begin;

select plan(21);

select ok(to_regclass('public.profiles') is not null, 'profiles table exists');
select ok(to_regclass('public.shopping_carts') is not null, 'shopping carts table exists');
select ok(to_regclass('public.cart_receipt_images') is not null, 'receipt metadata table exists');
select ok(to_regclass('public.mutation_receipts') is not null, 'mutation receipt table exists');
select ok(to_regclass('public.audit_log') is not null, 'audit table exists');

select ok(to_regprocedure('public.get_or_create_active_cart(uuid)') is not null, 'active-cart RPC exists');
select ok(to_regprocedure('public.finalize_cart(uuid,uuid,uuid)') is not null, 'checkout RPC exists');
select ok(to_regprocedure('public.admin_update_user_role(uuid,public.app_role,uuid)') is not null, 'admin role RPC exists');
select ok(to_regprocedure('public.before_user_created(jsonb)') is not null, 'Auth hook exists');
select ok(to_regprocedure('public.prepare_account_deletion(uuid)') is not null, 'account deletion RPC exists');

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity),
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p')),
  'every public application table has RLS enabled'
);

select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'latest_product_prices'),
  'latest product prices is a security-invoker view'
);

select is((select public from storage.buckets where id = 'receipts'), false, 'receipt bucket is private');
select is((select file_size_limit from storage.buckets where id = 'receipts'), 5242880::bigint, 'receipt bucket is limited to 5 MB');
select is((select count(*)::integer from public.units where is_default), 1, 'exactly one unit is the default');
select set_eq(
  'select abbreviation::text from public.units',
  array['un','g','kg','ml','l','dose'],
  'canonical units are seeded'
);
select is(
  (
    select count(*)::integer
    from public.units child
    join public.units parent on parent.id = child.base_unit_id
    where child.abbreviation in ('g','ml')
      and (child.abbreviation = 'g' and parent.abbreviation = 'kg' or child.abbreviation = 'ml' and parent.abbreviation = 'l')
      and child.base_unit_factor = 1000
  ),
  2,
  'canonical small units have parent pricing units'
);

select ok(
  exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'shopping_carts' and indexdef ilike '%where (finalized_at is null)%'),
  'one-active-cart partial unique index exists'
);
select ok(
  exists(select 1 from pg_constraint where conrelid = 'public.product_entries'::regclass and pg_get_constraintdef(oid) ilike '%original_price%price%'),
  'price entries enforce original price against final price'
);
select ok(
  exists(select 1 from pg_trigger where tgrelid = 'public.categories'::regclass and not tgisinternal),
  'category integrity trigger exists'
);
select ok(
  exists(select 1 from pg_trigger where tgrelid = 'public.shopping_cart_items'::regclass and not tgisinternal),
  'cart item integrity triggers exist'
);

select * from finish();
rollback;
