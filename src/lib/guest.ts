import { useEffect, useState } from 'react';
import { sheets, sheetsReady } from './sheets';

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** ?to=budi-santoso  ->  { id: 'budi-santoso', name: 'Budi Santoso' } */
export function readGuestParam() {
  const raw = new URLSearchParams(location.search).get('to') || '';
  const id = raw.trim();
  const name = id
    ? id.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : '';
  return { id, name };
}

/**
 * The guest this link was made for. The name starts from the ?to= slug and is
 * replaced by the exact name in the guest list (titles, spelling) once Sheets answers.
 */
export function useGuest(track = true) {
  const [guest, setGuest] = useState(readGuestParam);
  useEffect(() => {
    if (!guest.id) return;
    if (track) sheets.track({ guestId: guest.id, event: 'open' });
    if (!sheetsReady) return;
    let alive = true;
    sheets.getGuest(guest.id)
      .then(g => { if (alive && g && g.name) setGuest(cur => ({ ...cur, name: String(g.name) })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [guest.id, track]);
  return guest;
}

export function guestLink(origin: string, id: string) {
  return origin + '/?to=' + encodeURIComponent(id);
}
