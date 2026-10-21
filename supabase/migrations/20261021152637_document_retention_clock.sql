-- Storage RLS and API must use the same database clock, not the application host clock.
create function public.crm_document_access_state(p_case_id uuid)
returns table(case_id uuid,case_number bigint,customer_email text,enabled boolean,retention_at timestamptz,expired boolean)
language sql stable security invoker set search_path='' as $$
  select a.case_id,a.case_number,a.customer_email,a.enabled,a.retention_at,
    coalesce(a.retention_at<=now(),false)
  from public.crm_document_access a where a.case_id=p_case_id;
$$;
create function public.crm_document_expired_cases()
returns table(case_id uuid) language sql stable security invoker set search_path='' as $$
  select a.case_id from public.crm_document_access a where a.retention_at<=now();
$$;
revoke all on function public.crm_document_access_state(uuid),public.crm_document_expired_cases() from public,anon;
grant execute on function public.crm_document_access_state(uuid),public.crm_document_expired_cases() to authenticated;
