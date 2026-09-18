begin;

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
        'unit', case when u.id is null then null else jsonb_build_object('id', u.id, 'name', u.name::text, 'abbreviation', u.abbreviation::text) end,
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

create or replace function public.list_invites(
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); caller_role public.app_role := public.current_app_role(); answer jsonb;
begin
  if caller_role not in ('admin','moderator') then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if page_size not between 1 and 100 or (cursor_created_at is null) <> (cursor_id is null) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  select coalesce(jsonb_agg(page.row_data order by page.created_at desc, page.id desc), '[]'::jsonb) into answer
  from (
    select i.id, i.created_at, jsonb_build_object(
      'id', i.id, 'email', i.email::text, 'assignedRole', i.assigned_role,
      'createdAt', i.created_at, 'expiresAt', i.expires_at, 'usedAt', i.used_at,
      'revokedAt', i.revoked_at, 'createdByMe', coalesce(i.created_by = caller_id, false)
    ) row_data
    from public.invites i
    where (caller_role = 'admin' or i.created_by = caller_id)
      and (cursor_created_at is null or (i.created_at, i.id) < (cursor_created_at, cursor_id))
    order by i.created_at desc, i.id desc limit page_size
  ) page;
  return answer;
end;
$$;

commit;
