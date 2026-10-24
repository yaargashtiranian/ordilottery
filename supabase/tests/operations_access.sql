-- Exercise real RLS/triggers/functions without leaving test contacts, receipts or accounts.
begin;
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000000001','operations-test@example.invalid',now());
insert into public.cms_editors(email,permissions) values('operations-test@example.invalid',array['customers','cases','payments','orders','support','overview']);
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","email":"operations-test@example.invalid","sub":"00000000-0000-4000-8000-000000000001"}',true);
do $$
<<scenario>>
declare customer_id uuid:='10000000-0000-4000-8000-000000000001'; other_id uuid:='10000000-0000-4000-8000-000000000002'; case_id uuid:='20000000-0000-4000-8000-000000000001'; ticket_id uuid:='30000000-0000-4000-8000-000000000001'; note_id uuid:='40000000-0000-4000-8000-000000000001'; affected integer; result jsonb;
begin
  insert into public.crm_customers(id,first_name,last_name,email,phone) values(customer_id,'مشتری','آزمایشی','customer@example.invalid','09000000000'),(other_id,'مشتری','دیگر','other@example.invalid','09000000001');
  assert (select count(*) from public.crm_activity a where a.customer_id=scenario.customer_id and kind='crm_customers')>=1,'customer audit missing';
  insert into public.crm_cases(id,customer_id,plan,quoted_amount) values(case_id,customer_id,'online',1499000);
  begin
    update public.crm_cases set service_status='completed',revision=2 where id=case_id;
    raise exception 'unreviewed case incorrectly completed';
  exception when check_violation then null; end;
  update public.crm_cases set service_status='in_progress',review_status='needs_correction',revision=2,last_note='شرح تغییر آزمایشی' where id=case_id;
  update public.crm_cases set service_status='ready',revision=2 where id=case_id and revision=1;
  get diagnostics affected=row_count;
  assert affected=0,'stale case overwrite succeeded';
  begin
    update public.crm_cases set quoted_amount=1,revision=3 where id=case_id;
    raise exception 'price snapshot changed';
  exception when check_violation then null; end;
  perform public.crm_create_ticket(ticket_id,customer_id,case_id,'پیگیری آزمایشی','phone','normal','شرح اولیه');
  perform public.crm_create_ticket(ticket_id,customer_id,case_id,'پیگیری آزمایشی','phone','normal','شرح اولیه');
  assert (select count(*) from public.crm_ticket_messages m where m.ticket_id=scenario.ticket_id)=1,'ticket retry duplicated initial note';
  perform public.crm_add_ticket_note(note_id,ticket_id,'یادداشت داخلی آزمایشی');
  perform public.crm_add_ticket_note(note_id,ticket_id,'یادداشت داخلی آزمایشی');
  assert (select count(*) from public.crm_ticket_messages m where m.ticket_id=scenario.ticket_id)=2,'note retry duplicated';
  begin
    perform public.crm_create_ticket(gen_random_uuid(),other_id,case_id,'ارتباط اشتباه','phone','normal','نباید ذخیره شود');
    raise exception 'cross-customer case link accepted';
  exception when check_violation then null; end;
  begin
    insert into public.crm_payments(case_id,amount,reference,status,gateway_verified) values(case_id,1000,'forged-gateway','recorded',true);
    raise exception 'manual record claimed gateway verification';
  exception when check_violation then null; end;
  insert into public.crm_payments(case_id,amount,reference,status) values(case_id,1499000,'receipt-1','recorded'),(case_id,500000,'refund-1','refunded');
  result:=public.crm_case_financials(case_id);
  assert (result->>'net_recorded')::bigint=999000,'financial sum incorrect';
  assert (result->>'receipt_count')::integer=2,'receipt count incorrect';
  assert not has_table_privilege('authenticated','public.crm_payments','UPDATE'),'receipts may be overwritten';
  assert not has_table_privilege('authenticated','public.crm_activity','DELETE'),'audit may be deleted';
end $$;
select set_config('request.jwt.claims','{"role":"authenticated","email":"outsider@example.invalid","sub":"00000000-0000-4000-8000-000000000002"}',true);
do $$ begin
  assert (select count(*) from public.crm_customers)=0,'non-admin can read customers';
  assert (select count(*) from public.crm_cases)=0,'non-admin can read cases';
  assert (select count(*) from public.crm_payments)=0,'non-admin can read payments';
  assert (select count(*) from public.crm_tickets)=0,'non-admin can read tickets';
  assert (select count(*) from public.crm_ticket_messages)=0,'non-admin can read support notes';
  assert (select count(*) from public.crm_activity)=0,'non-admin can read audit';
  begin
    insert into public.crm_customers(first_name,last_name,email,phone)values('غیر','مجاز','forbidden@example.invalid','09000000002');
    raise exception 'non-admin created customer';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  assert not has_table_privilege('anon','public.crm_customers','SELECT'),'anonymous customer grant';
  assert not has_table_privilege('anon','public.crm_cases','SELECT'),'anonymous case grant';
  assert not has_table_privilege('anon','public.crm_payments','SELECT'),'anonymous receipt grant';
  assert not has_function_privilege('anon','public.crm_summary()','EXECUTE'),'anonymous summary grant';
end $$;
rollback;
select 'passed: private RLS, atomic audit, immutable receipts, revisions, ticket idempotency and exact totals' as result;
