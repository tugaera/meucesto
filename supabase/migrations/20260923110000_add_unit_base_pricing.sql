begin;

alter table public.units add column if not exists base_unit_id uuid references public.units(id) on delete restrict;
alter table public.units add column if not exists base_unit_factor numeric(12,6);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_base_unit_not_self') then
    alter table public.units add constraint units_base_unit_not_self check (base_unit_id is null or base_unit_id <> id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_base_unit_pair') then
    alter table public.units add constraint units_base_unit_pair check ((base_unit_id is null) = (base_unit_factor is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_base_unit_factor_positive') then
    alter table public.units add constraint units_base_unit_factor_positive check (base_unit_factor is null or base_unit_factor > 0);
  end if;
end $$;

update public.units child
set base_unit_id = parent.id, base_unit_factor = 1000
from public.units parent
where child.abbreviation = 'g' and parent.abbreviation = 'kg';

update public.units child
set base_unit_id = parent.id, base_unit_factor = 1000
from public.units parent
where child.abbreviation = 'ml' and parent.abbreviation = 'l';

create or replace function public.get_catalog_reference_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare elevated boolean; answer jsonb;
begin
  perform public.require_authenticated();
  elevated := public.has_app_role(array['admin','moderator']::public.app_role[]);
  select jsonb_build_object(
    'stores', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name::text, 'isActive', s.is_active, 'sortOrder', s.sort_order) order by s.sort_order nulls last, s.name::text, s.id), '[]'::jsonb) from public.stores s where elevated or s.is_active),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name::text, 'parentId', c.parent_id, 'isActive', c.is_active, 'sortOrder', c.sort_order) order by c.sort_order nulls last, c.name::text, c.id), '[]'::jsonb) from public.categories c where elevated or c.is_active),
    'brands', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name::text, 'isActive', b.is_active, 'isVerified', b.is_verified) order by b.name::text, b.id), '[]'::jsonb) from public.brands b where (elevated or b.is_active) and (elevated or b.is_verified)),
    'units', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name::text, 'abbreviation', u.abbreviation::text,
        'isActive', u.is_active, 'isDefault', u.is_default,
        'baseUnitId', u.base_unit_id, 'baseUnitName', bu.name::text,
        'baseUnitAbbreviation', bu.abbreviation::text, 'baseUnitFactor', u.base_unit_factor
      ) order by u.is_default desc, u.name::text, u.id), '[]'::jsonb)
      from public.units u
      left join public.units bu on bu.id = u.base_unit_id
      where elevated or u.is_active
    )
  ) into answer;
  return answer;
end;
$$;

create or replace function public.search_products(
  search_text text default null,
  barcode text default null,
  cursor_name text default null,
  cursor_id uuid default null,
  page_size integer default 20,
  include_inactive boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare normalized_query text := public.normalize_name(search_text); normalized_code text := public.normalize_barcode(barcode); elevated boolean; answer jsonb;
begin
  perform public.require_authenticated();
  elevated := public.has_app_role(array['admin','moderator']::public.app_role[]);
  if page_size not between 1 and 100 or (cursor_name is null) <> (cursor_id is null) or (include_inactive and not elevated) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if normalized_query = '' then normalized_query := null; end if;
  select coalesce(jsonb_agg(page.row_data order by page.normalized_name, page.id), '[]'::jsonb)
  into answer
  from (
    select p.id, public.normalize_name(p.name) as normalized_name,
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'barcode', p.barcode, 'tags', p.tags,
        'measurementQuantity', p.measurement_quantity, 'isActive', p.is_active,
        'category', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name::text) end,
        'subcategory', case when sc.id is null then null else jsonb_build_object('id', sc.id, 'name', sc.name::text) end,
        'brand', case when b.id is null then null else jsonb_build_object('id', b.id, 'name', b.name::text, 'isVerified', b.is_verified) end,
        'unit', case when u.id is null then null else jsonb_build_object(
          'id', u.id, 'name', u.name::text, 'abbreviation', u.abbreviation::text,
          'baseUnitId', u.base_unit_id, 'baseUnitName', bu.name::text,
          'baseUnitAbbreviation', bu.abbreviation::text, 'baseUnitFactor', u.base_unit_factor
        ) end,
        'latestPrice', case when latest.id is null then null else jsonb_build_object(
          'id', latest.id, 'storeId', latest.store_id, 'storeName', latest.store_name,
          'price', latest.price, 'originalPrice', latest.original_price, 'quantity', latest.quantity,
          'createdAt', latest.created_at
        ) end
      ) as row_data
    from public.products p
    left join public.categories c on c.id = p.category_id
    left join public.categories sc on sc.id = p.subcategory_id
    left join public.brands b on b.id = p.brand_id
    left join public.units u on u.id = p.unit_id
    left join public.units bu on bu.id = u.base_unit_id
    left join lateral (
      select e.id, e.store_id, s.name::text as store_name, e.price, e.original_price, e.quantity, e.created_at
      from public.product_entries e join public.stores s on s.id = e.store_id
      where e.product_id = p.id
      order by e.created_at desc, e.id desc limit 1
    ) latest on true
    where (not include_inactive and p.is_active or include_inactive and elevated)
      and (normalized_code is null or p.barcode = normalized_code)
      and (normalized_query is null or public.normalize_name(p.name) OPERATOR(extensions.%) normalized_query or public.normalize_name(p.name) like '%' || normalized_query || '%' or normalized_query = any(p.tags))
      and (cursor_name is null or (public.normalize_name(p.name), p.id) > (cursor_name, cursor_id))
    order by public.normalize_name(p.name), p.id
    limit page_size
  ) page;
  return answer;
