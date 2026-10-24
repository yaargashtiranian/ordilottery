-- Contact belongs to an opaque chat capability, never to an inferred/verified CRM identity.
alter table public.growth_conversations
 add column first_name text,
 add column last_name text,
 add column phone text,
 add constraint growth_chat_lead_complete check (
   (first_name is null and last_name is null and phone is null) or
   (first_name is not null and last_name is not null and phone is not null
    and char_length(btrim(first_name)) between 2 and 80
    and char_length(btrim(last_name)) between 2 and 80 and phone ~ '^09[0-9]{9}$'));
alter table public.growth_messages add column visitor_read_at timestamptz;
create index growth_staff_unread_idx on public.growth_messages(conversation_id,created_at desc) where sender='staff' and visitor_read_at is null;

create table public.growth_chat_reads (
 staff_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 message_id uuid not null references public.growth_messages(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(staff_id,message_id)
);
create index growth_chat_reads_message_idx on public.growth_chat_reads(message_id);
alter table public.growth_chat_reads enable row level security;
revoke all on public.growth_chat_reads from public,anon,authenticated;
grant all on public.growth_chat_reads to service_role;
grant select,insert on public.growth_chat_reads to authenticated;
create policy staff_read_receipts on public.growth_chat_reads for select to authenticated using
 (staff_id=(select auth.uid()) and (select growth_private.is_staff()));
create policy staff_record_receipt on public.growth_chat_reads for insert to authenticated with check
 (staff_id=(select auth.uid()) and (select growth_private.is_staff()) and exists(select 1 from public.growth_messages m where m.id=message_id and m.sender='visitor'));

-- An explicit contact submit is idempotent; a guessed phone number grants no access to other chats.
create function public.growth_set_chat_lead(p_guest text,p_first_name text,p_last_name text,p_phone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.growth_conversations;
begin
 if p_guest is null or p_guest !~ '^[a-f0-9]{64}$' or p_first_name is null or p_last_name is null or p_phone is null
 or char_length(btrim(p_first_name)) not between 2 and 80 or char_length(btrim(p_last_name)) not between 2 and 80
 or p_phone !~ '^09[0-9]{9}$' then raise exception 'INVALID'; end if;
 insert into public.growth_conversations(guest_hash,first_name,last_name,phone)
 values(p_guest,btrim(p_first_name),btrim(p_last_name),p_phone)
 on conflict(guest_hash) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone
 returning * into c;
 return jsonb_build_object('firstName',c.first_name,'lastName',c.last_name,'phone',c.phone);
end $$;

-- Enforce lead capture inside the existing durable send transaction, including legacy conversations.
create or replace function public.growth_send_message(p_guest text,p_id uuid,p_body text) returns uuid
 language plpgsql security invoker set search_path='' as $$
declare c public.growth_conversations; previous public.growth_messages;
begin
 select * into c from public.growth_conversations where guest_hash=p_guest for update;
 if not found or c.first_name is null or c.last_name is null or c.phone is null then raise exception 'CHAT_LEAD_REQUIRED'; end if;
 select * into previous from public.growth_messages where id=p_id;
 if found then
  if previous.conversation_id<>c.id or previous.body<>p_body or previous.sender<>'visitor' then raise exception 'CONFLICT'; end if;
  return c.id;
 end if;
 if (select count(*) from public.growth_messages where conversation_id=c.id and sender='visitor' and created_at>now()-interval '1 minute')>=8 then raise exception 'TOO_MANY'; end if;
 insert into public.growth_messages(id,conversation_id,sender,body) values(p_id,c.id,'visitor',p_body);
 update public.growth_conversations set status='waiting',updated_at=now() where id=c.id;
 return c.id;
end $$;

-- Closed-widget polls fetch counts/contact only; full messages are fetched only for an open human chat.
create function public.growth_visitor_chat(p_guest text,p_messages boolean default true) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c public.growth_conversations; messages jsonb:='[]'; unread_ids jsonb:='[]'; unread bigint;
begin
 select * into c from public.growth_conversations where guest_hash=p_guest;
 if not found then return jsonb_build_object('conversation',null,'messages','[]'::jsonb,'unread_count',0,'unread_ids','[]'::jsonb); end if;
 select count(*) into unread from public.growth_messages where conversation_id=c.id and sender='staff' and visitor_read_at is null;
 if p_messages then
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') into messages from
   (select id,sender,body,created_at,visitor_read_at from public.growth_messages where conversation_id=c.id order by created_at desc,id desc limit 100) m;
  select coalesce(jsonb_agg(m->>'id'),'[]') into unread_ids from jsonb_array_elements(messages) m where m->>'sender'='staff' and m->>'visitor_read_at' is null;
 end if;
 return jsonb_build_object('conversation',jsonb_build_object('id',c.id,'status',c.status,'updated_at',c.updated_at,
   'lead',case when c.phone is not null then jsonb_build_object('firstName',c.first_name,'lastName',c.last_name,'phone',c.phone) else null end),
   'messages',messages,'unread_count',unread,'unread_ids',unread_ids);
end $$;
create function public.growth_visitor_read(p_guest text,p_ids uuid[],p_all boolean default false) returns bigint
language plpgsql security invoker set search_path='' as $$
declare unread bigint;
begin
 if p_ids is null or cardinality(p_ids)>100 then raise exception 'INVALID'; end if;
 update public.growth_messages m set visitor_read_at=now() from public.growth_conversations c
 where m.conversation_id=c.id and c.guest_hash=p_guest and m.sender='staff' and m.visitor_read_at is null and (p_all or m.id=any(p_ids));
 select count(*) into unread from public.growth_messages m join public.growth_conversations c on c.id=m.conversation_id where c.guest_hash=p_guest and m.sender='staff' and m.visitor_read_at is null;
 return unread;
end $$;

-- Per-message receipts avoid timestamp/cursor races and do not mark a later unseen message as read.
create function public.growth_staff_read(p_ids uuid[] default null) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not growth_private.is_staff() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_ids is not null and cardinality(p_ids)>100 then raise exception 'INVALID'; end if;
 insert into public.growth_chat_reads(staff_id,message_id)
 select (select auth.uid()),m.id from public.growth_messages m where m.sender='visitor' and (p_ids is null or m.id=any(p_ids))
 on conflict(staff_id,message_id) do nothing;
end $$;
create function public.growth_staff_chat(p_conversation uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c public.growth_conversations; messages jsonb; unread_ids jsonb;
begin
 if not growth_private.is_staff() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.growth_conversations where id=p_conversation;
 if not found then raise exception 'NOT_FOUND'; end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') into messages from
  (select id,sender,body,created_at from public.growth_messages where conversation_id=c.id order by created_at desc,id desc limit 100) m;
 select coalesce(jsonb_agg(m->>'id'),'[]') into unread_ids from jsonb_array_elements(messages) m
 where m->>'sender'='visitor' and not exists(select 1 from public.growth_chat_reads r where r.staff_id=(select auth.uid()) and r.message_id=(m->>'id')::uuid);
 return jsonb_build_object('messages',messages,'unread_ids',unread_ids,'lead',
 case when c.phone is not null then jsonb_build_object('firstName',c.first_name,'lastName',c.last_name,'phone',c.phone) else null end);
end $$;
create view public.growth_chat_inbox with (security_invoker=true) as
 select c.id,c.status,c.first_name,c.last_name,c.phone,c.created_at,c.updated_at,
 (select count(*) from public.growth_messages m where m.conversation_id=c.id and m.sender='visitor'
 and not exists(select 1 from public.growth_chat_reads r where r.staff_id=(select auth.uid()) and r.message_id=m.id)) as unread_count
 from public.growth_conversations c;
revoke all on public.growth_chat_inbox from public,anon;
grant select on public.growth_chat_inbox to authenticated;
create function public.growth_staff_notifications() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare total bigint; items jsonb;
begin
 if not growth_private.is_staff() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select count(*) into total from public.growth_messages m where m.sender='visitor' and not exists(select 1 from public.growth_chat_reads r where r.staff_id=(select auth.uid()) and r.message_id=m.id);
 select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id desc),'[]') into items from (
  select m.id,m.conversation_id,m.created_at,c.first_name,c.last_name from public.growth_messages m join public.growth_conversations c on c.id=m.conversation_id
  where m.sender='visitor' and not exists(select 1 from public.growth_chat_reads r where r.staff_id=(select auth.uid()) and r.message_id=m.id)
  order by m.created_at desc,m.id desc limit 20) n;
 return jsonb_build_object('total',total,'items',items);
end $$;
revoke all on function public.growth_set_chat_lead(text,text,text,text),public.growth_visitor_chat(text,boolean),public.growth_visitor_read(text,uuid[],boolean),public.growth_staff_read(uuid[]),public.growth_staff_chat(uuid),public.growth_staff_notifications() from public,anon,authenticated;
grant execute on function public.growth_set_chat_lead(text,text,text,text),public.growth_visitor_chat(text,boolean),public.growth_visitor_read(text,uuid[],boolean) to service_role;
grant execute on function public.growth_staff_read(uuid[]),public.growth_staff_chat(uuid),public.growth_staff_notifications() to authenticated;

-- Update only untouched seed copy; preserve staff-authored privacy text.
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text6}',to_jsonb('پاسخ‌های راهنمای خودکار از متن‌های از پیش تعیین‌شده هستند. پیش از اولین پیام به کارشناس، نام، نام خانوادگی و شماره موبایل برای پیگیری پشتیبانی دریافت می‌شود. این اطلاعات، پیام‌ها و وضعیت خواندن اعلان‌ها در Supabase ذخیره می‌شوند و تیم مجاز به آن‌ها دسترسی دارد. شماره موبایل در این مرحله تأیید پیامکی نمی‌شود. اعلان پاسخ فقط داخل سایت و در مرورگر صاحب گفت‌وگو نمایش داده می‌شود. یک کوکی خصوصی ۳۰روزه برای مشاهده سفارش و گفت‌وگو در همین مرورگر استفاده می‌شود؛ پاک‌کردن کوکی یا تغییر مرورگر این دسترسی را از بین می‌برد. هیچ مدرک هویتی یا اطلاعات کارت را در چت نفرستید. برای اصلاح یا درخواست حذف اطلاعات از گفت‌وگو با کارشناس استفاده کنید. سیاست نهایی نگهداری سفارش‌ها و پیام‌ها پیش از استفاده عملیاتی باید اعلام شود.'::text)) where slug='privacy' and draft_content->>'text6'='پاسخ‌های راهنمای خودکار از متن‌های از پیش تعیین‌شده هستند. پیام ارسالی به کارشناس در Supabase ذخیره می‌شود و تیم به آن دسترسی دارد. یک کوکی خصوصی ۳۰روزه برای مشاهده سفارش و گفت‌وگو در همین مرورگر استفاده می‌شود؛ پاک‌کردن کوکی یا تغییر مرورگر این دسترسی را از بین می‌برد. هیچ مدرک هویتی یا اطلاعات کارت را در چت نفرستید. برای اصلاح یا درخواست حذف اطلاعات از گفت‌وگو با کارشناس استفاده کنید. سیاست نهایی نگهداری سفارش‌ها و پیام‌ها پیش از استفاده عملیاتی باید اعلام شود.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text6}',to_jsonb('پاسخ‌های راهنمای خودکار از متن‌های از پیش تعیین‌شده هستند. پیش از اولین پیام به کارشناس، نام، نام خانوادگی و شماره موبایل برای پیگیری پشتیبانی دریافت می‌شود. این اطلاعات، پیام‌ها و وضعیت خواندن اعلان‌ها در Supabase ذخیره می‌شوند و تیم مجاز به آن‌ها دسترسی دارد. شماره موبایل در این مرحله تأیید پیامکی نمی‌شود. اعلان پاسخ فقط داخل سایت و در مرورگر صاحب گفت‌وگو نمایش داده می‌شود. یک کوکی خصوصی ۳۰روزه برای مشاهده سفارش و گفت‌وگو در همین مرورگر استفاده می‌شود؛ پاک‌کردن کوکی یا تغییر مرورگر این دسترسی را از بین می‌برد. هیچ مدرک هویتی یا اطلاعات کارت را در چت نفرستید. برای اصلاح یا درخواست حذف اطلاعات از گفت‌وگو با کارشناس استفاده کنید. سیاست نهایی نگهداری سفارش‌ها و پیام‌ها پیش از استفاده عملیاتی باید اعلام شود.'::text)) where slug='privacy' and published_content->>'text6'='پاسخ‌های راهنمای خودکار از متن‌های از پیش تعیین‌شده هستند. پیام ارسالی به کارشناس در Supabase ذخیره می‌شود و تیم به آن دسترسی دارد. یک کوکی خصوصی ۳۰روزه برای مشاهده سفارش و گفت‌وگو در همین مرورگر استفاده می‌شود؛ پاک‌کردن کوکی یا تغییر مرورگر این دسترسی را از بین می‌برد. هیچ مدرک هویتی یا اطلاعات کارت را در چت نفرستید. برای اصلاح یا درخواست حذف اطلاعات از گفت‌وگو با کارشناس استفاده کنید. سیاست نهایی نگهداری سفارش‌ها و پیام‌ها پیش از استفاده عملیاتی باید اعلام شود.';
