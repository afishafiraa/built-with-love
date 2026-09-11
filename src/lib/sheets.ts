/* Google Sheets backend through an Apps Script Web App.
   No OAuth, no server: the Web App writes straight into the spreadsheet.
   POSTs use text/plain to dodge the CORS preflight Apps Script cannot answer. */
import type { Guest, WeddingConfig, Wish } from '../types';

const ENDPOINT = (import.meta.env.VITE_SHEETS_ENDPOINT as string) || '';
const TOKEN = (import.meta.env.VITE_SHEETS_TOKEN as string) || '';

/** False while .env still has the placeholder — the UI then runs in demo mode. */
export const sheetsReady = /^https:\/\/script\.google\.com\//.test(ENDPOINT) && !ENDPOINT.includes('XXXX');

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!sheetsReady) throw new Error('VITE_SHEETS_ENDPOINT belum diatur');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: TOKEN, ...payload })
  });
  if (!res.ok) throw new Error('sheets ' + res.status);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.data as T;
}

export const sheets = {
  listGuests: () => call<Guest[]>('listGuests'),
  /** Just the display name for one invitation link (no guest list exposed). */
  getGuest: (id: string) => call<{ name: string } | null>('getGuest', { id }),
  /** Stores an image in the couple's Google Drive and returns a public URL. */
  uploadImage: (p: { data: string; mime: string; name: string }) => call<{ url: string }>('uploadImage', p),
  upsertGuest: (g: Partial<Guest>) => call<void>('upsertGuest', { guest: g }),
  rsvp: (p: { guestId: string; name: string; rsvp: 'yes' | 'no'; guests: number }) => call<void>('rsvp', p),
  checkIn: (guestId: string) => call<void>('checkIn', { guestId }),
  listWishes: (all = false) => call<Wish[]>('listWishes', { all }),
  addWish: (p: { name: string; text: string; guestId?: string }) => call<void>('addWish', p),
  moderateWish: (id: string, status: 'approved' | 'hidden') => call<void>('moderateWish', { id, status }),
  getConfig: () => call<Partial<WeddingConfig> | null>('getConfig'),
  saveConfig: (config: WeddingConfig) => call<void>('saveConfig', { config }),
  track: (p: { guestId: string; event: string }) =>
    sheetsReady ? call<void>('track', p).catch(() => {}) : Promise.resolve()
};
