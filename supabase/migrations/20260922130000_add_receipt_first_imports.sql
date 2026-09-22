begin;

alter table public.shopping_carts
  add column if not exists source text not null default 'app'
  check (source in ('app', 'receipt'));

create or replace function public.create_receipt_import_cart(mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  prior jsonb;
  imported_cart public.shopping_carts%rowtype;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'create_receipt_import_cart', 'cart', null);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;

  insert into public.shopping_carts(user_id, finalized_at, source)
  values (caller_id, now(), 'receipt')
  returning * into imported_cart;

  answer := jsonb_build_object('cartId', imported_cart.id, 'finalizedAt', imported_cart.finalized_at);
  perform public.write_audit_event('receipt.import_created', 'cart', imported_cart.id, '{}'::jsonb);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.discard_empty_receipt_import_cart(cart_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'discard_empty_receipt_import_cart', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;

  delete from public.shopping_carts c
  where c.id = discard_empty_receipt_import_cart.cart_id
    and c.user_id = caller_id
    and c.source = 'receipt'
    and not exists(select 1 from public.shopping_cart_items i where i.cart_id = c.id)
    and not exists(select 1 from public.cart_receipt_images r where r.cart_id = c.id);
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;

  answer := jsonb_build_object('cartId', cart_id, 'discarded', true);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.apply_ai_receipt_import(
  cart_id uuid,
  receipt_id uuid,
  review_request_id uuid,
  import_data jsonb,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  prior jsonb;
  imported_cart public.shopping_carts%rowtype;
  line jsonb;
  line_name text;
  line_barcode text;
  line_quantity numeric(12,3);
  line_unit_price numeric(12,2);
  line_total numeric(12,2);
  resolved_product_id uuid;
  resolved_store_id uuid;
  purchase_time timestamptz;
  accepted_count integer;
  rejected_count integer;
  final_total numeric(12,2);
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'apply_ai_receipt_import', 'receipt', receipt_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;

  select c.* into imported_cart
  from public.shopping_carts c
  join public.cart_receipt_images r on r.cart_id = c.id
  where c.id = apply_ai_receipt_import.cart_id
    and c.user_id = caller_id
    and c.source = 'receipt'
    and c.finalized_at is not null
    and r.id = apply_ai_receipt_import.receipt_id
  for update of c;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;

  perform 1 from public.ai_provider_requests request
  where request.id = review_request_id and request.user_id = caller_id and request.status = 'completed';
  if not found then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;

  if exists(select 1 from public.shopping_cart_items i where i.cart_id = apply_ai_receipt_import.cart_id)
    or jsonb_typeof(import_data) <> 'object'
    or exists(select 1 from jsonb_object_keys(import_data) key_name where key_name not in ('merchant','purchasedAt','items','accepted','rejected'))
    or jsonb_typeof(import_data -> 'items') <> 'array'
    or jsonb_array_length(import_data -> 'items') > 200
    or coalesce(import_data ->> 'accepted', '') !~ '^\d{1,3}$'
    or coalesce(import_data ->> 'rejected', '') !~ '^\d{1,3}$'
    or (import_data ->> 'accepted')::integer <> jsonb_array_length(import_data -> 'items')
    or (import_data ->> 'accepted')::integer + (import_data ->> 'rejected')::integer > 200
  then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;

  accepted_count := (import_data ->> 'accepted')::integer;
  rejected_count := (import_data ->> 'rejected')::integer;
  if accepted_count = 0 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;

  if nullif(btrim(import_data ->> 'merchant'), '') is not null then
    select s.id into resolved_store_id
    from public.stores s
    where s.is_active and public.normalize_name(s.name::text) = public.normalize_name(import_data ->> 'merchant')
    order by s.sort_order nulls last, s.id
    limit 1;
  end if;

  begin
    purchase_time := nullif(import_data ->> 'purchasedAt', '')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    purchase_time := null;
  end;
  if purchase_time is not null and (purchase_time > now() + interval '1 day' or purchase_time < timestamptz '2000-01-01') then
    purchase_time := null;
  end if;

  for line in select value from jsonb_array_elements(import_data -> 'items') loop
    if jsonb_typeof(line) <> 'object'
      or exists(select 1 from jsonb_object_keys(line) key_name where key_name not in ('name','barcode','quantity','unitPrice','lineTotal'))
      or char_length(btrim(coalesce(line ->> 'name', ''))) not between 1 and 200
      or coalesce(line ->> 'quantity', '') !~ '^\d+(\.\d{1,3})?$'
      or coalesce(line ->> 'lineTotal', '') !~ '^\d+(\.\d{1,2})?$'
      or (line ->> 'unitPrice') is not null and (line ->> 'unitPrice') !~ '^\d+(\.\d{1,2})?$'
    then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;

    line_name := btrim(line ->> 'name');
    line_barcode := nullif(public.normalize_barcode(line ->> 'barcode'), '');
    line_quantity := (line ->> 'quantity')::numeric(12,3);
    line_total := (line ->> 'lineTotal')::numeric(12,2);
    line_unit_price := case
      when line ->> 'unitPrice' is not null then (line ->> 'unitPrice')::numeric(12,2)
      else round(line_total / nullif(line_quantity, 0), 2)
    end;
    if line_quantity <= 0 or line_unit_price is null or line_unit_price < 0 or line_barcode is not null and char_length(line_barcode) > 80 then
      raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
    end if;

    resolved_product_id := null;
    if line_barcode is not null then
      select p.id into resolved_product_id from public.products p where p.barcode = line_barcode order by p.is_active desc, p.created_at, p.id limit 1;
    end if;
    if resolved_product_id is null then
      select p.id into resolved_product_id from public.products p
      where public.normalize_name(p.name) = public.normalize_name(line_name)
      order by p.is_active desc, p.created_at, p.id limit 1;
    end if;

    insert into public.shopping_cart_items(cart_id, product_id, product_name, product_barcode, price, quantity, added_by)
    values (cart_id, resolved_product_id, line_name, line_barcode, line_unit_price, line_quantity, caller_id);
  end loop;

  final_total := public.recalculate_cart_total_locked(cart_id);
  update public.shopping_carts c
  set store_id = coalesce(resolved_store_id, c.store_id),
      total = final_total,
      finalized_at = coalesce(purchase_time, c.finalized_at),
      revision = c.revision + 1
  where c.id = apply_ai_receipt_import.cart_id
  returning * into imported_cart;

  answer := jsonb_build_object(
    'receiptId', receipt_id,
    'requestId', review_request_id,
    'accepted', accepted_count,
    'rejected', rejected_count,
    'imported', true,
    'cartId', imported_cart.id,
    'total', imported_cart.total::text
  );
  perform public.write_audit_event('receipt.ai_import_applied', 'receipt', receipt_id, jsonb_build_object('accepted', accepted_count, 'rejected', rejected_count));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_history_cart_detail(cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare answer jsonb;
begin
  perform public.require_authenticated();
  if not public.can_access_cart(cart_id) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  select jsonb_build_object(
    'id', c.id,
    'ownerId', c.user_id,
    'ownerEmail', owner_profile.email::text,
    'isOwner', c.user_id = auth.uid(),
    'canManageReceipts', c.user_id = auth.uid(),
    'isReceiptImport', c.source = 'receipt',
    'store', case when s.id is null then null else jsonb_build_object('id', s.id, 'name', s.name::text) end,
    'total', c.total,
    'finalizedAt', c.finalized_at,
    'createdAt', c.created_at,
    'revision', c.revision
  ) into answer
  from public.shopping_carts c
  join public.profiles owner_profile on owner_profile.id = c.user_id
  left join public.stores s on s.id = c.store_id
  where c.id = get_history_cart_detail.cart_id and c.finalized_at is not null;
  if answer is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return answer;
end;
$$;

grant execute on function public.create_receipt_import_cart(uuid) to authenticated;
grant execute on function public.discard_empty_receipt_import_cart(uuid,uuid) to authenticated;
grant execute on function public.apply_ai_receipt_import(uuid,uuid,uuid,jsonb,uuid) to authenticated;

commit;
