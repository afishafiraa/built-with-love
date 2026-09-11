/* Google Sheets backend through an Apps Script Web App.
   No OAuth, no server: the Web App writes straight into the spreadsheet.
   POSTs use text/plain to dodge the CORS preflight Apps Script cannot answer. */
import type { Guest, WeddingConfig, Wish } from '../types';

const ENDPOINT = (import.meta.env.VITE_SHEETS_ENDPOINT as string) || '';
const TOKEN = (import.meta.env.VITE_SHEETS_TOKEN as string) || '';

/** False while .env still has the placeholder — the UI then runs in demo mode. */
export const sheetsReady = /^https:\/\/script\.google\.com\//.test(ENDPOINT) && !ENDPOINT.includes('XXXX');

/* Apps Script answers a POST with a 302 to script.googleusercontent.com, which the
   browser re-issues as a GET. That second hop is occasionally flaky — it can 404, or
   land back on /exec and run doGet, whose reply carries no `data`. Both look like a
   dead backend, so retry the actions that are safe to repeat.

   addWish and track append rows, so a retry could duplicate them: they get one shot. */
const ATTEMPTS: Record<string, number> = {
  // A guest's RSVP is the one thing that must not be dropped on the day, so it is
  // given the most room: 5 tries spread over roughly 6 seconds.
  rsvp: 5,
  addWish: 1,
  track: 1
};
const DEFAULT_ATTEMPTS = 3;

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!sheetsReady) throw new Error('VITE_SHEETS_ENDPOINT belum diatur');
  const tries = ATTEMPTS[action] ?? DEFAULT_ATTEMPTS;
  let last = 'sheets tidak menjawab';

  for (let i = 1; i <= tries; i++) {
    if (i > 1) await new Promise(r => setTimeout(r, Math.min(3000, 500 * 2 ** (i - 2))));
    let json: Record<string, unknown>;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: TOKEN, ...payload })
      });
      if (!res.ok) { last = 'sheets ' + res.status; continue; }
      json = await res.json();
    } catch {
      last = 'jaringan terputus';
      continue;
    }
    // A real answer from the script — an error here is permanent, do not retry it.
    if (json.error) throw new Error(String(json.error));
    if (!('data' in json)) { last = 'respons tanpa data (permintaan berubah jadi GET)'; continue; }
    return json.data as T;
  }
  throw new Error(last);
}

/* Sheets hands back typed cells, not strings: a phone typed as 085740894090 arrives
   as the number 85740894090, and "invited" as a number. Normalise on the way in so
   the rest of the app can trust the Guest / Wish types instead of guessing. */
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function toGuest(raw: Record<string, unknown>): Guest {
  const rsvp = str(raw.rsvp);
  return {
    id: str(raw.id),
    name: str(raw.name),
    category: str(raw.category),
    phone: str(raw.phone),
    invited: Number(raw.invited) || 0,
    opened: str(raw.opened),
    rsvp: rsvp === 'yes' || rsvp === 'no' ? rsvp : '',
    guests: Number(raw.guests) || 0,
    checkedInAt: str(raw.checkedInAt)
  };
}

function toWish(raw: Record<string, unknown>): Wish {
  const status = str(raw.status);
  return {
    id: str(raw.id),
    name: str(raw.name),
    text: str(raw.text),
    createdAt: str(raw.createdAt),
    status: status === 'approved' || status === 'hidden' ? status : 'pending'
  };
}

export const sheets = {
  listGuests: async () => (await call<Record<string, unknown>[]>('listGuests')).map(toGuest),
  /** Just the display name for one invitation link (no guest list exposed). */
  getGuest: (id: string) => call<{ name: string } | null>('getGuest', { id }),
  /** Stores an image in the couple's Google Drive and returns a public URL. */
  uploadImage: (p: { data: string; mime: string; name: string }) => call<{ url: string }>('uploadImage', p),
  upsertGuest: (g: Partial<Guest>) => call<void>('upsertGuest', { guest: g }),
  rsvp: (p: { guestId: string; name: string; rsvp: 'yes' | 'no'; guests: number }) => call<void>('rsvp', p),
  checkIn: (guestId: string) => call<void>('checkIn', { guestId }),
  listWishes: async (all = false) => (await call<Record<string, unknown>[]>('listWishes', { all })).map(toWish),
  addWish: (p: { name: string; text: string; guestId?: string }) => call<void>('addWish', p),
  moderateWish: (id: string, status: 'approved' | 'hidden') => call<void>('moderateWish', { id, status }),
  getConfig: () => call<Partial<WeddingConfig> | null>('getConfig'),
  saveConfig: (config: WeddingConfig) => call<void>('saveConfig', { config }),
  track: (p: { guestId: string; event: string }) =>
    sheetsReady ? call<void>('track', p).catch(() => {}) : Promise.resolve()
};
