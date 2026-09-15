import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { sheets, sheetsReady } from '../lib/sheets';
import { downloadCsv } from '../lib/csv';
import { guestLink, slug } from '../lib/guest';
import { copyText } from '../lib/clipboard';
import { isValidWaNumber, waInviteText, waLink, waNumber } from '../lib/whatsapp';
import { loadCached } from '../lib/config';
import { mergeConfig } from '../config/invitation';
import AdminGate from '../components/AdminGate';
import type { Guest, WeddingConfig, Wish } from '../types';

const ink = '#2F2C26', sage = '#4A5343', red = '#A93227', paper = '#FBF8F0';

const btn: CSSProperties = { minHeight: 44, padding: '10px 15px', background: 'transparent', border: '1px solid rgba(47,44,38,.22)', borderRadius: 999, font: '500 10.5px/1 system-ui', letterSpacing: '.11em', textTransform: 'uppercase', cursor: 'pointer' };
const th: CSSProperties = { padding: '6px 8px', fontWeight: 400 };
const td: CSSProperties = { padding: '10px 8px', verticalAlign: 'top' };
const mini: CSSProperties = { minHeight: 44, marginRight: 6, padding: '7px 10px', border: '1px solid rgba(47,44,38,.2)', background: 'transparent', borderRadius: 7, fontSize: 11, cursor: 'pointer' };
const waBtn: CSSProperties = { ...mini, display: 'inline-block', textDecoration: 'none', color: ink };
const dangerMini: CSSProperties = { ...mini, marginRight: 0, borderColor: 'rgba(169,50,39,.35)', color: red };

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
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!sheetsReady) return;
    setBusy(true);
    try {
      const data = await sheets.dashboardData();
      setGuests(data.guests);
      setWishes(data.wishes);
      if (data.config) setCfg(mergeConfig(data.config));
      setErr(null);
    } catch (e) {
      // Without this the dashboard just shows zeros and setup mistakes stay invisible.
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }
  useEffect(() => { refresh(); }, []);

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
    <div className="app-min-screen app-dashboard" style={{ background: '#EDEADF', color: ink, fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ font: '500 10px/1 system-ui', letterSpacing: '.3em', textTransform: 'uppercase', color: red }}>Dashboard</div>
          <h1 style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 500 }}>Tamu &amp; ucapan</h1>
          <a href="/studio" style={{ display: 'inline-block', marginTop: 6, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: sage }}>Studio undangan &rarr;</a>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/checkin" style={{ ...btn, display: 'grid', placeItems: 'center', boxSizing: 'border-box', color: ink, textDecoration: 'none' }}>Scanner QR</a>
          <button onClick={refresh} style={btn}>{busy ? 'Memuat...' : 'Muat ulang'}</button>
          <button onClick={() => downloadCsv('tamu.csv', guests as unknown as Record<string, unknown>[])} style={btn}>Export CSV</button>
        </div>
      </header>

      {!sheetsReady && (
        <Notice tone={sage} title="Mode demo aktif">
          Backend sengaja dimatikan melalui <code>VITE_DEMO_MODE=true</code>. Jalankan lewat
          Vercel Preview dengan server environment yang lengkap untuk mengelola data asli.
        </Notice>
      )}
      {sheetsReady && err && (
        <Notice tone={red} title="Gagal memuat data">
          {err}
        </Notice>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, margin: '22px 0' }}>
        {cards.map(([label, value]) => (
          <div key={label} style={{ padding: 16, background: paper, borderRadius: 14, border: '1px solid rgba(47,44,38,.1)' }}>
            <div style={{ fontSize: 28, fontWeight: 500 }}>{value}</div>
            <div style={{ marginTop: 4, font: '500 10.5px/1 system-ui', letterSpacing: '.12em', textTransform: 'uppercase', opacity: .62 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setTab('guests')} style={{ ...btn, background: tab === 'guests' ? ink : 'transparent', color: tab === 'guests' ? paper : ink }}>Daftar tamu</button>
        <button onClick={() => setTab('wishes')} style={{ ...btn, background: tab === 'wishes' ? ink : 'transparent', color: tab === 'wishes' ? paper : ink }}>
          Ucapan ({wishes.filter(w => w.status === 'hidden').length} disembunyikan)
        </button>
      </div>

      {tab === 'guests'
        ? <GuestTable guests={guests} cfg={cfg} onQr={setQrFor} onSaved={refresh} />
        : <WishList wishes={wishes} onModerate={async (id, s) => { await sheets.moderateWish(id, s); refresh(); }} />}

      {qrFor && (
        <div onClick={() => setQrFor(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(33,36,28,.6)', display: 'grid', placeItems: 'center', zIndex: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: paper, padding: 26, borderRadius: 18, textAlign: 'center' }}>
            <QRCodeCanvas value={location.origin + '/checkin?g=' + encodeURIComponent(qrFor.id)} size={220} marginSize={2} />
            <div style={{ marginTop: 12, fontWeight: 500 }}>{qrFor.name}</div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: .6 }}>Tunjukkan di meja penerima tamu</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ tone, title, children }: { tone: string; title: string; children: ReactNode }) {
  return (
    <div style={{ margin: '22px 0 0', padding: '14px 16px', background: paper, border: '1px solid ' + tone + '55', borderLeft: '3px solid ' + tone, borderRadius: 12 }}>
      <div style={{ font: '500 10px/1 system-ui', letterSpacing: '.16em', textTransform: 'uppercase', color: tone }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.75, opacity: .78 }}>{children}</div>
    </div>
  );
}

function GuestTable({ guests, cfg, onQr, onSaved }: { guests: Guest[]; cfg: WeddingConfig; onQr: (g: Guest) => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState<Guest | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const [copiedGuest, setCopiedGuest] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [waQueue, setWaQueue] = useState<Guest[]>([]);
  const [waIndex, setWaIndex] = useState(0);
  const [waOpened, setWaOpened] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  const [waError, setWaError] = useState('');
  const [waNotice, setWaNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending-rsvp' | 'attending' | 'not-attending' | 'pending-wa' | 'checked-in'>('all');
  const hasValidPhone = (g: Guest) => isValidWaNumber(g.phone);
  const hasInviteLink = (g: Guest) => /^\d{8}$/.test(g.inviteToken);
  const pendingWa = guests.filter(g => hasValidPhone(g) && hasInviteLink(g) && !g.waSentAt);
  const missingPhone = guests.filter(g => !hasValidPhone(g)).length;
  const missingToken = guests.filter(g => !hasInviteLink(g)).length;
  const currentWa = waQueue[waIndex] || null;
  const visibleGuests = useMemo(() => {
    const needle = query.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
    return guests.filter(g => {
      const haystack = [g.name, g.phone, g.id, g.inviteToken].join(' ').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      const matchesQuery = !needle || haystack.includes(needle);
      const matchesFilter = filter === 'all'
        || (filter === 'pending-rsvp' && !g.rsvp)
        || (filter === 'attending' && g.rsvp === 'yes')
        || (filter === 'not-attending' && g.rsvp === 'no')
        || (filter === 'pending-wa' && isValidWaNumber(g.phone) && !g.waSentAt)
        || (filter === 'checked-in' && !!g.checkedInAt);
      return matchesQuery && matchesFilter;
    });
  }, [filter, guests, query]);
  const filters = [
    ['all', 'Semua'],
    ['pending-rsvp', 'Belum RSVP'],
    ['attending', 'Hadir'],
    ['not-attending', 'Tidak hadir'],
    ['pending-wa', 'Belum WA'],
    ['checked-in', 'Check-in']
  ] as const;

  const startWaQueue = (items: Guest[]) => {
    if (!items.length) return;
    setWaQueue(items);
    setWaIndex(0);
    setWaOpened(false);
    setWaError('');
    setWaNotice('');
  };
  const advanceWa = () => {
    if (waIndex + 1 >= waQueue.length) {
      setWaQueue([]);
      setWaIndex(0);
      setWaNotice('Antrean selesai. Tamu yang sudah dikonfirmasi tidak akan masuk pengiriman berikutnya.');
    } else {
      setWaIndex(i => i + 1);
      setWaOpened(false);
      setWaError('');
    }
  };
  const confirmWaSent = async () => {
    if (!currentWa || !waOpened) return;
    setWaBusy(true);
    setWaError('');
    try {
      await sheets.markGuestWaSent(currentWa.id);
      await onSaved();
      advanceWa();
    } catch (e) {
      setWaError(e instanceof Error ? e.message : 'Gagal menyimpan status WhatsApp');
    } finally { setWaBusy(false); }
  };
  const resetWaSent = async (guest: Guest) => {
    if (!window.confirm(`Masukkan ${guest.name} kembali ke antrean WhatsApp?`)) return;
    setWaBusy(true);
    setWaError('');
    try { await sheets.markGuestWaSent(guest.id, false); await onSaved(); }
    catch (e) { setWaError(e instanceof Error ? e.message : 'Gagal mengubah status WhatsApp'); }
    finally { setWaBusy(false); }
  };
  const markExistingWa = async (guest: Guest) => {
    if (!window.confirm(`Tandai undangan WhatsApp untuk ${guest.name} sebagai sudah dikirim?`)) return;
    setWaBusy(true);
    setWaError('');
    try { await sheets.markGuestWaSent(guest.id); await onSaved(); }
    catch (e) { setWaError(e instanceof Error ? e.message : 'Gagal menyimpan status WhatsApp'); }
    finally { setWaBusy(false); }
  };
  const removeGuest = async (guest: Guest) => {
    const confirmed = window.confirm(
      `Hapus ${guest.name} dari daftar tamu?\n\nData RSVP, jumlah kursi, dan status check-in tamu ini juga akan terhapus.`
    );
    if (!confirmed) return;
    setDeleting(guest.id);
    setDeleteError('');
    try {
      const removed = await sheets.deleteGuest(guest.id);
      if (!removed) throw new Error('Tamu tidak ditemukan. Muat ulang daftar dan coba lagi.');
      await onSaved();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Gagal menghapus tamu');
    } finally {
      setDeleting(null);
    }
  };
  const startEdit = (guest: Guest) => {
    setEditing(guest);
    setEditName(guest.name);
    setEditPhone(guest.phone || '');
    setEditError('');
  };
  const saveEdit = async () => {
    if (!editing || !editName.trim()) {
      setEditError('Nama tamu tidak boleh kosong.');
      return;
    }
    setEditBusy(true);
    setEditError('');
    try {
      const nextPhone = editPhone.trim();
      const phoneChanged = waNumber(nextPhone) !== waNumber(editing.phone);
      await sheets.upsertGuest({ id: editing.id, name: editName.trim(), phone: nextPhone });
      // A corrected number has not received the invitation yet, even when the
      // old number was previously marked as sent.
      if (phoneChanged && editing.waSentAt) await sheets.markGuestWaSent(editing.id, false);
      await onSaved();
      setEditing(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Gagal menyimpan perubahan tamu');
    } finally {
      setEditBusy(false);
    }
  };
  return (
    <div style={{ background: paper, border: '1px solid rgba(47,44,38,.1)', borderRadius: 16, padding: 18, overflowX: 'auto' }}>
      <form onSubmit={async e => {
        e.preventDefault();
        const cleanName = name.trim();
        if (!cleanName || addBusy) return;
        const base = slug(cleanName) || 'tamu';
        const used = new Set(guests.map(g => g.id.toLowerCase()));
        let id = base;
        let suffix = 2;
        while (used.has(id.toLowerCase())) id = base + '-' + suffix++;
        setAddBusy(true);
        setAddError('');
        try {
          await sheets.upsertGuest({ id, name: cleanName, phone: phone.trim(), invited: 2 });
          setName(''); setPhone('');
          await onSaved();
        } catch (error) {
          setAddError(error instanceof Error ? error.message : 'Gagal menambah tamu');
        } finally {
          setAddBusy(false);
        }
      }} style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama tamu" maxLength={80} autoComplete="name"
          style={{ flex: '1 1 200px', padding: 11, border: '1px solid rgba(47,44,38,.18)', borderRadius: 9 }} />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08..." inputMode="tel" autoComplete="tel" maxLength={24}
          style={{ width: 150, padding: 11, border: '1px solid rgba(47,44,38,.18)', borderRadius: 9 }} />
        <button disabled={addBusy || !name.trim()} style={{ ...btn, background: sage, color: paper, borderColor: sage, opacity: addBusy || !name.trim() ? .55 : 1 }}>
          {addBusy ? 'Menambah…' : 'Tambah'}
        </button>
      </form>
      {addError && <div role="alert" style={{ margin: '0 0 12px', color: red, fontSize: 12 }}>{addError}</div>}
      {deleteError && <div role="alert" style={{ margin: '0 0 12px', color: red, fontSize: 12 }}>{deleteError}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '4px 0 14px', padding: '12px 14px', background: '#E3E8DC', borderRadius: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Antrean WhatsApp pribadi</div>
          <div style={{ marginTop: 3, fontSize: 11, opacity: .62 }}>
            {pendingWa.length} belum dikirim{missingPhone ? ` · ${missingPhone} tanpa nomor valid` : ''}{missingToken ? ` · ${missingToken} tanpa invite token` : ''}
          </div>
        </div>
        <button type="button" onClick={() => startWaQueue(pendingWa)} disabled={!pendingWa.length || waBusy}
          style={{ ...btn, background: pendingWa.length ? sage : 'rgba(74,83,67,.12)', color: pendingWa.length ? paper : ink, borderColor: pendingWa.length ? sage : 'transparent' }}>
          {pendingWa.length ? `Mulai kirim (${pendingWa.length})` : 'Semua sudah dikirim'}
        </button>
      </div>
      {(waError || waNotice) && <div role="status" style={{ margin: '0 0 12px', color: waError ? red : sage, fontSize: 12 }}>{waError || waNotice}</div>}
      <div style={{ display: 'grid', gap: 10, margin: '2px 0 14px' }}>
        <label style={{ position: 'relative', display: 'block' }}>
          <span style={{ position: 'absolute', left: 13, top: '50%', marginTop: -9, opacity: .45, pointerEvents: 'none' }} aria-hidden="true">⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} type="search" placeholder="Cari nama, nomor HP, atau ID tamu…" aria-label="Cari tamu"
            style={{ boxSizing: 'border-box', width: '100%', minHeight: 44, padding: '11px 38px', border: '1px solid rgba(47,44,38,.18)', borderRadius: 12, background: '#fff', color: ink }} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Hapus pencarian"
            style={{ position: 'absolute', right: 2, top: '50%', marginTop: -22, width: 44, height: 44, border: 0, borderRadius: '50%', background: 'transparent', cursor: 'pointer' }}>&times;</button>}
        </label>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} aria-label="Filter daftar tamu">
          {filters.map(([key, text]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
              style={{ ...mini, flex: '0 0 auto', borderRadius: 999, background: filter === key ? ink : 'transparent', color: filter === key ? paper : ink }}>
              {text}
            </button>
          ))}
        </div>
        <div role="status" style={{ fontSize: 11, opacity: .58 }}>{visibleGuests.length} dari {guests.length} tamu ditampilkan</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', opacity: .55, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            <th style={th}>Nama</th><th style={th}>No. HP</th><th style={th}>Dibuka</th><th style={th}>RSVP</th>
            <th style={th}>Kursi</th><th style={th}>Check-in</th><th style={th}>WhatsApp</th><th style={th}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {visibleGuests.map(g => {
            const link = guestLink(location.origin, g.id, g.inviteToken);
            return (
              <tr key={g.id} style={{ borderTop: '1px solid rgba(47,44,38,.1)' }}>
                <td style={td}>{g.name}<div style={{ fontSize: 11, opacity: .5 }}>{g.id}-{g.inviteToken || 'token-belum-dibuat'}</div></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{g.phone || '-'}</td>
                <td style={td}>{g.opened ? 'ya' : '-'}</td>
                <td style={td}>{g.rsvp === 'yes' ? 'Hadir' : g.rsvp === 'no' ? 'Tidak' : '-'}</td>
                <td style={td}>{g.guests || '-'}</td>
                <td style={td}>{g.checkedInAt ? 'ya' : '-'}</td>
                <td style={{ ...td, minWidth: 105 }}>
                  {g.waSentAt
                    ? <><div style={{ color: sage, fontWeight: 600 }}>Terkirim</div><div style={{ marginTop: 2, fontSize: 10, opacity: .55 }}>{new Date(g.waSentAt).toLocaleString('id-ID')}</div></>
                    : <>
                        <div style={{ color: hasValidPhone(g) ? red : ink, opacity: hasValidPhone(g) ? 1 : .45 }}>{hasValidPhone(g) ? 'Belum' : 'Tanpa nomor'}</div>
                        {hasValidPhone(g) && hasInviteLink(g) && <button type="button" onClick={() => markExistingWa(g)} disabled={waBusy}
                          style={{ marginTop: 4, padding: 0, border: 0, background: 'transparent', color: sage, fontSize: 10, textDecoration: 'underline', cursor: waBusy ? 'default' : 'pointer' }}>Tandai sudah WA</button>}
                      </>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {hasValidPhone(g) && hasInviteLink(g) && !g.waSentAt && <button type="button" onClick={() => startWaQueue([g])} style={waBtn}>WhatsApp</button>}
                  {g.waSentAt && <button type="button" onClick={() => resetWaSent(g)} disabled={waBusy} style={mini}>Batalkan tanda WA</button>}
                  <button disabled={!link} onClick={async () => {
                    if (!link) return;
                    if (!await copyText(link)) return;
                    setCopiedGuest(g.id);
                    window.setTimeout(() => setCopiedGuest(current => current === g.id ? null : current), 1600);
                  }} style={mini}>{copiedGuest === g.id ? 'Tersalin' : 'Salin link'}</button>
                  <button onClick={() => onQr(g)} style={mini}>QR</button>
                  <button type="button" onClick={() => startEdit(g)} style={mini}>Edit</button>
                  <button type="button" onClick={() => removeGuest(g)} disabled={deleting === g.id}
                    style={{ ...dangerMini, opacity: deleting === g.id ? .55 : 1, cursor: deleting === g.id ? 'default' : 'pointer' }}>
                    {deleting === g.id ? 'Menghapus…' : 'Hapus'}
                  </button>
                </td>
              </tr>
            );
          })}
          {!visibleGuests.length && (
            <tr><td colSpan={8} style={{ padding: '28px 12px', textAlign: 'center', opacity: .58 }}>Tidak ada tamu yang cocok dengan pencarian atau filter ini.</td></tr>
          )}
        </tbody>
      </table>

      {editing && (
        <div onClick={() => { if (!editBusy) setEditing(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(33,36,28,.68)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <form onSubmit={e => { e.preventDefault(); void saveEdit(); }} onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="edit-guest-title"
            style={{ boxSizing: 'border-box', width: '100%', maxWidth: 440, background: paper, borderRadius: 18, padding: 22, boxShadow: '0 24px 80px rgba(0,0,0,.32)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
              <div>
                <div style={{ font: '500 10px/1 system-ui', letterSpacing: '.14em', textTransform: 'uppercase', color: sage }}>Edit tamu</div>
                <h2 id="edit-guest-title" style={{ margin: '7px 0 0', fontSize: 22 }}>Nama &amp; nomor HP</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)} disabled={editBusy} aria-label="Tutup edit tamu"
                style={{ width: 44, height: 44, border: '1px solid rgba(47,44,38,.18)', background: 'transparent', borderRadius: '50%', cursor: editBusy ? 'default' : 'pointer' }}>&times;</button>
            </div>
            <label style={{ display: 'block', marginTop: 18, fontSize: 12, fontWeight: 600 }}>
              Nama tamu
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                style={{ boxSizing: 'border-box', display: 'block', width: '100%', marginTop: 7, padding: 12, border: '1px solid rgba(47,44,38,.18)', borderRadius: 9 }} />
            </label>
            <label style={{ display: 'block', marginTop: 13, fontSize: 12, fontWeight: 600 }}>
              Nomor HP
              <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="08..." inputMode="tel"
                style={{ boxSizing: 'border-box', display: 'block', width: '100%', marginTop: 7, padding: 12, border: '1px solid rgba(47,44,38,.18)', borderRadius: 9 }} />
            </label>
            <div style={{ marginTop: 9, fontSize: 11, lineHeight: 1.55, opacity: .58 }}>
              Link undangan dan riwayat RSVP tetap sama. Jika nomor HP diubah, status WhatsApp lama akan dibatalkan agar nomor baru masuk antrean.
            </div>
            {editError && <div role="alert" style={{ marginTop: 10, color: red, fontSize: 12 }}>{editError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginTop: 17 }}>
              <button type="button" onClick={() => setEditing(null)} disabled={editBusy} style={{ ...btn, padding: 13 }}>Batal</button>
              <button type="submit" disabled={editBusy || !editName.trim()}
                style={{ ...btn, padding: 13, background: sage, borderColor: sage, color: paper, opacity: editBusy || !editName.trim() ? .55 : 1 }}>
                {editBusy ? 'Menyimpan…' : 'Simpan perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {currentWa && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(33,36,28,.68)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-label="Antrean WhatsApp" style={{ boxSizing: 'border-box', width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', background: paper, borderRadius: 18, padding: 22, boxShadow: '0 24px 80px rgba(0,0,0,.32)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
              <div>
                <div style={{ font: '500 10px/1 system-ui', letterSpacing: '.14em', textTransform: 'uppercase', color: sage }}>WhatsApp {waIndex + 1} dari {waQueue.length}</div>
                <h2 style={{ margin: '7px 0 0', fontSize: 22 }}>{currentWa.name}</h2>
                <div style={{ marginTop: 3, fontSize: 12, opacity: .6 }}>+{waNumber(currentWa.phone)}</div>
              </div>
              <button type="button" onClick={() => { setWaQueue([]); setWaError(''); }} aria-label="Tutup antrean"
                style={{ width: 44, height: 44, border: '1px solid rgba(47,44,38,.18)', background: 'transparent', borderRadius: '50%', cursor: 'pointer' }}>&times;</button>
            </div>
            <div style={{ marginTop: 16, padding: 14, maxHeight: 210, overflowY: 'auto', whiteSpace: 'pre-wrap', background: '#F3EFE5', border: '1px solid rgba(47,44,38,.1)', borderRadius: 10, fontSize: 12.5, lineHeight: 1.6 }}>
              {waInviteText(currentWa.name, guestLink(location.origin, currentWa.id, currentWa.inviteToken), cfg)}
            </div>
            {waError && <div role="alert" style={{ marginTop: 10, color: red, fontSize: 12 }}>{waError}</div>}
            <button type="button" onClick={() => {
              const popup = window.open(waLink(currentWa.phone || '', waInviteText(currentWa.name, guestLink(location.origin, currentWa.id, currentWa.inviteToken), cfg)), '_blank');
              if (popup) {
                popup.opener = null;
                setWaOpened(true);
                setWaError('');
              } else {
                setWaOpened(false);
                setWaError('WhatsApp tidak terbuka. Izinkan pop-up untuk situs ini lalu coba lagi.');
              }
            }} style={{ ...btn, width: '100%', marginTop: 16, padding: 14, background: '#317B58', borderColor: '#317B58', color: '#fff' }}>
              {waOpened ? 'Buka WhatsApp lagi' : 'Buka WhatsApp'}
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginTop: 9 }}>
              <button type="button" onClick={advanceWa} disabled={waBusy} style={{ ...btn, padding: 13 }}>Lewati</button>
              <button type="button" onClick={confirmWaSent} disabled={!waOpened || waBusy}
                style={{ ...btn, padding: 13, background: waOpened ? sage : 'rgba(74,83,67,.12)', borderColor: waOpened ? sage : 'transparent', color: waOpened ? paper : ink }}>
                {waBusy ? 'Menyimpan…' : 'Sudah dikirim & lanjut'}
              </button>
            </div>
            {!waOpened && <div style={{ marginTop: 9, textAlign: 'center', fontSize: 11, opacity: .55 }}>Buka WhatsApp terlebih dahulu, kirim pesannya, lalu kembali ke halaman ini.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function WishList({ wishes, onModerate }: { wishes: Wish[]; onModerate: (id: string, s: 'approved' | 'hidden') => void }) {
  const [changing, setChanging] = useState<string | null>(null);
  const changeVisibility = async (wish: Wish) => {
    setChanging(wish.id);
    try { await onModerate(wish.id, wish.status === 'hidden' ? 'approved' : 'hidden'); }
    finally { setChanging(null); }
  };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {wishes.map(w => (
        <div key={w.id} style={{ background: paper, border: '1px solid rgba(47,44,38,.1)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontSize: 13 }}>{w.name}</strong>
            <span style={{ padding: '5px 8px', borderRadius: 999, background: w.status === 'hidden' ? '#F5E0DC' : '#E3E8DC', color: w.status === 'hidden' ? red : sage, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {w.status === 'hidden' ? 'Disembunyikan' : 'Tampil publik'}
            </span>
          </div>
          <p style={{ margin: '8px 0 12px', fontSize: 13.5, lineHeight: 1.7 }}>{w.text}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => changeVisibility(w)} disabled={changing === w.id}
              style={{ ...mini, marginRight: 0, background: w.status === 'hidden' ? sage : red, color: paper, opacity: changing === w.id ? .6 : 1 }}>
              {changing === w.id ? 'Menyimpan…' : w.status === 'hidden' ? 'Tampilkan kembali' : 'Sembunyikan'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
