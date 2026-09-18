begin;

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

commit;