end;
$$;

create or replace function public.catalog_save_unit(
  unit_id uuid,
  name text,
  abbreviation text,
  base_unit_id uuid,
  base_unit_factor numeric,
  is_active boolean,
  make_default boolean,
  replacement_default_id uuid,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_id uuid := coalesce(unit_id, extensions.uuid_generate_v4()); clean_name text := btrim(name); clean_abbreviation text := lower(btrim(abbreviation)); was_default boolean := false; prior jsonb; answer jsonb;
begin
  if not public.has_app_role(array['admin','moderator']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  prior := public.begin_mutation(mutation_id, 'catalog_save_unit', 'unit', target_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if char_length(clean_name) not between 1 and 80 or clean_abbreviation !~ '^[a-z][a-z0-9]{0,15}$' or (make_default and not is_active)
    or (base_unit_id is null) <> (base_unit_factor is null) or base_unit_factor is not null and base_unit_factor <= 0 or base_unit_id = target_id then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if base_unit_id is not null then
    perform 1 from public.units u where u.id = base_unit_id and u.is_active for update;
    if not found then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  end if;
  if unit_id is not null then
    select u.is_default into was_default from public.units u where u.id = unit_id for update;
    if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
  if make_default then
    update public.units u set is_default = false where u.is_default;
  elsif was_default and not is_active then
    if replacement_default_id is null or replacement_default_id = target_id then raise exception using errcode = '22023', message = 'DEFAULT_UNIT_REQUIRED'; end if;
    perform 1 from public.units u where u.id = replacement_default_id and u.is_active for update;
    if not found then raise exception using errcode = '22023', message = 'DEFAULT_UNIT_REQUIRED'; end if;
    update public.units u set is_default = false where u.id = target_id;
    update public.units u set is_default = true where u.id = replacement_default_id;
  end if;
  if unit_id is null then
    insert into public.units(id, name, abbreviation, base_unit_id, base_unit_factor, is_active, is_default)
    values (target_id, clean_name, clean_abbreviation, base_unit_id, base_unit_factor, is_active, make_default);
  else
    update public.units u set name = clean_name, abbreviation = clean_abbreviation,
      base_unit_id = catalog_save_unit.base_unit_id, base_unit_factor = catalog_save_unit.base_unit_factor,
      is_active = catalog_save_unit.is_active,
      is_default = case when make_default then true when was_default and not is_active then false else u.is_default end
    where u.id = unit_id;
  end if;
  select jsonb_build_object(
    'id', u.id, 'name', u.name::text, 'abbreviation', u.abbreviation::text,
    'isActive', u.is_active, 'isDefault', u.is_default,
    'baseUnitId', u.base_unit_id, 'baseUnitName', bu.name::text,
    'baseUnitAbbreviation', bu.abbreviation::text, 'baseUnitFactor', u.base_unit_factor
  ) into answer
  from public.units u
  left join public.units bu on bu.id = u.base_unit_id
  where u.id = target_id;
  perform public.write_audit_event('catalog.unit_saved', 'unit', target_id, jsonb_build_object('isActive', is_active, 'isDefault', make_default));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

grant execute on function public.catalog_save_unit(uuid,text,text,uuid,numeric,boolean,boolean,uuid,uuid) to authenticated;

commit;
