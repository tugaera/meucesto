begin;

select plan(18);

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef),
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=""%'),
  'every public security-definer function has an empty search path'
);

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl where n.nspname = 'public' and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'),
  0,
  'PUBLIC cannot execute application functions'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anon cannot execute application functions'
);

select ok(has_function_privilege('authenticated', 'public.get_my_profile()', 'execute'), 'authenticated can call profile RPC');
select ok(has_function_privilege('authenticated', 'public.finalize_cart(uuid,uuid,uuid)', 'execute'), 'authenticated can call checkout RPC');
select ok(has_function_privilege('service_role', 'public.bootstrap_first_admin(uuid,boolean)', 'execute'), 'service role can bootstrap first admin');
select ok(not has_function_privilege('authenticated', 'public.bootstrap_first_admin(uuid,boolean)', 'execute'), 'authenticated cannot bootstrap an admin');
select ok(not has_function_privilege('authenticated', 'public.validate_invite_code(text,text)', 'execute'), 'authenticated cannot call internal invite validation');

select ok(not has_table_privilege('authenticated', 'public.shopping_carts', 'insert'), 'authenticated has no direct cart insert');
select ok(not has_table_privilege('authenticated', 'public.shopping_cart_items', 'update'), 'authenticated has no direct cart item update');
select ok(not has_table_privilege('authenticated', 'public.invites', 'select'), 'authenticated has no direct invite read');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'select'), 'authenticated has no direct audit read');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'), 'authenticated cannot directly update profiles');

select policies_are('storage', 'objects', array['receipts_owner_delete','receipts_owner_upload'], 'receipt object policies are narrowly scoped');
select policies_are('realtime', 'messages', array['realtime_cart_receive','realtime_cart_send','realtime_list_receive','realtime_list_send'], 'Realtime policies are present');
select ok((select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass), 'Realtime messages has RLS enabled');
select ok(
  exists(select 1 from pg_constraint where conrelid = 'public.audit_log'::regclass and pg_get_constraintdef(oid) ilike '%password%token%invite_code%ocr_text%'),
  'audit metadata rejects sensitive keys'
);
select ok(
  not has_table_privilege('authenticated', 'public.mutation_receipts', 'select')
  and not has_table_privilege('authenticated', 'public.request_rate_limits', 'select')
  and not has_table_privilege('authenticated', 'public.ai_usage_daily', 'select'),
  'operational security tables have no client reads'
);

select * from finish();
rollback;
