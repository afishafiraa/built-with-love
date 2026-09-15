import { useEffect, useState } from 'react';
import { sheets, sheetsReady } from './sheets';

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** ?to=budi-santoso-48271935 -> stable slug + separate 8-digit token. */
export function readGuestParam() {
  const raw = new URLSearchParams(location.search).get('to') || '';
  const key = raw.trim().toLowerCase();
  const match = key.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d{8})$/);
  const id = match?.[1] || '';
  const inviteToken = match?.[2] || '';
  // Do not infer/display a name from the URL before the token is verified.
  return { id, inviteToken, key: match ? key : '', name: '' };
}

/**
 * The guest this link was made for. The name starts from the ?to= slug and is
 * replaced by the exact name in the guest list (titles, spelling) once Sheets answers.
 */
export function useGuest(track = true) {
  const [guest, setGuest] = useState(readGuestParam);
  useEffect(() => {
    if (!guest.key) return;
    if (track) sheets.track({ inviteKey: guest.key, event: 'open' });
    if (!sheetsReady) return;
    let alive = true;
    sheets.getGuest(guest.key)
      .then(g => {
        if (!alive) return;
        if (g?.name) setGuest(cur => ({ ...cur, id: g.id, name: String(g.name) }));
        else setGuest(cur => ({ ...cur, id: '', inviteToken: '', key: '', name: '' }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [guest.key, track]);
  return guest;
}

export function guestLink(origin: string, id: string, inviteToken: string) {
  if (!id || !/^\d{8}$/.test(inviteToken)) return '';
  return origin + '/?to=' + encodeURIComponent(id + '-' + inviteToken);
}
