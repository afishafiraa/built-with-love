import { useEffect, useState } from 'react';
import { sheets } from '../lib/sheets';

/** Opened by scanning a guest QR: /checkin?g=<guestId> */
export default function CheckIn() {
  const id = new URLSearchParams(location.search).get('g') || '';
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');

  useEffect(() => {
    if (!id) return;
    sheets.checkIn(id).then(() => setState('ok')).catch(() => setState('err'));
  }, [id]);

  const msg = !id ? 'Tidak ada kode tamu pada tautan ini.'
    : state === 'ok' ? 'Check-in tercatat. Selamat datang!'
    : state === 'err' ? 'Gagal menyimpan. Coba lagi atau catat manual.'
    : 'Menyimpan...';

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#4A5343', color: '#FBF6EC', fontFamily: 'system-ui', padding: 30, textAlign: 'center' }}>
      <div>
        <div style={{ font: '400 10px/1 system-ui', letterSpacing: '.34em', textTransform: 'uppercase', opacity: .7 }}>Check-in</div>
        <div style={{ margin: '16px 0 8px', fontSize: 34 }}>{id.replace(/-/g, ' ') || '-'}</div>
        <p style={{ opacity: .8, fontSize: 14 }}>{msg}</p>
      </div>
    </div>
  );
}
