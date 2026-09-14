import { useState } from 'react';
import type { ReactNode } from 'react';

const PIN = (import.meta.env.VITE_ADMIN_PIN as string) || '';
const KEY = 'wd-admin';

/** PIN screen shared by /dashboard and /studio (one unlock per browser session). */
export default function AdminGate({ title, children }: { title: string; children: ReactNode }) {
  const [ok, setOk] = useState(() => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  if (ok) return <>{children}</>;
  return (
    <div className="app-min-screen" style={{ display: 'grid', placeItems: 'center', background: '#EDEADF', fontFamily: "'Archivo', system-ui, sans-serif", color: '#2F2C26', padding: 20 }}>
      <form onSubmit={e => {
        e.preventDefault();
        if (PIN && pin === PIN) { try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } setOk(true); }
        else setWrong(true);
      }} style={{ display: 'grid', gap: 10, padding: 28, background: '#FBF8F0', border: '1px solid rgba(47,44,38,.1)', borderRadius: 18, width: '100%', maxWidth: 300, boxSizing: 'border-box' }}>
        <div style={{ font: "600 11px/1 'Archivo'", letterSpacing: '.2em', textTransform: 'uppercase', color: '#A93227' }}>{title}</div>
        <div style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 26, marginBottom: 6 }}>Masuk</div>
        <input value={pin} onChange={e => { setPin(e.target.value); setWrong(false); }} type="password" inputMode="numeric" placeholder="PIN" autoFocus
          style={{ minHeight: 44, boxSizing: 'border-box', padding: 12, border: '1px solid ' + (wrong ? '#A93227' : 'rgba(47,44,38,.2)'), borderRadius: 10, font: "300 16px 'Archivo'" }} />
        {wrong && <div style={{ font: "300 11.5px/1.4 'Archivo'", color: '#A93227' }}>{PIN ? 'PIN salah.' : 'VITE_ADMIN_PIN belum diatur di .env.'}</div>}
        <button style={{ minHeight: 44, padding: 13, background: '#2F2C26', color: '#FBF8F0', border: 0, borderRadius: 10, cursor: 'pointer', font: "500 10.5px/1 'Archivo'", letterSpacing: '.16em', textTransform: 'uppercase' }}>Masuk</button>
      </form>
    </div>
  );
}
