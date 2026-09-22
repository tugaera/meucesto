begin;

create or replace function public.add_or_merge_cart_item(
  cart_id uuid,
  item jsonb,
  expected_revision integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_cart_id alias for $1;
  cart public.shopping_carts%rowtype;
  existing public.shopping_cart_items%rowtype;
  saved public.shopping_cart_items%rowtype;
  submitted_product_id uuid;
  submitted_name text := btrim(item ->> 'name');
  submitted_barcode text := public.normalize_barcode(item ->> 'barcode');
  submitted_price numeric(12,2);
  submitted_original numeric(12,2);
  submitted_quantity numeric(12,3);
  total_value numeric(12,2);
  new_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'add_or_merge_cart_item', 'cart', target_cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  begin
    submitted_product_id := nullif(item ->> 'productId', '')::uuid;
    submitted_price := (item ->> 'price')::numeric(12,2);
    submitted_original := nullif(item ->> 'originalPrice', '')::numeric(12,2);
    submitted_quantity := coalesce(nullif(item ->> 'quantity', '')::numeric(12,3), 1);
  exception when others then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end;
  if submitted_name = '' or submitted_price < 0 or submitted_quantity <= 0 or (submitted_original is not null and submitted_original < submitted_price) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if submitted_product_id is not null and not exists(select 1 from public.products p where p.id = submitted_product_id and p.is_active) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  select * into cart from public.shopping_carts c where c.id = target_cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_cart(target_cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  if cart.store_id is null then raise exception using errcode = '55000', message = 'STORE_REQUIRED'; end if;
  if cart.revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;

  select i.* into existing
  from public.shopping_cart_items i
  where i.cart_id = target_cart_id and (
    (submitted_barcode is not null and i.product_barcode = submitted_barcode)
    or (submitted_product_id is not null and i.product_id = submitted_product_id)
    or (public.normalize_name(i.product_name) = public.normalize_name(submitted_name))
  )
  order by case
    when submitted_barcode is not null and i.product_barcode = submitted_barcode then 1
    when submitted_product_id is not null and i.product_id = submitted_product_id then 2
    else 3 end
  limit 1 for update;

  if found then
    update public.shopping_cart_items i
    set product_id = coalesce(submitted_product_id, i.product_id),
        product_name = submitted_name,
        product_barcode = coalesce(submitted_barcode, i.product_barcode),
        price = submitted_price,
        original_price = submitted_original,
        quantity = i.quantity + submitted_quantity,
        revision = i.revision + 1
    where i.id = existing.id returning * into saved;
  else
    insert into public.shopping_cart_items(
      cart_id, product_id, product_name, product_barcode, price, original_price, quantity, added_by
    ) values (
      target_cart_id, submitted_product_id, submitted_name, submitted_barcode, submitted_price, submitted_original, submitted_quantity, auth.uid()
    ) returning * into saved;
  end if;

  total_value := public.recalculate_cart_total_locked(target_cart_id);
  update public.shopping_carts c set revision = c.revision + 1 where c.id = target_cart_id returning c.revision into new_revision;
  answer := jsonb_build_object(
    'item', jsonb_build_object(
      'id', saved.id, 'productId', saved.product_id, 'name', saved.product_name,
      'barcode', saved.product_barcode, 'price', saved.price::text,
      'originalPrice', saved.original_price::text, 'quantity', saved.quantity::text,
      'revision', saved.revision
    ),
    'cartRevision', new_revision,
    'cartTotal', total_value::text
  );
  perform public.broadcast_invalidation('cart', target_cart_id, new_revision, 'item_saved', saved.id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.update_cart_item(
  cart_id uuid,
  item_id uuid,
  updates jsonb,
  expected_item_revision integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_cart_id alias for $1;
  target_item_id alias for $2;
  cart public.shopping_carts%rowtype;
  current_item public.shopping_cart_items%rowtype;
  saved public.shopping_cart_items%rowtype;
  next_name text;
  next_price numeric(12,2);
  next_original numeric(12,2);
  next_quantity numeric(12,3);
  total_value numeric(12,2);
  new_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'update_cart_item', 'cart_item', target_item_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into cart from public.shopping_carts c where c.id = target_cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_cart(target_cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  select * into current_item from public.shopping_cart_items i where i.id = target_item_id and i.cart_id = target_cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if current_item.revision <> expected_item_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  begin
    next_name := case when updates ? 'name' then btrim(updates ->> 'name') else current_item.product_name end;
    next_price := case when updates ? 'price' then (updates ->> 'price')::numeric(12,2) else current_item.price end;
    next_original := case when updates ? 'originalPrice' then nullif(updates ->> 'originalPrice', '')::numeric(12,2) else current_item.original_price end;
    next_quantity := case when updates ? 'quantity' then (updates ->> 'quantity')::numeric(12,3) else current_item.quantity end;
  exception when others then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end;
  if next_name = '' or next_price < 0 or next_quantity <= 0 or (next_original is not null and next_original < next_price) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  update public.shopping_cart_items i
  set product_name = next_name, price = next_price, original_price = next_original,
      quantity = next_quantity, revision = i.revision + 1
  where i.id = target_item_id returning * into saved;
  total_value := public.recalculate_cart_total_locked(target_cart_id);
  update public.shopping_carts c set revision = c.revision + 1 where c.id = target_cart_id returning c.revision into new_revision;
  answer := jsonb_build_object(
    'item', jsonb_build_object('id', saved.id, 'name', saved.product_name, 'price', saved.price::text, 'originalPrice', saved.original_price::text, 'quantity', saved.quantity::text, 'revision', saved.revision),
    'cartRevision', new_revision, 'cartTotal', total_value::text
  );
  perform public.broadcast_invalidation('cart', target_cart_id, new_revision, 'item_updated', target_item_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.delete_cart_item(
  cart_id uuid,
  item_id uuid,
  expected_item_revision integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_cart_id alias for $1;
  target_item_id alias for $2;
  cart public.shopping_carts%rowtype;
  current_revision integer;
  total_value numeric(12,2);
  new_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'delete_cart_item', 'cart_item', target_item_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into cart from public.shopping_carts c where c.id = target_cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_cart(target_cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  select i.revision into current_revision from public.shopping_cart_items i where i.id = target_item_id and i.cart_id = target_cart_id for update;
  if not found then
    answer := jsonb_build_object('deleted', true, 'itemId', target_item_id, 'alreadyMissing', true, 'cartRevision', cart.revision, 'cartTotal', cart.total::text);
    return public.complete_mutation(mutation_id, answer);
  end if;
  if current_revision <> expected_item_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  delete from public.shopping_cart_items i where i.id = target_item_id;
  total_value := public.recalculate_cart_total_locked(target_cart_id);
  update public.shopping_carts c set revision = c.revision + 1 where c.id = target_cart_id returning c.revision into new_revision;
  answer := jsonb_build_object('deleted', true, 'itemId', target_item_id, 'cartRevision', new_revision, 'cartTotal', total_value::text);
  perform public.broadcast_invalidation('cart', target_cart_id, new_revision, 'item_deleted', target_item_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

commit;
