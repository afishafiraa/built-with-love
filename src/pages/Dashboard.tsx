import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { sheets } from '../lib/sheets';
import { downloadCsv } from '../lib/csv';
import { guestLink } from '../lib/guest';
import { waInviteText, waLink } from '../lib/whatsapp';
import { fetchPublished, loadCached } from '../lib/config';
import AdminGate from '../components/AdminGate';
import type { Guest, WeddingConfig, Wish } from '../types';

const ink = '#2F2C26', sage = '#4A5343', red = '#A93227', paper = '#FBF8F0';

const btn: CSSProperties = { padding: '10px 15px', background: 'transparent', border: '1px solid rgba(47,44,38,.22)', borderRadius: 999, font: '400 10px/1 system-ui', letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer' };
const th: CSSProperties = { padding: '6px 8px', fontWeight: 400 };
const td: CSSProperties = { padding: '10px 8px', verticalAlign: 'top' };
const mini: CSSProperties = { marginRight: 6, padding: '6px 10px', border: '1px solid rgba(47,44,38,.2)', background: 'transparent', borderRadius: 7, fontSize: 11, cursor: 'pointer' };
const waBtn: CSSProperties = { ...mini, display: 'inline-block', textDecoration: 'none', color: ink };

export default function Dashboard() {
  return <AdminGate title="Dashboard"><DashboardInner /></AdminGate>;
}

function DashboardInner() {
  const [cfg, setCfg] = useState<WeddingConfig>(loadCached);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [tab, setTab] = useState<'guests' | 'wishes'>('guests');
  const [qrFor, setQrFor] = useState<Guest | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const [g, w] = await Promise.all([sheets.listGuests(), sheets.listWishes(true)]);
      setGuests(g); setWishes(w);
    } catch { /* Sheets not configured yet */ } finally { setBusy(false); }
  }
  useEffect(() => { refresh(); fetchPublished().then(setCfg).catch(() => {}); }, []);

  const stats = useMemo(() => {
    const yes = guests.filter(g => g.rsvp === 'yes');
    return {
      invited: guests.length,
      opened: guests.filter(g => g.opened).length,
      yes: yes.length,
      no: guests.filter(g => g.rsvp === 'no').length,
      seats: yes.reduce((s, g) => s + (Number(g.guests) || 0), 0),
      checked: guests.filter(g => g.checkedInAt).length
    };
  }, [guests]);

  const cards: [string, number][] = [
    ['Diundang', stats.invited], ['Dibuka', stats.opened], ['Hadir', stats.yes],
    ['Tidak hadir', stats.no], ['Total kursi', stats.seats], ['Check-in', stats.checked]
  ];

  return (
    <div style={{ minHeight: '100dvh', background: '#EDEADF', color: ink, fontFamily: 'system-ui', padding: '28px 24px 60px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ font: '500 10px/1 system-ui', letterSpacing: '.3em', textTransform: 'uppercase', color: red }}>Dashboard</div>
          <h1 style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 500 }}>Tamu &amp; ucapan</h1>
          <a href="/studio" style={{ display: 'inline-block', marginTop: 6, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: sage }}>Studio undangan &rarr;</a>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={refresh} style={btn}>{busy ? 'Memuat...' : 'Muat ulang'}</button>
          <button onClick={() => downloadCsv('tamu.csv', guests as unknown as Record<string, unknown>[])} style={btn}>Export CSV</button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, margin: '22px 0' }}>
        {cards.map(([label, value]) => (
          <div key={label} style={{ padding: 16, background: paper, borderRadius: 14, border: '1px solid rgba(47,44,38,.1)' }}>
            <div style={{ fontSize: 28, fontWeight: 500 }}>{value}</div>
            <div style={{ marginTop: 4, font: '400 9px/1 system-ui', letterSpacing: '.18em', textTransform: 'uppercase', opacity: .55 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setTab('guests')} style={{ ...btn, background: tab === 'guests' ? ink : 'transparent', color: tab === 'guests' ? paper : ink }}>Daftar tamu</button>
        <button onClick={() => setTab('wishes')} style={{ ...btn, background: tab === 'wishes' ? ink : 'transparent', color: tab === 'wishes' ? paper : ink }}>
          Ucapan ({wishes.filter(w => w.status === 'pending').length} baru)
        </button>
      </div>

      {tab === 'guests'
        ? <GuestTable guests={guests} cfg={cfg} onQr={setQrFor} onSaved={refresh} />
        : <WishList wishes={wishes} onModerate={async (id, s) => { await sheets.moderateWish(id, s); refresh(); }} />}

      {qrFor && (
        <div onClick={() => setQrFor(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(33,36,28,.6)', display: 'grid', placeItems: 'center', zIndex: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: paper, padding: 26, borderRadius: 18, textAlign: 'center' }}>
            <QRCodeCanvas value={location.origin + '/checkin?g=' + qrFor.id} size={220} marginSize={2} />
            <div style={{ marginTop: 12, fontWeight: 500 }}>{qrFor.name}</div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: .6 }}>Tunjukkan di meja penerima tamu</div>
          </div>
        </div>
      )}
    </div>
  );
}

function GuestTable({ guests, cfg, onQr, onSaved }: { guests: Guest[]; cfg: WeddingConfig; onQr: (g: Guest) => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (
    <div style={{ background: paper, border: '1px solid rgba(47,44,38,.1)', borderRadius: 16, padding: 18, overflowX: 'auto' }}>
      <form onSubmit={async e => {
        e.preventDefault();
        if (!name.trim()) return;
        await sheets.upsertGuest({ id: slug(name), name: name.trim(), phone, invited: 2 });
        setName(''); setPhone(''); onSaved();
      }} style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama tamu"
          style={{ flex: '1 1 200px', padding: 11, border: '1px solid rgba(47,44,38,.18)', borderRadius: 9 }} />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08..."
          style={{ width: 150, padding: 11, border: '1px solid rgba(47,44,38,.18)', borderRadius: 9 }} />
        <button style={{ ...btn, background: sage, color: paper, borderColor: sage }}>Tambah</button>
      </form>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', opacity: .55, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            <th style={th}>Nama</th><th style={th}>Dibuka</th><th style={th}>RSVP</th>
            <th style={th}>Kursi</th><th style={th}>Check-in</th><th style={th}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {guests.map(g => {
            const link = guestLink(location.origin, g.id);
            return (
              <tr key={g.id} style={{ borderTop: '1px solid rgba(47,44,38,.1)' }}>
                <td style={td}>{g.name}<div style={{ fontSize: 11, opacity: .5 }}>{g.id}</div></td>
                <td style={td}>{g.opened ? 'ya' : '-'}</td>
                <td style={td}>{g.rsvp === 'yes' ? 'Hadir' : g.rsvp === 'no' ? 'Tidak' : '-'}</td>
                <td style={td}>{g.guests || '-'}</td>
                <td style={td}>{g.checkedInAt ? 'ya' : '-'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <a href={waLink(g.phone || '', waInviteText(g.name, link, cfg))} target="_blank" rel="noreferrer" style={waBtn}>WhatsApp</a>
                  <button onClick={() => navigator.clipboard?.writeText(link)} style={mini}>Salin link</button>
                  <button onClick={() => onQr(g)} style={mini}>QR</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WishList({ wishes, onModerate }: { wishes: Wish[]; onModerate: (id: string, s: 'approved' | 'hidden') => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {wishes.map(w => (
        <div key={w.id} style={{ background: paper, border: '1px solid rgba(47,44,38,.1)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontSize: 13 }}>{w.name}</strong>
            <span style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .5 }}>{w.status}</span>
          </div>
          <p style={{ margin: '8px 0 12px', fontSize: 13.5, lineHeight: 1.7 }}>{w.text}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onModerate(w.id, 'approved')} style={{ ...mini, background: sage, color: paper }}>Tampilkan</button>
            <button onClick={() => onModerate(w.id, 'hidden')} style={{ ...mini, background: red, color: paper }}>Sembunyikan</button>
          </div>
        </div>
      ))}
    </div>
  );
}
