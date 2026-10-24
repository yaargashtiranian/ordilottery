-- Existing staff retain their sections; only the designated owner receives user administration.
alter table public.cms_editors add column display_name text not null default '' check(char_length(display_name)<=100),
 add column enabled boolean not null default true,
 add column is_owner boolean not null default false,
 add column permissions text[] not null default '{}',
 add column revision integer not null default 1 check(revision>0);
update public.cms_editors set permissions=array['overview','customers','cases','documents','payments','support','campaigns','orders','chat','content'],
 is_owner=(email='alihemmat.dev@gmail.com');
alter table public.cms_editors add constraint staff_permissions_valid check(permissions <@ array['overview','customers','cases','documents','payments','support','campaigns','orders','chat','content','users']::text[]);
grant select on public.cms_editors to service_role;

-- Consult actual confirmed Auth identity and current membership on every statement, so revocation is immediate.
create function growth_private.has_permission(p_section text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.cms_editors e on e.email=lower(u.email)
 where u.id=(select auth.uid()) and u.email_confirmed_at is not null and e.enabled
 and u.email !~ '@local-otp[.]invalid$' and (e.is_owner or p_section=any(e.permissions)));
$$;
revoke all on function growth_private.has_permission(text) from public,anon;
grant execute on function growth_private.has_permission(text) to authenticated;
create or replace function growth_private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select growth_private.has_permission('chat');
$$;

alter policy editor_can_read_own_membership on public.cms_editors using
 (email=lower((select auth.jwt())->>'email') and (select auth.uid()) is not null or (select growth_private.has_permission('users')));
alter policy editors_can_read_pages on public.cms_pages using ((select growth_private.has_permission('content')));
alter policy editors_can_update_pages on public.cms_pages using ((select growth_private.has_permission('content'))) with check ((select growth_private.has_permission('content')));

-- A separate append-only log records access changes without storing credentials.
create table public.backoffice_access_log (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 email text not null,
 previous_access jsonb,
 new_access jsonb not null,
 created_at timestamptz not null default now()
);
create index backoffice_access_log_actor_idx on public.backoffice_access_log(actor_id);
alter table public.backoffice_access_log enable row level security;
revoke all on public.backoffice_access_log from public,anon,authenticated;
grant select on public.backoffice_access_log to authenticated;
create policy access_managers_read on public.backoffice_access_log for select to authenticated using ((select growth_private.has_permission('users')));

