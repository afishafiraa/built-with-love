-- Wedding invitation production schema.
-- Apply once through the Supabase SQL Editor or CLI before deploying this backend.

create extension if not exists pgcrypto;

create table if not exists public.guests (
  id text primary key,
  invite_token text not null unique,
  name text not null,
  category text not null default '',
  phone text not null default '',
  invited smallint not null default 1,
  opened_at timestamptz,
  rsvp text,
  guest_count smallint not null default 0,
  checked_in_at timestamptz,
  wa_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_id_format check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint guests_token_format check (invite_token ~ '^[0-9]{8}$'),
  constraint guests_invited_range check (invited between 1 and 2),
  constraint guests_rsvp_value check (rsvp is null or rsvp in ('yes', 'no')),
  constraint guests_count_range check (guest_count between 0 and 2)
);

create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  guest_id text references public.guests(id) on delete set null,
  name text not null,
  text text not null,
  created_at timestamptz not null default now(),
  status text not null default 'approved',
  request_id text not null unique,
  constraint wishes_status_value check (status in ('approved', 'hidden')),
  constraint wishes_request_id_format check (request_id ~ '^[A-Za-z0-9_-]{16,80}$')
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  guest_id text references public.guests(id) on delete set null,
  event text not null,
  constraint events_value check (event in ('open', 'open-invitation'))
);

create table if not exists public.invitation_config (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint invitation_config_singleton check (id = 1)
);

create index if not exists wishes_public_order_idx
  on public.wishes (created_at desc) where status = 'approved';
create index if not exists events_guest_time_idx
  on public.events (guest_id, at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guests_set_updated_at on public.guests;
create trigger guests_set_updated_at
before update on public.guests
for each row execute function public.set_updated_at();

drop trigger if exists invitation_config_set_updated_at on public.invitation_config;
create trigger invitation_config_set_updated_at
before update on public.invitation_config
for each row execute function public.set_updated_at();

-- Exact token validation and config are returned in one database round-trip.
create or replace function public.invitation_bootstrap(p_invite_key text)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_guest public.guests%rowtype;
  v_config jsonb;
begin
  select g.* into v_guest
  from public.guests g
  where p_invite_key = g.id || '-' || g.invite_token;

  if not found then
    return jsonb_build_object('config', null, 'guest', null);
  end if;

  select c.data into v_config from public.invitation_config c where c.id = 1;
  return jsonb_build_object(
    'config', v_config,
    'guest', jsonb_build_object('id', v_guest.id, 'name', v_guest.name)
  );
end;
$$;

create or replace function public.public_wishes(p_invite_key text, p_limit integer default 100)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_valid boolean;
begin
  select exists(
    select 1 from public.guests g
    where p_invite_key = g.id || '-' || g.invite_token
  ) into v_valid;
  if not v_valid then raise exception 'invalid invitation link'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id,
      'name', x.name,
      'text', x.text,
      'createdAt', x.created_at,
      'status', x.status
    ) order by x.created_at desc)
    from (
      select w.id, w.name, w.text, w.created_at, w.status
      from public.wishes w
      where w.status = 'approved'
      order by w.created_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 200))
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.submit_rsvp(
  p_invite_key text,
  p_name text,
  p_rsvp text,
  p_guest_count integer
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_id text;
begin
  if p_rsvp not in ('yes', 'no') or nullif(btrim(p_name), '') is null then
    raise exception 'invalid rsvp';
  end if;
  if p_rsvp = 'yes' and (p_guest_count < 1 or p_guest_count > 2) then
    raise exception 'invalid guest count';
  end if;

  update public.guests g
  set rsvp = p_rsvp,
      guest_count = case when p_rsvp = 'yes' then p_guest_count else 0 end,
      opened_at = coalesce(g.opened_at, now())
  where p_invite_key = g.id || '-' || g.invite_token
  returning g.id into v_id;

  if v_id is null then raise exception 'invalid invitation link'; end if;
  return true;
end;
$$;

create or replace function public.submit_wish(
  p_invite_key text,
  p_name text,
  p_text text,
  p_request_id text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_guest_id text;
  v_id uuid;
begin
  select g.id into v_guest_id
  from public.guests g
  where p_invite_key = g.id || '-' || g.invite_token;
  if v_guest_id is null then raise exception 'invalid invitation link'; end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_text), '') is null then
    raise exception 'wish name and text required';
  end if;

  insert into public.wishes (guest_id, name, text, status, request_id)
  values (v_guest_id, left(btrim(p_name), 80), left(btrim(p_text), 600), 'approved', p_request_id)
  on conflict (request_id) do update set request_id = excluded.request_id
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mark_invitation_opened(p_invite_key text, p_event text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_id text;
begin
  if p_event not in ('open', 'open-invitation') then raise exception 'invalid event'; end if;
  update public.guests g
  set opened_at = coalesce(g.opened_at, now())
  where p_invite_key = g.id || '-' || g.invite_token
  returning g.id into v_id;
  if v_id is null then return false; end if;
  insert into public.events (guest_id, event) values (v_id, p_event);
  return true;
end;
$$;

create or replace function public.check_in_guest(p_guest_code text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_id text;
begin
  update public.guests g
  set checked_in_at = coalesce(g.checked_in_at, now())
  where g.id = p_guest_code or (g.id || '-' || g.invite_token) = p_guest_code
  returning g.id into v_id;
  return v_id is not null;
end;
$$;

alter table public.guests enable row level security;
alter table public.wishes enable row level security;
alter table public.events enable row level security;
alter table public.invitation_config enable row level security;

revoke all on table public.guests, public.wishes, public.events, public.invitation_config from anon, authenticated;
grant all on table public.guests, public.wishes, public.events, public.invitation_config to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.invitation_bootstrap(text) from public, anon, authenticated;
revoke all on function public.public_wishes(text, integer) from public, anon, authenticated;
revoke all on function public.submit_rsvp(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.submit_wish(text, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_invitation_opened(text, text) from public, anon, authenticated;
revoke all on function public.check_in_guest(text) from public, anon, authenticated;

grant execute on function public.invitation_bootstrap(text) to service_role;
grant execute on function public.public_wishes(text, integer) to service_role;
grant execute on function public.submit_rsvp(text, text, text, integer) to service_role;
grant execute on function public.submit_wish(text, text, text, text) to service_role;
grant execute on function public.mark_invitation_opened(text, text) to service_role;
grant execute on function public.check_in_guest(text) to service_role;

-- Public files can be displayed by guests, but only the server-side secret may upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invitation-assets',
  'invitation-assets',
  true,
  3000000,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
