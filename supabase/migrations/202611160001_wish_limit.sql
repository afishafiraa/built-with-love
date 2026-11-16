create index if not exists wishes_guest_count_idx on public.wishes (guest_id);

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
  v_existing_guest text;
  v_id uuid;
begin
  -- Serialize submissions for the same invitation, including across devices.
  select g.id into v_guest_id
  from public.guests g
  where p_invite_key = g.id || '-' || g.invite_token
  for update;
  if v_guest_id is null then raise exception 'invalid invitation link'; end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_text), '') is null then
    raise exception 'wish name and text required';
  end if;

  select w.id, w.guest_id into v_id, v_existing_guest
  from public.wishes w where w.request_id = p_request_id;
  if found then
    if v_existing_guest is distinct from v_guest_id then raise exception 'invalid request id'; end if;
    return v_id;
  end if;

  -- Hidden wishes count too; changing a display name does not reset the limit.
  if (select count(*) from public.wishes w where w.guest_id = v_guest_id) >= 2 then
    raise exception 'wish_limit_reached';
  end if;

  insert into public.wishes (guest_id, name, text, status, request_id)
  values (v_guest_id, left(btrim(p_name), 80), left(btrim(p_text), 600), 'approved', p_request_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_wish(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_wish(text, text, text, text) to service_role;