-- This is the only authenticated mutation entry point. No table write grants, owner edits, self edits or stale writes.
create function growth_private.save_staff(p_email text,p_name text,p_permissions text[],p_enabled boolean,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.cms_editors; normalized text[]; current_email text;
begin
 if not growth_private.has_permission('users') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select lower(email) into current_email from auth.users where id=auth.uid();
 if p_email is null or p_email<>lower(trim(p_email)) or char_length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 or p_email ~ '@local-otp[.]invalid$' or p_name is null or char_length(trim(p_name)) not between 2 and 100 or p_permissions is null or p_enabled is null
 or not (p_permissions <@ array['overview','customers','cases','documents','payments','support','campaigns','orders','chat','content','users']::text[]) then raise exception 'INVALID_STAFF' using errcode='23514'; end if;
 if p_email=current_email then raise exception 'SELF_CHANGE_FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('staff:'||p_email,0));
 select * into previous from public.cms_editors where email=p_email for update;
 if previous.is_owner then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
 if (previous.email is null and p_revision<>0) or (previous.email is not null and p_revision is distinct from previous.revision) or p_revision is null then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 select array_agg(distinct section order by section) into normalized from unnest(p_permissions ||
 case when p_permissions && array['overview','cases','documents','payments','support'] then array['customers'] else '{}'::text[] end ||
 case when p_permissions && array['overview','documents','payments','support'] then array['cases'] else '{}'::text[] end ||
 case when p_permissions && array['overview','payments'] then array['orders'] else '{}'::text[] end ||
 case when 'overview'=any(p_permissions) then array['payments','support'] else '{}'::text[] end) section;
 normalized:=coalesce(normalized,'{}');
 if p_enabled and cardinality(normalized)=0 then raise exception 'EMPTY_PERMISSIONS' using errcode='23514'; end if;
 insert into public.cms_editors(email,display_name,permissions,enabled) values(p_email,trim(p_name),normalized,p_enabled)
 on conflict(email) do update set display_name=excluded.display_name,permissions=excluded.permissions,enabled=excluded.enabled,revision=cms_editors.revision+1;
 insert into public.backoffice_access_log(actor_id,email,previous_access,new_access)
 select auth.uid(),p_email,case when previous.email is null then null else to_jsonb(previous) end,to_jsonb(e) from public.cms_editors e where e.email=p_email;
end;
$$;
revoke all on function growth_private.save_staff(text,text,text[],boolean,integer) from public,anon;
grant execute on function growth_private.save_staff(text,text,text[],boolean,integer) to authenticated;
create function public.backoffice_save_staff(p_email text,p_name text,p_permissions text[],p_enabled boolean,p_revision integer) returns void
language sql security invoker set search_path='' as $$ select growth_private.save_staff(p_email,p_name,p_permissions,p_enabled,p_revision); $$;
revoke all on function public.backoffice_save_staff(text,text,text[],boolean,integer) from public,anon;
grant execute on function public.backoffice_save_staff(text,text,text[],boolean,integer) to authenticated;

-- Each operational table has its own authority. Related history follows the permission for its actual event type.
do $$ declare tab text; section text; begin
 foreach tab in array array['crm_customers','crm_cases','crm_payments','crm_tickets','crm_ticket_messages'] loop
 section:=case tab when 'crm_customers' then 'customers' when 'crm_cases' then 'cases' when 'crm_payments' then 'payments' else 'support' end;
 execute format('alter policy admin_read on public.%I using ((select growth_private.has_permission(%L)))',tab,section);
 execute format('alter policy admin_insert on public.%I with check ((select growth_private.has_permission(%L)))',tab,section);
 if tab in ('crm_customers','crm_cases','crm_tickets') then
 execute format('alter policy admin_update on public.%I using ((select growth_private.has_permission(%L))) with check ((select growth_private.has_permission(%L)))',tab,section,section); end if;
 end loop;
end $$;
alter policy admin_read on public.crm_activity using (growth_private.has_permission(case kind when 'crm_customers' then 'customers' when 'crm_cases' then 'cases' when 'crm_payments' then 'payments' when 'document_review' then 'documents' else 'support' end));
alter policy admin_insert on public.crm_activity with check (growth_private.has_permission(case kind when 'crm_customers' then 'customers' when 'crm_cases' then 'cases' when 'crm_payments' then 'payments' when 'document_review' then 'documents' else 'support' end));

alter policy staff_read on public.growth_campaigns using ((select growth_private.has_permission('campaigns')));
alter policy staff_create on public.growth_campaigns with check ((select growth_private.has_permission('campaigns')));
alter policy staff_toggle on public.growth_campaigns using ((select growth_private.has_permission('campaigns'))) with check ((select growth_private.has_permission('campaigns')));
alter policy staff_read on public.growth_orders using ((select growth_private.has_permission('orders')));

-- Campaign managers receive aggregate usage without needing access to order contact details.
create function growth_private.campaign_stats(p_ids uuid[]) returns table(id uuid,used bigint,reserved bigint)
language sql stable security definer set search_path='' as $$
 select c.id,count(o.id) filter(where o.status='completed'),count(o.id) filter(where o.status in ('pending','initiating','redirected') and (o.mode<>'simulation' or o.expires_at>clock_timestamp()))
 from public.growth_campaigns c left join public.growth_orders o on o.campaign_id=c.id
 where growth_private.has_permission('campaigns') and c.id=any(p_ids) and cardinality(p_ids)<=25 group by c.id;
$$;
revoke all on function growth_private.campaign_stats(uuid[]) from public,anon;
grant execute on function growth_private.campaign_stats(uuid[]) to authenticated;
create or replace function public.growth_campaign_stats(p_ids uuid[]) returns table(id uuid,used bigint,reserved bigint)
language sql stable security invoker set search_path='' as $$ select * from growth_private.campaign_stats(p_ids); $$;

drop policy access_read on public.crm_document_access;
create policy access_read on public.crm_document_access for select to authenticated using (
  (select growth_private.has_permission('documents'))
  or (customer_email=lower((select auth.jwt())->>'email') and (select auth.uid()) is not null)
);

drop policy access_insert on public.crm_document_access;
create policy access_insert on public.crm_document_access for insert to authenticated with check (
  (select growth_private.has_permission('documents')));

drop policy access_update on public.crm_document_access;
create policy access_update on public.crm_document_access for update to authenticated using (
  (select growth_private.has_permission('documents'))
) with check ((select growth_private.has_permission('documents')));

drop policy documents_read on public.crm_documents;
create policy documents_read on public.crm_documents for select to authenticated using (
  (select auth.uid()) is not null and exists(select 1 from public.crm_document_access a where a.case_id=crm_documents.case_id and
  (a.customer_email=lower((select auth.jwt())->>'email') or (select growth_private.has_permission('documents')))));

drop policy documents_insert on public.crm_documents;
create policy documents_insert on public.crm_documents for insert to authenticated with check (
  uploaded_by=(select auth.uid()) and exists(select 1 from public.crm_document_access a where a.case_id=crm_documents.case_id and (a.retention_at is null or a.retention_at>now()) and
  ((select growth_private.has_permission('documents')) or (a.enabled and source='customer' and a.customer_email=lower((select auth.jwt())->>'email')))));

drop policy documents_update on public.crm_documents;
create policy documents_update on public.crm_documents for update to authenticated using (
  (select growth_private.has_permission('documents')) or (uploaded_by=(select auth.uid()) and not uploaded and exists(select 1 from public.crm_document_access a where a.case_id=crm_documents.case_id and a.enabled and a.customer_email=lower((select auth.jwt())->>'email')))
) with check (exists(select 1 from public.crm_document_access a where a.case_id=crm_documents.case_id and
 ((select growth_private.has_permission('documents')) or (a.enabled and a.customer_email=lower((select auth.jwt())->>'email') and (a.retention_at is null or a.retention_at>now())))));

drop policy reviews_read on public.crm_document_reviews;
create policy reviews_read on public.crm_document_reviews for select to authenticated using (
  exists(select 1 from public.crm_documents d join public.crm_document_access a on a.case_id=d.case_id where d.id=crm_document_reviews.document_id and
  (a.customer_email=lower((select auth.jwt())->>'email') or (select growth_private.has_permission('documents')))));

drop policy reviews_insert on public.crm_document_reviews;
create policy reviews_insert on public.crm_document_reviews for insert to authenticated with check (
  actor_id=(select auth.uid()) and (select growth_private.has_permission('documents')));

drop policy case_document_read on storage.objects;
create policy case_document_read on storage.objects for select to authenticated using (
 bucket_id='case-documents' and exists(select 1 from public.crm_documents d join public.crm_document_access a on a.case_id=d.case_id
 where name in (d.case_id::text||'/'||d.id::text||'/primary',d.case_id::text||'/'||d.id::text||'/backup') and not d.erased
 and (a.customer_email=lower((select auth.jwt())->>'email') or (select growth_private.has_permission('documents')))
 and (a.retention_at is null or a.retention_at>now() or (select growth_private.has_permission('documents')))));

drop policy case_document_upload on storage.objects;
create policy case_document_upload on storage.objects for insert to authenticated with check (
 bucket_id='case-documents' and exists(select 1 from public.crm_documents d join public.crm_document_access a on a.case_id=d.case_id
 where name in (d.case_id::text||'/'||d.id::text||'/primary',d.case_id::text||'/'||d.id::text||'/backup') and not d.uploaded and d.uploaded_by=(select auth.uid())
 and (a.retention_at is null or a.retention_at>now())
 and ((a.enabled and a.customer_email=lower((select auth.jwt())->>'email')) or (select growth_private.has_permission('documents')))));

drop policy case_document_expired_delete on storage.objects;
create policy case_document_expired_delete on storage.objects for delete to authenticated using (
 bucket_id='case-documents' and (select growth_private.has_permission('documents'))
 and exists(select 1 from public.crm_documents d join public.crm_document_access a on a.case_id=d.case_id
 where name in (d.case_id::text||'/'||d.id::text||'/primary',d.case_id::text||'/'||d.id::text||'/backup') and a.retention_at<=now()));

create function growth_private.sync_document_access() returns trigger language plpgsql security definer set search_path='' as $$
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
revoke all on function growth_private.sync_document_access() from public,anon,authenticated;
drop trigger crm_case_document_access on public.crm_cases;
drop trigger crm_customer_document_access on public.crm_customers;
create trigger crm_case_document_access after insert or update on public.crm_cases for each row execute function growth_private.sync_document_access();
create trigger crm_customer_document_access after update of email on public.crm_customers for each row execute function growth_private.sync_document_access();

create or replace function public.crm_document_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare staff boolean; root public.crm_documents;
begin
  staff:=growth_private.has_permission('documents');
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
