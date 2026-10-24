-- No SMS/Auth calls: synthetic hashes exercise real database authority, then roll back every fixture.
begin;
set local role service_role;
do $$
declare guest text:=repeat('a',64); other_guest text:=repeat('b',64); challenge uuid;
 profile jsonb:='{"firstName":"آزمون","lastName":"پیامک","email":"qa-otp-sql@example.invalid","phone":"09000000881"}';
begin
 challenge:=public.growth_mobile_start(guest,profile,repeat('e',64));
 begin
  perform public.growth_mobile_start(other_guest,profile,repeat('e',64));
  raise exception 'duplicate phone claim accepted';
 exception when raise_exception then
  if sqlerrm<>'OTP_COOLDOWN' then raise; end if;
 end;
 assert public.growth_mobile_verify(guest,challenge,repeat('f',64))=false,'unaccepted send verified';
 assert public.growth_mobile_finish(guest,challenge,'accepted',repeat('f',64)),'first result not persisted';
 assert not public.growth_mobile_finish(guest,challenge,'accepted',repeat('f',64)),'send result overwritten';
 assert not public.growth_identity_attempt(guest,challenge,true,'mobile'),'boolean confirmation bypass';
 assert not public.growth_mobile_verify(other_guest,challenge,repeat('f',64)),'cross-browser OTP use';
 assert not public.growth_mobile_verify(guest,challenge,repeat('0',64)),'wrong code verified';
 assert public.growth_mobile_verify(guest,challenge,repeat('f',64)),'valid code rejected';
 assert not public.growth_mobile_verify(guest,challenge,repeat('f',64)),'code replay accepted';
 assert (select code_hash is null from public.growth_phone_otps where challenge_id=challenge),'consumed digest retained';
 assert (public.growth_identity_status(guest,profile->>'email',profile->>'phone')->>'verified')::boolean,'contact proof absent';
 assert not public.growth_mobile_registration_claim(guest,'other@example.invalid',profile->>'phone'),'profile mismatch accepted';
 assert public.growth_mobile_registration_claim(guest,profile->>'email',profile->>'phone'),'registration claim missing';
 assert not public.growth_mobile_registration_claim(guest,profile->>'email',profile->>'phone'),'registration proof replay accepted';
end $$;
set local role authenticated;
do $$ begin
 assert not has_table_privilege('authenticated','public.growth_phone_otps','SELECT'),'code hashes exposed';
 assert not has_function_privilege('authenticated','public.growth_mobile_verify(text,uuid,text)','EXECUTE'),'verification public';
 assert not has_function_privilege('authenticated','public.growth_mobile_start(text,jsonb,text)','EXECUTE'),'claim public';
end $$;
set local role anon;
do $$ begin
 assert not has_table_privilege('anon','public.growth_phone_otps','SELECT'),'anonymous code hashes exposed';
 assert not has_function_privilege('anon','public.growth_mobile_registration_claim(text,text,text)','EXECUTE'),'anonymous registration claim';
end $$;
rollback;
select 'passed: durable OTP claim, cooldown, hash comparison, one-time use, profile binding and service-only authority' as result;
