-- Public playback, signed admin-only uploads. Run once in Supabase SQL Editor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invitation-audio',
  'invitation-audio',
  true,
  15000000,
  array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
