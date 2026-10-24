-- Codes are HMACs only. No anonymous/authenticated role can read, claim or verify these rows.
alter table public.growth_identity_checks drop constraint growth_identity_checks_channel_check,
 drop constraint growth_identity_checks_method_check;
alter table public.growth_identity_checks add constraint growth_identity_checks_channel_check check(channel in ('email','test_phone','mobile')),
 add constraint growth_identity_checks_method_check check(method in ('email','test_phone','mobile'));
alter table public.growth_orders drop constraint growth_orders_contact_check_check;
alter table public.growth_orders add constraint growth_orders_contact_check_check check(contact_check in ('existing','email','test_phone','mobile'));
create table public.growth_phone_otps (
 challenge_id uuid primary key,
 guest_hash text not null check(guest_hash ~ '^[a-f0-9]{64}$'),
 phone_key text not null check(phone_key ~ '^[a-f0-9]{64}$'),
 state text not null default 'sending' check(state in ('sending','accepted','rejected','unknown')),
 code_hash text check(code_hash ~ '^[a-f0-9]{64}$'),
 attempts integer not null default 0 check(attempts between 0 and 5),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes',
 consumed_at timestamptz,
 registration_claimed_at timestamptz
);
create index growth_phone_otps_phone_time_idx on public.growth_phone_otps(phone_key,created_at);
create index growth_phone_otps_guest_time_idx on public.growth_phone_otps(guest_hash,created_at);
create index growth_phone_otps_created_idx on public.growth_phone_otps(created_at);
alter table public.growth_phone_otps enable row level security;
revoke all on public.growth_phone_otps from public,anon,authenticated;
grant all on public.growth_phone_otps to service_role;

-- Serialize claims across instances/browsers. Uncertain sends consume the same cooldown/quota as accepted sends.
create function public.growth_mobile_start(p_guest text,p_profile jsonb,p_phone_key text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare challenge uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('otp-guest:'||p_guest,0));
 perform pg_advisory_xact_lock(hashtextextended('otp-phone:'||p_phone_key,0));
 delete from public.growth_phone_otps where challenge_id in (select challenge_id from public.growth_phone_otps where created_at<now()-interval '1 day' order by created_at limit 100);
 if exists(select 1 from public.growth_phone_otps where phone_key=p_phone_key and created_at>now()-interval '60 seconds') then raise exception 'OTP_COOLDOWN'; end if;
 if (select count(*) from public.growth_phone_otps where phone_key=p_phone_key and created_at>now()-interval '1 hour')>=5
 or (select count(*) from public.growth_phone_otps where guest_hash=p_guest and created_at>now()-interval '1 hour')>=5 then raise exception 'OTP_LIMIT'; end if;
 challenge:=public.growth_identity_start(p_guest,p_profile,'mobile');
 insert into public.growth_phone_otps(challenge_id,guest_hash,phone_key) values(challenge,p_guest,p_phone_key);
 return challenge;
end $$;

