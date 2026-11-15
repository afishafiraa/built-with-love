import { useEffect, useState } from 'react';
import { currentInviteParam } from './invite';
import type { InviteParam } from './invite';
import { api, backendReady } from './api';

type GuestStatus = 'none' | 'loading' | 'valid' | 'invalid' | 'error';
type GuestState = InviteParam & { name: string; status: GuestStatus; rsvp: 'yes' | 'no' | null; guests: number };

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** ?to=budi-santoso-48271935 -> stable slug + separate 8-digit token. */
function readGuestParam(): GuestState {
  const parsed = currentInviteParam();
  // Do not infer/display a name from the URL before the token is verified.
  return {
    ...parsed,
    name: '',
    rsvp: null,
    guests: 0,
    status: parsed.supplied ? (parsed.key && backendReady ? 'loading' : 'invalid') : 'none'
  };
}

/**
 * The guest this link was made for. No name is inferred from the URL: the exact
 * name only appears after the server verifies the slug and token together.
 */
export function useGuest(track = true) {
  const [guest, setGuest] = useState(readGuestParam);
  useEffect(() => {
    if (!guest.key) return;
    if (!backendReady) return;
    let alive = true;
    const applyGuest = (g: Awaited<ReturnType<typeof api.bootstrap>>) => {
      if (!alive) return;
      if (g.guest?.name) {
        setGuest(cur => ({ ...cur, id: g.guest!.id, name: String(g.guest!.name),
          rsvp: g.guest!.rsvp === 'yes' || g.guest!.rsvp === 'no' ? g.guest!.rsvp : null,
          guests: Number(g.guest!.guests) || 0, status: 'valid' }));
      } else setGuest(cur => ({ ...cur, id: '', inviteToken: '', name: '', rsvp: null, guests: 0, status: 'invalid' }));
    };
    api.bootstrap(guest.key)
      .then(g => {
        applyGuest(g);
        if (alive && g.guest?.name && track) api.track({ inviteKey: guest.key, event: 'open' });
      })
      .catch(() => { if (alive) setGuest(cur => ({ ...cur, status: 'error' })); });
    const onSynced = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== guest.key) return;
      api.refreshBootstrap(guest.key).then(applyGuest).catch(() => {});
    };
    window.addEventListener('wedding-rsvp-synced', onSynced);
    return () => { alive = false; window.removeEventListener('wedding-rsvp-synced', onSynced); };
  }, [guest.key, track]);
  return guest;
}

export function guestLink(origin: string, id: string, inviteToken: string) {
  if (!id || !/^\d{8}$/.test(inviteToken)) return '';
  return origin + '/?to=' + encodeURIComponent(id + '-' + inviteToken);
}
