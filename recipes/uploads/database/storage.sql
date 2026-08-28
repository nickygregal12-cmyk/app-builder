-- App Builder organisation-owned file storage. Review before creating a real Supabase migration.
--
-- Files belong to an ORGANISATION, not to the person who happened to upload
-- them. The previous version of this recipe keyed every policy on
-- `auth.uid()`, which gives each user a private folder — correct for a consumer
-- product and wrong for a B2B SaaS, where a colleague leaving must not take the
-- company's documents with them and a teammate must be able to open what their
-- organisation owns.
--
-- ## The boundary, and why it is not the one PR #184 built
--
-- #184 established that factory-owned tables in `public` must `revoke all` from
-- `anon, authenticated` before granting, because Supabase's default privileges
-- hand both roles table-wide access. That rule deliberately does NOT apply here.
-- `storage.objects` and `storage.buckets` are Supabase's own tables and its
-- Storage API operates through those grants; revoking them would break the
-- service rather than secure it. Measured, not assumed — see the probe output
-- recorded in the pull request.
--
-- So for storage the supported boundary is RLS, and RLS is the whole of it.
--
-- ## The object key, and what makes the tenant unambiguous
--
--   <organisation-id>/<object-uuid>-<original-file-name>
--
-- One level, deliberately. Supabase's `list` is not recursive, so a nested
-- `<org>/<uuid>/<name>` layout would return folder stubs with no size or
-- timestamp and force a request per file. Flat keeps one list call returning
-- real objects with real metadata.
--
-- The first path segment is the tenant and every policy re-derives it from the
-- object's own name rather than from anything the caller says separately. The
-- uuid makes two people uploading `invoice.pdf` two objects instead of a
-- collision, and the original name survives after it so the product can show a
-- filename a person recognises.
insert into storage.buckets (id, name, public, file_size_limit)
values ('organisation-files', 'organisation-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

/**
 * The organisation an object belongs to, or null.
 *
 * Null rather than an error is the point. A policy that raised on a malformed
 * key would turn a bad request into a 500 and, worse, would make the failure
 * mode depend on Postgres's evaluation order rather than on this function. A
 * key whose first segment is not a uuid belongs to no organisation, and
 * `has_org_role(null, ...)` is false, so such an object is invisible and
 * unwritable to everyone.
 */
create or replace function app_private.storage_object_organisation(object_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (storage.foldername(object_name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then ((storage.foldername(object_name))[1])::uuid
    else null
  end;
$$;

revoke all on function app_private.storage_object_organisation(text) from public;
grant execute on function app_private.storage_object_organisation(text) to authenticated;

-- --- Row level security on the objects themselves --------------------------------
--
-- The role split is the same one the organisations recipe already defines and
-- the records recipe already uses. A viewer reads; a contributor adds; removing
-- something an organisation owns is an owner/admin decision.

-- Read and download: any member of the owning organisation, whatever their role.
create policy "organisation_files_select_member" on storage.objects for select to authenticated
using (
  bucket_id = 'organisation-files'
  and app_private.has_org_role(app_private.storage_object_organisation(name), null)
);

-- Upload: everyone except a viewer, and only into an organisation the caller
-- actually belongs to. The path is supplied by the client and validated here;
-- naming another tenant's id gets the caller nothing, because membership is
-- re-derived from that very path.
create policy "organisation_files_insert_contributor" on storage.objects for insert to authenticated
with check (
  bucket_id = 'organisation-files'
  and app_private.has_org_role(app_private.storage_object_organisation(name), array['owner', 'admin', 'editor', 'member'])
);

-- Remove: an organisation-scoped privilege, as it is for records.
create policy "organisation_files_delete_admin" on storage.objects for delete to authenticated
using (
  bucket_id = 'organisation-files'
  and app_private.has_org_role(app_private.storage_object_organisation(name), array['owner', 'admin'])
);

-- No UPDATE policy exists, and its absence is the design rather than an
-- omission. Renaming an object is how a file would move between tenants: an
-- identity that legitimately belongs to two organisations could otherwise
-- rewrite `<org-a>/…` to `<org-b>/…` and satisfy a membership check on both
-- sides of the write. With no UPDATE policy, no caller can reclassify an
-- object at all, and the only way to put a file in another organisation is to
-- upload it there — which is an ordinary act by somebody entitled to do it,
-- not a silent reassignment of what an organisation owns.
