-- RSVP state travels with the verified invitation bootstrap. Publish history is
-- written in the same transaction as the active config so restoration is safe.

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
    'guest', jsonb_build_object(
      'id', v_guest.id,
      'name', v_guest.name,
      'rsvp', v_guest.rsvp,
      'guests', v_guest.guest_count
    )
  );
end;
$$;

create table if not exists public.invitation_config_versions (
  id bigint generated always as identity primary key,
  data jsonb not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint invitation_config_versions_note_length check (char_length(note) <= 120)
);

create index if not exists invitation_config_versions_latest_idx
  on public.invitation_config_versions (created_at desc, id desc);

alter table public.invitation_config_versions enable row level security;
revoke all on table public.invitation_config_versions from public, anon, authenticated;
grant all on table public.invitation_config_versions to service_role;
grant usage, select on sequence public.invitation_config_versions_id_seq to service_role;

create or replace function public.publish_invitation_config(p_data jsonb, p_note text default '')
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_current jsonb;
  v_id bigint;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid config';
  end if;
  if char_length(coalesce(p_note, '')) > 120 then
    raise exception 'invalid note';
  end if;

  select data into v_current from public.invitation_config where id = 1 for update;
  if not exists (select 1 from public.invitation_config_versions) and v_current is not null then
    insert into public.invitation_config_versions (data, note)
    values (v_current, 'Versi sebelum riwayat aktif');
  end if;

  insert into public.invitation_config_versions (data, note)
  values (p_data, coalesce(btrim(p_note), '')) returning id into v_id;

  insert into public.invitation_config (id, data) values (1, p_data)
  on conflict (id) do update set data = excluded.data;
  return v_id;
end;
$$;

create or replace function public.restore_invitation_config_version(p_version_id bigint)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_data jsonb;
begin
  select data into v_data from public.invitation_config_versions where id = p_version_id;
  if not found then raise exception 'invalid version'; end if;
  perform public.publish_invitation_config(v_data, 'Pemulihan versi #' || p_version_id);
  return v_data;
end;
$$;

revoke all on function public.publish_invitation_config(jsonb, text) from public, anon, authenticated;
revoke all on function public.restore_invitation_config_version(bigint) from public, anon, authenticated;
grant execute on function public.publish_invitation_config(jsonb, text) to service_role;
grant execute on function public.restore_invitation_config_version(bigint) to service_role;
