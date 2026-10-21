-- Exact financial totals are independent of the bounded receipt-history list.
create function public.crm_case_financials(p_case_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'net_recorded',coalesce(sum(case when status='recorded' then amount when status='refunded' then -amount else 0 end),0),
  'receipt_count',count(*)
) from public.crm_payments where case_id=p_case_id;
$$;
revoke all on function public.crm_case_financials(uuid) from public,anon;
grant execute on function public.crm_case_financials(uuid) to authenticated;
