begin;

create or replace function public.add_or_merge_list_item(
  list_id uuid,
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
  target_list_id alias for $1;
  list_row public.shopping_lists%rowtype;
  existing public.shopping_list_items%rowtype;
  saved public.shopping_list_items%rowtype;
  submitted_product_id uuid;
  submitted_name text := nullif(btrim(item ->> 'name'), '');
  submitted_barcode text := public.normalize_barcode(item ->> 'barcode');
  submitted_quantity numeric(12,3);
  new_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'add_or_merge_list_item', 'list', target_list_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  begin
    submitted_product_id := nullif(item ->> 'productId', '')::uuid;
    submitted_quantity := coalesce(nullif(item ->> 'quantity', '')::numeric(12,3), 1);
  exception when others then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end;
  if (submitted_product_id is null and submitted_name is null) or submitted_quantity <= 0 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if submitted_product_id is not null then
    select p.name, p.barcode into submitted_name, submitted_barcode from public.products p where p.id = submitted_product_id and p.is_active;
    if not found then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  end if;
  select * into list_row from public.shopping_lists l where l.id = target_list_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_list(target_list_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if list_row.revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  select i.* into existing from public.shopping_list_items i
  where i.list_id = target_list_id and (
    (submitted_product_id is not null and i.product_id = submitted_product_id)
    or (submitted_barcode is not null and i.product_barcode = submitted_barcode)
    or (submitted_name is not null and public.normalize_name(i.product_name) = public.normalize_name(submitted_name))
  )
  order by case when submitted_product_id is not null and i.product_id = submitted_product_id then 1 when submitted_barcode is not null and i.product_barcode = submitted_barcode then 2 else 3 end
  limit 1 for update;
  if found then
    update public.shopping_list_items i
    set product_id = coalesce(submitted_product_id, i.product_id), product_name = submitted_name,
        product_barcode = coalesce(submitted_barcode, i.product_barcode),
        planned_quantity = i.planned_quantity + submitted_quantity, revision = i.revision + 1
    where i.id = existing.id returning * into saved;
  else
    insert into public.shopping_list_items(list_id, product_id, product_name, product_barcode, planned_quantity, added_by)
    values (target_list_id, submitted_product_id, submitted_name, submitted_barcode, submitted_quantity, auth.uid()) returning * into saved;
  end if;
  update public.shopping_lists l set revision = l.revision + 1 where l.id = target_list_id returning l.revision into new_revision;
  answer := jsonb_build_object('item', jsonb_build_object('id', saved.id, 'productId', saved.product_id, 'name', saved.product_name, 'barcode', saved.product_barcode, 'quantity', saved.planned_quantity::text, 'revision', saved.revision), 'listRevision', new_revision);
  perform public.broadcast_invalidation('list', target_list_id, new_revision, 'item_saved', saved.id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.update_list_item(
  list_id uuid,
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
  target_list_id alias for $1;
  target_item_id alias for $2;
  list_row public.shopping_lists%rowtype;
  current_item public.shopping_list_items%rowtype;
  next_name text;
  next_quantity numeric(12,3);
  next_barcode text;
  new_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'update_list_item', 'list_item', target_item_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into list_row from public.shopping_lists l where l.id = target_list_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_list(target_list_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select * into current_item from public.shopping_list_items i where i.id = target_item_id and i.list_id = target_list_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if current_item.revision <> expected_item_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  begin
    next_name := case when updates ? 'name' then nullif(btrim(updates ->> 'name'), '') else current_item.product_name end;
    next_quantity := case when updates ? 'quantity' then (updates ->> 'quantity')::numeric(12,3) else current_item.planned_quantity end;
    next_barcode := case when updates ? 'barcode' then public.normalize_barcode(updates ->> 'barcode') else current_item.product_barcode end;
  exception when others then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end;
  if next_quantity <= 0 or (current_item.product_id is null and next_name is null) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  update public.shopping_list_items i
  set product_name = next_name, product_barcode = next_barcode, planned_quantity = next_quantity, revision = i.revision + 1
  where i.id = target_item_id;
  update public.shopping_lists l set revision = l.revision + 1 where l.id = target_list_id returning l.revision into new_revision;
  answer := jsonb_build_object('itemId', target_item_id, 'listRevision', new_revision);
  perform public.broadcast_invalidation('list', target_list_id, new_revision, 'item_updated', target_item_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.delete_list_item(
  list_id uuid,
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
  target_list_id alias for $1;
  target_item_id alias for $2;
  list_row public.shopping_lists%rowtype;
  item_revision integer;
  new_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'delete_list_item', 'list_item', target_item_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into list_row from public.shopping_lists l where l.id = target_list_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_list(target_list_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select i.revision into item_revision from public.shopping_list_items i where i.id = target_item_id and i.list_id = target_list_id for update;
  if found then
    if item_revision <> expected_item_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
    delete from public.shopping_list_items i where i.id = target_item_id;
  end if;
  update public.shopping_lists l set revision = l.revision + 1 where l.id = target_list_id returning l.revision into new_revision;
  answer := jsonb_build_object('deleted', true, 'itemId', target_item_id, 'alreadyMissing', item_revision is null, 'listRevision', new_revision);
  perform public.broadcast_invalidation('list', target_list_id, new_revision, 'item_deleted', target_item_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

commit;
