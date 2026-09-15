import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

type State = 'checking' | 'locked' | 'ready';

function csrfCookie() {
  try {
    const value = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith('wedding_csrf='));
    return value ? decodeURIComponent(value.slice('wedding_csrf='.length)) : '';
  } catch { return ''; }
}

/** Server-verified session gate shared by Dashboard, Studio and Check-in. */
export default function AdminGate({ title, children }: { title: string; children: ReactNode }) {
  const [state, setState] = useState<State>('checking');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => response.json())
      .then(json => { if (active) setState(json?.data?.authenticated ? 'ready' : 'locked'); })
      .catch(() => { if (active) { setState('locked'); setError('Server login belum dapat dihubungi.'); } });
    const lock = () => setState('locked');
    window.addEventListener('wedding-auth-required', lock);
    return () => { active = false; window.removeEventListener('wedding-auth-required', lock); };
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Gagal masuk.');
      setPassword(''); setState('ready');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Gagal masuk.'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    await fetch('/api/auth', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfCookie() },
      body: JSON.stringify({ action: 'logout' })
    }).catch(() => {});
    setState('locked');
  };

  if (state === 'ready') return <>
    <button type="button" onClick={logout} aria-label="Keluar dari sesi admin"
      style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 1000, minHeight: 38, padding: '9px 13px', border: '1px solid rgba(47,44,38,.18)', borderRadius: 999, background: '#FFF9EF', color: '#3E352C', boxShadow: '0 7px 20px rgba(47,44,38,.12)', font: '600 10px/1 system-ui', letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
      Keluar
    </button>
    {children}
  </>;

  return (
    <div className="app-min-screen" style={{ display: 'grid', placeItems: 'center', background: '#EDEADF', fontFamily: "'Archivo', system-ui, sans-serif", color: '#2F2C26', padding: 20 }}>
      {state === 'checking' ? <div role="status">Memeriksa sesi aman…</div> : (
        <form onSubmit={login} style={{ display: 'grid', gap: 10, padding: 28, background: '#FBF8F0', border: '1px solid rgba(47,44,38,.1)', borderRadius: 18, width: '100%', maxWidth: 320, boxSizing: 'border-box' }}>
          <div style={{ font: "600 11px/1 'Archivo'", letterSpacing: '.2em', textTransform: 'uppercase', color: '#A93227' }}>{title}</div>
          <div style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 26, marginBottom: 6 }}>Masuk aman</div>
          <input value={password} onChange={event => { setPassword(event.target.value); setError(''); }} type="password" placeholder="Password admin" autoComplete="current-password" autoFocus maxLength={256}
            style={{ minHeight: 44, boxSizing: 'border-box', padding: 12, border: '1px solid ' + (error ? '#A93227' : 'rgba(47,44,38,.2)'), borderRadius: 10, font: "300 16px 'Archivo'" }} />
          {error && <div role="alert" style={{ font: "300 11.5px/1.4 'Archivo'", color: '#A93227' }}>{error}</div>}
          <button disabled={busy || !password} style={{ minHeight: 44, padding: 13, background: '#2F2C26', color: '#FBF8F0', border: 0, borderRadius: 10, cursor: busy ? 'default' : 'pointer', opacity: busy || !password ? .55 : 1, font: "500 10.5px/1 'Archivo'", letterSpacing: '.16em', textTransform: 'uppercase' }}>
            {busy ? 'Memeriksa…' : 'Masuk'}
          </button>
          <div style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.5, opacity: .55 }}>Sesi tersimpan di cookie HttpOnly dan berakhir otomatis setelah 8 jam.</div>
        </form>
      )}
    </div>
  );
}
