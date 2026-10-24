-- Entire scenario rolls back: fake claims and metadata never become real applicant documents.
begin;
insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-8000-000000000001','documents-test@example.invalid',now()),
('00000000-0000-4000-8000-000000000002','documents-owner@example.invalid',now()),
('00000000-0000-4000-8000-000000000003','documents-other@example.invalid',now());
insert into public.cms_editors(email,permissions) values('documents-test@example.invalid',array['documents','cases','customers']);
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","email":"documents-test@example.invalid","sub":"00000000-0000-4000-8000-000000000001"}',true);
insert into public.crm_customers(id,first_name,last_name,email,phone) values
('11000000-0000-4000-8000-000000000001','مشتری','آزمایشی','documents-owner@example.invalid','09000000000'),
('11000000-0000-4000-8000-000000000002','مشتری','دیگر','documents-other@example.invalid','09000000001');
insert into public.crm_cases(id,customer_id,plan,quoted_amount) values
('22000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','online',1499000),
('22000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','online',1499000);
update public.crm_document_access set enabled=true where case_id in ('22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"role":"authenticated","email":"documents-owner@example.invalid","sub":"00000000-0000-4000-8000-000000000002"}',true);
do $$ declare changed integer; begin
  assert (select count(*) from public.crm_document_access)=1,'customer can see another invitation';
  assert (select count(*) from public.crm_cases)=0,'CRM internal case leaked';
  assert (select count(*) from public.crm_customers)=0,'CRM contacts leaked';
  insert into public.crm_documents(id,case_id,group_id,title,kind,applicant_role,filename,mime_type,byte_size,sha256,source)
  values('33000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','مدرک آزمایشی','general','applicant','synthetic.pdf','application/pdf',33,repeat('a',64),'customer');
  begin
    insert into public.crm_documents(id,case_id,group_id,title,kind,applicant_role,filename,mime_type,byte_size,sha256,source)
    values('33000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000002','مدرک ممنوع','general','applicant','synthetic.pdf','application/pdf',33,repeat('a',64),'customer');
    raise exception 'cross-case upload succeeded';
  exception when insufficient_privilege then null; end;
  update public.crm_documents set uploaded=true,revision=2 where id='33000000-0000-4000-8000-000000000001';
  update public.crm_documents set status='approved',revision=3 where id='33000000-0000-4000-8000-000000000001';
  get diagnostics changed=row_count; assert changed=0,'customer reviewed document';
end $$;
select set_config('request.jwt.claims','{"role":"authenticated","email":"documents-other@example.invalid","sub":"00000000-0000-4000-8000-000000000003"}',true);
do $$ begin assert (select count(*) from public.crm_documents)=0,'cross-customer metadata leak'; end $$;
select set_config('request.jwt.claims','{"role":"authenticated","email":"documents-test@example.invalid","sub":"00000000-0000-4000-8000-000000000001"}',true);
do $$ declare changed integer; begin
  begin
    update public.crm_documents set status='rejected',revision=3 where id='33000000-0000-4000-8000-000000000001';
    raise exception 'rejection without reason accepted';
  exception when check_violation then null; end;
  update public.crm_documents set status='rejected',review_note='نسخه خواناتر ارسال شود',revision=3 where id='33000000-0000-4000-8000-000000000001';
  assert (select count(*) from public.crm_document_reviews where document_id='33000000-0000-4000-8000-000000000001')=1,'review audit absent';
  update public.crm_documents set status='approved',revision=3 where id='33000000-0000-4000-8000-000000000001' and revision=2;
  get diagnostics changed=row_count; assert changed=0,'stale review overwrote result';
  insert into public.crm_documents(id,case_id,group_id,title,kind,applicant_role,filename,mime_type,byte_size,sha256,source)
  values('33000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','مدرک آزمایشی','general','applicant','replacement.pdf','application/pdf',33,repeat('b',64),'staff');
  assert (select version from public.crm_documents where id='33000000-0000-4000-8000-000000000003')=2,'version allocation failed';
  assert (select status from public.crm_documents where id='33000000-0000-4000-8000-000000000001')='rejected','original review overwritten';
  update public.crm_cases set service_status='completed',review_status='approved',revision=2 where id='22000000-0000-4000-8000-000000000001';
  assert (select retention_at from public.crm_document_access where case_id='22000000-0000-4000-8000-000000000001')=now()+interval '90 days','retention deadline missing';
end $$;
select set_config('request.jwt.claims','{"role":"authenticated","email":"outsider@example.invalid","sub":"00000000-0000-4000-8000-000000000004"}',true);
do $$ begin
 assert (select count(*) from public.crm_document_access)=0,'outsider invitation leak';
 assert (select count(*) from public.crm_documents)=0,'outsider document leak';
 assert (select count(*) from public.crm_document_reviews)=0,'outsider review leak';
end $$;
set local role anon;
do $$ begin
 assert not has_table_privilege('anon','public.crm_documents','SELECT'),'anonymous document grant';
 assert not has_table_privilege('anon','public.crm_document_access','SELECT'),'anonymous invitation grant';
end $$;
rollback;
select 'passed: customer isolation, no CRM leakage, staff review, immutable versions, optimistic concurrency, retention' as result;
