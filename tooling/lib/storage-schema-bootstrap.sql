-- Bring a bare PostgreSQL image's storage schema up to the shape the Storage
-- service creates, so a local harness can apply the uploads recipe.
--
-- `supabase/postgres` ships the storage tables, but `public` and
-- `file_size_limit` on `storage.buckets` are added by storage-api's own
-- migrations when that service starts. A local run without the service
-- therefore cannot apply a fragment that names them.
--
-- This is an APPROXIMATION and is only for local harnesses. The faithful
-- environment is CI, where `supabase start` runs the real Storage service and
-- these columns already exist. Nothing here is shipped to a generated app.
alter table storage.buckets add column if not exists public boolean not null default false;
alter table storage.buckets add column if not exists file_size_limit bigint;
