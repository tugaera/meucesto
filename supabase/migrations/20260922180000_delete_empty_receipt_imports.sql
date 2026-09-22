begin;

create or replace function public.delete_empty_receipt_import_cart(cart_id uuid, mutation_id uuid)
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
  prior := public.begin_mutation(mutation_id, 'delete_empty_receipt_import_cart', 'cart', cart_id);
  if prior is not null and prior <> '{"pending":true}'::jsonb then return prior; end if;

  delete from public.shopping_carts c
  where c.id = delete_empty_receipt_import_cart.cart_id
    and c.user_id = caller_id
    and c.source = 'receipt'
    and c.finalized_at is not null
    and c.total = 0
    and not exists(select 1 from public.shopping_cart_items i where i.cart_id = c.id);
  if not found then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;

  answer := jsonb_build_object('cartId', cart_id, 'deleted', true);
  perform public.write_audit_event('receipt.import_deleted', 'cart', cart_id, '{}'::jsonb);
  return public.complete_mutation(mutation_id, answer);
end;
$$;

grant execute on function public.delete_empty_receipt_import_cart(uuid,uuid) to authenticated;

commit;
