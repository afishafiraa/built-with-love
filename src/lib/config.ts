import { useEffect, useState } from 'react';
import type { WeddingConfig } from '../types';
import { mergeConfig } from '../config/invitation';
import { sheets, sheetsReady } from './sheets';

/* Content lives in three places:
   - published: the Sheets `Config` tab — what guests see (cached in localStorage for fast repeat visits)
   - draft:     the Studio's working copy in localStorage — what the Studio preview shows
   - defaults:  src/config/invitation.ts — fallback when nothing else exists */
const DRAFT_KEY = 'wedding-config-v1';
const CACHE_KEY = 'wedding-config-published';

function read(key: string): Partial<WeddingConfig> | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function write(key: string, cfg: WeddingConfig | null) {
  try { cfg ? localStorage.setItem(key, JSON.stringify(cfg)) : localStorage.removeItem(key); } catch { /* private mode */ }
}

export const isPreview = () => new URLSearchParams(location.search).has('preview');

export function loadCached(): WeddingConfig { return mergeConfig(read(CACHE_KEY)); }
export function loadDraft(): WeddingConfig | null { const d = read(DRAFT_KEY); return d ? mergeConfig(d) : null; }

/** Save the Studio draft and push it to any open preview (same-origin iframes and tabs). */
export function saveDraft(cfg: WeddingConfig | null) {
  write(DRAFT_KEY, cfg);
  window.dispatchEvent(new CustomEvent('wedding-config'));
  document.querySelectorAll('iframe').forEach(f => {
    try { f.contentWindow?.postMessage({ type: 'wedding-config' }, location.origin); } catch { /* cross-origin frame */ }
  });
}

/** Fetch the published config from Sheets (falls back to cache / defaults). */
export async function fetchPublished(): Promise<WeddingConfig> {
  if (!sheetsReady) return loadCached();
  const remote = await sheets.getConfig();
  if (!remote) return loadCached();
  const cfg = mergeConfig(remote);
  write(CACHE_KEY, cfg);
  return cfg;
}

export async function publish(cfg: WeddingConfig) {
  await sheets.saveConfig(cfg);
  write(CACHE_KEY, cfg);
}

/** Config for the invitation page. In `?preview` mode it follows the Studio draft live. */
export function useConfig(): WeddingConfig {
  const preview = isPreview();
  const [cfg, setCfg] = useState<WeddingConfig>(() => (preview && loadDraft()) || loadCached());

  useEffect(() => {
    if (preview) {
      const sync = () => setCfg(loadDraft() || loadCached());
      const onMsg = (e: MessageEvent) => { if (e.data && e.data.type === 'wedding-config') sync(); };
      window.addEventListener('storage', sync);
      window.addEventListener('wedding-config', sync);
      window.addEventListener('message', onMsg);
      return () => {
        window.removeEventListener('storage', sync);
        window.removeEventListener('wedding-config', sync);
        window.removeEventListener('message', onMsg);
      };
    }
    let alive = true;
    fetchPublished().then(c => { if (alive) setCfg(c); }).catch(() => {});
    return () => { alive = false; };
  }, [preview]);

  return cfg;
}
