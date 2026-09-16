/* Safety net for RSVPs that could not be delivered.
 *
 * The RSVP API already retries a handful of times, which covers a brief network blip.
 * It does not cover a guest who loses signal entirely,
 * gives up and closes the page — and that guest is exactly the one the couple needs
 * to hear about. So a failed RSVP is parked here and re-sent on the next visit, when
 * the connection comes back, or when the tab is brought back to the foreground.
 *
 * Re-sending is safe: the `rsvp` action resolves an inviteKey and updates the same
 * guest row atomically, so delivering the same entry twice does not create a duplicate. */
import { api, backendReady } from './api';

type PendingRsvp = {
  /** localStorage key the invitation uses to remember "already answered". */
  key: string;
  inviteKey: string;
  name: string;
  rsvp: 'yes' | 'no';
  guests: number;
  queuedAt: string;
};

const KEY = 'rsvp-outbox-v2';

function read(): PendingRsvp[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function write(list: PendingRsvp[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch { /* private mode — nothing more we can do */ }
}

/** Park an undelivered RSVP. Keyed by inviteKey, so changing the answer replaces
    the queued one instead of stacking a second entry. */
export function queueRsvp(entry: Omit<PendingRsvp, 'queuedAt'>) {
  const list = read().filter(p => p.inviteKey !== entry.inviteKey);
  list.push({ ...entry, queuedAt: new Date().toISOString() });
  write(list);
}

/**
 * Deliver everything queued. Returns how many got through.
 * Entries that still fail stay queued for the next attempt.
 */
async function flushOutbox(): Promise<number> {
  if (!backendReady) return 0;
  const list = read();
  if (!list.length) return 0;

  const stuck: PendingRsvp[] = [];
  let sent = 0;

  for (const p of list) {
    try {
      await api.rsvp({ inviteKey: p.inviteKey, name: p.name, rsvp: p.rsvp, guests: p.guests });
      sent++;
      // Now that it is really recorded, let the invitation show its "answered" state.
      try {
        localStorage.setItem(p.key, JSON.stringify({ name: p.name, attend: p.rsvp, guests: p.guests }));
      } catch { /* ignore */ }
    } catch {
      stuck.push(p);
    }
  }

  write(stuck);
  return sent;
}

/**
 * Flush now, and again whenever the browser regains connectivity or the tab is
 * brought back to the foreground. Returns an unsubscribe function.
 */
export function startOutbox(onSent?: (count: number) => void) {
  let running = false;

  const run = async () => {
    if (running || !navigator.onLine) return;
    running = true;
    try {
      const n = await flushOutbox();
      if (n && onSent) onSent(n);
    } catch { /* try again on the next trigger */ } finally { running = false; }
  };

  const onVisible = () => { if (document.visibilityState === 'visible') run(); };

  run();
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
