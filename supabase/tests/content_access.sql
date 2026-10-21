-- All changes and synthetic membership are rolled back; no account/email is created.
begin;
insert into public.cms_editors (email) values ('cms-test@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"cms-test@example.invalid","sub":"00000000-0000-0000-0000-000000000001"}', true);
do $$
declare old_revision integer; original_text text; affected integer;
begin
  assert (select count(*) from public.cms_pages) = 3, 'editor must read all pages';
  select revision, published_content->>'eyebrow' into old_revision, original_text
    from public.cms_pages where slug = 'home';
  update public.cms_pages set draft_content = jsonb_set(draft_content, '{eyebrow}', '"CMS transaction test"'), revision = old_revision + 1
    where slug = 'home' and revision = old_revision;
  get diagnostics affected = row_count;
  assert affected = 1, 'draft save must succeed';
  assert (select published_content->>'eyebrow' from public.cms_pages where slug = 'home') = original_text, 'draft must not change publication';
  update public.cms_pages set revision = old_revision + 1 where slug = 'home' and revision = old_revision;
  get diagnostics affected = row_count;
  assert affected = 0, 'stale writes must not overwrite newer drafts';
  update public.cms_pages set published_content = draft_content where slug = 'home';
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"outsider@example.invalid","sub":"00000000-0000-0000-0000-000000000002"}', true);
do $$
declare affected integer;
begin
  assert (select count(*) from public.cms_pages) = 0, 'non-editor must not read drafts';
  update public.cms_pages set revision = revision + 1 where slug = 'home';
  get diagnostics affected = row_count;
  assert affected = 0, 'non-editor must not update content';
end $$;
set local role anon;
do $$
begin
  assert (select published_content->>'eyebrow' from public.cms_pages where slug = 'home') = 'CMS transaction test', 'published copy must be public';
  assert not has_column_privilege('anon','public.cms_pages','draft_content','SELECT'), 'draft column must be private';
  assert not has_table_privilege('anon','public.cms_pages','UPDATE'), 'public writes must be denied';
  assert not has_table_privilege('authenticated','public.cms_editors','INSERT'), 'users must not grant editor membership';
end $$;
rollback;
select 'passed: draft isolation, publish, optimistic concurrency, anonymous and non-editor access' as result;
