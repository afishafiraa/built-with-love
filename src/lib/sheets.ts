/* Same-origin API client. Apps Script credentials never enter the browser bundle:
   Vercel Functions validate the request, enforce public/admin capabilities, then
   attach the server-only token before forwarding to Apps Script. */
import type { Guest, WeddingConfig, Wish } from '../types';

type PublicBootstrap = {
  config: Partial<WeddingConfig> | null;
  guest: { id: string; name: string } | null;
};

/** Explicit demo mode is useful for visual-only Vite development without APIs. */
export const sheetsReady = import.meta.env.VITE_DEMO_MODE !== 'true';

const ADMIN_ACTIONS = new Set([
  'listGuests', 'getGuestById', 'uploadImage', 'upsertGuest', 'deleteGuest',
  'markGuestWaSent', 'checkIn', 'moderateWish', 'saveConfig'
]);

const ATTEMPTS: Record<string, number> = { rsvp: 5, addWish: 1, track: 1 };
const DEFAULT_ATTEMPTS = 3;
const bootstrapRequests = new Map<string, Promise<PublicBootstrap>>();

function cookie(name: string) {
  try {
    const prefix = `${name}=`;
    const part = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    return part ? decodeURIComponent(part.slice(prefix.length)) : '';
  } catch { return ''; }
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!sheetsReady) throw new Error('Backend dinonaktifkan oleh VITE_DEMO_MODE');
  const admin = ADMIN_ACTIONS.has(action) || (action === 'listWishes' && payload.all === true);
  const tries = ATTEMPTS[action] ?? DEFAULT_ATTEMPTS;
  let last = 'server tidak menjawab';

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    if (attempt > 1) await new Promise(resolve => setTimeout(resolve, Math.min(3000, 500 * 2 ** (attempt - 2))));
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (admin) headers['X-CSRF-Token'] = cookie('wedding_csrf');
      const response = await fetch(admin ? '/api/admin' : '/api/public', {
        method: 'POST', credentials: 'same-origin', headers,
        body: JSON.stringify({ action, ...payload })
      });
      const json = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (response.status === 401) {
        window.dispatchEvent(new Event('wedding-auth-required'));
        throw new Error('Sesi admin berakhir. Silakan masuk lagi.');
      }
      if (!response.ok || json.error) throw new Error(String(json.error || `server ${response.status}`));
      if (!Object.prototype.hasOwnProperty.call(json, 'data')) throw new Error('Respons server tidak valid');
      return json.data as T;
    } catch (error) {
      last = error instanceof Error ? error.message : 'jaringan terputus';
      if (/ditolak|tidak valid|invalid|required|salah|berakhir|terlalu banyak/i.test(last)) break;
    }
  }
  throw new Error(last);
}

const str = (value: unknown) => value === null || value === undefined ? '' : String(value);

function toGuest(raw: Record<string, unknown>): Guest {
  const rsvp = str(raw.rsvp);
  return {
    id: str(raw.id), inviteToken: str(raw.inviteToken), name: str(raw.name),
    category: str(raw.category), phone: str(raw.phone), invited: Number(raw.invited) || 0,
    opened: str(raw.opened), rsvp: rsvp === 'yes' || rsvp === 'no' ? rsvp : '',
    guests: Number(raw.guests) || 0, checkedInAt: str(raw.checkedInAt), waSentAt: str(raw.waSentAt)
  };
}

function toWish(raw: Record<string, unknown>): Wish {
  return {
    id: str(raw.id), name: str(raw.name), text: str(raw.text), createdAt: str(raw.createdAt),
    status: str(raw.status) === 'hidden' ? 'hidden' : 'approved'
  };
}

export const sheets = {
  bootstrap: (inviteKey: string) => {
    if (!bootstrapRequests.has(inviteKey)) {
      bootstrapRequests.set(inviteKey, call<PublicBootstrap>('bootstrap', { inviteKey })
        .catch(error => { bootstrapRequests.delete(inviteKey); throw error; }));
    }
    return bootstrapRequests.get(inviteKey)!;
  },
  dashboardData: async () => {
    const data = await call<{ guests: Record<string, unknown>[]; wishes: Record<string, unknown>[]; config: Partial<WeddingConfig> | null }>('dashboardData');
    return { guests: data.guests.map(toGuest), wishes: data.wishes.map(toWish), config: data.config };
  },
  listGuests: async () => (await call<Record<string, unknown>[]>('listGuests')).map(toGuest),
  getGuest: (inviteKey: string) => call<{ id: string; name: string } | null>('getGuest', { inviteKey }),
  getGuestById: (guestId: string) => call<{ id: string; name: string } | null>('getGuestById', { guestId }),
  uploadImage: (payload: { data: string; mime: string; name: string }) => call<{ url: string }>('uploadImage', payload),
  upsertGuest: (guest: Partial<Guest>) => call<{ id: string; inviteToken: string }>('upsertGuest', { guest }),
  deleteGuest: (id: string) => call<boolean>('deleteGuest', { id }),
  markGuestWaSent: (id: string, sent = true) => call<string>('markGuestWaSent', { id, sent }),
  rsvp: (payload: { inviteKey: string; name: string; rsvp: 'yes' | 'no'; guests: number }) => call<void>('rsvp', payload),
  checkIn: (guestId: string) => call<boolean | null>('checkIn', { guestId }),
  listWishes: async (all = false) => (await call<Record<string, unknown>[]>('listWishes', { all })).map(toWish),
  addWish: (payload: { name: string; text: string; inviteKey: string; requestId: string; website?: string }) => call<{ id: string }>('addWish', payload),
  moderateWish: (id: string, status: 'approved' | 'hidden') => call<void>('moderateWish', { id, status }),
  getConfig: () => call<Partial<WeddingConfig> | null>('getConfig'),
  saveConfig: (config: WeddingConfig) => call<void>('saveConfig', { config }),
  track: (payload: { inviteKey: string; event: string }) =>
    sheetsReady && payload.inviteKey ? call<void>('track', payload).catch(() => {}) : Promise.resolve()
};
