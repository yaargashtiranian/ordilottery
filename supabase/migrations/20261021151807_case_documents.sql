-- Explicit case invitations expose no CRM notes, payment records or internal support.
create table public.crm_document_access (
  case_id uuid primary key references public.crm_cases(id),
  case_number bigint not null,
  customer_email text not null,
  enabled boolean not null default false,
  retention_at timestamptz
);
create index crm_document_access_email_idx on public.crm_document_access(customer_email);
create table public.crm_documents (
  id uuid primary key,
  case_id uuid not null references public.crm_document_access(case_id),
  group_id uuid not null references public.crm_documents(id) deferrable initially deferred,
  version integer not null default 1,
  title text not null check (char_length(title) between 2 and 120),
  kind text not null check (kind in ('general','photo','identity')),
  applicant_role text not null check (applicant_role in ('applicant','spouse','child')),
  filename text not null check (char_length(filename) between 1 and 160),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source text not null check (source in ('customer','staff')),
  uploaded_by uuid not null default auth.uid(),
  uploaded boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text not null default '' check (char_length(review_note) <= 2000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  revision integer not null default 1,
  erased boolean not null default false,
  created_at timestamptz not null default now(),
  unique(group_id,version),
  check (status <> 'rejected' or char_length(trim(review_note)) >= 3)
);
create index crm_documents_case_idx on public.crm_documents(case_id,created_at desc);
create index crm_documents_uploaded_by_idx on public.crm_documents(uploaded_by);
create index crm_documents_reviewed_by_idx on public.crm_documents(reviewed_by);
create table public.crm_document_reviews (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.crm_documents(id),
  status text not null check (status in ('approved','rejected')),
  note text not null,
  actor_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index crm_document_reviews_document_idx on public.crm_document_reviews(document_id,created_at desc);
create index crm_document_reviews_actor_idx on public.crm_document_reviews(actor_id);

alter table public.crm_document_access enable row level security;
alter table public.crm_documents enable row level security;
alter table public.crm_document_reviews enable row level security;
revoke all on public.crm_document_access,public.crm_documents,public.crm_document_reviews from anon,authenticated;
grant select,insert,update on public.crm_document_access,public.crm_documents to authenticated;
grant select,insert on public.crm_document_reviews to authenticated;
revoke all on sequence public.crm_document_reviews_id_seq from anon,authenticated;
grant usage on sequence public.crm_document_reviews_id_seq to authenticated;

create policy access_read on public.crm_document_access for select to authenticated using (
  exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email'))
  or (customer_email=lower((select auth.jwt())->>'email') and (select auth.uid()) is not null)
);
create policy access_insert on public.crm_document_access for insert to authenticated with check (
  exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')));
create policy access_update on public.crm_document_access for update to authenticated using (
  exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email'))
) with check (exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')));
create policy documents_read on public.crm_documents for select to authenticated using (
  (select auth.uid()) is not null and exists(select 1 from public.crm_document_access a where a.case_id=crm_documents.case_id and
  (a.customer_email=lower((select auth.jwt())->>'email') or exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')))));
create policy documents_insert on public.crm_documents for insert to authenticated with check (
  uploaded_by=(select auth.uid()) and exists(select 1 from public.crm_document_access a where a.case_id=crm_documents.case_id and (a.retention_at is null or a.retention_at>now()) and
  (exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')) or (a.enabled and source='customer' and a.customer_email=lower((select auth.jwt())->>'email')))));
create policy documents_update on public.crm_documents for update to authenticated using (
  exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')) or (uploaded_by=(select auth.uid()) and not uploaded and exists(select 1 from public.crm_document_access a where a.case_id=crm_documents.case_id and a.enabled and a.customer_email=lower((select auth.jwt())->>'email')))
) with check (exists(select 1 from public.crm_document_access a where a.case_id=crm_documents.case_id and
 (exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')) or (a.enabled and a.customer_email=lower((select auth.jwt())->>'email') and (a.retention_at is null or a.retention_at>now())))));
create policy reviews_read on public.crm_document_reviews for select to authenticated using (
  exists(select 1 from public.crm_documents d join public.crm_document_access a on a.case_id=d.case_id where d.id=crm_document_reviews.document_id and
  (a.customer_email=lower((select auth.jwt())->>'email') or exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')))));
create policy reviews_insert on public.crm_document_reviews for insert to authenticated with check (
  actor_id=(select auth.uid()) and exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')));

-- Invoker triggers synchronize invitations/revoke old email access without opening CRM tables.
create function public.crm_sync_document_access() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_name='crm_cases' then
    insert into public.crm_document_access(case_id,case_number,customer_email,retention_at)
    select new.id,new.case_number,lower(c.email),case when new.service_status in ('completed','cancelled') then now()+interval '90 days' end
    from public.crm_customers c where c.id=new.customer_id
    on conflict(case_id) do update set retention_at=case
      when new.service_status in ('completed','cancelled') then coalesce(crm_document_access.retention_at,now()+interval '90 days') else null end;
  else
    update public.crm_document_access set customer_email=lower(new.email) where case_id in (select id from public.crm_cases where customer_id=new.id);
  end if;
  return new;
end $$;
create trigger crm_case_document_access after insert or update on public.crm_cases for each row execute function public.crm_sync_document_access();
create trigger crm_customer_document_access after update of email on public.crm_customers for each row execute function public.crm_sync_document_access();
insert into public.crm_document_access(case_id,case_number,customer_email,retention_at)
select c.id,c.case_number,lower(u.email),case when c.service_status in ('completed','cancelled') then c.updated_at+interval '90 days' end
from public.crm_cases c join public.crm_customers u on u.id=c.customer_id;

-- Immutable file identities, serialized version allocation, and review history protect concurrent experts.
create function public.crm_document_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare staff boolean; root public.crm_documents;
begin
  staff:=exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email'));
  if tg_op='INSERT' then
    if new.uploaded or new.erased or new.status<>'pending' or new.review_note<>'' or new.reviewed_at is not null or new.reviewed_by is not null or new.revision<>1 then raise exception 'Invalid initial document state'; end if;
    new.source:=case when staff then 'staff' else 'customer' end;
    new.uploaded_by:=auth.uid(); new.created_at:=now();
    perform pg_advisory_xact_lock(hashtextextended(new.group_id::text,0));
    if new.group_id<>new.id then
      select * into root from public.crm_documents where id=new.group_id and group_id=id and uploaded and not erased;
      if root.id is null or root.case_id<>new.case_id or root.kind<>new.kind or root.applicant_role<>new.applicant_role then raise exception 'Invalid document version'; end if;
      new.title:=root.title;
    end if;
    select coalesce(max(version),0)+1 into new.version from public.crm_documents where group_id=new.group_id;
  else
    if (to_jsonb(new)-array['uploaded','status','review_note','reviewed_by','reviewed_at','revision','erased']) is distinct from
       (to_jsonb(old)-array['uploaded','status','review_note','reviewed_by','reviewed_at','revision','erased']) then raise exception 'File metadata is immutable'; end if;
    if new.revision<>old.revision+1 or (old.uploaded and not new.uploaded) or (old.erased and not new.erased) then raise exception 'Document revision conflict' using errcode='40001'; end if;
    if not staff and (new.status<>old.status or new.review_note<>old.review_note or new.erased<>old.erased or new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by) then raise exception 'Staff review required'; end if;
    if new.erased and not old.erased and not exists(select 1 from public.crm_document_access where case_id=old.case_id and retention_at<=now()) then raise exception 'Retention has not expired'; end if;
    if (new.status,new.review_note) is distinct from (old.status,old.review_note) then
      if not old.uploaded or old.erased or new.status='pending' then raise exception 'Document is not reviewable'; end if;
      new.reviewed_by:=auth.uid();new.reviewed_at:=now();
      insert into public.crm_document_reviews(document_id,status,note) values(new.id,new.status,new.review_note);
      insert into public.crm_activity(customer_id,case_id,kind,label,details)
      select customer_id,id,'document_review','مدرک بررسی شد',jsonb_build_object('document_id',new.id,'status',new.status) from public.crm_cases where id=new.case_id;
    else
      new.reviewed_by:=old.reviewed_by;new.reviewed_at:=old.reviewed_at;
    end if;
  end if;
  return new;
end $$;
create trigger crm_document_guard before insert or update on public.crm_documents for each row execute function public.crm_document_guard();
revoke all on function public.crm_sync_document_access(),public.crm_document_guard() from public,anon,authenticated;

-- Files and recovery copies are authenticated ciphertext; there are no public URLs or overwrite grants.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('case-documents','case-documents',false,5242908,array['application/octet-stream']);
create policy case_document_read on storage.objects for select to authenticated using (
 bucket_id='case-documents' and exists(select 1 from public.crm_documents d join public.crm_document_access a on a.case_id=d.case_id
 where name in (d.case_id::text||'/'||d.id::text||'/primary',d.case_id::text||'/'||d.id::text||'/backup') and not d.erased
 and (a.customer_email=lower((select auth.jwt())->>'email') or exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')))
 and (a.retention_at is null or a.retention_at>now() or exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')))));
create policy case_document_upload on storage.objects for insert to authenticated with check (
 bucket_id='case-documents' and exists(select 1 from public.crm_documents d join public.crm_document_access a on a.case_id=d.case_id
 where name in (d.case_id::text||'/'||d.id::text||'/primary',d.case_id::text||'/'||d.id::text||'/backup') and not d.uploaded and d.uploaded_by=(select auth.uid())
 and (a.retention_at is null or a.retention_at>now())
 and ((a.enabled and a.customer_email=lower((select auth.jwt())->>'email')) or exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email')))));
create policy case_document_expired_delete on storage.objects for delete to authenticated using (
 bucket_id='case-documents' and exists(select 1 from public.cms_editors where email=((select auth.jwt())->>'email'))
 and exists(select 1 from public.crm_documents d join public.crm_document_access a on a.case_id=d.case_id
 where name in (d.case_id::text||'/'||d.id::text||'/primary',d.case_id::text||'/'||d.id::text||'/backup') and a.retention_at<=now()));
