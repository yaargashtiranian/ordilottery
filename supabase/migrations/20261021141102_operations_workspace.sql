-- Operational records are private to the existing, server-managed administrator allowlist.
create table public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 2 and 80),
  last_name text not null check (char_length(last_name) between 2 and 80),
  email text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null check (phone ~ '^09[0-9]{9}$'),
  notes text not null default '' check (char_length(notes) <= 2000),
  search_text text generated always as (first_name || ' ' || last_name || ' ' || email || ' ' || phone) stored,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.crm_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigint generated always as identity unique,
  customer_id uuid not null references public.crm_customers(id),
  plan text not null check (plan in ('online','inperson')),
  cycle text check (char_length(cycle) between 1 and 30),
  quoted_amount bigint not null check (quoted_amount > 0 and quoted_amount <= 10000000000),
  currency text not null default 'IRT' check (currency = 'IRT'),
  service_status text not null default 'new' check (service_status in ('new','in_progress','ready','completed','cancelled')),
  review_status text not null default 'not_received' check (review_status in ('not_received','in_review','needs_correction','approved')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  assigned_to text not null default '' check (char_length(assigned_to) <= 80),
  follow_up_on date,
  last_note text not null default '' check (char_length(last_note) <= 2000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_status not in ('ready','completed') or review_status = 'approved')
);
create index crm_cases_customer_idx on public.crm_cases(customer_id,created_at desc);
create index crm_cases_status_idx on public.crm_cases(service_status,updated_at desc);
create table public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_cases(id),
  amount bigint not null check (amount > 0 and amount <= 10000000000),
  currency text not null default 'IRT' check (currency = 'IRT'),
  reference text not null check (char_length(reference) between 3 and 100),
  status text not null check (status in ('recorded','pending','failed','refunded')),
  source text not null default 'manual' check (source = 'manual'),
  gateway_verified boolean not null default false check (gateway_verified = false),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique(case_id,reference)
);
create index crm_payments_case_idx on public.crm_payments(case_id,created_at desc);
create table public.crm_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  customer_id uuid not null references public.crm_customers(id),
  case_id uuid references public.crm_cases(id),
  subject text not null check (char_length(subject) between 3 and 160),
  channel text not null default 'phone' check (channel in ('phone','messenger','email','internal')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_customer','resolved')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_tickets_customer_idx on public.crm_tickets(customer_id,created_at desc);
create index crm_tickets_case_idx on public.crm_tickets(case_id);
create index crm_tickets_status_idx on public.crm_tickets(status,updated_at desc);
create table public.crm_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index crm_ticket_messages_ticket_idx on public.crm_ticket_messages(ticket_id,created_at);
create table public.crm_activity (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.crm_customers(id),
  case_id uuid references public.crm_cases(id),
  ticket_id uuid references public.crm_tickets(id),
  kind text not null,
  label text not null,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index crm_activity_customer_idx on public.crm_activity(customer_id,created_at desc);
create index crm_activity_case_idx on public.crm_activity(case_id,created_at desc);
create index crm_activity_ticket_idx on public.crm_activity(ticket_id,created_at desc);

-- No anonymous, customer-facing or self-granted staff access is exposed by these tables.
do $$ declare tab text; begin
  foreach tab in array array['crm_customers','crm_cases','crm_payments','crm_tickets','crm_ticket_messages','crm_activity'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from anon, authenticated',tab);
    execute format('grant select, insert on public.%I to authenticated',tab);
    execute format('create policy admin_read on public.%I for select to authenticated using (exists (select 1 from public.cms_editors where email = ((select auth.jwt())->>''email'')))',tab);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check (exists (select 1 from public.cms_editors where email = ((select auth.jwt())->>''email'')))',tab);
  end loop;
  foreach tab in array array['crm_customers','crm_cases','crm_tickets'] loop
    execute format('grant update on public.%I to authenticated',tab);
    execute format('create policy admin_update on public.%I for update to authenticated using (exists (select 1 from public.cms_editors where email = ((select auth.jwt())->>''email''))) with check (exists (select 1 from public.cms_editors where email = ((select auth.jwt())->>''email'')))',tab);
  end loop;
end $$;
revoke all on sequence public.crm_cases_case_number_seq,public.crm_tickets_ticket_number_seq,public.crm_activity_id_seq from anon,authenticated;
grant usage on sequence public.crm_cases_case_number_seq,public.crm_tickets_ticket_number_seq,public.crm_activity_id_seq to authenticated;

-- Database-side versions/timestamps prevent partial updates and stale overwrite.
create function public.crm_stamp_record() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.id <> old.id then raise exception 'Record identity is immutable' using errcode='23514'; end if;
  if new.revision <> old.revision+1 then raise exception 'Revision conflict' using errcode='40001'; end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  if tg_table_name='crm_cases' then
    if new.case_number<>old.case_number or new.customer_id <> old.customer_id or new.plan <> old.plan or new.quoted_amount <> old.quoted_amount then
      raise exception 'Case ownership and price snapshot are immutable' using errcode='23514';
    end if;
  elsif tg_table_name='crm_tickets' then
    if new.ticket_number<>old.ticket_number or new.customer_id <> old.customer_id or new.case_id is distinct from old.case_id then
      raise exception 'Ticket relationship is immutable' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger crm_customer_stamp before update on public.crm_customers for each row execute function public.crm_stamp_record();
create trigger crm_case_stamp before update on public.crm_cases for each row execute function public.crm_stamp_record();
create trigger crm_ticket_stamp before update on public.crm_tickets for each row execute function public.crm_stamp_record();

-- A ticket linked to a case must always belong to that case's actual customer.
create function public.crm_check_ticket_customer() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.case_id is not null and not exists(select 1 from public.crm_cases where id=new.case_id and customer_id=new.customer_id) then
    raise exception 'Case/customer mismatch' using errcode='23514';
  end if;
  return new;
end $$;
create trigger crm_ticket_customer before insert on public.crm_tickets for each row execute function public.crm_check_ticket_customer();

-- Append-only operational history is written in the same transaction as each mutation.
create function public.crm_audit_record() returns trigger language plpgsql security invoker set search_path='' as $$
declare cid uuid; caseid uuid; ticketid uuid; eventlabel text; detail jsonb := '{}'::jsonb;
begin
  if tg_table_name='crm_customers' then
    cid:=new.id; eventlabel:=case when tg_op='INSERT' then 'مشتری ثبت شد' else 'اطلاعات مشتری ویرایش شد' end;
  elsif tg_table_name='crm_cases' then
    cid:=new.customer_id;caseid:=new.id;
    eventlabel:=case when tg_op='INSERT' then 'پرونده ایجاد شد' else 'وضعیت پرونده به‌روز شد' end;
    detail:=jsonb_build_object('service_status',new.service_status,'review_status',new.review_status,'note',new.last_note);
  elsif tg_table_name='crm_payments' then
    select customer_id into cid from public.crm_cases where id=new.case_id;
    caseid:=new.case_id;eventlabel:='سابقه پرداخت دستی ثبت شد';detail:=jsonb_build_object('amount',new.amount,'status',new.status,'payment_id',new.id);
  elsif tg_table_name='crm_tickets' then
    cid:=new.customer_id;caseid:=new.case_id;ticketid:=new.id;
    eventlabel:=case when tg_op='INSERT' then 'درخواست پشتیبانی ایجاد شد' else 'پشتیبانی به‌روز شد' end;
    detail:=jsonb_build_object('status',new.status);
  end if;
  insert into public.crm_activity(customer_id,case_id,ticket_id,kind,label,details)
  values(cid,caseid,ticketid,tg_table_name,eventlabel,detail);
  return new;
end $$;
create trigger crm_customer_audit after insert or update on public.crm_customers for each row execute function public.crm_audit_record();
create trigger crm_case_audit after insert or update on public.crm_cases for each row execute function public.crm_audit_record();
create trigger crm_payment_audit after insert on public.crm_payments for each row execute function public.crm_audit_record();
create trigger crm_ticket_audit after insert or update on public.crm_tickets for each row execute function public.crm_audit_record();

-- Initial support note and ticket are atomic; retries with the same ID do not create duplicates.
create function public.crm_create_ticket(p_id uuid,p_customer_id uuid,p_case_id uuid,p_subject text,p_channel text,p_priority text,p_body text)
returns public.crm_tickets language plpgsql security invoker set search_path='' as $$
declare result public.crm_tickets; added integer;
begin
  insert into public.crm_tickets(id,customer_id,case_id,subject,channel,priority)
  values(p_id,p_customer_id,p_case_id,p_subject,p_channel,p_priority) on conflict(id) do nothing returning * into result;
  get diagnostics added=row_count;
  if added=0 then
    select * into result from public.crm_tickets where id=p_id;
    if result.id is null or result.customer_id<>p_customer_id or result.case_id is distinct from p_case_id or result.subject<>p_subject or result.channel<>p_channel or result.priority<>p_priority
      or not exists(select 1 from public.crm_ticket_messages where id=p_id and body=p_body) then
      raise exception 'Idempotency conflict' using errcode='23505';
    end if;
    return result;
  end if;
  insert into public.crm_ticket_messages(id,ticket_id,body) values(p_id,p_id,p_body);
  return result;
end $$;
create function public.crm_add_ticket_note(p_id uuid,p_ticket_id uuid,p_body text)
returns public.crm_ticket_messages language plpgsql security invoker set search_path='' as $$
declare result public.crm_ticket_messages; added integer;
begin
  insert into public.crm_ticket_messages(id,ticket_id,body) values(p_id,p_ticket_id,p_body) on conflict(id) do nothing returning * into result;
  get diagnostics added=row_count;
  if added=0 then
    select * into result from public.crm_ticket_messages where id=p_id;
    if result.id is null or result.ticket_id<>p_ticket_id or result.body<>p_body then raise exception 'Idempotency conflict' using errcode='23505'; end if;
  else
    update public.crm_tickets set revision=revision+1 where id=p_ticket_id;
  end if;
  return result;
end $$;

create function public.crm_summary() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'customers',(select count(*) from public.crm_customers),
  'cases',(select count(*) from public.crm_cases),
  'active_cases',(select count(*) from public.crm_cases where service_status not in ('completed','cancelled')),
  'needs_review',(select count(*) from public.crm_cases where review_status in ('not_received','in_review','needs_correction') and service_status<>'cancelled'),
  'open_tickets',(select count(*) from public.crm_tickets where status<>'resolved'),
  'recorded_amount',(select coalesce(sum(case when status='recorded' then amount when status='refunded' then -amount else 0 end),0) from public.crm_payments)
);
$$;
revoke all on function public.crm_stamp_record(),public.crm_check_ticket_customer(),public.crm_audit_record() from public,anon,authenticated;
revoke all on function public.crm_create_ticket(uuid,uuid,uuid,text,text,text,text),public.crm_add_ticket_note(uuid,uuid,text),public.crm_summary() from public,anon;
grant execute on function public.crm_create_ticket(uuid,uuid,uuid,text,text,text,text),public.crm_add_ticket_note(uuid,uuid,text),public.crm_summary() to authenticated;
