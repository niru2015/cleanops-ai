-- CLEAN-004's local config creates this bucket locally; hosted projects also need
-- a migration before evidence and normalized WhatsApp receipt uploads can succeed.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('operational-evidence','operational-evidence',false,10485760,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
