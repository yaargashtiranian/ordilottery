-- Campaign/order mutations serialize on the campaign row. The browser never controls prices,
-- payment state, campaign usage, staff identity or the guest-session hash.
create function public.growth_is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.cms_editors e on e.email=lower(u.email)
 where u.id=(select auth.uid()) and u.email_confirmed_at is not null);
$$;
revoke all on function public.growth_is_staff() from public,anon;
grant execute on function public.growth_is_staff() to authenticated;

create table public.growth_campaigns (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
 name text not null check(char_length(name) between 2 and 100),
 channel text not null default '' check(char_length(channel)<=100),
 notes text not null default '' check(char_length(notes)<=1000),
 percent integer not null check(percent between 1 and 100),
 max_uses integer not null check(max_uses between 1 and 1000000),
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at>starts_at),
 plan text not null check(plan in ('all','online','inperson')),
 mode text not null check(mode in ('simulation','sandbox','live')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.growth_orders (
 id uuid primary key,
 guest_hash text not null check(guest_hash ~ '^[a-f0-9]{64}$'),
 input_hash text not null,
 applicant jsonb not null,
 plan text not null check(plan in ('online','inperson')),
 mode text not null check(mode in ('simulation','sandbox','live')),
 campaign_id uuid references public.growth_campaigns(id),
 base_amount bigint not null check(base_amount>0),
 discount_amount bigint not null check(discount_amount>=0 and discount_amount<=base_amount),
 total_amount bigint not null check(total_amount=base_amount-discount_amount),
 currency text not null default 'IRT' check(currency='IRT'),
 status text not null check(status in ('pending','initiating','redirected','completed','cancelled')),
 payment_kind text check(payment_kind in ('discount','simulation','zarinpal')),
 authority text unique,
 provider_ref text,
 case_id uuid references public.crm_cases(id),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 expires_at timestamptz not null default (now()+interval '20 minutes')
);
create index growth_orders_campaign_idx on public.growth_orders(campaign_id,status,expires_at);
create index growth_orders_guest_idx on public.growth_orders(guest_hash,created_at desc);
create unique index growth_orders_case_idx on public.growth_orders(case_id) where case_id is not null;
create index growth_orders_email_idx on public.growth_orders(campaign_id,(lower(applicant->>'email'))) where campaign_id is not null;
create index growth_orders_created_idx on public.growth_orders(created_at desc);
-- One successful redemption per normalized email and campaign; pending attempts also count in the locked RPC.
create unique index growth_orders_redemption_idx on public.growth_orders(campaign_id,(lower(applicant->>'email')))
 where campaign_id is not null and status='completed';

create table public.growth_conversations (
 id uuid primary key default gen_random_uuid(),
 guest_hash text not null unique check(guest_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'waiting' check(status in ('waiting','replied','closed')),
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index growth_chat_queue_idx on public.growth_conversations(updated_at desc);
create table public.growth_messages (
 id uuid primary key,
 conversation_id uuid not null references public.growth_conversations(id) on delete cascade,
 sender text not null check(sender in ('visitor','staff')),
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index growth_messages_cursor_idx on public.growth_messages(conversation_id,created_at,id);
-- Durable fixed-window abuse control works across serverless instances; cleanup is an explicit maintenance task.
create table public.growth_rate_limits (
 key text primary key,
 hits integer not null,
 expires_at timestamptz not null
);

create index growth_rate_expiry_idx on public.growth_rate_limits(expires_at);

-- Public clients have no table or function access. Staff can read lists and create/toggle campaigns;
-- service-role calls are confined to server-only modules and scoped to the HttpOnly guest capability.
do $$ declare tab text; begin
 foreach tab in array array['growth_campaigns','growth_orders','growth_conversations','growth_messages','growth_rate_limits'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant all on public.%I to service_role',tab);
  if tab<>'growth_rate_limits' then
   execute format('grant select on public.%I to authenticated',tab);
   execute format('create policy staff_read on public.%I for select to authenticated using ((select public.growth_is_staff()))',tab);
  end if;
 end loop;
end $$;
grant insert on public.growth_campaigns to authenticated;
grant update(active) on public.growth_campaigns to authenticated;
create policy staff_create on public.growth_campaigns for insert to authenticated with check((select public.growth_is_staff()));
create policy staff_toggle on public.growth_campaigns for update to authenticated using ((select public.growth_is_staff())) with check((select public.growth_is_staff()));

create function public.growth_limit(p_key text,p_max integer,p_seconds integer) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.growth_rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when growth_rate_limits.expires_at<=clock_timestamp() then 1 else growth_rate_limits.hits+1 end,
 expires_at=case when growth_rate_limits.expires_at<=clock_timestamp() then now()+make_interval(secs=>p_seconds) else growth_rate_limits.expires_at end
 returning hits into n;
 -- Bounded housekeeping prevents expired limiter keys from growing without a scheduled job.
 if n=1 then delete from public.growth_rate_limits where key in (select r.key from public.growth_rate_limits r where r.expires_at<now()-interval '1 day' order by r.expires_at limit 100); end if;
 return n<=p_max;
end $$;

-- The transaction owns the immutable price snapshot. Quote and reserve share exactly this calculation.
create function public.growth_checkout(p_id uuid,p_guest text,p_hash text,p_applicant jsonb,p_plan text,p_code text,p_mode text,p_reserve boolean,p_expected bigint default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.growth_campaigns; o public.growth_orders; amount bigint; discount bigint:=0; used integer;
begin
 if p_mode not in ('simulation','sandbox','live') or p_guest !~ '^[a-f0-9]{64}$' then raise exception 'INVALID'; end if;
 amount:=case p_plan when 'online' then 1499000 when 'inperson' then 2999000 else null end;
 if amount is null then raise exception 'INVALID'; end if;
 -- Lock by idempotency key even when no campaign is selected.
 perform pg_advisory_xact_lock(hashtextextended(p_guest,1));
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_reserve then
  select * into o from public.growth_orders where id=p_id;
  if found then
   if o.guest_hash<>p_guest or o.input_hash<>p_hash then raise exception 'CONFLICT'; end if;
   return to_jsonb(o)-'guest_hash'-'input_hash'-'applicant';
  end if;
 end if;
 if p_code<>'' then
  select * into c from public.growth_campaigns where code=p_code for update;
  if not found or not c.active or c.mode<>p_mode or now()<c.starts_at or now()>=c.ends_at or c.plan not in ('all',p_plan) then raise exception 'COUPON_UNAVAILABLE'; end if;
  -- Only simulator reservations expire automatically. A real gateway may still settle after a browser closes.
  select count(*) into used from public.growth_orders where campaign_id=c.id and
   (status='completed' or (status in ('pending','initiating','redirected') and (mode<>'simulation' or expires_at>clock_timestamp())));
  if used>=c.max_uses then raise exception 'COUPON_UNAVAILABLE'; end if;
  if p_reserve and exists(select 1 from public.growth_orders where campaign_id=c.id and lower(applicant->>'email')=lower(p_applicant->>'email') and
   (status='completed' or (status in ('pending','initiating','redirected') and (mode<>'simulation' or expires_at>clock_timestamp())))) then raise exception 'COUPON_ALREADY_USED'; end if;
  discount:=amount*c.percent/100;
 end if;
 if not p_reserve then return jsonb_build_object('base_amount',amount,'discount_amount',discount,'total_amount',amount-discount,'currency','IRT','percent',coalesce(c.percent,0),'mode',p_mode); end if;
 if p_expected is null or p_expected<>amount-discount then raise exception 'PRICE_CHANGED'; end if;
 if coalesce(p_applicant->>'firstName','')='' or coalesce(p_applicant->>'lastName','')='' or coalesce(p_applicant->>'phone','') !~ '^09[0-9]{9}$' or coalesce(p_applicant->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID'; end if;
 -- One open attempt per session limits abandoned checkout spam without blocking retries of the same request.
 if (select count(*) from public.growth_orders where guest_hash=p_guest and status in ('pending','initiating','redirected') and (mode<>'simulation' or expires_at>clock_timestamp()))>=3 then raise exception 'TOO_MANY'; end if;
 insert into public.growth_orders(id,guest_hash,input_hash,applicant,plan,mode,campaign_id,base_amount,discount_amount,total_amount,status)
 values(p_id,p_guest,p_hash,p_applicant,p_plan,p_mode,c.id,amount,discount,amount-discount,'pending') returning * into o;
 return to_jsonb(o)-'guest_hash'-'input_hash'-'applicant';
end $$;

-- Completion is idempotent and never marks a government submission or unlocks document intake.
create function public.growth_complete(p_id uuid,p_kind text,p_reference text default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare o public.growth_orders; customer_id uuid; new_case_id uuid; campaign_id uuid;
begin
 -- Share the reservation lock before checking expiration, preventing a last-millisecond completion from overselling.
 select g.campaign_id into campaign_id from public.growth_orders g where g.id=p_id;
 if campaign_id is not null then perform 1 from public.growth_campaigns c where c.id=campaign_id for update; end if;
 select * into o from public.growth_orders where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if o.status='completed' then return to_jsonb(o)-'guest_hash'-'input_hash'-'applicant'; end if;
 if o.status='cancelled' or (o.mode='simulation' and o.expires_at<=clock_timestamp()) then raise exception 'EXPIRED'; end if;
 if (p_kind='discount' and o.total_amount<>0) or (p_kind='simulation' and o.mode<>'simulation') or
 (p_kind='zarinpal' and (o.mode='simulation' or o.authority is null or coalesce(p_reference,'')='')) or p_kind not in ('discount','simulation','zarinpal') then raise exception 'INVALID'; end if;
 if o.mode='live' then
  -- Email supplied by a guest is not an authenticated identity: never attach to another customer's existing record.
  insert into public.crm_customers(first_name,last_name,email,phone) values(o.applicant->>'firstName',o.applicant->>'lastName',lower(o.applicant->>'email'),o.applicant->>'phone') returning id into customer_id;
  insert into public.crm_cases(customer_id,plan,quoted_amount,last_note) values(customer_id,o.plan,o.base_amount,'سفارش وب؛ مبلغ و تخفیف در بخش سفارش‌ها. دریافت مدارک نیازمند فعال‌سازی کارشناس است.') returning id into new_case_id;
 end if;
 update public.growth_orders set status='completed',payment_kind=p_kind,provider_ref=p_reference,completed_at=now(),case_id=new_case_id where id=p_id returning * into o;
 return to_jsonb(o)-'guest_hash'-'input_hash'-'applicant';
end $$;

-- Visitor and staff messages share a timeline separate from crm_ticket_messages, which remain private notes.
create function public.growth_send_message(p_guest text,p_id uuid,p_body text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare cid uuid; previous public.growth_messages;
begin
 insert into public.growth_conversations(guest_hash) values(p_guest) on conflict(guest_hash) do nothing;
 select id into cid from public.growth_conversations where guest_hash=p_guest for update;
 select * into previous from public.growth_messages where id=p_id;
 if found then
  if previous.conversation_id<>cid or previous.body<>p_body or previous.sender<>'visitor' then raise exception 'CONFLICT'; end if;
  return cid;
 end if;
 if (select count(*) from public.growth_messages where conversation_id=cid and sender='visitor' and created_at>now()-interval '1 minute')>=8 then raise exception 'TOO_MANY'; end if;
 insert into public.growth_messages(id,conversation_id,sender,body) values(p_id,cid,'visitor',p_body);
 update public.growth_conversations set status='waiting',updated_at=now() where id=cid;
 return cid;
end $$;
create function public.growth_staff_reply(p_conversation uuid,p_id uuid,p_body text,p_close boolean default false) returns void
 language plpgsql security definer set search_path='' as $$
declare previous public.growth_messages;
begin
 if not public.growth_is_staff() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.growth_conversations where id=p_conversation for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_body<>'' then
  select * into previous from public.growth_messages where id=p_id;
  if found then
   if previous.conversation_id<>p_conversation or previous.body<>p_body or previous.sender<>'staff' then raise exception 'CONFLICT'; end if;
   return;
  end if;
  insert into public.growth_messages(id,conversation_id,sender,body) values(p_id,p_conversation,'staff',p_body);
 end if;
 update public.growth_conversations set status=case when p_close then 'closed' else 'replied' end,updated_at=now() where id=p_conversation;
end $$;
-- Revoke default PUBLIC execution, including SECURITY DEFINER entry points.
revoke all on function public.growth_limit(text,integer,integer),public.growth_checkout(uuid,text,text,jsonb,text,text,text,boolean,bigint),public.growth_complete(uuid,text,text),public.growth_send_message(text,uuid,text),public.growth_staff_reply(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.growth_limit(text,integer,integer),public.growth_checkout(uuid,text,text,jsonb,text,text,text,boolean,bigint),public.growth_complete(uuid,text,text),public.growth_send_message(text,uuid,text) to service_role;
grant execute on function public.growth_staff_reply(uuid,uuid,text,boolean) to authenticated;

-- Aggregated counts omit applicant identities and use the same reservation predicate as checkout.
create function public.growth_campaign_stats(p_ids uuid[]) returns table(id uuid,used bigint,reserved bigint)
 language sql stable security invoker set search_path='' as $$
 select c.id,count(o.id) filter(where o.status='completed'),count(o.id) filter(where o.status in ('pending','initiating','redirected') and (o.mode<>'simulation' or o.expires_at>clock_timestamp()))
 from public.growth_campaigns c left join public.growth_orders o on o.campaign_id=c.id where c.id=any(p_ids) and cardinality(p_ids)<=25 group by c.id;
$$;
revoke all on function public.growth_campaign_stats(uuid[]) from public,anon;
grant execute on function public.growth_campaign_stats(uuid[]) to authenticated;

-- Manual receipts remain immutable/manual. Coupon credit and verified web receipts are separate ledger sources.
create or replace function public.crm_case_financials(p_case_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'net_recorded',(select coalesce(sum(case when status='recorded' then amount when status='refunded' then -amount else 0 end),0) from public.crm_payments where case_id=p_case_id),
  'receipt_count',(select count(*) from public.crm_payments where case_id=p_case_id),
  'discount_amount',(select coalesce(sum(discount_amount),0) from public.growth_orders where case_id=p_case_id and mode='live' and status='completed'),
  'gateway_amount',(select coalesce(sum(total_amount),0) from public.growth_orders where case_id=p_case_id and mode='live' and status='completed' and payment_kind='zarinpal')
 );
$$;
