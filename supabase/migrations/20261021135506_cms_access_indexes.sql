-- Keep FK maintenance indexed and make the per-statement JWT lookup explicit.
create index cms_pages_updated_by_idx on public.cms_pages (updated_by);
alter policy editor_can_read_own_membership on public.cms_editors
  using (email = ((select auth.jwt())->>'email') and (select auth.uid()) is not null);
alter policy editors_can_read_pages on public.cms_pages
  using (exists (select 1 from public.cms_editors where email = ((select auth.jwt())->>'email')));
alter policy editors_can_update_pages on public.cms_pages
  using (exists (select 1 from public.cms_editors where email = ((select auth.jwt())->>'email')))
  with check (exists (select 1 from public.cms_editors where email = ((select auth.jwt())->>'email')));
