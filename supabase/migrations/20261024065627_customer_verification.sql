-- A test phone check is a form checkpoint, never a confirmed email or a document-access credential.
create table public.growth_identity_checks (
 guest_hash text primary key check(guest_hash ~ '^[a-f0-9]{64}$'),
 profile jsonb not null check(jsonb_typeof(profile)='object' and profile->>'phone' ~ '^09[0-9]{9}$' and profile->>'email' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 challenge_id uuid not null default gen_random_uuid(),
 channel text not null check(channel in ('email','test_phone')),
 method text check(method in ('email','test_phone')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 expires_at timestamptz not null default (now()+interval '10 minutes')
);
create index growth_identity_expiry_idx on public.growth_identity_checks(expires_at);
alter table public.growth_identity_checks enable row level security;
revoke all on public.growth_identity_checks from public,anon,authenticated;
grant all on public.growth_identity_checks to service_role;
create index crm_customers_email_lookup_idx on public.crm_customers(lower(email));
create index crm_customers_phone_lookup_idx on public.crm_customers(phone);
create index growth_orders_contact_email_idx on public.growth_orders(lower(applicant->>'email'));
create index growth_orders_contact_phone_idx on public.growth_orders((applicant->>'phone'));

-- This private lookup returns only presence; it cannot return an Auth ID, profile, case or session.
create function growth_private.customer_known(p_email text,p_phone text,p_auth_only boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where (email=lower(p_email) or phone=ltrim('98'||substr(p_phone,2),'+'))
 and (p_auth_only or email_confirmed_at is not null or phone_confirmed_at is not null))
 or (not p_auth_only and (
 exists(select 1 from public.crm_customers where lower(email)=lower(p_email) or phone=p_phone)
 or exists(select 1 from public.growth_orders where lower(applicant->>'email')=lower(p_email) or applicant->>'phone'=p_phone)));
$$;
revoke all on function growth_private.customer_known(text,text,boolean) from public,anon,authenticated;
grant usage on schema growth_private to service_role;
grant execute on function growth_private.customer_known(text,text,boolean) to service_role;
create function public.growth_identity_status(p_guest text,p_email text,p_phone text,p_auth_only boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('known',growth_private.customer_known(p_email,p_phone,p_auth_only),'verified',
 exists(select 1 from public.growth_identity_checks where guest_hash=p_guest and lower(profile->>'email')=lower(p_email) and profile->>'phone'=p_phone and method is not null and expires_at>now()));
$$;
create function public.growth_identity_start(p_guest text,p_profile jsonb,p_channel text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare challenge uuid;
begin
 -- Bound cleanup runs only on this service-only endpoint and never touches nonexpired checks.
 delete from public.growth_identity_checks where guest_hash in (select guest_hash from public.growth_identity_checks where expires_at<now() order by expires_at limit 100);
 insert into public.growth_identity_checks(guest_hash,profile,channel) values(p_guest,p_profile,p_channel)
 on conflict(guest_hash) do update set profile=excluded.profile,channel=excluded.channel,method=null,attempts=0,expires_at=now()+interval '10 minutes',challenge_id=gen_random_uuid()
 returning challenge_id into challenge;
 return challenge;
end $$;
create function public.growth_identity_current(p_guest text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('profile',profile,'challenge',challenge_id,'channel',channel,'verified',method is not null,'method',method)
 from public.growth_identity_checks where guest_hash=p_guest and expires_at>now();
$$;
-- Failed attempts are committed too; IDs, contact tuple, expiry and guest capability bind each challenge.
create function public.growth_identity_attempt(p_guest text,p_id uuid,p_valid boolean,p_method text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c public.growth_identity_checks;
begin
 select * into c from public.growth_identity_checks where guest_hash=p_guest for update;
 if not found or c.challenge_id<>p_id or c.expires_at<=now() or c.attempts>=5 or c.channel<>p_method then return false; end if;
 if c.method is not null then return p_valid is true; end if;
 update public.growth_identity_checks set attempts=attempts+1 where guest_hash=p_guest;
 if p_valid is not true then return false; end if;
 update public.growth_identity_checks set method=p_method,expires_at=now()+interval '30 minutes' where guest_hash=p_guest;
 return true;
end $$;
alter table public.growth_orders add column contact_check text check(contact_check in ('existing','email','test_phone'));
create function public.growth_order_contact_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select method into new.contact_check from public.growth_identity_checks where guest_hash=new.guest_hash
 and lower(profile->>'email')=lower(new.applicant->>'email') and profile->>'phone'=new.applicant->>'phone' and method is not null and expires_at>now();
 if new.contact_check is null then
  if not growth_private.customer_known(new.applicant->>'email',new.applicant->>'phone') then raise exception 'CONTACT_VERIFICATION_REQUIRED'; end if;
  new.contact_check:='existing';
 end if;
 return new;
end $$;
create trigger growth_order_contact_check before insert on public.growth_orders for each row execute function public.growth_order_contact_guard();
revoke all on function public.growth_identity_status(text,text,text,boolean),public.growth_identity_start(text,jsonb,text),public.growth_identity_current(text),public.growth_identity_attempt(text,uuid,boolean,text),public.growth_order_contact_guard() from public,anon,authenticated;
grant execute on function public.growth_identity_status(text,text,text,boolean),public.growth_identity_start(text,jsonb,text),public.growth_identity_current(text),public.growth_identity_attempt(text,uuid,boolean,text),public.growth_order_contact_guard() to service_role;

-- Hosted Phone Auth is disabled until SMS is connected. A reserved random email authenticates local test
-- accounts through existing Supabase password sessions, without claiming the customer's real email.
create function growth_private.test_login_email(p_phone text) returns text language sql stable security definer set search_path='' as $$
 select email from auth.users where phone=ltrim(p_phone,'+') and email like '%@local-otp.invalid'
 and raw_app_meta_data->>'identity_assurance'='test_phone' limit 1;
$$;
revoke all on function growth_private.test_login_email(text) from public,anon,authenticated;
grant execute on function growth_private.test_login_email(text) to service_role;
create function public.growth_test_login(p_phone text) returns text language sql stable security invoker set search_path='' as $$
 select growth_private.test_login_email(p_phone);
$$;
revoke all on function public.growth_test_login(text) from public,anon,authenticated;
grant execute on function public.growth_test_login(text) to service_role;

-- Restrictive policies compose with every existing invitation/file rule and deny the reserved namespace,
-- even if a staff member accidentally creates an invitation addressed to an internal test login.
do $$ declare tab text; begin
 foreach tab in array array['crm_document_access','crm_documents','crm_document_reviews'] loop
  execute format('create policy no_mock_identity on public.%I as restrictive for all to authenticated using (coalesce((select auth.jwt())->>''email'','''') !~ ''@local-otp[.]invalid$'') with check (coalesce((select auth.jwt())->>''email'','''') !~ ''@local-otp[.]invalid$'')',tab);
 end loop;
end $$;
create policy no_mock_identity on storage.objects as restrictive for all to authenticated
 using(coalesce((select auth.jwt())->>'email','') !~ '@local-otp[.]invalid$')
 with check(coalesce((select auth.jwt())->>'email','') !~ '@local-otp[.]invalid$');

-- Shorten untouched public seed copy while preserving all editor-authored content.
update public.cms_pages set draft_content=jsonb_set(draft_content,'{description}',to_jsonb('انتخاب خدمت، آماده‌سازی مدارک و پیگیری ثبت‌نام.'::text)) where slug='home' and draft_content->>'description'='از انتخاب روش همراهی تا آماده‌سازی مدارک؛ مسیرت را با چند قدم کوتاه شروع کن. قیمت را قبل از تصمیم می‌بینی.';
update public.cms_pages set published_content=jsonb_set(published_content,'{description}',to_jsonb('انتخاب خدمت، آماده‌سازی مدارک و پیگیری ثبت‌نام.'::text)) where slug='home' and published_content->>'description'='از انتخاب روش همراهی تا آماده‌سازی مدارک؛ مسیرت را با چند قدم کوتاه شروع کن. قیمت را قبل از تصمیم می‌بینی.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{step1}',to_jsonb('انتخاب خدمت'::text)) where slug='home' and draft_content->>'step1'='از آشنایی شروع می‌کنیم';
update public.cms_pages set published_content=jsonb_set(published_content,'{step1}',to_jsonb('انتخاب خدمت'::text)) where slug='home' and published_content->>'step1'='از آشنایی شروع می‌کنیم';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{step2}',to_jsonb('اطلاعات تماس و روش همراهی را ثبت کنید.'::text)) where slug='home' and draft_content->>'step2'='نام و اطلاعات تماس را وارد می‌کنید و شیوه همراهی را انتخاب می‌کنید. برای شروع، همین کافی است.';
update public.cms_pages set published_content=jsonb_set(published_content,'{step2}',to_jsonb('اطلاعات تماس و روش همراهی را ثبت کنید.'::text)) where slug='home' and published_content->>'step2'='نام و اطلاعات تماس را وارد می‌کنید و شیوه همراهی را انتخاب می‌کنید. برای شروع، همین کافی است.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{step3}',to_jsonb('تکمیل اطلاعات'::text)) where slug='home' and draft_content->>'step3'='با یک مسیر روشن ادامه می‌دهیم';
update public.cms_pages set published_content=jsonb_set(published_content,'{step3}',to_jsonb('تکمیل اطلاعات'::text)) where slug='home' and published_content->>'step3'='با یک مسیر روشن ادامه می‌دهیم';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{step4}',to_jsonb('پس از فعال‌سازی پرونده، فرم تکمیلی و مدارک را ارسال کنید.'::text)) where slug='home' and draft_content->>'step4'='پس از پرداخت تأییدشده هزینه خدمات، فرم تکمیلی و راهنمای آماده‌سازی مدارک در اختیار شماست.';
update public.cms_pages set published_content=jsonb_set(published_content,'{step4}',to_jsonb('پس از فعال‌سازی پرونده، فرم تکمیلی و مدارک را ارسال کنید.'::text)) where slug='home' and published_content->>'step4'='پس از پرداخت تأییدشده هزینه خدمات، فرم تکمیلی و راهنمای آماده‌سازی مدارک در اختیار شماست.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{step5}',to_jsonb('بررسی مدارک'::text)) where slug='home' and draft_content->>'step5'='جزئیات را با دقت بررسی می‌کنیم';
update public.cms_pages set published_content=jsonb_set(published_content,'{step5}',to_jsonb('بررسی مدارک'::text)) where slug='home' and published_content->>'step5'='جزئیات را با دقت بررسی می‌کنیم';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{step6}',to_jsonb('کارشناس مدارک را بررسی و اصلاحات لازم را اعلام می‌کند.'::text)) where slug='home' and draft_content->>'step6'='متخصص، اطلاعات و مدارک را بررسی می‌کند. اگر چیزی نیاز به اصلاح داشته باشد، قدم بعد را با هم برمی‌داریم.';
update public.cms_pages set published_content=jsonb_set(published_content,'{step6}',to_jsonb('کارشناس مدارک را بررسی و اصلاحات لازم را اعلام می‌کند.'::text)) where slug='home' and published_content->>'step6'='متخصص، اطلاعات و مدارک را بررسی می‌کند. اگر چیزی نیاز به اصلاح داشته باشد، قدم بعد را با هم برمی‌داریم.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{step7}',to_jsonb('ثبت نهایی'::text)) where slug='home' and draft_content->>'step7'='تا ثبت نهایی، کنارتان می‌مانیم';
update public.cms_pages set published_content=jsonb_set(published_content,'{step7}',to_jsonb('ثبت نهایی'::text)) where slug='home' and published_content->>'step7'='تا ثبت نهایی، کنارتان می‌مانیم';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{step8}',to_jsonb('ثبت رسمی پس از تکمیل پرونده و در بازه اعلام‌شده انجام می‌شود.'::text)) where slug='home' and draft_content->>'step8'='ثبت رسمی در بازه اعلام‌شده و پس از تکمیل پرونده انجام می‌شود؛ دریافت درخواست خدمات، به معنی ثبت نهایی نیست.';
update public.cms_pages set published_content=jsonb_set(published_content,'{step8}',to_jsonb('ثبت رسمی پس از تکمیل پرونده و در بازه اعلام‌شده انجام می‌شود.'::text)) where slug='home' and published_content->>'step8'='ثبت رسمی در بازه اعلام‌شده و پس از تکمیل پرونده انجام می‌شود؛ دریافت درخواست خدمات، به معنی ثبت نهایی نیست.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text19}',to_jsonb('لاتاری DV، برنامهٔ ویزای تنوع آمریکاست.'::text)) where slug='home' and draft_content->>'text19'='لاتاری گرین‌کارت، فرصتی برای قدم گذاشتن در یک مسیر تازه است؛ اما قدم اول، شناخت درست آن است.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text19}',to_jsonb('لاتاری DV، برنامهٔ ویزای تنوع آمریکاست.'::text)) where slug='home' and published_content->>'text19'='لاتاری گرین‌کارت، فرصتی برای قدم گذاشتن در یک مسیر تازه است؛ اما قدم اول، شناخت درست آن است.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text20}',to_jsonb('انتخاب‌شدن به معنی صدور ویزا نیست.'::text)) where slug='home' and draft_content->>'text20'='برنامه Diversity Visa یا DV، مسیر انتخاب متقاضیان برای ادامه فرایند ویزای تنوع آمریکاست. انتخاب شدن، آغاز بررسی پرونده است و به‌تنهایی به معنی دریافت ویزا نیست.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text20}',to_jsonb('انتخاب‌شدن به معنی صدور ویزا نیست.'::text)) where slug='home' and published_content->>'text20'='برنامه Diversity Visa یا DV، مسیر انتخاب متقاضیان برای ادامه فرایند ویزای تنوع آمریکاست. انتخاب شدن، آغاز بررسی پرونده است و به‌تنهایی به معنی دریافت ویزا نیست.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text22}',to_jsonb('برای آماده‌سازی مدارک و پیگیری درخواست همراهتان هستیم.'::text)) where slug='home' and draft_content->>'text22'='برای تصمیم شما وعده نمی‌سازیم؛ کمک می‌کنیم اطلاعات، مدارک و مراحل درخواست را با دقت بیشتری پیش ببرید.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text22}',to_jsonb('برای آماده‌سازی مدارک و پیگیری درخواست همراهتان هستیم.'::text)) where slug='home' and published_content->>'text22'='برای تصمیم شما وعده نمی‌سازیم؛ کمک می‌کنیم اطلاعات، مدارک و مراحل درخواست را با دقت بیشتری پیش ببرید.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text28}',to_jsonb('از ثبت اطلاعات تماس تا بررسی و تکمیل پرونده.'::text)) where slug='home' and draft_content->>'text28'='قرار نیست از همان ابتدا همه‌چیز را بدانید. مسیر را به قدم‌های کوچک و روشن تقسیم کرده‌ایم.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text28}',to_jsonb('از ثبت اطلاعات تماس تا بررسی و تکمیل پرونده.'::text)) where slug='home' and published_content->>'text28'='قرار نیست از همان ابتدا همه‌چیز را بدانید. مسیر را به قدم‌های کوچک و روشن تقسیم کرده‌ایم.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text38}',to_jsonb('مدارک موردنیاز را در پرتال پرونده ببینید.'::text)) where slug='home' and draft_content->>'text38'='هر مدرک، راهنمای خودش را دارد. در مرحله تکمیلی، دقیقاً می‌دانید چه چیزی لازم است و چطور باید آماده‌اش کنید.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text38}',to_jsonb('مدارک موردنیاز را در پرتال پرونده ببینید.'::text)) where slug='home' and published_content->>'text38'='هر مدرک، راهنمای خودش را دارد. در مرحله تکمیلی، دقیقاً می‌دانید چه چیزی لازم است و چطور باید آماده‌اش کنید.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text40}',to_jsonb('عکس مطابق دستورالعمل رسمی همان دوره بررسی می‌شود.'::text)) where slug='home' and draft_content->>'text40'='ویژگی‌های عکس بر اساس دستورالعمل رسمی بررسی می‌شود؛ کنترل فایل، جای بررسی متخصص را نمی‌گیرد.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text40}',to_jsonb('عکس مطابق دستورالعمل رسمی همان دوره بررسی می‌شود.'::text)) where slug='home' and published_content->>'text40'='ویژگی‌های عکس بر اساس دستورالعمل رسمی بررسی می‌شود؛ کنترل فایل، جای بررسی متخصص را نمی‌گیرد.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text42}',to_jsonb('جزئیات هویتی و مدارک در پرتال خصوصی دریافت می‌شوند.'::text)) where slug='home' and draft_content->>'text42'='ابتدا فقط اطلاعات تماس؛ جزئیات و مدارک هویتی در مرحله تکمیلی و از مسیر تعیین‌شده دریافت می‌شوند.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text42}',to_jsonb('جزئیات هویتی و مدارک در پرتال خصوصی دریافت می‌شوند.'::text)) where slug='home' and published_content->>'text42'='ابتدا فقط اطلاعات تماس؛ جزئیات و مدارک هویتی در مرحله تکمیلی و از مسیر تعیین‌شده دریافت می‌شوند.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text44}',to_jsonb('نگهداری خصوصی تا پایان پرونده و ۹۰ روز پس از آن.'::text)) where slug='home' and draft_content->>'text44'='قبل از دریافت مدارک، روش ارسال و شرایط نگهداری آن‌ها روشن خواهد بود.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text44}',to_jsonb('نگهداری خصوصی تا پایان پرونده و ۹۰ روز پس از آن.'::text)) where slug='home' and published_content->>'text44'='قبل از دریافت مدارک، روش ارسال و شرایط نگهداری آن‌ها روشن خواهد بود.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text50}',to_jsonb('خدمات بررسی و تکمیل پرونده پس از انتخاب هم قابل ارائه است.'::text)) where slug='home' and draft_content->>'text50'='پس از انتخاب شدن در لاتاری، مسیر تازه‌ای از بررسی و تکمیل پرونده آغاز می‌شود. امکان همراهی متخصص برای این مرحله هم وجود دارد.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text50}',to_jsonb('خدمات بررسی و تکمیل پرونده پس از انتخاب هم قابل ارائه است.'::text)) where slug='home' and published_content->>'text50'='پس از انتخاب شدن در لاتاری، مسیر تازه‌ای از بررسی و تکمیل پرونده آغاز می‌شود. امکان همراهی متخصص برای این مرحله هم وجود دارد.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text51}',to_jsonb('با توافق و هزینهٔ جداگانه؛ بدون تضمین ویزا.'::text)) where slug='home' and draft_content->>'text51'='این خدمت با بررسی شرایط، دامنه و هزینه جداگانه ارائه می‌شود. انتخاب شدن یا همراهی متخصص، تضمین صدور ویزا نیست.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text51}',to_jsonb('با توافق و هزینهٔ جداگانه؛ بدون تضمین ویزا.'::text)) where slug='home' and published_content->>'text51'='این خدمت با بررسی شرایط، دامنه و هزینه جداگانه ارائه می‌شود. انتخاب شدن یا همراهی متخصص، تضمین صدور ویزا نیست.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text64}',to_jsonb('ارائه‌دهندهٔ مستقل خدمات، بدون وابستگی به دولت آمریکا. هزینهٔ رسمی و خدمات پس از انتخاب جداست.'::text)) where slug='home' and draft_content->>'text64'='ارائه‌دهنده مستقل خدمات است و وابستگی به دولت آمریکا ندارد. تعرفه‌های نمایش‌داده‌شده مربوط به خدمات شرکت است؛ هزینه احتمالی رسمی و خدمات بعدی، در صورت لزوم جداگانه اعلام می‌شوند.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text64}',to_jsonb('ارائه‌دهندهٔ مستقل خدمات، بدون وابستگی به دولت آمریکا. هزینهٔ رسمی و خدمات پس از انتخاب جداست.'::text)) where slug='home' and published_content->>'text64'='ارائه‌دهنده مستقل خدمات است و وابستگی به دولت آمریکا ندارد. تعرفه‌های نمایش‌داده‌شده مربوط به خدمات شرکت است؛ هزینه احتمالی رسمی و خدمات بعدی، در صورت لزوم جداگانه اعلام می‌شوند.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{faqAnswer1}',to_jsonb('خیر. پیش‌ثبت‌نام، درخواست استفاده از خدمات یارگشت است. ثبت رسمی پس از تکمیل پرونده و در بازه اعلام‌شده انجام می‌شود.'::text)) where slug='home' and draft_content->>'faqAnswer1'='خیر. پیش‌ثبت‌نام، درخواست استفاده از خدمات یارگشت است. ثبت در سامانه رسمی تنها در بازه اعلام‌شده و پس از تکمیل و بررسی اطلاعات انجام می‌شود. دریافت فرم یا پرداخت به معنی ثبت نهایی نیست.';
update public.cms_pages set published_content=jsonb_set(published_content,'{faqAnswer1}',to_jsonb('خیر. پیش‌ثبت‌نام، درخواست استفاده از خدمات یارگشت است. ثبت رسمی پس از تکمیل پرونده و در بازه اعلام‌شده انجام می‌شود.'::text)) where slug='home' and published_content->>'faqAnswer1'='خیر. پیش‌ثبت‌نام، درخواست استفاده از خدمات یارگشت است. ثبت در سامانه رسمی تنها در بازه اعلام‌شده و پس از تکمیل و بررسی اطلاعات انجام می‌شود. دریافت فرم یا پرداخت به معنی ثبت نهایی نیست.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{faqAnswer2}',to_jsonb('نام، نام خانوادگی، ایمیل و موبایل؛ مدارک در مرحلهٔ تکمیلی دریافت می‌شوند.'::text)) where slug='home' and draft_content->>'faqAnswer2'='فقط نام، نام خانوادگی، ایمیل و شماره تماس. پس از پرداخت تأییدشده، فرم تکمیلی و راهنمای مدارک در اختیار شما قرار می‌گیرد. اطلاعات بیشتر را در همان مرحله دریافت می‌کنیم.';
update public.cms_pages set published_content=jsonb_set(published_content,'{faqAnswer2}',to_jsonb('نام، نام خانوادگی، ایمیل و موبایل؛ مدارک در مرحلهٔ تکمیلی دریافت می‌شوند.'::text)) where slug='home' and published_content->>'faqAnswer2'='فقط نام، نام خانوادگی، ایمیل و شماره تماس. پس از پرداخت تأییدشده، فرم تکمیلی و راهنمای مدارک در اختیار شما قرار می‌گیرد. اطلاعات بیشتر را در همان مرحله دریافت می‌کنیم.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{faqAnswer3}',to_jsonb('آنلاین: تماس و پیام‌رسان. حضوری: بررسی و اسکن مدارک با متخصص. عکاسی با توافق جداگانه.'::text)) where slug='home' and draft_content->>'faqAnswer3'='در روش آنلاین، راهنمایی و پیگیری از طریق تماس و پیام‌رسان است. در روش حضوری، متخصص برای بررسی و اسکن مدارک همراه شماست. عکاسی با هماهنگی و توافق جداگانه امکان‌پذیر است.';
update public.cms_pages set published_content=jsonb_set(published_content,'{faqAnswer3}',to_jsonb('آنلاین: تماس و پیام‌رسان. حضوری: بررسی و اسکن مدارک با متخصص. عکاسی با توافق جداگانه.'::text)) where slug='home' and published_content->>'faqAnswer3'='در روش آنلاین، راهنمایی و پیگیری از طریق تماس و پیام‌رسان است. در روش حضوری، متخصص برای بررسی و اسکن مدارک همراه شماست. عکاسی با هماهنگی و توافق جداگانه امکان‌پذیر است.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{faqAnswer4}',to_jsonb('خیر؛ پرداخت بابت آماده‌سازی و پیگیری پرونده است. انتخاب و صدور ویزا تضمین نمی‌شوند.'::text)) where slug='home' and draft_content->>'faqAnswer4'='خیر. هزینه خدمات برای آماده‌سازی، بررسی و پیگیری درخواست شماست و احتمال انتخاب شدن را افزایش نمی‌دهد. انتخاب در لاتاری و دریافت ویزا دو مرحله جدا هستند و هیچ‌کدام تضمین نمی‌شوند.';
update public.cms_pages set published_content=jsonb_set(published_content,'{faqAnswer4}',to_jsonb('خیر؛ پرداخت بابت آماده‌سازی و پیگیری پرونده است. انتخاب و صدور ویزا تضمین نمی‌شوند.'::text)) where slug='home' and published_content->>'faqAnswer4'='خیر. هزینه خدمات برای آماده‌سازی، بررسی و پیگیری درخواست شماست و احتمال انتخاب شدن را افزایش نمی‌دهد. انتخاب در لاتاری و دریافت ویزا دو مرحله جدا هستند و هیچ‌کدام تضمین نمی‌شوند.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{faqAnswer5}',to_jsonb('دستورالعمل رسمی همان دوره در سایت وزارت خارجه آمریکا؛ قوانین دورهٔ جدید هنوز تأیید نشده‌اند.'::text)) where slug='home' and draft_content->>'faqAnswer5'='مبنای این موارد، دستورالعمل رسمی همان دوره در وب‌سایت وزارت خارجه آمریکاست. تا تأیید اطلاعیه دوره جدید، درباره الزام پاسپورت، مبلغ رسمی یا تاریخ شروع ادعای قطعی نداریم.';
update public.cms_pages set published_content=jsonb_set(published_content,'{faqAnswer5}',to_jsonb('دستورالعمل رسمی همان دوره در سایت وزارت خارجه آمریکا؛ قوانین دورهٔ جدید هنوز تأیید نشده‌اند.'::text)) where slug='home' and published_content->>'faqAnswer5'='مبنای این موارد، دستورالعمل رسمی همان دوره در وب‌سایت وزارت خارجه آمریکاست. تا تأیید اطلاعیه دوره جدید، درباره الزام پاسپورت، مبلغ رسمی یا تاریخ شروع ادعای قطعی نداریم.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{faqAnswer6}',to_jsonb('بله، با توافق دربارهٔ خدمات و هزینهٔ جداگانه.'::text)) where slug='home' and draft_content->>'faqAnswer6'='امکان همراهی متخصص برای مراحل بعد از انتخاب شدن وجود دارد. جزئیات، حدود مسئولیت و هزینه این خدمت جداگانه بررسی و توافق می‌شود؛ این خدمت در تعرفه اولیه ثبت‌نام منظور نشده است.';
update public.cms_pages set published_content=jsonb_set(published_content,'{faqAnswer6}',to_jsonb('بله، با توافق دربارهٔ خدمات و هزینهٔ جداگانه.'::text)) where slug='home' and published_content->>'faqAnswer6'='امکان همراهی متخصص برای مراحل بعد از انتخاب شدن وجود دارد. جزئیات، حدود مسئولیت و هزینه این خدمت جداگانه بررسی و توافق می‌شود؛ این خدمت در تعرفه اولیه ثبت‌نام منظور نشده است.';
update public.cms_pages set draft_content=jsonb_set(draft_content,'{text4}',to_jsonb('اطلاعات تماس هنگام درخواست تأیید و سفارش در Supabase ذخیره می‌شود. تأیید تماس ۳۰ دقیقه معتبر و به همان مرورگر و مشخصات وابسته است. تأیید ایمیل با Supabase Auth انجام می‌شود. کد ثابت موبایل فقط در محیط آزمایشی محلی فعال است و تأیید واقعی مالکیت موبایل یا ایمیل نیست. حساب آزمایشی موبایل دسترسی مدارک نمی‌دهد؛ مدارک به ایمیل تأییدشده و دعوت پرونده نیاز دارند.'::text)) where slug='privacy' and draft_content->>'text4'='پیش از تأیید نهایی، نام، نام خانوادگی، ایمیل و شماره تماس فقط در حافظه صفحه هستند. هنگام تأیید سفارش در سرویس فعال، این اطلاعات همراه با خدمت، قیمت و نتیجه سفارش در Supabase ذخیره می‌شوند و تیم مجاز به آن‌ها دسترسی دارد. در حالت پیش‌نمایش غیرفعال، فرم اطلاعات را ارسال نمی‌کند.';
update public.cms_pages set published_content=jsonb_set(published_content,'{text4}',to_jsonb('اطلاعات تماس هنگام درخواست تأیید و سفارش در Supabase ذخیره می‌شود. تأیید تماس ۳۰ دقیقه معتبر و به همان مرورگر و مشخصات وابسته است. تأیید ایمیل با Supabase Auth انجام می‌شود. کد ثابت موبایل فقط در محیط آزمایشی محلی فعال است و تأیید واقعی مالکیت موبایل یا ایمیل نیست. حساب آزمایشی موبایل دسترسی مدارک نمی‌دهد؛ مدارک به ایمیل تأییدشده و دعوت پرونده نیاز دارند.'::text)) where slug='privacy' and published_content->>'text4'='پیش از تأیید نهایی، نام، نام خانوادگی، ایمیل و شماره تماس فقط در حافظه صفحه هستند. هنگام تأیید سفارش در سرویس فعال، این اطلاعات همراه با خدمت، قیمت و نتیجه سفارش در Supabase ذخیره می‌شوند و تیم مجاز به آن‌ها دسترسی دارد. در حالت پیش‌نمایش غیرفعال، فرم اطلاعات را ارسال نمی‌کند.';
