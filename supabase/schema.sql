begin;

create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin', 'moderator', 'user');
create type public.locale_code as enum ('pt', 'en');

create or replace function public.normalize_name(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.normalize_barcode(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(btrim(coalesce(value, '')), '[^0-9A-Za-z]', '', 'g')), '');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_valid_timezone(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value ~ '^[A-Za-z][A-Za-z0-9_+\-]{0,63}(/[A-Za-z0-9_+\-]{1,64}){1,2}$'
    and char_length(value) <= 128;
$$;

create or replace function public.is_valid_tracking_state(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
    and value ? 'manuallyChecked'
    and value ? 'suppressedAutoMatch'
    and not exists (
      select 1
      from jsonb_object_keys(value) as key_name
      where key_name not in ('manuallyChecked', 'suppressedAutoMatch')
    )
    and jsonb_typeof(value -> 'manuallyChecked') = 'array'
    and jsonb_typeof(value -> 'suppressedAutoMatch') = 'array'
    and jsonb_array_length(value -> 'manuallyChecked') <= 1000
    and jsonb_array_length(value -> 'suppressedAutoMatch') <= 1000
    and not exists (
      select 1
      from jsonb_array_elements_text(value -> 'manuallyChecked') as item(identifier)
      where identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and not exists (
      select 1
      from jsonb_array_elements_text(value -> 'suppressedAutoMatch') as item(identifier)
      where identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null unique,
  role public.app_role not null default 'user',
  language public.locale_code not null default 'pt',
  timezone text not null default 'Europe/Lisbon' check (public.is_valid_timezone(timezone)),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default extensions.uuid_generate_v4(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  email extensions.citext,
  created_by uuid references public.profiles(id) on delete set null,
  assigned_role public.app_role not null default 'user',
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_by is null or used_at is not null)
);

create table public.stores (
  id uuid primary key default extensions.uuid_generate_v4(),
  name extensions.citext not null unique check (char_length(btrim(name::text)) between 1 and 120),
  is_active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default extensions.uuid_generate_v4(),
  name extensions.citext not null check (char_length(btrim(name::text)) between 1 and 120),
  parent_id uuid references public.categories(id) on delete restrict,
  is_active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create table public.brands (
  id uuid primary key default extensions.uuid_generate_v4(),
  name extensions.citext not null unique check (char_length(btrim(name::text)) between 1 and 120),
  is_active boolean not null default true,
  is_verified boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default extensions.uuid_generate_v4(),
  name extensions.citext not null unique check (char_length(btrim(name::text)) between 1 and 80),
  abbreviation extensions.citext not null unique check (abbreviation::text ~ '^[a-z][a-z0-9]{0,15}$'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_default or is_active)
);

create table public.products (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  barcode text unique check (barcode is null or barcode = public.normalize_barcode(barcode)),
  category_id uuid references public.categories(id) on delete restrict,
  subcategory_id uuid references public.categories(id) on delete restrict,
  brand_id uuid references public.brands(id) on delete restrict,
  tags text[] not null default '{}',
  measurement_quantity numeric(12,3) check (measurement_quantity > 0),
  unit_id uuid references public.units(id) on delete restrict,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((measurement_quantity is null) = (unit_id is null)),
  check (cardinality(tags) <= 50)
);

create table public.shopping_lists (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_list_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  product_name text,
  product_barcode text check (product_barcode is null or product_barcode = public.normalize_barcode(product_barcode)),
  planned_quantity numeric(12,3) not null default 1 check (planned_quantity > 0),
  added_by uuid references public.profiles(id) on delete set null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (product_id is not null or nullif(btrim(product_name), '') is not null),
  check (product_name is null or char_length(btrim(product_name)) between 1 and 200)
);

create table public.shopping_carts (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete restrict,
  tracking_list_id uuid references public.shopping_lists(id) on delete set null,
  tracking_check_state jsonb not null default '{"manuallyChecked":[],"suppressedAutoMatch":[]}'::jsonb
    check (public.is_valid_tracking_state(tracking_check_state)),
  total numeric(12,2) not null default 0 check (total >= 0),
  finalized_at timestamptz,
  checkout_idempotency_key uuid unique,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_cart_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  cart_id uuid not null references public.shopping_carts(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  product_entry_id uuid,
  product_name text not null check (char_length(btrim(product_name)) between 1 and 200),
  product_barcode text check (product_barcode is null or product_barcode = public.normalize_barcode(product_barcode)),
  price numeric(12,2) not null check (price >= 0),
  original_price numeric(12,2) check (original_price >= price),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  added_by uuid references public.profiles(id) on delete set null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_entries (
  id uuid primary key default extensions.uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  price numeric(12,2) not null check (price >= 0),
  original_price numeric(12,2) check (original_price >= price),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  created_by uuid references public.profiles(id) on delete set null,
  source_cart_id uuid references public.shopping_carts(id) on delete set null,
  source_cart_item_id uuid references public.shopping_cart_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shopping_cart_items
  add constraint shopping_cart_items_product_entry_fk
  foreign key (product_entry_id) references public.product_entries(id) on delete set null;

create table public.cart_shares (
  id uuid primary key default extensions.uuid_generate_v4(),
  cart_id uuid not null references public.shopping_carts(id) on delete cascade,
  shared_with_user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cart_id, shared_with_user_id)
);

create table public.list_shares (
  id uuid primary key default extensions.uuid_generate_v4(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  shared_with_user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (list_id, shared_with_user_id)
);

create table public.resource_join_invites (
  id uuid primary key default extensions.uuid_generate_v4(),
  resource_type text not null check (resource_type in ('cart', 'list')),
  resource_id uuid not null,
  token_hash bytea not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (max_uses is null or use_count <= max_uses)
);

create table public.cart_receipt_images (
  id uuid primary key default extensions.uuid_generate_v4(),
  cart_id uuid not null references public.shopping_carts(id) on delete cascade,
  bucket_id text not null default 'receipts' check (bucket_id = 'receipts'),
  object_path text not null unique check (object_path !~ '(^|/)\.\.(/|$)'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sort_order integer not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mutation_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mutation_id uuid not null,
  operation text not null check (char_length(operation) between 1 and 80),
  resource_type text not null check (char_length(resource_type) between 1 and 40),
  resource_id uuid,
  result jsonb not null default '{"pending":true}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  primary key (user_id, mutation_id),
  check (expires_at > created_at)
);

create table public.request_rate_limits (
  action text not null check (char_length(action) between 1 and 80),
  key_hash text not null check (char_length(key_hash) between 32 and 128),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (action, key_hash, window_start)
);

create table public.ai_usage_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table public.ai_provider_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  provider_request_id text,
  status text not null check (status in ('started', 'completed', 'failed', 'ambiguous')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default extensions.uuid_generate_v4(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object'),
  check (metadata::text !~* '"(password|token|invite_code|ocr_text|receipt_text|provider_payload)"\s*:')
);

create table public.retention_queue (
  id uuid primary key default extensions.uuid_generate_v4(),
  job_type text not null check (job_type in ('receipt_object_purge', 'audit_archive')),
  subject_user_id uuid,
  object_paths text[] not null default '{}',
  execute_after timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(object_paths) <= 5000)
);

create unique index profiles_email_lower_idx on public.profiles (lower(email::text));
create index profiles_role_idx on public.profiles (role);
create index profiles_invited_by_idx on public.profiles (invited_by);
create index invites_active_code_idx on public.invites (code, expires_at) where used_at is null and revoked_at is null;
create index invites_active_email_idx on public.invites (lower(email::text), expires_at) where email is not null and used_at is null and revoked_at is null;
create index invites_created_by_idx on public.invites (created_by);
create unique index categories_name_parent_idx on public.categories (
  public.normalize_name(name::text), coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index categories_parent_idx on public.categories (parent_id);
create index brands_pending_idx on public.brands (is_verified, is_active, created_at desc);
create unique index units_one_default_idx on public.units (is_default) where is_default;
create index products_name_trgm_idx on public.products using gin (public.normalize_name(name) extensions.gin_trgm_ops);
create index products_tags_idx on public.products using gin (tags);
create index products_category_idx on public.products (category_id);
create index products_subcategory_idx on public.products (subcategory_id);
create index products_brand_idx on public.products (brand_id);
create index products_unit_idx on public.products (unit_id);
create index products_active_idx on public.products (is_active, created_at desc, id desc);
create index shopping_lists_owner_idx on public.shopping_lists (user_id, updated_at desc, id desc);
create unique index shopping_list_items_product_idx on public.shopping_list_items (list_id, product_id) where product_id is not null;
create unique index shopping_list_items_barcode_idx on public.shopping_list_items (list_id, product_barcode) where product_barcode is not null;
create unique index shopping_list_items_free_name_idx on public.shopping_list_items (list_id, public.normalize_name(product_name))
  where product_id is null and product_barcode is null;
create index shopping_list_items_list_idx on public.shopping_list_items (list_id, created_at, id);
create unique index shopping_carts_one_active_owner_idx on public.shopping_carts (user_id) where finalized_at is null;
create index shopping_carts_history_idx on public.shopping_carts (finalized_at desc, id desc) where finalized_at is not null;
create index shopping_carts_tracking_idx on public.shopping_carts (tracking_list_id) where tracking_list_id is not null;
create unique index shopping_cart_items_product_idx on public.shopping_cart_items (cart_id, product_id) where product_id is not null;
create unique index shopping_cart_items_barcode_idx on public.shopping_cart_items (cart_id, product_barcode) where product_barcode is not null;
create unique index shopping_cart_items_free_name_idx on public.shopping_cart_items (cart_id, public.normalize_name(product_name))
  where product_id is null and product_barcode is null;
create index shopping_cart_items_cart_idx on public.shopping_cart_items (cart_id, created_at, id);
create unique index product_entries_source_item_idx on public.product_entries (source_cart_item_id) where source_cart_item_id is not null;
create index product_entries_product_store_idx on public.product_entries (product_id, store_id, created_at desc, id desc);
create index product_entries_store_idx on public.product_entries (store_id);
create index cart_shares_member_idx on public.cart_shares (shared_with_user_id, cart_id);
create index list_shares_member_idx on public.list_shares (shared_with_user_id, list_id);
create index resource_join_invites_resource_idx on public.resource_join_invites (resource_type, resource_id, created_at desc);
create index resource_join_invites_expiry_idx on public.resource_join_invites (expires_at) where revoked_at is null;
create index cart_receipt_images_cart_idx on public.cart_receipt_images (cart_id, sort_order, created_at, id);
create index mutation_receipts_expiry_idx on public.mutation_receipts (expires_at);
create index request_rate_limits_cleanup_idx on public.request_rate_limits (window_start, blocked_until);
create index ai_provider_requests_user_idx on public.ai_provider_requests (user_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc, id desc);
create index retention_queue_due_idx on public.retention_queue (execute_after, id) where completed_at is null;

create or replace function public.normalize_product_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized_tags text[];
begin
  new.name := btrim(new.name);
  new.barcode := public.normalize_barcode(new.barcode);
  select coalesce(array_agg(tag order by tag), '{}')
    into normalized_tags
  from (
    select distinct public.normalize_name(raw_tag) as tag
    from unnest(new.tags) as raw_tag
    where public.normalize_name(raw_tag) <> ''
  ) normalized;
  new.tags := normalized_tags;
  if cardinality(new.tags) > 50 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  return new;
end;
$$;

create or replace function public.validate_category_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cycle_found boolean;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception using errcode = '23514', message = 'CATEGORY_CYCLE';
  end if;
  with recursive ancestors as (
    select c.id, c.parent_id from public.categories c where c.id = new.parent_id
    union all
    select c.id, c.parent_id from public.categories c join ancestors a on c.id = a.parent_id
  )
  select exists(select 1 from ancestors where id = new.id) into cycle_found;
  if cycle_found then
    raise exception using errcode = '23514', message = 'CATEGORY_CYCLE';
  end if;
  return new;
end;
$$;

create or replace function public.validate_product_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_parent uuid;
begin
  if new.subcategory_id is null then
    return new;
  end if;
  select parent_id into expected_parent from public.categories where id = new.subcategory_id;
  if expected_parent is null or new.category_id is distinct from expected_parent then
    raise exception using errcode = '23514', message = 'INVALID_SUBCATEGORY';
  end if;
  return new;
end;
$$;

create or replace function public.reject_finalized_cart_item_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_cart_id uuid;
  is_finalized boolean;
begin
  target_cart_id := coalesce(new.cart_id, old.cart_id);
  select finalized_at is not null into is_finalized from public.shopping_carts where id = target_cart_id;
  if is_finalized then
    raise exception using errcode = '55000', message = 'CART_FINALIZED';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.validate_join_invite_resource()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if new.resource_type = 'cart' then
    select user_id into owner_id from public.shopping_carts where id = new.resource_id;
  else
    select user_id into owner_id from public.shopping_lists where id = new.resource_id;
  end if;
  if owner_id is null or owner_id is distinct from new.created_by then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  return new;
end;
$$;

create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.audit_retention_purge', true) = 'on' then
    return old;
  end if;
  raise exception using errcode = '42501', message = 'AUDIT_LOG_APPEND_ONLY';
end;
$$;

create or replace function public.normalize_unit_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name::text)::extensions.citext;
  new.abbreviation := lower(btrim(new.abbreviation::text))::extensions.citext;
  return new;
end;
$$;

create or replace function public.validate_resource_share()
returns trigger
language plpgsql
set search_path = ''
as $$
declare owner_id uuid;
begin
  if tg_table_name = 'cart_shares' then
    select c.user_id into owner_id from public.shopping_carts c where c.id = new.cart_id;
  else
    select l.user_id into owner_id from public.shopping_lists l where l.id = new.list_id;
  end if;
  if owner_id is null or new.shared_with_user_id = owner_id or new.created_by is distinct from owner_id then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger invites_updated_at before update on public.invites for each row execute function public.set_updated_at();
create trigger stores_updated_at before update on public.stores for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger brands_updated_at before update on public.brands for each row execute function public.set_updated_at();
create trigger units_updated_at before update on public.units for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger shopping_lists_updated_at before update on public.shopping_lists for each row execute function public.set_updated_at();
create trigger shopping_list_items_updated_at before update on public.shopping_list_items for each row execute function public.set_updated_at();
create trigger shopping_carts_updated_at before update on public.shopping_carts for each row execute function public.set_updated_at();
create trigger shopping_cart_items_updated_at before update on public.shopping_cart_items for each row execute function public.set_updated_at();
create trigger product_entries_updated_at before update on public.product_entries for each row execute function public.set_updated_at();
create trigger resource_join_invites_updated_at before update on public.resource_join_invites for each row execute function public.set_updated_at();
create trigger cart_receipt_images_updated_at before update on public.cart_receipt_images for each row execute function public.set_updated_at();
create trigger ai_usage_daily_updated_at before update on public.ai_usage_daily for each row execute function public.set_updated_at();
create trigger ai_provider_requests_updated_at before update on public.ai_provider_requests for each row execute function public.set_updated_at();
create trigger retention_queue_updated_at before update on public.retention_queue for each row execute function public.set_updated_at();
create trigger products_normalize before insert or update on public.products for each row execute function public.normalize_product_row();
create trigger units_normalize before insert or update on public.units for each row execute function public.normalize_unit_row();
create trigger categories_no_cycles before insert or update of parent_id on public.categories for each row execute function public.validate_category_parent();
create trigger products_valid_category before insert or update of category_id, subcategory_id on public.products for each row execute function public.validate_product_category();
create trigger cart_items_active_only before insert or update or delete on public.shopping_cart_items for each row execute function public.reject_finalized_cart_item_change();
create trigger join_invites_valid_resource before insert or update of resource_type, resource_id, created_by on public.resource_join_invites for each row execute function public.validate_join_invite_resource();
create trigger cart_shares_valid before insert or update on public.cart_shares for each row execute function public.validate_resource_share();
create trigger list_shares_valid before insert or update on public.list_shares for each row execute function public.validate_resource_share();
create trigger audit_log_no_update before update or delete on public.audit_log for each row execute function public.reject_audit_mutation();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.has_app_role(required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any(required_roles), false);
$$;

create or replace function public.is_cart_owner(target_cart_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.shopping_carts c
    where c.id = target_cart_id and c.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_cart(target_cart_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.shopping_carts c
    where c.id = target_cart_id
      and (
        c.user_id = (select auth.uid())
        or exists (
          select 1 from public.cart_shares s
          where s.cart_id = c.id and s.shared_with_user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.is_list_owner(target_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.shopping_lists l
    where l.id = target_list_id and l.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_list(target_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.shopping_lists l
    where l.id = target_list_id
      and (
        l.user_id = (select auth.uid())
        or exists (
          select 1 from public.list_shares s
          where s.list_id = l.id and s.shared_with_user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.shopping_carts c
          where c.tracking_list_id = l.id
            and c.finalized_at is null
            and public.can_access_cart(c.id)
        )
      )
  );
$$;

create or replace function public.require_authenticated()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;
  return caller_id;
end;
$$;

create or replace function public.write_audit_event(
  action_name text,
  target_type text,
  target_id uuid,
  safe_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if safe_metadata::text ~* '"(password|token|invite_code|ocr_text|receipt_text|provider_payload)"\s*:' then
    raise exception using errcode = '22023', message = 'AUDIT_METADATA_REJECTED';
  end if;
  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), action_name, target_type, target_id, coalesce(safe_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.begin_mutation(
  mutation_id uuid,
  operation_name text,
  target_type text,
  target_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_mutation_id alias for $1;
  caller_id uuid := public.require_authenticated();
  inserted_id uuid;
  stored_operation text;
  stored_result jsonb;
begin
  if requested_mutation_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  insert into public.mutation_receipts(user_id, mutation_id, operation, resource_type, resource_id)
  values (caller_id, requested_mutation_id, operation_name, target_type, target_id)
  on conflict on constraint mutation_receipts_pkey do nothing
  returning public.mutation_receipts.mutation_id into inserted_id;

  if inserted_id is not null then
    return null;
  end if;

  select m.operation, m.result
    into stored_operation, stored_result
  from public.mutation_receipts m
  where m.user_id = caller_id and m.mutation_id = requested_mutation_id
  for update;

  if stored_operation is distinct from operation_name then
    raise exception using errcode = '22023', message = 'MUTATION_ID_REUSED';
  end if;
  return stored_result;
end;
$$;

create or replace function public.complete_mutation(mutation_id uuid, final_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
begin
  update public.mutation_receipts
  set result = final_result
  where user_id = caller_id and public.mutation_receipts.mutation_id = complete_mutation.mutation_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'MUTATION_RECEIPT_MISSING';
  end if;
  return final_result;
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'email', p.email::text,
    'role', p.role,
    'language', p.language,
    'timezone', p.timezone,
    'createdAt', p.created_at
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.get_my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_app_role();
$$;

create or replace function public.update_my_preferences(
  language public.locale_code,
  timezone text,
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
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'update_preferences', 'profile', caller_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if not public.is_valid_timezone(timezone) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  update public.profiles p
  set language = update_my_preferences.language, timezone = update_my_preferences.timezone
  where p.id = caller_id;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  answer := public.get_my_profile();
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.ensure_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  auth_email extensions.citext;
begin
  select coalesce(u.email, u.raw_user_meta_data ->> 'email')::extensions.citext
  into auth_email
  from auth.users u where u.id = caller_id;
  if auth_email is null then
    raise exception using errcode = 'P0001', message = 'PROFILE_RECOVERY_UNAVAILABLE';
  end if;
  insert into public.profiles(id, email, role, language, timezone, invited_by)
  values (caller_id, auth_email, 'user', 'pt', 'Europe/Lisbon', null)
  on conflict (id) do nothing;
  return public.get_my_profile();
end;
$$;

create or replace function public.admin_update_user_role(
  user_id uuid,
  role public.app_role,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior jsonb;
  old_role public.app_role;
  admin_count integer;
  answer jsonb;
begin
  if not public.has_app_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  prior := public.begin_mutation(mutation_id, 'admin_update_user_role', 'profile', user_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select p.role into old_role from public.profiles p where p.id = user_id for update;
  if old_role is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if old_role = 'admin' and role <> 'admin' then
    select count(*) into admin_count from public.profiles p where p.role = 'admin';
    if admin_count <= 1 then raise exception using errcode = '55000', message = 'FINAL_ADMIN_REQUIRED'; end if;
  end if;
  update public.profiles p set role = admin_update_user_role.role where p.id = user_id;
  perform public.write_audit_event('user.role_changed', 'profile', user_id, jsonb_build_object('from', old_role, 'to', role));
  select jsonb_build_object('id', p.id, 'role', p.role) into answer from public.profiles p where p.id = user_id;
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.admin_list_users(
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answer jsonb;
begin
  if not public.has_app_role(array['admin','moderator']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  if page_size not between 1 and 100 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  select coalesce(jsonb_agg(row_data order by created_at desc, id desc), '[]'::jsonb)
  into answer
  from (
    select p.id, p.email::text as email, p.role, p.created_at,
      inviter.email::text as inviter_email,
      jsonb_build_object(
        'id', p.id, 'email', p.email::text, 'role', p.role,
        'createdAt', p.created_at, 'inviterEmail', inviter.email::text
      ) as row_data
    from public.profiles p
    left join public.profiles inviter on inviter.id = p.invited_by
    where cursor_created_at is null or (p.created_at, p.id) < (cursor_created_at, cursor_id)
    order by p.created_at desc, p.id desc
    limit page_size
  ) rows_page;
  return answer;
end;
$$;

create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitted_email extensions.citext := nullif(btrim(event -> 'user' ->> 'email'), '')::extensions.citext;
  submitted_code text := upper(btrim(event -> 'user' -> 'user_metadata' ->> 'invite_code'));
  matching_invite public.invites%rowtype;
begin
  if submitted_email is null or submitted_code !~ '^[A-Z0-9]{8}$' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'INVITE_INVALID_OR_UNAVAILABLE'));
  end if;
  select i.* into matching_invite
  from public.invites i
  where i.code = submitted_code
  for share;
  if not found
    or matching_invite.used_at is not null
    or matching_invite.revoked_at is not null
    or matching_invite.expires_at <= now()
    or (matching_invite.email is not null and lower(matching_invite.email::text) <> lower(submitted_email::text)) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'INVITE_INVALID_OR_UNAVAILABLE'));
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  signup_email extensions.citext := coalesce(new.email, new.raw_user_meta_data ->> 'email')::extensions.citext;
  signup_code text := upper(btrim(new.raw_user_meta_data ->> 'invite_code'));
  matching_invite public.invites%rowtype;
begin
  select i.* into matching_invite
  from public.invites i
  where i.code = signup_code
  for update;
  if not found
    or signup_email is null
    or matching_invite.used_at is not null
    or matching_invite.revoked_at is not null
    or matching_invite.expires_at <= now()
    or (matching_invite.email is not null and lower(matching_invite.email::text) <> lower(signup_email::text)) then
    raise exception using errcode = '42501', message = 'INVITE_INVALID_OR_UNAVAILABLE';
  end if;
  insert into public.profiles(id, email, role, invited_by)
  values (new.id, signup_email, matching_invite.assigned_role, matching_invite.created_by);
  update public.invites i
  set used_by = new.id, used_at = now()
  where i.id = matching_invite.id;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_invite(
  email text,
  assigned_role public.app_role,
  expires_at timestamptz,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  caller_role public.app_role := public.current_app_role();
  normalized_email extensions.citext := nullif(lower(btrim(email)), '')::extensions.citext;
  generated_code text;
  invite_id uuid;
  prior jsonb;
  answer jsonb;
begin
  if caller_role not in ('admin', 'moderator') or (caller_role = 'moderator' and assigned_role <> 'user') then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  if expires_at <= now() or expires_at > now() + interval '90 days' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  prior := public.begin_mutation(mutation_id, 'create_invite', 'invite', null);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if normalized_email is not null and (
    exists(select 1 from auth.users u where lower(coalesce(u.email, u.raw_user_meta_data ->> 'email')) = normalized_email::text)
    or exists(select 1 from public.invites i where i.email = normalized_email and i.used_at is null and i.revoked_at is null and i.expires_at > now())
  ) then
    raise exception using errcode = 'P0001', message = 'INVITE_TARGET_UNAVAILABLE';
  end if;
  loop
    generated_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists(select 1 from public.invites i where i.code = generated_code);
  end loop;
  insert into public.invites(code, email, created_by, assigned_role, expires_at)
  values (generated_code, normalized_email, caller_id, assigned_role, expires_at)
  returning id into invite_id;
  perform public.write_audit_event('invite.created', 'invite', invite_id, jsonb_build_object('role', assigned_role, 'emailRestricted', normalized_email is not null));
  answer := jsonb_build_object('id', invite_id, 'code', generated_code, 'email', normalized_email::text, 'role', assigned_role, 'expiresAt', expires_at);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.revoke_invite(invite_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  caller_role public.app_role := public.current_app_role();
  target public.invites%rowtype;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'revoke_invite', 'invite', invite_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into target from public.invites i where i.id = invite_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if target.used_at is not null or (caller_role <> 'admin' and target.created_by is distinct from caller_id) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  update public.invites i set revoked_at = coalesce(i.revoked_at, now()) where i.id = invite_id;
  perform public.write_audit_event('invite.revoked', 'invite', invite_id);
  answer := jsonb_build_object('id', invite_id, 'revoked', true);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.validate_invite_code(code text, email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists(
    select 1 from public.invites i
    where i.code = upper(btrim(code))
      and i.used_at is null and i.revoked_at is null and i.expires_at > now()
      and (i.email is null or lower(i.email::text) = lower(btrim(email)))
  ) then jsonb_build_object('valid', true)
  else jsonb_build_object('valid', false, 'errorCode', 'INVITE_INVALID_OR_UNAVAILABLE') end;
$$;

create or replace function public.consume_rate_limit(
  action_name text,
  hashed_key text,
  max_attempts integer,
  window_seconds integer,
  block_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket_start timestamptz;
  current_count integer;
  blocked timestamptz;
begin
  if char_length(hashed_key) < 32 or max_attempts < 1 or window_seconds < 1 or block_seconds < 1 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  bucket_start := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.request_rate_limits(action, key_hash, window_start, request_count)
  values (action_name, hashed_key, bucket_start, 1)
  on conflict (action, key_hash, window_start)
  do update set request_count = public.request_rate_limits.request_count + 1, updated_at = now()
  returning request_count, blocked_until into current_count, blocked;
  if blocked is not null and blocked > now() then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', greatest(1, ceil(extract(epoch from blocked - now()))::integer));
  end if;
  if current_count > max_attempts then
    blocked := now() + make_interval(secs => block_seconds);
    update public.request_rate_limits
    set blocked_until = blocked
    where action = action_name and key_hash = hashed_key and window_start = bucket_start;
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', block_seconds);
  end if;
  return jsonb_build_object('allowed', true, 'remaining', max_attempts - current_count);
end;
$$;

create or replace function public.broadcast_invalidation(
  resource_type text,
  resource_id uuid,
  resource_revision integer,
  mutation_type text,
  changed_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  topic text;
begin
  if resource_type not in ('cart', 'list') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  topic := case resource_type
    when 'cart' then 'cart-sync-' || resource_id::text
    else 'list-sync-' || resource_id::text
  end;
  perform realtime.send(
    jsonb_strip_nulls(jsonb_build_object(
      'event_id', extensions.uuid_generate_v4(),
      'resource_id', resource_id,
      'revision', resource_revision,
      'mutation_type', mutation_type,
      'changed_entity_id', changed_entity_id
    )),
    'invalidate',
    topic,
    true
  );
end;
$$;

create or replace function public.recalculate_cart_total_locked(target_cart_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  calculated_total numeric(12,2);
begin
  perform 1 from public.shopping_carts c where c.id = target_cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  select coalesce(sum(round(i.price * i.quantity, 2)), 0)::numeric(12,2)
  into calculated_total
  from public.shopping_cart_items i
  where i.cart_id = target_cart_id;
  update public.shopping_carts c set total = calculated_total where c.id = target_cart_id;
  return calculated_total;
end;
$$;

create or replace function public.get_or_create_active_cart(mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  cart public.shopping_carts%rowtype;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'get_or_create_active_cart', 'cart', null);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select c.* into cart from public.shopping_carts c where c.user_id = caller_id and c.finalized_at is null for update;
  if not found then
    insert into public.shopping_carts(user_id) values (caller_id)
    on conflict (user_id) where finalized_at is null do nothing
    returning * into cart;
    if cart.id is null then
      select c.* into cart from public.shopping_carts c where c.user_id = caller_id and c.finalized_at is null for update;
    end if;
  end if;
  answer := jsonb_build_object(
    'id', cart.id, 'ownerId', cart.user_id, 'storeId', cart.store_id,
    'trackingListId', cart.tracking_list_id, 'trackingState', cart.tracking_check_state,
    'total', cart.total::text, 'revision', cart.revision, 'finalizedAt', cart.finalized_at,
    'isOwner', true, 'canEditItems', true, 'canManageCart', true
  );
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_cart_by_id(cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  answer jsonb;
begin
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select jsonb_build_object(
    'id', c.id,
    'ownerId', c.user_id,
    'ownerEmail', owner.email::text,
    'storeId', c.store_id,
    'storeName', s.name::text,
    'trackingListId', c.tracking_list_id,
    'trackingState', c.tracking_check_state,
    'total', c.total::text,
    'revision', c.revision,
    'finalizedAt', c.finalized_at,
    'isOwner', c.user_id = caller_id,
    'isShared', c.user_id <> caller_id,
    'canEditItems', c.finalized_at is null,
    'canManageCart', c.user_id = caller_id and c.finalized_at is null,
    'canManageReceipts', c.user_id = caller_id and c.finalized_at is not null
  ) into answer
  from public.shopping_carts c
  join public.profiles owner on owner.id = c.user_id
  left join public.stores s on s.id = c.store_id
  where c.id = cart_id;
  if answer is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return answer;
end;
$$;

create or replace function public.get_cart_items(cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answer jsonb;
begin
  perform public.require_authenticated();
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select coalesce(jsonb_agg(item_data order by created_at, id), '[]'::jsonb)
  into answer
  from (
    select i.id, i.created_at,
      jsonb_build_object(
        'id', i.id,
        'cartId', i.cart_id,
        'productId', i.product_id,
        'productEntryId', i.product_entry_id,
        'name', i.product_name,
        'barcode', i.product_barcode,
        'price', i.price::text,
        'originalPrice', i.original_price::text,
        'quantity', i.quantity::text,
        'lineSubtotal', round(i.price * i.quantity, 2)::text,
        'lineSavings', (round(coalesce(i.original_price, i.price) * i.quantity, 2) - round(i.price * i.quantity, 2))::text,
        'revision', i.revision,
        'addedBy', i.added_by,
        'addedByEmail', contributor.email::text,
        'product', case when p.id is null then null else jsonb_build_object(
          'id', p.id, 'name', p.name, 'barcode', p.barcode, 'tags', p.tags,
          'brand', b.name::text, 'measurementQuantity', p.measurement_quantity::text,
          'unit', u.abbreviation::text
        ) end
      ) as item_data
    from public.shopping_cart_items i
    left join public.profiles contributor on contributor.id = i.added_by
    left join public.products p on p.id = i.product_id
    left join public.brands b on b.id = p.brand_id
    left join public.units u on u.id = p.unit_id
    where i.cart_id = get_cart_items.cart_id
  ) rows_data;
  return answer;
end;
$$;

create or replace function public.set_cart_store(
  cart_id uuid,
  store_id uuid,
  expected_revision integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart public.shopping_carts%rowtype;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'set_cart_store', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into cart from public.shopping_carts c where c.id = cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if cart.user_id <> auth.uid() then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  if cart.revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  if store_id is not null and not exists(select 1 from public.stores s where s.id = store_id and s.is_active) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  update public.shopping_carts c set store_id = set_cart_store.store_id, revision = c.revision + 1 where c.id = cart_id
  returning jsonb_build_object('id', c.id, 'storeId', c.store_id, 'revision', c.revision) into answer;
  perform public.broadcast_invalidation('cart', cart_id, (answer ->> 'revision')::integer, 'store_changed');
  return public.complete_mutation(mutation_id, answer);
end;
$$;

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
  prior := public.begin_mutation(mutation_id, 'add_or_merge_cart_item', 'cart', cart_id);
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
  select * into cart from public.shopping_carts c where c.id = cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  if cart.store_id is null then raise exception using errcode = '55000', message = 'STORE_REQUIRED'; end if;
  if cart.revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;

  select i.* into existing
  from public.shopping_cart_items i
  where i.cart_id = cart_id and (
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
      cart_id, submitted_product_id, submitted_name, submitted_barcode, submitted_price, submitted_original, submitted_quantity, auth.uid()
    ) returning * into saved;
  end if;

  total_value := public.recalculate_cart_total_locked(cart_id);
  update public.shopping_carts c set revision = c.revision + 1 where c.id = cart_id returning c.revision into new_revision;
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
  perform public.broadcast_invalidation('cart', cart_id, new_revision, 'item_saved', saved.id);
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
  prior := public.begin_mutation(mutation_id, 'update_cart_item', 'cart_item', item_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into cart from public.shopping_carts c where c.id = cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  select * into current_item from public.shopping_cart_items i where i.id = item_id and i.cart_id = cart_id for update;
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
  where i.id = item_id returning * into saved;
  total_value := public.recalculate_cart_total_locked(cart_id);
  update public.shopping_carts c set revision = c.revision + 1 where c.id = cart_id returning c.revision into new_revision;
  answer := jsonb_build_object(
    'item', jsonb_build_object('id', saved.id, 'name', saved.product_name, 'price', saved.price::text, 'originalPrice', saved.original_price::text, 'quantity', saved.quantity::text, 'revision', saved.revision),
    'cartRevision', new_revision, 'cartTotal', total_value::text
  );
  perform public.broadcast_invalidation('cart', cart_id, new_revision, 'item_updated', item_id);
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
  cart public.shopping_carts%rowtype;
  current_revision integer;
  total_value numeric(12,2);
  new_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'delete_cart_item', 'cart_item', item_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into cart from public.shopping_carts c where c.id = cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  select i.revision into current_revision from public.shopping_cart_items i where i.id = item_id and i.cart_id = cart_id for update;
  if not found then
    answer := jsonb_build_object('deleted', true, 'itemId', item_id, 'alreadyMissing', true, 'cartRevision', cart.revision, 'cartTotal', cart.total::text);
    return public.complete_mutation(mutation_id, answer);
  end if;
  if current_revision <> expected_item_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  delete from public.shopping_cart_items i where i.id = item_id;
  total_value := public.recalculate_cart_total_locked(cart_id);
  update public.shopping_carts c set revision = c.revision + 1 where c.id = cart_id returning c.revision into new_revision;
  answer := jsonb_build_object('deleted', true, 'itemId', item_id, 'cartRevision', new_revision, 'cartTotal', total_value::text);
  perform public.broadcast_invalidation('cart', cart_id, new_revision, 'item_deleted', item_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.attach_tracking_list(
  cart_id uuid,
  list_id uuid,
  expected_revision integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart public.shopping_carts%rowtype;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'attach_tracking_list', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into cart from public.shopping_carts c where c.id = cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  if cart.revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  if list_id is not null and not public.can_access_list(list_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  update public.shopping_carts c
  set tracking_list_id = attach_tracking_list.list_id,
      tracking_check_state = case when attach_tracking_list.list_id is null or attach_tracking_list.list_id is distinct from c.tracking_list_id
        then '{"manuallyChecked":[],"suppressedAutoMatch":[]}'::jsonb else c.tracking_check_state end,
      revision = c.revision + 1
  where c.id = cart_id
  returning jsonb_build_object('cartId', c.id, 'listId', c.tracking_list_id, 'state', c.tracking_check_state, 'revision', c.revision) into answer;
  perform public.broadcast_invalidation('cart', cart_id, (answer ->> 'revision')::integer, 'tracking_list_changed', list_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_tracking_state(cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answer jsonb;
begin
  perform public.require_authenticated();
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select jsonb_build_object(
    'cartId', c.id, 'listId', c.tracking_list_id, 'state', c.tracking_check_state,
    'revision', c.revision,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'productId', i.product_id, 'name', coalesce(p.name, i.product_name),
        'barcode', coalesce(p.barcode, i.product_barcode), 'quantity', i.planned_quantity::text,
        'revision', i.revision
      ) order by i.created_at, i.id)
      from public.shopping_list_items i
      left join public.products p on p.id = i.product_id
      where i.list_id = c.tracking_list_id
    ), '[]'::jsonb)
  ) into answer
  from public.shopping_carts c where c.id = cart_id;
  if answer is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return answer;
end;
$$;

create or replace function public.update_tracking_state(
  cart_id uuid,
  state jsonb,
  expected_revision integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart public.shopping_carts%rowtype;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'update_tracking_state', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if not public.is_valid_tracking_state(state) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  select * into cart from public.shopping_carts c where c.id = cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then raise exception using errcode = '55000', message = 'CART_FINALIZED'; end if;
  if cart.tracking_list_id is null then raise exception using errcode = '55000', message = 'TRACKING_LIST_REQUIRED'; end if;
  if cart.revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  if exists (
    select 1 from (
      select value::uuid as id from jsonb_array_elements_text(state -> 'manuallyChecked')
      union all
      select value::uuid as id from jsonb_array_elements_text(state -> 'suppressedAutoMatch')
    ) requested
    where not exists (
      select 1 from public.shopping_list_items i
      where i.id = requested.id and i.list_id = cart.tracking_list_id
    )
  ) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  update public.shopping_carts c
  set tracking_check_state = state, revision = c.revision + 1
  where c.id = cart_id
  returning jsonb_build_object('cartId', c.id, 'listId', c.tracking_list_id, 'state', c.tracking_check_state, 'revision', c.revision) into answer;
  perform public.broadcast_invalidation('cart', cart_id, (answer ->> 'revision')::integer, 'tracking_state_changed');
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_shared_active_carts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'ownerEmail', owner.email::text, 'storeId', c.store_id,
      'storeName', st.name::text, 'total', c.total::text, 'revision', c.revision,
      'updatedAt', c.updated_at
    ) order by c.updated_at desc, c.id desc
  ), '[]'::jsonb)
  from public.cart_shares s
  join public.shopping_carts c on c.id = s.cart_id and c.finalized_at is null
  join public.profiles owner on owner.id = c.user_id
  left join public.stores st on st.id = c.store_id
  where s.shared_with_user_id = (select auth.uid());
$$;

create or replace function public.share_cart_with_email(
  cart_id uuid,
  email text,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  target_id uuid;
  target_email text;
  share_id uuid;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'share_cart_with_email', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  perform 1 from public.shopping_carts c where c.id = cart_id and c.user_id = caller_id and c.finalized_at is null for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select p.id, p.email::text into target_id, target_email
  from public.profiles p where lower(p.email::text) = lower(btrim(email));
  if target_id is null or target_id = caller_id or exists(select 1 from public.cart_shares s where s.cart_id = share_cart_with_email.cart_id and s.shared_with_user_id = target_id) then
    raise exception using errcode = 'P0001', message = 'SHARE_TARGET_UNAVAILABLE';
  end if;
  insert into public.cart_shares(cart_id, shared_with_user_id, created_by)
  values (cart_id, target_id, caller_id) returning id into share_id;
  perform public.write_audit_event('cart.member_added', 'cart', cart_id, jsonb_build_object('shareId', share_id));
  answer := jsonb_build_object('id', share_id, 'userId', target_id, 'email', target_email);
  perform public.broadcast_invalidation('cart', cart_id, (select revision from public.shopping_carts where id = cart_id), 'member_added', target_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_cart_members(cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answer jsonb;
begin
  perform public.require_authenticated();
  if not public.is_cart_owner(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('shareId', s.id, 'userId', p.id, 'email', p.email::text, 'createdAt', s.created_at) order by s.created_at, s.id), '[]'::jsonb)
  into answer
  from public.cart_shares s join public.profiles p on p.id = s.shared_with_user_id
  where s.cart_id = get_cart_members.cart_id;
  return answer;
end;
$$;

create or replace function public.revoke_cart_share(cart_id uuid, member_user_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'revoke_cart_share', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  perform 1 from public.shopping_carts c where c.id = cart_id and c.user_id = auth.uid() for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  delete from public.cart_shares s where s.cart_id = revoke_cart_share.cart_id and s.shared_with_user_id = member_user_id;
  answer := jsonb_build_object('revoked', true, 'userId', member_user_id);
  perform public.write_audit_event('cart.member_revoked', 'cart', cart_id);
  perform public.broadcast_invalidation('cart', cart_id, (select revision from public.shopping_carts where id = cart_id), 'member_revoked', member_user_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.leave_shared_cart(cart_id uuid, mutation_id uuid)
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
  prior := public.begin_mutation(mutation_id, 'leave_shared_cart', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  delete from public.cart_shares s where s.cart_id = leave_shared_cart.cart_id and s.shared_with_user_id = caller_id;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  answer := jsonb_build_object('left', true, 'cartId', cart_id);
  perform public.broadcast_invalidation('cart', cart_id, (select revision from public.shopping_carts where id = cart_id), 'member_left', caller_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.create_or_rotate_cart_join_token(
  cart_id uuid,
  expires_at timestamptz,
  max_uses integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  plain_token text;
  invite_id uuid;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'rotate_cart_join_token', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  perform 1 from public.shopping_carts c where c.id = cart_id and c.user_id = caller_id and c.finalized_at is null for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if expires_at <= now() or expires_at > now() + interval '30 days' or (max_uses is not null and max_uses not between 1 and 100) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  update public.resource_join_invites r set revoked_at = now()
  where r.resource_type = 'cart' and r.resource_id = cart_id and r.revoked_at is null;
  plain_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.resource_join_invites(resource_type, resource_id, token_hash, created_by, expires_at, max_uses)
  values ('cart', cart_id, extensions.digest(plain_token, 'sha256'), caller_id, expires_at, max_uses)
  returning id into invite_id;
  perform public.write_audit_event('cart.join_token_rotated', 'cart', cart_id, jsonb_build_object('inviteId', invite_id, 'hasMaxUses', max_uses is not null));
  answer := jsonb_build_object('id', invite_id, 'token', plain_token, 'expiresAt', expires_at, 'maxUses', max_uses);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.revoke_cart_join_token(cart_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'revoke_cart_join_token', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if not public.is_cart_owner(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  update public.resource_join_invites r set revoked_at = coalesce(r.revoked_at, now())
  where r.resource_type = 'cart' and r.resource_id = cart_id and r.revoked_at is null;
  answer := jsonb_build_object('revoked', true, 'cartId', cart_id);
  perform public.write_audit_event('cart.join_token_revoked', 'cart', cart_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.preview_cart_join_token(token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answer jsonb;
begin
  perform public.require_authenticated();
  if token is null or char_length(token) < 40 then return jsonb_build_object('valid', false, 'errorCode', 'TOKEN_INVALID_OR_UNAVAILABLE'); end if;
  select jsonb_build_object('valid', true, 'resourceType', 'cart', 'resourceId', c.id, 'ownerEmail', p.email::text, 'storeName', s.name::text)
  into answer
  from public.resource_join_invites r
  join public.shopping_carts c on c.id = r.resource_id and c.finalized_at is null
  join public.profiles p on p.id = c.user_id
  left join public.stores s on s.id = c.store_id
  where r.resource_type = 'cart' and r.token_hash = extensions.digest(token, 'sha256')
    and r.revoked_at is null and r.expires_at > now() and (r.max_uses is null or r.use_count < r.max_uses);
  return coalesce(answer, jsonb_build_object('valid', false, 'errorCode', 'TOKEN_INVALID_OR_UNAVAILABLE'));
end;
$$;

create or replace function public.join_cart_by_token(token text, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  join_invite public.resource_join_invites%rowtype;
  owner_id uuid;
  inserted_share uuid;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'join_cart_by_token', 'cart', null);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if token is null or char_length(token) < 40 then raise exception using errcode = 'P0001', message = 'TOKEN_INVALID_OR_UNAVAILABLE'; end if;
  select * into join_invite from public.resource_join_invites r
  where r.resource_type = 'cart' and r.token_hash = extensions.digest(token, 'sha256') for update;
  if not found or join_invite.revoked_at is not null or join_invite.expires_at <= now()
    or (join_invite.max_uses is not null and join_invite.use_count >= join_invite.max_uses) then
    raise exception using errcode = 'P0001', message = 'TOKEN_INVALID_OR_UNAVAILABLE';
  end if;
  select c.user_id into owner_id from public.shopping_carts c where c.id = join_invite.resource_id and c.finalized_at is null for update;
  if owner_id is null or owner_id = caller_id then raise exception using errcode = 'P0001', message = 'TOKEN_INVALID_OR_UNAVAILABLE'; end if;
  insert into public.cart_shares(cart_id, shared_with_user_id, created_by)
  values (join_invite.resource_id, caller_id, owner_id)
  on conflict (cart_id, shared_with_user_id) do nothing returning id into inserted_share;
  if inserted_share is not null then
    update public.resource_join_invites r set use_count = r.use_count + 1 where r.id = join_invite.id;
  end if;
  answer := jsonb_build_object('joined', true, 'cartId', join_invite.resource_id, 'alreadyMember', inserted_share is null);
  if inserted_share is not null then
    perform public.broadcast_invalidation('cart', join_invite.resource_id, (select revision from public.shopping_carts where id = join_invite.resource_id), 'member_joined', caller_id);
  end if;
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.finalize_cart(
  cart_id uuid,
  idempotency_key uuid,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  cart public.shopping_carts%rowtype;
  cart_item public.shopping_cart_items%rowtype;
  resolved_product_id uuid;
  entry_id uuid;
  final_total numeric(12,2);
  item_count integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'finalize_cart', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into cart from public.shopping_carts c where c.id = cart_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if cart.user_id <> caller_id then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if cart.finalized_at is not null then
    if cart.checkout_idempotency_key = idempotency_key then
      select count(*) into item_count from public.shopping_cart_items i where i.cart_id = cart_id;
      answer := jsonb_build_object('cartId', cart.id, 'total', cart.total::text, 'finalizedAt', cart.finalized_at, 'itemCount', item_count, 'idempotentReplay', true);
      return public.complete_mutation(mutation_id, answer);
    end if;
    raise exception using errcode = '55000', message = 'CART_FINALIZED';
  end if;
  if cart.store_id is null then raise exception using errcode = '55000', message = 'STORE_REQUIRED'; end if;
  if not exists(select 1 from public.stores s where s.id = cart.store_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  select count(*) into item_count from public.shopping_cart_items i where i.cart_id = cart_id;
  if item_count = 0 then raise exception using errcode = '55000', message = 'CART_EMPTY'; end if;
  if exists(select 1 from public.shopping_carts c where c.checkout_idempotency_key = idempotency_key and c.id <> cart_id) then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;

  for cart_item in select * from public.shopping_cart_items i where i.cart_id = cart_id order by i.id for update loop
    resolved_product_id := cart_item.product_id;
    if resolved_product_id is null and cart_item.product_barcode is not null then
      select p.id into resolved_product_id from public.products p where p.barcode = cart_item.product_barcode order by p.created_at, p.id limit 1;
    end if;
    if resolved_product_id is null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('product:' || public.normalize_name(cart_item.product_name), 0));
      select p.id into resolved_product_id from public.products p
      where public.normalize_name(p.name) = public.normalize_name(cart_item.product_name)
      order by p.is_active desc, p.created_at, p.id limit 1;
    end if;
    if resolved_product_id is null then
      insert into public.products(name, barcode, created_by)
      values (cart_item.product_name, cart_item.product_barcode, caller_id)
      returning id into resolved_product_id;
    end if;
    update public.shopping_cart_items i set product_id = resolved_product_id where i.id = cart_item.id;
    insert into public.product_entries(
      product_id, store_id, price, original_price, quantity, created_by, source_cart_id, source_cart_item_id
    ) values (
      resolved_product_id, cart.store_id, cart_item.price, cart_item.original_price, cart_item.quantity,
      caller_id, cart_id, cart_item.id
    ) returning id into entry_id;
    update public.shopping_cart_items i set product_entry_id = entry_id where i.id = cart_item.id;
  end loop;

  final_total := public.recalculate_cart_total_locked(cart_id);
  update public.shopping_carts c
  set total = final_total, checkout_idempotency_key = idempotency_key,
      finalized_at = now(), revision = c.revision + 1
  where c.id = cart_id returning * into cart;
  perform public.write_audit_event('cart.finalized', 'cart', cart_id, jsonb_build_object('itemCount', item_count, 'storeId', cart.store_id));
  answer := jsonb_build_object(
    'cartId', cart.id, 'storeId', cart.store_id, 'total', cart.total::text,
    'finalizedAt', cart.finalized_at, 'itemCount', item_count, 'revision', cart.revision,
    'idempotentReplay', false
  );
  perform public.broadcast_invalidation('cart', cart_id, cart.revision, 'finalized');
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_lists_directory(
  cursor_updated_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  answer jsonb;
begin
  if page_size not between 1 and 100 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  with authorized as (
    select l.id, l.user_id, l.name, l.revision, l.created_at, l.updated_at, false as is_shared
    from public.shopping_lists l where l.user_id = caller_id
    union
    select l.id, l.user_id, l.name, l.revision, l.created_at, l.updated_at, true as is_shared
    from public.shopping_lists l join public.list_shares s on s.list_id = l.id
    where s.shared_with_user_id = caller_id
  ), page as (
    select a.*, p.email::text as owner_email,
      (select count(*) from public.shopping_list_items i where i.list_id = a.id)::integer as item_count
    from authorized a join public.profiles p on p.id = a.user_id
    where cursor_updated_at is null or (a.updated_at, a.id) < (cursor_updated_at, cursor_id)
    order by a.updated_at desc, a.id desc limit page_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'revision', revision, 'ownerId', user_id,
    'ownerEmail', owner_email, 'isShared', is_shared, 'itemCount', item_count,
    'createdAt', created_at, 'updatedAt', updated_at
  ) order by updated_at desc, id desc), '[]'::jsonb) into answer from page;
  return answer;
end;
$$;

create or replace function public.create_list(name text, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  list_row public.shopping_lists%rowtype;
  prior jsonb;
  answer jsonb;
begin
  if char_length(btrim(name)) not between 1 and 160 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  prior := public.begin_mutation(mutation_id, 'create_list', 'list', null);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  insert into public.shopping_lists(user_id, name) values (caller_id, btrim(name)) returning * into list_row;
  answer := jsonb_build_object('id', list_row.id, 'name', list_row.name, 'revision', list_row.revision, 'isShared', false, 'ownerId', caller_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.delete_resource_join_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.resource_join_invites r
  where r.resource_type = case tg_table_name when 'shopping_carts' then 'cart' else 'list' end
    and r.resource_id = old.id;
  return old;
end;
$$;

create trigger shopping_carts_delete_join_invites before delete on public.shopping_carts
for each row execute function public.delete_resource_join_invites();
create trigger shopping_lists_delete_join_invites before delete on public.shopping_lists
for each row execute function public.delete_resource_join_invites();

create or replace function public.delete_list(list_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  list_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'delete_list', 'list', list_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select l.revision into list_revision from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid() for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  perform public.broadcast_invalidation('list', list_id, list_revision + 1, 'deleted');
  delete from public.shopping_lists l where l.id = list_id;
  answer := jsonb_build_object('deleted', true, 'listId', list_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_list_by_id(list_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  answer jsonb;
begin
  if not public.can_access_list(list_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select jsonb_build_object(
    'id', l.id, 'name', l.name, 'revision', l.revision,
    'ownerId', l.user_id, 'ownerEmail', p.email::text,
    'isOwner', l.user_id = caller_id, 'isShared', l.user_id <> caller_id,
    'canManage', l.user_id = caller_id, 'createdAt', l.created_at, 'updatedAt', l.updated_at
  ) into answer
  from public.shopping_lists l join public.profiles p on p.id = l.user_id where l.id = list_id;
  if answer is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return answer;
end;
$$;

create or replace function public.get_list_items(list_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answer jsonb;
begin
  perform public.require_authenticated();
  if not public.can_access_list(list_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'listId', i.list_id, 'productId', i.product_id,
    'name', coalesce(p.name, i.product_name), 'barcode', coalesce(p.barcode, i.product_barcode),
    'quantity', i.planned_quantity::text, 'revision', i.revision,
    'addedBy', i.added_by, 'addedByEmail', contributor.email::text,
    'createdAt', i.created_at
  ) order by i.created_at, i.id), '[]'::jsonb) into answer
  from public.shopping_list_items i
  left join public.products p on p.id = i.product_id
  left join public.profiles contributor on contributor.id = i.added_by
  where i.list_id = get_list_items.list_id;
  return answer;
end;
$$;

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

create or replace function public.share_list_with_email(list_id uuid, email text, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  target_id uuid;
  target_email text;
  share_id uuid;
  list_revision integer;
  prior jsonb;
  answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'share_list_with_email', 'list', list_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select l.revision into list_revision from public.shopping_lists l where l.id = list_id and l.user_id = caller_id for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select p.id, p.email::text into target_id, target_email from public.profiles p where lower(p.email::text) = lower(btrim(email));
  if target_id is null or target_id = caller_id or exists(select 1 from public.list_shares s where s.list_id = share_list_with_email.list_id and s.shared_with_user_id = target_id) then
    raise exception using errcode = 'P0001', message = 'SHARE_TARGET_UNAVAILABLE';
  end if;
  insert into public.list_shares(list_id, shared_with_user_id, created_by) values (list_id, target_id, caller_id) returning id into share_id;
  answer := jsonb_build_object('id', share_id, 'userId', target_id, 'email', target_email);
  perform public.write_audit_event('list.member_added', 'list', list_id, jsonb_build_object('shareId', share_id));
  perform public.broadcast_invalidation('list', list_id, list_revision, 'member_added', target_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_list_members(list_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare answer jsonb;
begin
  perform public.require_authenticated();
  if not public.is_list_owner(list_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('shareId', s.id, 'userId', p.id, 'email', p.email::text, 'createdAt', s.created_at) order by s.created_at, s.id), '[]'::jsonb)
  into answer from public.list_shares s join public.profiles p on p.id = s.shared_with_user_id where s.list_id = get_list_members.list_id;
  return answer;
end;
$$;

create or replace function public.revoke_list_share(list_id uuid, member_user_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare prior jsonb; answer jsonb; list_revision integer;
begin
  prior := public.begin_mutation(mutation_id, 'revoke_list_share', 'list', list_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select l.revision into list_revision from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid() for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  delete from public.list_shares s where s.list_id = revoke_list_share.list_id and s.shared_with_user_id = member_user_id;
  answer := jsonb_build_object('revoked', true, 'userId', member_user_id);
  perform public.write_audit_event('list.member_revoked', 'list', list_id);
  perform public.broadcast_invalidation('list', list_id, list_revision, 'member_revoked', member_user_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.leave_shared_list(list_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); prior jsonb; answer jsonb; list_revision integer;
begin
  prior := public.begin_mutation(mutation_id, 'leave_shared_list', 'list', list_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select l.revision into list_revision from public.shopping_lists l where l.id = list_id;
  delete from public.list_shares s where s.list_id = leave_shared_list.list_id and s.shared_with_user_id = caller_id;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  answer := jsonb_build_object('left', true, 'listId', list_id);
  perform public.broadcast_invalidation('list', list_id, list_revision, 'member_left', caller_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.create_or_rotate_list_join_token(
  list_id uuid,
  expires_at timestamptz,
  max_uses integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); plain_token text; invite_id uuid; prior jsonb; answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'rotate_list_join_token', 'list', list_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  perform 1 from public.shopping_lists l where l.id = list_id and l.user_id = caller_id for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if expires_at <= now() or expires_at > now() + interval '30 days' or (max_uses is not null and max_uses not between 1 and 100) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  update public.resource_join_invites r set revoked_at = now() where r.resource_type = 'list' and r.resource_id = list_id and r.revoked_at is null;
  plain_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.resource_join_invites(resource_type, resource_id, token_hash, created_by, expires_at, max_uses)
  values ('list', list_id, extensions.digest(plain_token, 'sha256'), caller_id, expires_at, max_uses) returning id into invite_id;
  answer := jsonb_build_object('id', invite_id, 'token', plain_token, 'expiresAt', expires_at, 'maxUses', max_uses);
  perform public.write_audit_event('list.join_token_rotated', 'list', list_id, jsonb_build_object('inviteId', invite_id, 'hasMaxUses', max_uses is not null));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.revoke_list_join_token(list_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare prior jsonb; answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'revoke_list_join_token', 'list', list_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if not public.is_list_owner(list_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  update public.resource_join_invites r set revoked_at = coalesce(r.revoked_at, now()) where r.resource_type = 'list' and r.resource_id = list_id and r.revoked_at is null;
  answer := jsonb_build_object('revoked', true, 'listId', list_id);
  perform public.write_audit_event('list.join_token_revoked', 'list', list_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.preview_list_join_token(token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare answer jsonb;
begin
  perform public.require_authenticated();
  if token is null or char_length(token) < 40 then return jsonb_build_object('valid', false, 'errorCode', 'TOKEN_INVALID_OR_UNAVAILABLE'); end if;
  select jsonb_build_object('valid', true, 'resourceType', 'list', 'resourceId', l.id, 'resourceName', l.name, 'ownerEmail', p.email::text)
  into answer from public.resource_join_invites r join public.shopping_lists l on l.id = r.resource_id join public.profiles p on p.id = l.user_id
  where r.resource_type = 'list' and r.token_hash = extensions.digest(token, 'sha256')
    and r.revoked_at is null and r.expires_at > now() and (r.max_uses is null or r.use_count < r.max_uses);
  return coalesce(answer, jsonb_build_object('valid', false, 'errorCode', 'TOKEN_INVALID_OR_UNAVAILABLE'));
end;
$$;

create or replace function public.join_list_by_token(token text, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); join_invite public.resource_join_invites%rowtype; owner_id uuid; inserted_share uuid; prior jsonb; answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'join_list_by_token', 'list', null);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if token is null or char_length(token) < 40 then raise exception using errcode = 'P0001', message = 'TOKEN_INVALID_OR_UNAVAILABLE'; end if;
  select * into join_invite from public.resource_join_invites r where r.resource_type = 'list' and r.token_hash = extensions.digest(token, 'sha256') for update;
  if not found or join_invite.revoked_at is not null or join_invite.expires_at <= now()
    or (join_invite.max_uses is not null and join_invite.use_count >= join_invite.max_uses) then
    raise exception using errcode = 'P0001', message = 'TOKEN_INVALID_OR_UNAVAILABLE';
  end if;
  select l.user_id into owner_id from public.shopping_lists l where l.id = join_invite.resource_id for update;
  if owner_id is null or owner_id = caller_id then raise exception using errcode = 'P0001', message = 'TOKEN_INVALID_OR_UNAVAILABLE'; end if;
  insert into public.list_shares(list_id, shared_with_user_id, created_by) values (join_invite.resource_id, caller_id, owner_id)
  on conflict (list_id, shared_with_user_id) do nothing returning id into inserted_share;
  if inserted_share is not null then update public.resource_join_invites r set use_count = r.use_count + 1 where r.id = join_invite.id; end if;
  answer := jsonb_build_object('joined', true, 'listId', join_invite.resource_id, 'alreadyMember', inserted_share is null);
  if inserted_share is not null then perform public.broadcast_invalidation('list', join_invite.resource_id, (select revision from public.shopping_lists where id = join_invite.resource_id), 'member_joined', caller_id); end if;
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_history_page(
  cursor_finalized_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare answer jsonb;
begin
  perform public.require_authenticated();
  if page_size not between 1 and 100 or (cursor_finalized_at is null) <> (cursor_id is null) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select coalesce(jsonb_agg(page.row_data order by page.finalized_at desc, page.id desc), '[]'::jsonb)
  into answer
  from (
    select authorized.id, authorized.finalized_at,
      jsonb_build_object(
        'id', authorized.id,
        'finalizedAt', authorized.finalized_at,
        'ownerEmail', authorized.owner_email,
        'isShared', authorized.is_shared,
        'store', case when authorized.store_id is null then null else jsonb_build_object(
          'id', authorized.store_id,
          'name', authorized.store_name
        ) end,
        'total', authorized.total,
        'itemCount', (select count(*) from public.shopping_cart_items ci where ci.cart_id = authorized.id)
      ) as row_data
    from (
      select c.id, c.finalized_at, c.total, c.store_id, s.name::text as store_name,
        owner_profile.email::text as owner_email, false as is_shared
      from public.shopping_carts c
      join public.profiles owner_profile on owner_profile.id = c.user_id
      left join public.stores s on s.id = c.store_id
      where c.user_id = auth.uid() and c.finalized_at is not null
      union all
      select c.id, c.finalized_at, c.total, c.store_id, s.name::text as store_name,
        owner_profile.email::text as owner_email, true as is_shared
      from public.cart_shares share
      join public.shopping_carts c on c.id = share.cart_id
      join public.profiles owner_profile on owner_profile.id = c.user_id
      left join public.stores s on s.id = c.store_id
      where share.shared_with_user_id = auth.uid() and c.finalized_at is not null
    ) authorized
    where cursor_finalized_at is null
      or (authorized.finalized_at, authorized.id) < (cursor_finalized_at, cursor_id)
    order by authorized.finalized_at desc, authorized.id desc
    limit page_size
  ) page;
  return answer;
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

create or replace function public.get_history_cart_items(cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare answer jsonb;
begin
  perform public.require_authenticated();
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if not exists(select 1 from public.shopping_carts c where c.id = cart_id and c.finalized_at is not null) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'productId', i.product_id,
    'productEntryId', i.product_entry_id,
    'name', i.product_name,
    'barcode', i.product_barcode,
    'price', i.price,
    'originalPrice', i.original_price,
    'quantity', i.quantity,
    'lineTotal', round(i.price * i.quantity, 2),
    'addedByEmail', contributor.email::text,
    'createdAt', i.created_at
  ) order by i.created_at, i.id), '[]'::jsonb)
  into answer
  from public.shopping_cart_items i
  left join public.profiles contributor on contributor.id = i.added_by
  where i.cart_id = get_history_cart_items.cart_id;
  return answer;
end;
$$;

create or replace function public.get_history_cart_receipts(cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare answer jsonb;
begin
  perform public.require_authenticated();
  if not public.can_access_cart(cart_id) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if not exists(select 1 from public.shopping_carts c where c.id = cart_id and c.finalized_at is not null) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'bucketId', r.bucket_id,
    'objectPath', r.object_path,
    'mimeType', r.mime_type,
    'byteSize', r.byte_size,
    'width', r.width,
    'height', r.height,
    'sortOrder', r.sort_order,
    'createdAt', r.created_at
  ) order by r.sort_order, r.created_at, r.id), '[]'::jsonb)
  into answer
  from public.cart_receipt_images r
  where r.cart_id = get_history_cart_receipts.cart_id;
  return answer;
end;
$$;

create or replace function public.create_receipt_metadata(cart_id uuid, metadata jsonb, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated();
  prior jsonb;
  receipt_id uuid;
  next_sort integer;
  answer jsonb;
  object_path text := metadata ->> 'objectPath';
  mime_type text := metadata ->> 'mimeType';
  byte_size bigint;
  image_width integer;
  image_height integer;
begin
  prior := public.begin_mutation(mutation_id, 'create_receipt_metadata', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  perform 1 from public.shopping_carts c
  where c.id = cart_id and c.user_id = caller_id and c.finalized_at is not null
  for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if jsonb_typeof(metadata) <> 'object'
    or exists(select 1 from jsonb_object_keys(metadata) key_name where key_name not in ('objectPath','mimeType','byteSize','width','height'))
    or object_path is null
    or object_path not like caller_id::text || '/' || cart_id::text || '/%'
    or object_path ~ '(^|/)\.\.(/|$)'
    or mime_type not in ('image/jpeg','image/png','image/webp') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  begin
    byte_size := (metadata ->> 'byteSize')::bigint;
    image_width := nullif(metadata ->> 'width', '')::integer;
    image_height := nullif(metadata ->> 'height', '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end;
  if byte_size <= 0 or image_width is not null and image_width <= 0 or image_height is not null and image_height <= 0 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  select coalesce(max(r.sort_order), -1) + 1 into next_sort from public.cart_receipt_images r where r.cart_id = create_receipt_metadata.cart_id;
  insert into public.cart_receipt_images(cart_id, object_path, mime_type, byte_size, width, height, sort_order, uploaded_by)
  values (cart_id, object_path, mime_type, byte_size, image_width, image_height, next_sort, caller_id)
  returning id into receipt_id;
  answer := jsonb_build_object('id', receipt_id, 'cartId', cart_id, 'objectPath', object_path, 'sortOrder', next_sort);
  perform public.write_audit_event('receipt.metadata_created', 'receipt', receipt_id, jsonb_build_object('cartId', cart_id, 'mimeType', mime_type, 'byteSize', byte_size));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.reorder_receipts(cart_id uuid, ordered_ids uuid[], mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); prior jsonb; answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'reorder_receipts', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  perform 1 from public.shopping_carts c where c.id = cart_id and c.user_id = caller_id and c.finalized_at is not null for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if ordered_ids is null
    or cardinality(ordered_ids) <> (select count(*) from public.cart_receipt_images r where r.cart_id = reorder_receipts.cart_id)
    or (select count(distinct item_id) from unnest(ordered_ids) item_id) <> cardinality(ordered_ids)
    or exists(select 1 from unnest(ordered_ids) item_id where not exists(
      select 1 from public.cart_receipt_images r where r.cart_id = reorder_receipts.cart_id and r.id = item_id
    )) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  update public.cart_receipt_images r
  set sort_order = ordering.position - 1
  from unnest(ordered_ids) with ordinality ordering(id, position)
  where r.id = ordering.id and r.cart_id = reorder_receipts.cart_id;
  answer := jsonb_build_object('cartId', cart_id, 'orderedIds', to_jsonb(ordered_ids));
  perform public.write_audit_event('receipt.reordered', 'cart', cart_id, jsonb_build_object('count', cardinality(ordered_ids)));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.delete_receipt(cart_id uuid, receipt_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); prior jsonb; object_path text; answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'delete_receipt', 'receipt', receipt_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  perform 1 from public.shopping_carts c where c.id = cart_id and c.user_id = caller_id and c.finalized_at is not null for update;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  delete from public.cart_receipt_images r
  where r.id = receipt_id and r.cart_id = delete_receipt.cart_id
  returning r.object_path into object_path;
  if object_path is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  answer := jsonb_build_object('id', receipt_id, 'cartId', cart_id, 'objectPath', object_path, 'deleted', true);
  perform public.write_audit_event('receipt.metadata_deleted', 'receipt', receipt_id, jsonb_build_object('cartId', cart_id));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace view public.latest_product_prices
with (security_invoker = true)
as
select distinct on (entry.product_id, entry.store_id)
  entry.id as entry_id,
  entry.product_id,
  entry.store_id,
  entry.price,
  entry.original_price,
  entry.quantity,
  entry.created_at,
  product.name as product_name,
  product.barcode,
  store.name::text as store_name
from public.product_entries entry
join public.products product on product.id = entry.product_id
join public.stores store on store.id = entry.store_id
order by entry.product_id, entry.store_id, entry.created_at desc, entry.id desc;

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
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name::text, 'abbreviation', u.abbreviation::text, 'isActive', u.is_active, 'isDefault', u.is_default) order by u.is_default desc, u.name::text, u.id), '[]'::jsonb) from public.units u where elevated or u.is_active)
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

create or replace function public.get_product_detail(product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare answer jsonb; elevated boolean;
begin
  perform public.require_authenticated();
  elevated := public.has_app_role(array['admin','moderator']::public.app_role[]);
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'barcode', p.barcode, 'tags', p.tags,
    'measurementQuantity', p.measurement_quantity, 'isActive', p.is_active,
    'categoryId', p.category_id, 'subcategoryId', p.subcategory_id, 'brandId', p.brand_id, 'unitId', p.unit_id,
    'categoryName', c.name::text, 'subcategoryName', sc.name::text, 'brandName', b.name::text,
    'unitName', u.name::text, 'unitAbbreviation', u.abbreviation::text,
    'createdAt', p.created_at, 'updatedAt', p.updated_at
  ) into answer
  from public.products p
  left join public.categories c on c.id = p.category_id
  left join public.categories sc on sc.id = p.subcategory_id
  left join public.brands b on b.id = p.brand_id
  left join public.units u on u.id = p.unit_id
  where p.id = get_product_detail.product_id and (p.is_active or elevated);
  if answer is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return answer;
end;
$$;

create or replace function public.get_product_price_history(
  product_id uuid,
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
declare answer jsonb; elevated boolean;
begin
  perform public.require_authenticated();
  elevated := public.has_app_role(array['admin','moderator']::public.app_role[]);
  if page_size not between 1 and 100 or (cursor_created_at is null) <> (cursor_id is null) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  if not exists(select 1 from public.products p where p.id = product_id and (p.is_active or elevated)) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(page.row_data order by page.created_at desc, page.id desc), '[]'::jsonb)
  into answer from (
    select e.id, e.created_at, jsonb_build_object(
      'id', e.id, 'storeId', e.store_id, 'storeName', s.name::text, 'price', e.price,
      'originalPrice', e.original_price, 'quantity', e.quantity, 'createdAt', e.created_at,
      'sourceCartId', case when elevated then e.source_cart_id else null end
    ) row_data
    from public.product_entries e join public.stores s on s.id = e.store_id
    where e.product_id = get_product_price_history.product_id
      and (cursor_created_at is null or (e.created_at, e.id) < (cursor_created_at, cursor_id))
    order by e.created_at desc, e.id desc limit page_size
  ) page;
  return answer;
end;
$$;

create or replace function public.get_or_create_unverified_brand(name text, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); clean_name text := btrim(name); prior jsonb; target public.brands%rowtype; answer jsonb;
begin
  if public.current_app_role() <> 'user' then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  prior := public.begin_mutation(mutation_id, 'get_or_create_unverified_brand', 'brand', null);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if char_length(clean_name) not between 1 and 120 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  insert into public.brands(name, is_active, is_verified, created_by)
  values (clean_name, true, false, caller_id)
  on conflict (name) do nothing
  returning * into target;
  if target.id is null then select * into target from public.brands b where b.name = clean_name::extensions.citext; end if;
  if not target.is_active then raise exception using errcode = 'P0001', message = 'BRAND_UNAVAILABLE'; end if;
  answer := jsonb_build_object('id', target.id, 'name', target.name::text, 'isVerified', target.is_verified, 'created', target.created_by = caller_id and not target.is_verified);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.create_product(product jsonb, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.require_authenticated(); prior jsonb; target_id uuid; answer jsonb;
  product_name text := btrim(product ->> 'name'); product_barcode text := public.normalize_barcode(product ->> 'barcode');
  category_id uuid; subcategory_id uuid; brand_id uuid; unit_id uuid; measurement_quantity numeric(12,3); product_tags text[];
begin
  prior := public.begin_mutation(mutation_id, 'create_product', 'product', null);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if jsonb_typeof(product) <> 'object' or char_length(product_name) not between 1 and 200 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  begin
    category_id := nullif(product ->> 'categoryId', '')::uuid;
    subcategory_id := nullif(product ->> 'subcategoryId', '')::uuid;
    brand_id := nullif(product ->> 'brandId', '')::uuid;
    unit_id := nullif(product ->> 'unitId', '')::uuid;
    measurement_quantity := nullif(product ->> 'measurementQuantity', '')::numeric(12,3);
    if product ? 'tags' then select coalesce(array_agg(value), '{}') into product_tags from jsonb_array_elements_text(product -> 'tags'); else product_tags := '{}'; end if;
  exception when others then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end;
  if (measurement_quantity is null) <> (unit_id is null)
    or category_id is not null and not exists(select 1 from public.categories c where c.id = category_id and c.is_active)
    or subcategory_id is not null and not exists(select 1 from public.categories c where c.id = subcategory_id and c.is_active)
    or brand_id is not null and not exists(select 1 from public.brands b where b.id = brand_id and b.is_active)
    or unit_id is not null and not exists(select 1 from public.units u where u.id = unit_id and u.is_active) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  insert into public.products(name, barcode, category_id, subcategory_id, brand_id, tags, measurement_quantity, unit_id, created_by)
  values (product_name, product_barcode, category_id, subcategory_id, brand_id, product_tags, measurement_quantity, unit_id, caller_id)
  returning id into target_id;
  answer := public.get_product_detail(target_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.catalog_save_store(
  store_id uuid,
  name text,
  is_active boolean,
  sort_order integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_id uuid := coalesce(store_id, extensions.uuid_generate_v4()); clean_name text := btrim(name); prior jsonb; answer jsonb;
begin
  if not public.has_app_role(array['admin','moderator']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  prior := public.begin_mutation(mutation_id, 'catalog_save_store', 'store', target_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if char_length(clean_name) not between 1 and 120 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  if store_id is null then
    insert into public.stores(id, name, is_active, sort_order) values (target_id, clean_name, is_active, sort_order);
  else
    update public.stores s set name = clean_name, is_active = catalog_save_store.is_active, sort_order = catalog_save_store.sort_order where s.id = store_id;
    if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
  select jsonb_build_object('id', s.id, 'name', s.name::text, 'isActive', s.is_active, 'sortOrder', s.sort_order) into answer from public.stores s where s.id = target_id;
  perform public.write_audit_event('catalog.store_saved', 'store', target_id, jsonb_build_object('isActive', is_active));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.catalog_save_category(
  category_id uuid,
  name text,
  parent_id uuid,
  is_active boolean,
  sort_order integer,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_id uuid := coalesce(category_id, extensions.uuid_generate_v4()); clean_name text := btrim(name); prior jsonb; answer jsonb;
begin
  if not public.has_app_role(array['admin','moderator']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  prior := public.begin_mutation(mutation_id, 'catalog_save_category', 'category', target_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if char_length(clean_name) not between 1 and 120 or parent_id = target_id
    or parent_id is not null and not exists(select 1 from public.categories c where c.id = parent_id) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if category_id is null then
    insert into public.categories(id, name, parent_id, is_active, sort_order) values (target_id, clean_name, parent_id, is_active, sort_order);
  else
    update public.categories c set name = clean_name, parent_id = catalog_save_category.parent_id, is_active = catalog_save_category.is_active, sort_order = catalog_save_category.sort_order where c.id = category_id;
    if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
  if not is_active then
    with recursive descendants as (
      select c.id from public.categories c where c.parent_id = target_id
      union all
      select c.id from public.categories c join descendants d on c.parent_id = d.id
    ) update public.categories c set is_active = false where c.id in (select d.id from descendants d);
  end if;
  select jsonb_build_object('id', c.id, 'name', c.name::text, 'parentId', c.parent_id, 'isActive', c.is_active, 'sortOrder', c.sort_order) into answer from public.categories c where c.id = target_id;
  perform public.write_audit_event('catalog.category_saved', 'category', target_id, jsonb_build_object('isActive', is_active, 'hasParent', parent_id is not null));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.catalog_save_brand(
  brand_id uuid,
  name text,
  is_active boolean,
  is_verified boolean,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); target_id uuid := coalesce(brand_id, extensions.uuid_generate_v4()); clean_name text := btrim(name); prior jsonb; answer jsonb;
begin
  if not public.has_app_role(array['admin','moderator']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  prior := public.begin_mutation(mutation_id, 'catalog_save_brand', 'brand', target_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if char_length(clean_name) not between 1 and 120 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  if brand_id is null then
    insert into public.brands(id, name, is_active, is_verified, created_by) values (target_id, clean_name, is_active, true, caller_id);
  else
    update public.brands b set name = clean_name, is_active = catalog_save_brand.is_active, is_verified = catalog_save_brand.is_verified where b.id = brand_id;
    if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
  select jsonb_build_object('id', b.id, 'name', b.name::text, 'isActive', b.is_active, 'isVerified', b.is_verified) into answer from public.brands b where b.id = target_id;
  perform public.write_audit_event('catalog.brand_saved', 'brand', target_id, jsonb_build_object('isActive', is_active, 'isVerified', case when brand_id is null then true else is_verified end));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.catalog_save_unit(
  unit_id uuid,
  name text,
  abbreviation text,
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
  if char_length(clean_name) not between 1 and 80 or clean_abbreviation !~ '^[a-z][a-z0-9]{0,15}$' or (make_default and not is_active) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
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
    insert into public.units(id, name, abbreviation, is_active, is_default) values (target_id, clean_name, clean_abbreviation, is_active, make_default);
  else
    update public.units u set name = clean_name, abbreviation = clean_abbreviation, is_active = catalog_save_unit.is_active,
      is_default = case when make_default then true when was_default and not is_active then false else u.is_default end
    where u.id = unit_id;
  end if;
  select jsonb_build_object('id', u.id, 'name', u.name::text, 'abbreviation', u.abbreviation::text, 'isActive', u.is_active, 'isDefault', u.is_default) into answer from public.units u where u.id = target_id;
  perform public.write_audit_event('catalog.unit_saved', 'unit', target_id, jsonb_build_object('isActive', is_active, 'isDefault', make_default));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.catalog_save_product(product_id uuid, product jsonb, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare prior jsonb; current_product public.products%rowtype; answer jsonb; product_name text; product_barcode text; category_id uuid; subcategory_id uuid; brand_id uuid; unit_id uuid; measurement_quantity numeric(12,3); product_tags text[]; is_active boolean;
begin
  if not public.has_app_role(array['admin','moderator']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  prior := public.begin_mutation(mutation_id, 'catalog_save_product', 'product', product_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select * into current_product from public.products p where p.id = product_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  begin
    product_name := case when product ? 'name' then btrim(product ->> 'name') else current_product.name end;
    product_barcode := case when product ? 'barcode' then public.normalize_barcode(product ->> 'barcode') else current_product.barcode end;
    category_id := case when product ? 'categoryId' then nullif(product ->> 'categoryId', '')::uuid else current_product.category_id end;
    subcategory_id := case when product ? 'subcategoryId' then nullif(product ->> 'subcategoryId', '')::uuid else current_product.subcategory_id end;
    brand_id := case when product ? 'brandId' then nullif(product ->> 'brandId', '')::uuid else current_product.brand_id end;
    unit_id := case when product ? 'unitId' then nullif(product ->> 'unitId', '')::uuid else current_product.unit_id end;
    measurement_quantity := case when product ? 'measurementQuantity' then nullif(product ->> 'measurementQuantity', '')::numeric(12,3) else current_product.measurement_quantity end;
    is_active := case when product ? 'isActive' then (product ->> 'isActive')::boolean else current_product.is_active end;
    if product ? 'tags' then select coalesce(array_agg(value), '{}') into product_tags from jsonb_array_elements_text(product -> 'tags'); else product_tags := current_product.tags; end if;
  exception when others then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end;
  if char_length(product_name) not between 1 and 200 or (measurement_quantity is null) <> (unit_id is null) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  update public.products p set name = product_name, barcode = product_barcode, category_id = catalog_save_product.category_id,
    subcategory_id = catalog_save_product.subcategory_id, brand_id = catalog_save_product.brand_id, tags = product_tags,
    measurement_quantity = catalog_save_product.measurement_quantity, unit_id = catalog_save_product.unit_id, is_active = catalog_save_product.is_active
  where p.id = product_id;
  answer := public.get_product_detail(product_id);
  perform public.write_audit_event('catalog.product_saved', 'product', product_id, jsonb_build_object('isActive', is_active));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.catalog_save_price_entry(entry_id uuid, entry jsonb, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := coalesce(entry_id, extensions.uuid_generate_v4()); prior jsonb; answer jsonb;
  product_id uuid; store_id uuid; price numeric(12,2); original_price numeric(12,2); quantity numeric(12,3); effective_at timestamptz;
begin
  if not public.has_app_role(array['admin','moderator']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  prior := public.begin_mutation(mutation_id, 'catalog_save_price_entry', 'product_entry', target_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  begin
    product_id := (entry ->> 'productId')::uuid;
    store_id := (entry ->> 'storeId')::uuid;
    price := (entry ->> 'price')::numeric(12,2);
    original_price := nullif(entry ->> 'originalPrice', '')::numeric(12,2);
    quantity := coalesce(nullif(entry ->> 'quantity', '')::numeric(12,3), 1);
    effective_at := coalesce(nullif(entry ->> 'effectiveAt', '')::timestamptz, now());
  exception when others then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end;
  if price < 0 or quantity <= 0 or original_price is not null and original_price < price
    or not exists(select 1 from public.products p where p.id = product_id)
    or not exists(select 1 from public.stores s where s.id = store_id) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  if entry_id is null then
    insert into public.product_entries(id, product_id, store_id, price, original_price, quantity, created_by, created_at)
    values (target_id, product_id, store_id, price, original_price, quantity, auth.uid(), effective_at);
  else
    update public.product_entries e set product_id = catalog_save_price_entry.product_id, store_id = catalog_save_price_entry.store_id,
      price = catalog_save_price_entry.price, original_price = catalog_save_price_entry.original_price,
      quantity = catalog_save_price_entry.quantity, created_at = effective_at
    where e.id = entry_id;
    if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
  select jsonb_build_object('id', e.id, 'productId', e.product_id, 'storeId', e.store_id, 'price', e.price, 'originalPrice', e.original_price, 'quantity', e.quantity, 'createdAt', e.created_at)
  into answer from public.product_entries e where e.id = target_id;
  perform public.write_audit_event('catalog.price_entry_saved', 'product_entry', target_id, jsonb_build_object('productId', product_id, 'storeId', store_id, 'isCorrection', entry_id is not null));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.catalog_delete_price_entry(entry_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare prior jsonb; deleted_product_id uuid; answer jsonb;
begin
  if not public.has_app_role(array['admin','moderator']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  prior := public.begin_mutation(mutation_id, 'catalog_delete_price_entry', 'product_entry', entry_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  delete from public.product_entries e where e.id = entry_id returning e.product_id into deleted_product_id;
  if deleted_product_id is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  answer := jsonb_build_object('id', entry_id, 'deleted', true);
  perform public.write_audit_event('catalog.price_entry_deleted', 'product_entry', entry_id, jsonb_build_object('productId', deleted_product_id));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.admin_delete_catalog_entity(entity_type text, entity_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare prior jsonb; answer jsonb;
begin
  if not public.has_app_role(array['admin']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if entity_type not in ('category','brand','unit','product') then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  prior := public.begin_mutation(mutation_id, 'admin_delete_catalog_entity', entity_type, entity_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  begin
    case entity_type
      when 'category' then delete from public.categories c where c.id = entity_id;
      when 'brand' then delete from public.brands b where b.id = entity_id;
      when 'unit' then delete from public.units u where u.id = entity_id and not u.is_default;
      when 'product' then delete from public.products p where p.id = entity_id;
    end case;
  exception when foreign_key_violation then
    raise exception using errcode = '55000', message = 'RESOURCE_IN_USE';
  end;
  if not found then raise exception using errcode = '55000', message = 'RESOURCE_IN_USE_OR_NOT_FOUND'; end if;
  answer := jsonb_build_object('id', entity_id, 'entityType', entity_type, 'deleted', true);
  perform public.write_audit_event('catalog.entity_deleted', entity_type, entity_id);
  return public.complete_mutation(mutation_id, answer);
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

create or replace function public.get_sanitized_audit_page(
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
declare answer jsonb;
begin
  if not public.has_app_role(array['admin']::public.app_role[]) then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if page_size not between 1 and 100 or (cursor_created_at is null) <> (cursor_id is null) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  select coalesce(jsonb_agg(page.row_data order by page.created_at desc, page.id desc), '[]'::jsonb) into answer
  from (
    select a.id, a.created_at, jsonb_build_object(
      'id', a.id, 'action', a.action, 'entityType', a.entity_type, 'entityId', a.entity_id,
      'metadata', a.metadata, 'createdAt', a.created_at,
      'actor', case when p.id is null then null else jsonb_build_object('id', p.id, 'email', p.email::text) end
    ) row_data
    from public.audit_log a left join public.profiles p on p.id = a.actor_user_id
    where cursor_created_at is null or (a.created_at, a.id) < (cursor_created_at, cursor_id)
    order by a.created_at desc, a.id desc limit page_size
  ) page;
  return answer;
end;
$$;

create or replace function public.consume_ai_daily_quota(daily_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); next_count integer;
begin
  if daily_limit not between 1 and 1000 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  insert into public.ai_usage_daily(user_id, usage_date, request_count) values (caller_id, current_date, 1)
  on conflict (user_id, usage_date) do update set request_count = public.ai_usage_daily.request_count + 1, updated_at = now()
  returning request_count into next_count;
  if next_count > daily_limit then raise exception using errcode = 'P0001', message = 'AI_DAILY_LIMIT_REACHED'; end if;
  return jsonb_build_object('allowed', true, 'used', next_count, 'remaining', daily_limit - next_count);
end;
$$;

create or replace function public.record_ai_provider_request(
  request_id uuid,
  provider text,
  status text,
  provider_request_id text default null,
  error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated();
begin
  if provider not in ('anthropic','openai') or status not in ('started','completed','failed','ambiguous')
    or provider_request_id is not null and char_length(provider_request_id) > 240
    or error_code is not null and error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  insert into public.ai_provider_requests(id, user_id, provider, provider_request_id, status, error_code)
  values (request_id, caller_id, provider, provider_request_id, status, error_code)
  on conflict (id) do update set provider_request_id = coalesce(excluded.provider_request_id, public.ai_provider_requests.provider_request_id), status = excluded.status, error_code = excluded.error_code, updated_at = now()
  where public.ai_provider_requests.user_id = caller_id and public.ai_provider_requests.provider = excluded.provider;
end;
$$;

create or replace function public.record_ai_receipt_review(
  cart_id uuid,
  receipt_id uuid,
  review_request_id uuid,
  decisions jsonb,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); prior jsonb; answer jsonb; accepted_count integer; rejected_count integer;
begin
  prior := public.begin_mutation(mutation_id, 'record_ai_receipt_review', 'receipt', receipt_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  perform 1
  from public.shopping_carts c
  join public.cart_receipt_images r on r.cart_id = c.id
  where c.id = cart_id and c.finalized_at is not null and r.id = receipt_id and public.can_access_cart(c.id);
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  perform 1 from public.ai_provider_requests request
  where request.id = review_request_id and request.user_id = caller_id and request.status = 'completed';
  if not found then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  if jsonb_typeof(decisions) <> 'array' or jsonb_array_length(decisions) > 200
    or exists(
      select 1 from jsonb_array_elements(decisions) decision
      where jsonb_typeof(decision) <> 'object'
        or exists(select 1 from jsonb_object_keys(decision) key_name where key_name not in ('itemIndex','decision','matchedCartItemId'))
        or case when coalesce(decision ->> 'itemIndex', '') ~ '^\d{1,3}$' then (decision ->> 'itemIndex')::integer >= 200 else true end
        or decision ->> 'decision' not in ('accepted','rejected')
        or case when (decision ->> 'matchedCartItemId') is null then false
          when decision ->> 'matchedCartItemId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then not exists(select 1 from public.shopping_cart_items item where item.cart_id = record_ai_receipt_review.cart_id and item.id = (decision ->> 'matchedCartItemId')::uuid)
          else true end
    )
    or (select count(*) from jsonb_array_elements(decisions)) <> (select count(distinct decision ->> 'itemIndex') from jsonb_array_elements(decisions) decision)
  then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  select count(*) filter (where decision ->> 'decision' = 'accepted'), count(*) filter (where decision ->> 'decision' = 'rejected')
  into accepted_count, rejected_count from jsonb_array_elements(decisions) decision;
  answer := jsonb_build_object('receiptId', receipt_id, 'requestId', review_request_id, 'accepted', accepted_count, 'rejected', rejected_count, 'recorded', true);
  perform public.write_audit_event('receipt.ai_review_recorded', 'receipt', receipt_id, jsonb_build_object('accepted', accepted_count, 'rejected', rejected_count));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.get_my_data_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); answer jsonb;
begin
  select jsonb_build_object(
    'exportedAt', now(),
    'profile', public.get_my_profile(),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'revision', l.revision, 'createdAt', l.created_at, 'updatedAt', l.updated_at,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'productId', i.product_id, 'name', i.product_name, 'barcode', i.product_barcode, 'plannedQuantity', i.planned_quantity, 'createdAt', i.created_at) order by i.created_at, i.id), '[]'::jsonb) from public.shopping_list_items i where i.list_id = l.id),
        'sharedWith', (select coalesce(jsonb_agg(p.email::text order by p.email::text), '[]'::jsonb) from public.list_shares s join public.profiles p on p.id = s.shared_with_user_id where s.list_id = l.id)
      ) order by l.created_at, l.id) from public.shopping_lists l where l.user_id = caller_id
    ), '[]'::jsonb),
    'carts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'storeId', c.store_id, 'total', c.total, 'finalizedAt', c.finalized_at, 'createdAt', c.created_at,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'productId', i.product_id, 'name', i.product_name, 'barcode', i.product_barcode, 'price', i.price, 'originalPrice', i.original_price, 'quantity', i.quantity, 'createdAt', i.created_at) order by i.created_at, i.id), '[]'::jsonb) from public.shopping_cart_items i where i.cart_id = c.id),
        'receipts', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'objectPath', r.object_path, 'mimeType', r.mime_type, 'createdAt', r.created_at) order by r.sort_order, r.id), '[]'::jsonb) from public.cart_receipt_images r where r.cart_id = c.id),
        'sharedWith', (select coalesce(jsonb_agg(p.email::text order by p.email::text), '[]'::jsonb) from public.cart_shares s join public.profiles p on p.id = s.shared_with_user_id where s.cart_id = c.id)
      ) order by c.created_at, c.id) from public.shopping_carts c where c.user_id = caller_id
    ), '[]'::jsonb),
    'shares', jsonb_build_object(
      'carts', (select coalesce(jsonb_agg(jsonb_build_object('cartId', s.cart_id, 'ownerEmail', p.email::text, 'createdAt', s.created_at) order by s.created_at, s.id), '[]'::jsonb) from public.cart_shares s join public.shopping_carts c on c.id = s.cart_id join public.profiles p on p.id = c.user_id where s.shared_with_user_id = caller_id),
      'lists', (select coalesce(jsonb_agg(jsonb_build_object('listId', s.list_id, 'ownerEmail', p.email::text, 'createdAt', s.created_at) order by s.created_at, s.id), '[]'::jsonb) from public.list_shares s join public.shopping_lists l on l.id = s.list_id join public.profiles p on p.id = l.user_id where s.shared_with_user_id = caller_id)
    ),
    'invitesCreated', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email::text, 'assignedRole', i.assigned_role, 'usedAt', i.used_at, 'expiresAt', i.expires_at, 'revokedAt', i.revoked_at, 'createdAt', i.created_at) order by i.created_at, i.id), '[]'::jsonb) from public.invites i where i.created_by = caller_id),
    'catalogContributions', jsonb_build_object(
      'products', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'barcode', p.barcode, 'createdAt', p.created_at) order by p.created_at, p.id), '[]'::jsonb) from public.products p where p.created_by = caller_id),
      'brands', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name::text, 'isVerified', b.is_verified, 'createdAt', b.created_at) order by b.created_at, b.id), '[]'::jsonb) from public.brands b where b.created_by = caller_id),
      'priceEntries', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'productId', e.product_id, 'storeId', e.store_id, 'price', e.price, 'createdAt', e.created_at) order by e.created_at, e.id), '[]'::jsonb) from public.product_entries e where e.created_by = caller_id)
    )
  ) into answer;
  return answer;
end;
$$;

create or replace function public.prepare_account_deletion(mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := public.require_authenticated(); caller_role public.app_role; admin_count integer; prior jsonb; answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'prepare_account_deletion', 'profile', caller_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  select p.role into caller_role from public.profiles p where p.id = caller_id for update;
  if caller_role is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if caller_role = 'admin' then
    select count(*) into admin_count from public.profiles p where p.role = 'admin';
    if admin_count <= 1 then raise exception using errcode = '55000', message = 'FINAL_ADMIN_REQUIRED'; end if;
  end if;
  select jsonb_build_object(
    'userId', caller_id,
    'receiptObjectPaths', coalesce(jsonb_agg(r.object_path order by r.object_path) filter (where r.object_path is not null), '[]'::jsonb),
    'ownedCartCount', count(distinct c.id),
    'ownedListCount', (select count(*) from public.shopping_lists l where l.user_id = caller_id)
  ) into answer
  from public.shopping_carts c left join public.cart_receipt_images r on r.cart_id = c.id
  where c.user_id = caller_id;
  perform public.write_audit_event('account.deletion_prepared', 'profile', caller_id, jsonb_build_object('receiptCount', jsonb_array_length(answer -> 'receiptObjectPaths')));
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.schedule_deleted_account_receipt_purge(
  deleted_user_id uuid,
  receipt_object_paths text[],
  retention_days integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare job_id uuid;
begin
  if deleted_user_id is null or retention_days not between 1 and 365 or cardinality(receipt_object_paths) > 5000
    or exists(select 1 from unnest(receipt_object_paths) object_path where object_path not like deleted_user_id::text || '/%') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  insert into public.retention_queue(job_type, subject_user_id, object_paths, execute_after)
  values ('receipt_object_purge', deleted_user_id, coalesce(receipt_object_paths, '{}'), now() + make_interval(days => retention_days))
  returning id into job_id;
  return job_id;
end;
$$;

create or replace function public.get_due_retention_jobs(page_size integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare answer jsonb;
begin
  if page_size not between 1 and 100 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'jobType', q.job_type, 'subjectUserId', q.subject_user_id, 'objectPaths', q.object_paths, 'executeAfter', q.execute_after, 'attemptCount', q.attempt_count) order by q.execute_after, q.id), '[]'::jsonb)
  into answer from (
    select * from public.retention_queue q where q.completed_at is null and q.execute_after <= now()
    order by q.execute_after, q.id limit page_size for update skip locked
  ) q;
  return answer;
end;
$$;

create or replace function public.complete_retention_job(job_id uuid, succeeded boolean, error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if error_code is not null and error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  update public.retention_queue q set attempt_count = q.attempt_count + 1,
    completed_at = case when succeeded then now() else null end,
    last_error_code = case when succeeded then null else coalesce(error_code, 'UNKNOWN') end,
    execute_after = case when succeeded then q.execute_after else now() + least(interval '24 hours', make_interval(mins => (q.attempt_count + 1) * 15)) end
  where q.id = job_id;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
end;
$$;

create or replace function public.get_audit_retention_batch(cutoff timestamptz, page_size integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare answer jsonb;
begin
  if cutoff > now() - interval '30 days' or page_size not between 1 and 5000 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'actorUserId', a.actor_user_id, 'action', a.action, 'entityType', a.entity_type, 'entityId', a.entity_id, 'metadata', a.metadata, 'createdAt', a.created_at) order by a.created_at, a.id), '[]'::jsonb)
  into answer from (select * from public.audit_log a where a.created_at < cutoff order by a.created_at, a.id limit page_size) a;
  return answer;
end;
$$;

create or replace function public.purge_operational_data(
  invite_retention_days integer default 90,
  audit_retention_months integer default 12,
  delete_due_audit boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare invite_count integer; mutation_count integer; rate_count integer; ai_count integer; audit_count integer := 0;
begin
  if invite_retention_days not between 1 and 3650 or audit_retention_months not between 1 and 120 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  delete from public.invites i where i.expires_at < now() - make_interval(days => invite_retention_days) and (i.used_at is not null or i.revoked_at is not null or i.expires_at <= now());
  get diagnostics invite_count = row_count;
  delete from public.mutation_receipts m where m.expires_at <= now(); get diagnostics mutation_count = row_count;
  delete from public.request_rate_limits r where r.window_start < now() - interval '30 days'; get diagnostics rate_count = row_count;
  delete from public.ai_provider_requests r where r.created_at < now() - interval '30 days'; get diagnostics ai_count = row_count;
  if delete_due_audit then
    perform set_config('app.audit_retention_purge', 'on', true);
    delete from public.audit_log a where a.created_at < now() - make_interval(months => audit_retention_months);
    get diagnostics audit_count = row_count;
  end if;
  return jsonb_build_object('invites', invite_count, 'mutationReceipts', mutation_count, 'rateLimits', rate_count, 'aiProviderRequests', ai_count, 'auditEvents', audit_count);
end;
$$;

create or replace function public.bootstrap_first_admin(target_user_id uuid, allow_break_glass boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare admin_count integer; answer jsonb;
begin
  select count(*) into admin_count from public.profiles p where p.role = 'admin';
  if admin_count > 0 and not allow_break_glass then raise exception using errcode = '55000', message = 'ADMIN_ALREADY_EXISTS'; end if;
  update public.profiles p set role = 'admin' where p.id = target_user_id;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (null, case when allow_break_glass then 'admin.break_glass_bootstrap' else 'admin.first_bootstrap' end, 'profile', target_user_id, '{}');
  select jsonb_build_object('id', p.id, 'role', p.role) into answer from public.profiles p where p.id = target_user_id;
  return answer;
end;
$$;

create or replace function public.delete_active_cart(cart_id uuid, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare prior jsonb; answer jsonb;
begin
  prior := public.begin_mutation(mutation_id, 'delete_active_cart', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  delete from public.shopping_carts c where c.id = cart_id and c.user_id = auth.uid() and c.finalized_at is null;
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  answer := jsonb_build_object('id', cart_id, 'deleted', true);
  perform public.write_audit_event('cart.deleted', 'cart', cart_id);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

create or replace function public.rename_list(list_id uuid, name text, expected_revision integer, mutation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare clean_name text := btrim(name); prior jsonb; answer jsonb; current_revision integer;
begin
  prior := public.begin_mutation(mutation_id, 'rename_list', 'list', list_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;
  if char_length(clean_name) not between 1 and 160 then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  select l.revision into current_revision from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid() for update;
  if current_revision is null then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  if current_revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
  update public.shopping_lists l set name = clean_name, revision = l.revision + 1 where l.id = list_id
  returning jsonb_build_object('id', l.id, 'name', l.name, 'revision', l.revision) into answer;
  perform public.broadcast_invalidation('list', list_id, (answer ->> 'revision')::integer, 'list_renamed');
  return public.complete_mutation(mutation_id, answer);
end;
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.invites enable row level security;
alter table public.invites force row level security;
alter table public.stores enable row level security;
alter table public.stores force row level security;
alter table public.categories enable row level security;
alter table public.categories force row level security;
alter table public.brands enable row level security;
alter table public.brands force row level security;
alter table public.units enable row level security;
alter table public.units force row level security;
alter table public.products enable row level security;
alter table public.products force row level security;
alter table public.product_entries enable row level security;
alter table public.product_entries force row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_lists force row level security;
alter table public.shopping_list_items enable row level security;
alter table public.shopping_list_items force row level security;
alter table public.shopping_carts enable row level security;
alter table public.shopping_carts force row level security;
alter table public.shopping_cart_items enable row level security;
alter table public.shopping_cart_items force row level security;
alter table public.cart_shares enable row level security;
alter table public.cart_shares force row level security;
alter table public.list_shares enable row level security;
alter table public.list_shares force row level security;
alter table public.resource_join_invites enable row level security;
alter table public.resource_join_invites force row level security;
alter table public.cart_receipt_images enable row level security;
alter table public.cart_receipt_images force row level security;
alter table public.mutation_receipts enable row level security;
alter table public.mutation_receipts force row level security;
alter table public.request_rate_limits enable row level security;
alter table public.request_rate_limits force row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_usage_daily force row level security;
alter table public.ai_provider_requests enable row level security;
alter table public.ai_provider_requests force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.retention_queue enable row level security;
alter table public.retention_queue force row level security;

create policy profiles_select_own on public.profiles
for select to authenticated
using (id = (select auth.uid()));

create policy stores_select_authorized on public.stores
for select to authenticated
using (
  is_active
  or public.current_app_role() in ('admin','moderator')
  or exists(select 1 from public.product_entries e join public.products p on p.id = e.product_id where e.store_id = stores.id and p.is_active)
);

create policy categories_select_authorized on public.categories
for select to authenticated
using (
  is_active
  or public.current_app_role() in ('admin','moderator')
  or exists(select 1 from public.products p where p.is_active and (p.category_id = categories.id or p.subcategory_id = categories.id))
);

create policy brands_select_authorized on public.brands
for select to authenticated
using (
  (is_active and is_verified)
  or created_by = (select auth.uid())
  or public.current_app_role() in ('admin','moderator')
  or exists(select 1 from public.products p where p.is_active and p.brand_id = brands.id)
);

create policy units_select_authorized on public.units
for select to authenticated
using (
  is_active
  or public.current_app_role() in ('admin','moderator')
  or exists(select 1 from public.products p where p.is_active and p.unit_id = units.id)
);

create policy products_select_authorized on public.products
for select to authenticated
using (is_active or public.current_app_role() in ('admin','moderator'));

create policy product_entries_select_authorized on public.product_entries
for select to authenticated
using (
  public.current_app_role() in ('admin','moderator')
  or exists(select 1 from public.products p where p.id = product_entries.product_id and p.is_active)
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy receipts_owner_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'receipts'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists(
    select 1 from public.shopping_carts c
    where c.id = split_part(name, '/', 2)::uuid and c.user_id = (select auth.uid()) and c.finalized_at is not null
  )
);

create policy receipts_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'receipts'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists(
    select 1 from public.shopping_carts c
    where c.id = split_part(name, '/', 2)::uuid and c.user_id = (select auth.uid()) and c.finalized_at is not null
  )
);

create policy realtime_cart_receive on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and case
    when (select realtime.topic()) ~ '^cart-sync-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.can_access_cart(substring((select realtime.topic()) from 11)::uuid)
    else false
  end
);

create policy realtime_cart_send on realtime.messages
for insert to authenticated
with check (
  extension = 'broadcast'
  and case
    when (select realtime.topic()) ~ '^cart-sync-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.can_access_cart(substring((select realtime.topic()) from 11)::uuid)
    else false
  end
);

create policy realtime_list_receive on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and case
    when (select realtime.topic()) ~ '^list-sync-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.can_access_list(substring((select realtime.topic()) from 11)::uuid)
    else false
  end
);

create policy realtime_list_send on realtime.messages
for insert to authenticated
with check (
  extension = 'broadcast'
  and case
    when (select realtime.topic()) ~ '^list-sync-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.can_access_list(substring((select realtime.topic()) from 11)::uuid)
    else false
  end
);

revoke all on schema public from public, anon, authenticated;
grant usage on schema public to authenticated, service_role, supabase_auth_admin;
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke all privileges on all functions in schema public from public, anon, authenticated;

grant select on public.profiles, public.stores, public.categories, public.brands, public.units, public.products, public.product_entries to authenticated;
grant select on public.latest_product_prices to authenticated;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_app_role(public.app_role[]) to authenticated;
grant execute on function public.can_access_cart(uuid) to authenticated;
grant execute on function public.is_cart_owner(uuid) to authenticated;
grant execute on function public.can_access_list(uuid) to authenticated;
grant execute on function public.is_list_owner(uuid) to authenticated;

grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.update_my_preferences(public.locale_code,text,uuid) to authenticated;
grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.admin_update_user_role(uuid,public.app_role,uuid) to authenticated;
grant execute on function public.admin_list_users(timestamptz,uuid,integer) to authenticated;
grant execute on function public.create_invite(text,public.app_role,timestamptz,uuid) to authenticated;
grant execute on function public.revoke_invite(uuid,uuid) to authenticated;
grant execute on function public.list_invites(timestamptz,uuid,integer) to authenticated;
grant execute on function public.get_sanitized_audit_page(timestamptz,uuid,integer) to authenticated;

grant execute on function public.get_or_create_active_cart(uuid) to authenticated;
grant execute on function public.get_cart_by_id(uuid) to authenticated;
grant execute on function public.get_cart_items(uuid) to authenticated;
grant execute on function public.set_cart_store(uuid,uuid,integer,uuid) to authenticated;
grant execute on function public.add_or_merge_cart_item(uuid,jsonb,integer,uuid) to authenticated;
grant execute on function public.update_cart_item(uuid,uuid,jsonb,integer,uuid) to authenticated;
grant execute on function public.delete_cart_item(uuid,uuid,integer,uuid) to authenticated;
grant execute on function public.attach_tracking_list(uuid,uuid,integer,uuid) to authenticated;
grant execute on function public.get_tracking_state(uuid) to authenticated;
grant execute on function public.update_tracking_state(uuid,jsonb,integer,uuid) to authenticated;
grant execute on function public.get_shared_active_carts() to authenticated;
grant execute on function public.share_cart_with_email(uuid,text,uuid) to authenticated;
grant execute on function public.get_cart_members(uuid) to authenticated;
grant execute on function public.revoke_cart_share(uuid,uuid,uuid) to authenticated;
grant execute on function public.leave_shared_cart(uuid,uuid) to authenticated;
grant execute on function public.create_or_rotate_cart_join_token(uuid,timestamptz,integer,uuid) to authenticated;
grant execute on function public.revoke_cart_join_token(uuid,uuid) to authenticated;
grant execute on function public.preview_cart_join_token(text) to authenticated;
grant execute on function public.join_cart_by_token(text,uuid) to authenticated;
grant execute on function public.finalize_cart(uuid,uuid,uuid) to authenticated;
grant execute on function public.delete_active_cart(uuid,uuid) to authenticated;

grant execute on function public.get_lists_directory(timestamptz,uuid,integer) to authenticated;
grant execute on function public.create_list(text,uuid) to authenticated;
grant execute on function public.rename_list(uuid,text,integer,uuid) to authenticated;
grant execute on function public.delete_list(uuid,uuid) to authenticated;
grant execute on function public.get_list_by_id(uuid) to authenticated;
grant execute on function public.get_list_items(uuid) to authenticated;
grant execute on function public.add_or_merge_list_item(uuid,jsonb,integer,uuid) to authenticated;
grant execute on function public.update_list_item(uuid,uuid,jsonb,integer,uuid) to authenticated;
grant execute on function public.delete_list_item(uuid,uuid,integer,uuid) to authenticated;
grant execute on function public.share_list_with_email(uuid,text,uuid) to authenticated;
grant execute on function public.get_list_members(uuid) to authenticated;
grant execute on function public.revoke_list_share(uuid,uuid,uuid) to authenticated;
grant execute on function public.leave_shared_list(uuid,uuid) to authenticated;
grant execute on function public.create_or_rotate_list_join_token(uuid,timestamptz,integer,uuid) to authenticated;
grant execute on function public.revoke_list_join_token(uuid,uuid) to authenticated;
grant execute on function public.preview_list_join_token(text) to authenticated;
grant execute on function public.join_list_by_token(text,uuid) to authenticated;

grant execute on function public.get_history_page(timestamptz,uuid,integer) to authenticated;
grant execute on function public.get_history_cart_detail(uuid) to authenticated;
grant execute on function public.get_history_cart_items(uuid) to authenticated;
grant execute on function public.get_history_cart_receipts(uuid) to authenticated;
grant execute on function public.create_receipt_metadata(uuid,jsonb,uuid) to authenticated;
grant execute on function public.reorder_receipts(uuid,uuid[],uuid) to authenticated;
grant execute on function public.delete_receipt(uuid,uuid,uuid) to authenticated;

grant execute on function public.get_catalog_reference_data() to authenticated;
grant execute on function public.search_products(text,text,text,uuid,integer,boolean) to authenticated;
grant execute on function public.get_product_detail(uuid) to authenticated;
grant execute on function public.get_product_price_history(uuid,timestamptz,uuid,integer) to authenticated;
grant execute on function public.get_or_create_unverified_brand(text,uuid) to authenticated;
grant execute on function public.create_product(jsonb,uuid) to authenticated;
grant execute on function public.catalog_save_store(uuid,text,boolean,integer,uuid) to authenticated;
grant execute on function public.catalog_save_category(uuid,text,uuid,boolean,integer,uuid) to authenticated;
grant execute on function public.catalog_save_brand(uuid,text,boolean,boolean,uuid) to authenticated;
grant execute on function public.catalog_save_unit(uuid,text,text,boolean,boolean,uuid,uuid) to authenticated;
grant execute on function public.catalog_save_product(uuid,jsonb,uuid) to authenticated;
grant execute on function public.catalog_save_price_entry(uuid,jsonb,uuid) to authenticated;
grant execute on function public.catalog_delete_price_entry(uuid,uuid) to authenticated;
grant execute on function public.admin_delete_catalog_entity(text,uuid,uuid) to authenticated;
grant execute on function public.consume_ai_daily_quota(integer) to authenticated;
grant execute on function public.record_ai_provider_request(uuid,text,text,text,text) to authenticated;
grant execute on function public.record_ai_receipt_review(uuid,uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.get_my_data_export() to authenticated;
grant execute on function public.prepare_account_deletion(uuid) to authenticated;

grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.validate_invite_code(text,text) to service_role;
grant execute on function public.consume_rate_limit(text,text,integer,integer,integer) to service_role;
grant execute on function public.schedule_deleted_account_receipt_purge(uuid,text[],integer) to service_role;
grant execute on function public.get_due_retention_jobs(integer) to service_role;
grant execute on function public.complete_retention_job(uuid,boolean,text) to service_role;
grant execute on function public.get_audit_retention_batch(timestamptz,integer) to service_role;
grant execute on function public.purge_operational_data(integer,integer,boolean) to service_role;
grant execute on function public.bootstrap_first_admin(uuid,boolean) to service_role;

insert into public.units(name, abbreviation, is_default, is_active)
values
  ('Unit', 'un', true, true),
  ('Gram', 'g', false, true),
  ('Kilogram', 'kg', false, true),
  ('Millilitre', 'ml', false, true),
  ('Litre', 'l', false, true),
  ('Dose', 'dose', false, true)
on conflict (abbreviation) do nothing;

commit;