-- A late result or an ambiguous retry cannot reactivate a replaced or completed claim.
create function public.growth_mobile_finish(p_guest text,p_id uuid,p_state text,p_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if p_state not in ('accepted','rejected','unknown') or (p_state='accepted' and (p_hash is null or p_hash !~ '^[a-f0-9]{64}$')) then return false; end if;
 update public.growth_phone_otps set state=p_state,code_hash=case when p_state='accepted' then p_hash end
 where challenge_id=p_id and guest_hash=p_guest and state='sending' and expires_at>now()
 and exists(select 1 from public.growth_identity_checks where guest_hash=p_guest and challenge_id=p_id and channel='mobile');
 get diagnostics changed=row_count; return changed=1;
end $$;

-- The comparison, attempt counter, single-use consumption and resulting contact proof commit atomically.
create function public.growth_mobile_verify(p_guest text,p_id uuid,p_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare otp public.growth_phone_otps; current_check public.growth_identity_checks;
begin
 select * into current_check from public.growth_identity_checks where guest_hash=p_guest for update;
 if not found or current_check.challenge_id<>p_id or current_check.channel<>'mobile' or current_check.expires_at<=now() or current_check.method is not null then return false; end if;
 select * into otp from public.growth_phone_otps where challenge_id=p_id and guest_hash=p_guest for update;
 if not found or otp.state<>'accepted' or otp.expires_at<=now() or otp.attempts>=5 or otp.consumed_at is not null or otp.code_hash is null then return false; end if;
 update public.growth_phone_otps set attempts=attempts+1 where challenge_id=p_id;
 if p_hash is null or p_hash<>otp.code_hash then
  if otp.attempts=4 then update public.growth_phone_otps set code_hash=null where challenge_id=p_id; end if;
  return false;
 end if;
 update public.growth_phone_otps set code_hash=null,consumed_at=now() where challenge_id=p_id;
 update public.growth_identity_checks set method='mobile',expires_at=now()+interval '30 minutes' where guest_hash=p_guest;
 return true;
end $$;

-- A proven contact may be used to create at most one Auth account; retries cannot reuse it to change a password.
create function public.growth_mobile_registration_claim(p_guest text,p_email text,p_phone text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 update public.growth_phone_otps o set registration_claimed_at=now() from public.growth_identity_checks c
 where c.guest_hash=p_guest and c.challenge_id=o.challenge_id and c.method='mobile' and c.expires_at>now()
 and lower(c.profile->>'email')=lower(p_email) and c.profile->>'phone'=p_phone
 and o.consumed_at is not null and o.registration_claimed_at is null;
 get diagnostics changed=row_count; return changed=1;
end $$;

-- The legacy boolean confirmation RPC cannot bypass the real mobile-code comparison.
create or replace function public.growth_identity_attempt(p_guest text,p_id uuid,p_valid boolean,p_method text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c public.growth_identity_checks;
begin
 if p_method not in ('email','test_phone') or p_method is null then return false; end if;
 select * into c from public.growth_identity_checks where guest_hash=p_guest for update;
 if not found or c.challenge_id<>p_id or c.expires_at<=now() or c.attempts>=5 or c.channel<>p_method then return false; end if;
 if c.method is not null then return p_valid is true; end if;
 update public.growth_identity_checks set attempts=attempts+1 where guest_hash=p_guest;
 if p_valid is not true then return false; end if;
 update public.growth_identity_checks set method=p_method,expires_at=now()+interval '30 minutes' where guest_hash=p_guest;
 return true;
end $$;
revoke all on function public.growth_mobile_start(text,jsonb,text),public.growth_mobile_finish(text,uuid,text,text),public.growth_mobile_verify(text,uuid,text),public.growth_mobile_registration_claim(text,text,text) from public,anon,authenticated;
grant execute on function public.growth_mobile_start(text,jsonb,text),public.growth_mobile_finish(text,uuid,text,text),public.growth_mobile_verify(text,uuid,text),public.growth_mobile_registration_claim(text,text,text) to service_role;

-- Hosted Phone Auth is currently disabled. Reserved aliases preserve Supabase password/session handling
-- while the real confirmed phone and the unconfirmed claimed email remain separate identities.
create or replace function growth_private.test_login_email(p_phone text) returns text language sql stable security definer set search_path='' as $$
 select email from auth.users where phone=ltrim(p_phone,'+') and
 (email like '%@local-otp.invalid' or (email like '%@phone-login.invalid' and phone_confirmed_at is not null))
 limit 1;
$$;
alter table public.cms_editors add constraint staff_no_phone_alias check(email !~ '@(local-otp|phone-login)[.]invalid$');
do $$ declare tab text; begin
 foreach tab in array array['crm_document_access','crm_documents','crm_document_reviews'] loop
 execute format('alter policy no_mock_identity on public.%I using (coalesce((select auth.jwt())->>''email'','''') !~ ''@(local-otp|phone-login)[.]invalid$'') with check (coalesce((select auth.jwt())->>''email'','''') !~ ''@(local-otp|phone-login)[.]invalid$'')',tab);
 end loop;
end $$;
alter policy no_mock_identity on storage.objects using(coalesce((select auth.jwt())->>'email','') !~ '@(local-otp|phone-login)[.]invalid$')
 with check(coalesce((select auth.jwt())->>'email','') !~ '@(local-otp|phone-login)[.]invalid$');
