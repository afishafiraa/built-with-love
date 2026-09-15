import { useEffect, useState } from 'react';
import AdminGate from '../components/AdminGate';
import { sheets, sheetsReady } from '../lib/sheets';

type State = 'loading' | 'ready' | 'saving' | 'ok' | 'missing' | 'err';

/** Opened by scanning a guest QR: /checkin?g=<guestId>. */
export default function CheckIn() {
  return <AdminGate title="Check-in Petugas"><CheckInInner /></AdminGate>;
}

function CheckInInner() {
  const id = new URLSearchParams(location.search).get('g')?.trim() || '';
  const [name, setName] = useState('');
  const [state, setState] = useState<State>(id ? 'loading' : 'missing');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !sheetsReady) {
      setState(id ? 'err' : 'missing');
      if (id && !sheetsReady) setError('Backend Google Sheets belum tersambung.');
      return;
    }
    let active = true;
    sheets.getGuestById(id)
      .then(guest => {
        if (!active) return;
        if (!guest?.name) setState('missing');
        else { setName(String(guest.name)); setState('ready'); }
      })
      .catch(err => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memeriksa data tamu.');
        setState('err');
      });
    return () => { active = false; };
  }, [id]);

  const confirm = async () => {
    setState('saving');
    setError('');
    try {
      const saved = await sheets.checkIn(id);
      setState(saved === false ? 'missing' : 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan check-in.');
      setState('err');
    }
  };

  const message = state === 'loading' ? 'Memeriksa data tamu…'
    : state === 'ready' ? 'Pastikan nama tamu sudah benar sebelum mencatat kehadiran.'
    : state === 'saving' ? 'Menyimpan check-in…'
    : state === 'ok' ? 'Check-in tercatat. Selamat datang!'
    : state === 'missing' ? 'Kode tamu tidak ditemukan atau tautan tidak lengkap.'
    : error || 'Gagal menyimpan. Coba lagi atau catat manual.';

  return (
    <main className="app-min-screen" style={{ display: 'grid', placeItems: 'center', background: '#747963', color: '#FFF9EF', fontFamily: 'system-ui', padding: 30, textAlign: 'center' }}>
      <div style={{ boxSizing: 'border-box', width: '100%', maxWidth: 390, padding: '34px 26px', border: '1px solid rgba(255,249,239,.28)', borderRadius: 22, background: 'rgba(74,83,67,.42)', boxShadow: '0 24px 70px rgba(34,38,29,.2)' }}>
        <div style={{ font: '500 10px/1 system-ui', letterSpacing: '.3em', textTransform: 'uppercase', color: '#D8B873' }}>Check-in</div>
        <h1 style={{ margin: '17px 0 8px', fontSize: 32, fontWeight: 500, textTransform: 'capitalize' }}>{name || id.replace(/[-_]/g, ' ') || 'Tamu'}</h1>
        <p role={state === 'err' || state === 'missing' ? 'alert' : 'status'} style={{ margin: '0 auto', opacity: .82, fontSize: 14, lineHeight: 1.65 }}>{message}</p>
        {state === 'ready' && (
          <button type="button" onClick={confirm}
            style={{ width: '100%', marginTop: 22, padding: '14px 18px', border: 0, borderRadius: 999, background: '#FFF9EF', color: '#3E352C', font: '600 12px/1 system-ui', cursor: 'pointer' }}>
            Konfirmasi check-in
          </button>
        )}
        {state === 'err' && id && (
          <button type="button" onClick={() => location.reload()}
            style={{ marginTop: 18, padding: '11px 18px', border: '1px solid rgba(255,249,239,.35)', borderRadius: 999, background: 'transparent', color: '#FFF9EF', cursor: 'pointer' }}>
            Coba lagi
          </button>
        )}
      </div>
    </main>
  );
}
