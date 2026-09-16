import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import AdminGate from '../components/AdminGate';
import { DEFAULT_CONFIG, mergeConfig } from '../config/invitation';
import { LIBRARY, SLOTS, SLOT_SRC } from '../config/slots';
const UPLOAD_NOTE = {
  remote: 'Gambar disimpan di Supabase Storage melalui server yang terautentikasi.',
  local: 'Mode lokal: gambar hanya tersimpan di browser ini — atur Supabase di .env supaya foto ikut terbit ke tamu.'
};
const SLOT_DEF = Object.fromEntries(SLOTS.flatMap(g => g.items).map(it => [it.slot, it]));
import { BODY_FONTS, DISPLAY_FONTS } from '../config/fonts';
import { MUSIC_TRACKS } from '../config/music';
import type { SlotDef } from '../config/slots';
import { fetchPublished, loadCached, loadDraft, publish, saveDraft } from '../lib/config';
import { backendReady } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { uploadAsset, uploadMode } from '../lib/upload';
import { uploadAudio } from '../lib/audio-upload';
import { slug } from '../lib/guest';
import type { WeddingConfig } from '../types';

/* Studio Undangan — port of "Studio Undangan.dc.html".
   Left: content form + per-position image slots. Right: live phone preview of
   the invitation (/?preview=1), which follows the draft through localStorage.
   "Terbitkan" writes the draft to Supabase so guests see it. */

const INK = '#2F2C26', PAPER = '#FBF8F0', SAGE = '#4A5343', RED = '#A93227', BG = '#EDEADF', PANEL = '#E3DFD2';

const pill: CSSProperties = { minHeight: 44, padding: '11px 16px', background: 'transparent', border: '1px solid rgba(47,44,38,.24)', borderRadius: 999, font: "500 10.5px/1 'Archivo'", letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', color: INK, whiteSpace: 'nowrap' };
const label: CSSProperties = { font: "500 11px/1.15 'Archivo'", letterSpacing: '.14em', textTransform: 'uppercase', opacity: .62 };
const input: CSSProperties = { minHeight: 44, padding: '12px 13px', background: '#FFFFFF', border: '1px solid rgba(47,44,38,.16)', borderRadius: 10, font: "300 16px 'Archivo'", width: '100%', boxSizing: 'border-box', color: INK };
const linkBtn: CSSProperties = { minHeight: 44, padding: '0 6px', border: 0, background: 'none', cursor: 'pointer', font: "500 10.5px/1 'Archivo'", letterSpacing: '.09em', textTransform: 'uppercase', color: SAGE };
const card: CSSProperties = { background: PAPER, border: '1px solid rgba(47,44,38,.1)', borderRadius: 18, padding: '22px 22px 24px' };

type Key = Exclude<keyof WeddingConfig, 'assets' | 'template' | 'lang'>;
type Field = { key: Key; label: string; ph?: string; note?: string; area?: boolean; wide?: boolean; options?: { value: string; label: string }[] };

const GROUPS: { title: string; hint: string; isLang?: boolean; musicUpload?: boolean; photos?: string[]; fields: Field[] }[] = [
  { title: 'Mempelai', hint: 'Nama, foto & orang tua', photos: ['v-groom', 'v-bride', 'v-cover-round'], fields: [
    { key: 'groomName', label: 'Nama panggilan pria', ph: 'Ave' },
    { key: 'brideName', label: 'Nama panggilan wanita', ph: 'Mumu' },
    { key: 'groomFull', label: 'Nama lengkap pria' },
    { key: 'brideFull', label: 'Nama lengkap wanita' },
    { key: 'groomParents', label: 'Orang tua pria', wide: true },
    { key: 'brideParents', label: 'Orang tua wanita', wide: true },
    { key: 'groomInstagram', label: 'Instagram pria', ph: '@username', note: 'Tombol Instagram muncul di bawah nama. Kosongkan untuk menyembunyikan.' },
    { key: 'brideInstagram', label: 'Instagram wanita', ph: '@username' }
  ] },
  { title: 'Tipografi & tagar', hint: 'Huruf & hashtag', fields: [
    { key: 'displayFont', label: 'Huruf handwriting untuk judul & nama', options: DISPLAY_FONTS, note: 'Cookie adalah pilihan desain utama. Pilih "Font sendiri" hanya jika ingin memakai file font berlisensi di app/public/fonts/display.woff2 (atau .otf / .ttf).' },
    { key: 'bodyFont', label: 'Huruf teks', options: BODY_FONTS },
    { key: 'hashtag', label: 'Hashtag pernikahan', wide: true, ph: '#NamaKitaWedding', note: 'Tampil di penutup, di bawah logo, dengan tombol salin & lihat di Instagram.' }
  ] },
  { title: 'Acara', hint: 'Tanggal & jam', fields: [
    { key: 'dateISO', label: 'Waktu acara (ISO)', ph: '2027-01-03T09:00:00+07:00', note: 'Dipakai untuk hitung mundur dan tombol kalender.' },
    { key: 'dateLabel', label: 'Tanggal tampil (Indonesia)', ph: 'Minggu, 3 Januari 2027' },
    { key: 'dateLabelEn', label: 'Tanggal tampil (English)', ph: 'Sunday, 3 January 2027' },
    { key: 'akadTime', label: 'Jam akad', ph: '09.00 WIB' },
    { key: 'resepsiTime', label: 'Jam resepsi', ph: '11.00 WIB' }
  ] },
  { title: 'Lokasi', hint: 'Tempat & peta', fields: [
    { key: 'venue', label: 'Nama tempat' },
    { key: 'city', label: 'Kota' },
    { key: 'address', label: 'Alamat lengkap', area: true, wide: true },
    { key: 'mapsQuery', label: 'Kata kunci Google Maps', wide: true, note: 'Yang dicari di peta, mis. "Gedung Serbaguna Melati, Yogyakarta".' }
  ] },
  { title: 'Love story', hint: 'Indonesia & English · kosongkan untuk menyembunyikan', fields: [1, 2, 3, 4].flatMap(n => [
    { key: ('story' + n + 'Year') as Key, label: 'Babak ' + n + ' — tahun' },
    { key: ('story' + n + 'Title') as Key, label: 'Babak ' + n + ' — judul Indonesia' },
    { key: ('story' + n + 'Body') as Key, label: 'Babak ' + n + ' — cerita Indonesia', area: true, wide: true },
    { key: ('story' + n + 'TitleEn') as Key, label: 'Chapter ' + n + ' — English title', ph: 'English version' },
    { key: ('story' + n + 'BodyEn') as Key, label: 'Chapter ' + n + ' — English story', ph: 'English version', area: true, wide: true,
      note: 'Jika dikosongkan, versi Indonesia tetap ditampilkan saat undangan memakai English.' }
  ]) },
  { title: 'Amplop digital', hint: 'Kosongkan untuk menyembunyikan kartu', fields: [
    { key: 'bank1Name', label: 'Bank 1 — nama' }, { key: 'bank1Acct', label: 'Bank 1 — nomor rekening' },
    { key: 'bank1Holder', label: 'Bank 1 — atas nama', wide: true },
    { key: 'bank2Name', label: 'Bank 2 — nama' }, { key: 'bank2Acct', label: 'Bank 2 — nomor rekening' },
    { key: 'bank2Holder', label: 'Bank 2 — atas nama', wide: true },
    { key: 'giftAddressLabel', label: 'Kartu alamat — judul' },
    { key: 'giftAddressHolder', label: 'Kartu alamat — penerima & telepon' },
    { key: 'giftAddress', label: 'Alamat kirim hadiah', area: true, wide: true }
  ] },
  { title: 'Musik & bahasa', hint: 'Latar suara', isLang: true, musicUpload: true, fields: [
    { key: 'musicUrl', label: 'Musik tersimpan', wide: true, options: MUSIC_TRACKS.map(track => ({ value: track.value, label: track.label })),
      note: 'Pilihan ini berasal dari file yang tersedia di public/audio. Judul lagu di bawah akan terisi otomatis dan tetap dapat disesuaikan.' },
    { key: 'musicTitle', label: 'Judul lagu (opsional)', wide: true }
  ] }
];

export default function Studio() {
  return <AdminGate title="Studio Undangan"><StudioInner /></AdminGate>;
}

type PubState = 'idle' | 'publishing' | 'done' | 'error';

function StudioInner() {
  const [cfg, setCfg] = useState<WeddingConfig>(() => loadDraft() || loadCached());
  const [publishedJson, setPublishedJson] = useState(() => JSON.stringify(loadCached()));
  const [tab, setTab] = useState<'content' | 'assets'>('content');
  const [previewKey, setPreviewKey] = useState(0);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pub, setPub] = useState<PubState>('idle');
  const [pubErr, setPubErr] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewGuest, setPreviewGuest] = useState('Budi Santoso');
  const previewSrc = '/?preview=1' + (previewGuest.trim() ? '&to=' + encodeURIComponent(slug(previewGuest)) : '');
  const narrow = useNarrow(980);

  // Pull the published copy once; start from it when there is no local draft yet.
  const touched = useRef(false);
  useEffect(() => {
    const hadDraft = !!loadDraft();
    if (!hadDraft) saveDraft(cfg);
    fetchPublished().then(p => {
      setPublishedJson(JSON.stringify(p));
      if (!hadDraft && !touched.current) { setCfg(p); saveDraft(p); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = JSON.stringify(cfg) !== publishedJson;
  const englishKeys: (keyof WeddingConfig)[] = [
    'dateLabelEn',
    'story1TitleEn', 'story1BodyEn',
    'story2TitleEn', 'story2BodyEn',
    'story3TitleEn', 'story3BodyEn',
    'story4TitleEn', 'story4BodyEn'
  ];
  const englishFilled = englishKeys.filter(key => String(cfg[key] || '').trim()).length;
  const englishComplete = englishFilled === englishKeys.length;

  const update = (next: WeddingConfig) => {
    touched.current = true;
    setCfg(next); saveDraft(next);
    if (pub !== 'publishing') setPub('idle');
  };
  const set = (key: keyof WeddingConfig, value: string) => {
    if (key === 'musicUrl') {
      const track = MUSIC_TRACKS.find(item => item.value === value);
      update({ ...cfg, musicUrl: value, musicTitle: track?.title ?? cfg.musicTitle });
      return;
    }
    update({ ...cfg, [key]: value });
  };
  const setAsset = (slot: string, url: string) => {
    const assets = { ...cfg.assets };
    if (url) assets[slot] = url; else delete assets[slot];
    update({ ...cfg, assets });
  };

  const onPublish = async () => {
    if (Object.values(cfg.assets).some(u => u.startsWith('data:'))) {
      setPub('error'); setPubErr('ada gambar yang diunggah saat mode lokal. Unggah ulang gambar itu sekarang (Supabase sudah aktif) lalu terbitkan lagi.'); return;
    }
    setPub('publishing'); setPubErr('');
    try { await publish(cfg); setPublishedJson(JSON.stringify(cfg)); setPub('done'); }
    catch (e) { setPub('error'); setPubErr((e as Error).message); }
  };

  const onReset = () => {
    if (!confirmReset) { setConfirmReset(true); window.setTimeout(() => setConfirmReset(false), 3000); return; }
    setConfirmReset(false);
    update(mergeConfig(DEFAULT_CONFIG));
    setPreviewKey(k => k + 1);
  };

  const onCopyJson = async () => {
    if (!await copyText(JSON.stringify(cfg, null, 2))) return;
    setJsonCopied(true);
    window.setTimeout(() => setJsonCopied(false), 1800);
  };

  const status = !backendReady
    ? { text: 'Mode lokal — Supabase belum diatur. Salin JSON sebagai backup sebelum menerbitkan.', color: '#8A5A12', bg: '#F5E7D8' }
    : pub === 'publishing' ? { text: 'Menerbitkan…', color: INK, bg: PANEL }
    : pub === 'error' ? { text: 'Gagal menerbitkan: ' + pubErr, color: RED, bg: '#F5E0DC' }
    : dirty ? { text: 'Draf tersimpan di browser ini · belum diterbitkan', color: '#8A5A12', bg: '#F5E7D8' }
    : { text: '✓ Sama dengan versi yang dilihat tamu', color: SAGE, bg: '#E3E8DC' };

  const coupleShort = (cfg.groomName || 'Ave') + ' & ' + (cfg.brideName || 'Mumu');

  const previewPanel = (
    <div style={{ borderLeft: narrow ? 0 : '1px solid rgba(47,44,38,.12)', background: PANEL, display: 'grid', gridTemplateRows: 'auto auto 1fr', minHeight: 0, height: '100%' }}>
      <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(47,44,38,.12)' }}>
        <div>
          <div style={{ font: "500 10.5px/1 'Archivo'", letterSpacing: '.18em', textTransform: 'uppercase', opacity: .58 }}>Pratinjau langsung</div>
          <div style={{ marginTop: 5, fontFamily: "'Bodoni Moda', serif", fontSize: 17 }}>{coupleShort}</div>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => setPreviewKey(k => k + 1)} title="Muat ulang" aria-label="Muat ulang pratinjau" style={{ width: 44, height: 44, border: '1px solid rgba(47,44,38,.2)', background: PAPER, borderRadius: '50%', cursor: 'pointer', font: "400 15px/1 'Archivo'", color: INK }}>&#8635;</button>
          <a href={previewSrc} target="_blank" rel="noreferrer" style={{ display: 'grid', placeItems: 'center', padding: '0 14px', height: 44, border: '1px solid rgba(47,44,38,.2)', background: PAPER, borderRadius: 999, font: "500 10.5px/1 'Archivo'", letterSpacing: '.12em', textTransform: 'uppercase', textDecoration: 'none', color: INK }}>Buka</a>
          {narrow && <button onClick={() => setShowPreview(false)} aria-label="Tutup pratinjau" style={{ width: 44, height: 44, border: '1px solid rgba(47,44,38,.2)', background: PAPER, borderRadius: '50%', cursor: 'pointer', font: "300 18px/1 'Archivo'", color: INK }}>&times;</button>}
        </div>
      </div>
      <div style={{ padding: '12px 22px', borderBottom: '1px solid rgba(47,44,38,.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <label htmlFor="st-preview-guest" style={{ ...label, whiteSpace: 'nowrap' }}>Tamu contoh</label>
        <input id="st-preview-guest" value={previewGuest} onChange={e => setPreviewGuest(e.target.value)} placeholder="Nama tamu" className="st-in"
          style={{ ...input, padding: '9px 12px', fontSize: 13 }} />
      </div>
      <div style={{ minHeight: 0, display: 'grid', placeItems: 'center', padding: 22, overflow: 'hidden' }}>
        <div style={{ boxSizing: 'border-box', height: '100%', maxHeight: 818, maxWidth: '100%', aspectRatio: '408/818', borderRadius: 34, overflow: 'hidden', border: '9px solid ' + INK, boxShadow: '0 26px 60px rgba(47,44,38,.32)', background: '#FBF6EC' }}>
          <iframe key={previewKey} src={previewSrc} title="Pratinjau undangan" style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-screen" style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1fr) 470px', background: BG, color: INK, fontFamily: "'Archivo', system-ui, sans-serif", overflow: 'hidden' }}>
      <div style={{ minWidth: 0, overflowY: 'auto', padding: narrow ? '26px 18px 110px' : '34px 36px 90px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ font: "600 10.5px/1 'Archivo'", letterSpacing: '.22em', textTransform: 'uppercase', color: RED }}>Studio Undangan</div>
              <a href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, font: "500 10.5px/1 'Archivo'", letterSpacing: '.12em', textTransform: 'uppercase', color: INK, opacity: .65 }}>Dashboard &rarr;</a>
            </div>
            <h1 style={{ margin: '10px 0 0', fontFamily: "'Bodoni Moda', serif", fontWeight: 400, fontSize: narrow ? 32 : 40, lineHeight: 1.05 }}>Atur isi undangan</h1>
            <p style={{ margin: '8px 0 0', maxWidth: 540, font: "200 13px/1.7 'Archivo'", opacity: .7, textWrap: 'pretty' } as CSSProperties}>
              Setiap perubahan langsung tersimpan sebagai draf dan tampil di pratinjau. Tekan <b style={{ fontWeight: 500 }}>Terbitkan</b> agar tamu melihat versi terbaru. Aset diletakkan per posisi, jadi kamu bisa menaruh gambar yang tepat di tiap sudut.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onCopyJson} style={pill}>{jsonCopied ? '✓ JSON tersalin' : 'Salin JSON'}</button>
            <button onClick={onReset} style={{ ...pill, borderColor: 'rgba(169,50,39,.4)', color: RED }}>{confirmReset ? 'Yakin reset?' : 'Reset'}</button>
            <button onClick={onPublish} disabled={!backendReady || pub === 'publishing' || !dirty}
              style={{ ...pill, background: SAGE, borderColor: SAGE, color: PAPER, opacity: !backendReady || !dirty ? .45 : 1, cursor: !backendReady || !dirty ? 'default' : 'pointer' }}>
              {pub === 'publishing' ? 'Menerbitkan…' : 'Terbitkan'}
            </button>
          </div>
        </div>

        <div role="status" style={{ marginTop: 18, padding: '10px 14px', borderRadius: 12, background: status.bg, color: status.color, font: "300 12px/1.5 'Archivo'" }}>{status.text}</div>

        <div style={{ display: 'flex', gap: 6, margin: '22px 0 22px', padding: 5, background: PANEL, borderRadius: 999, width: 'max-content' }}>
          {(['content', 'assets'] as const).map(k => (
            <button key={k} onClick={() => setTab(k)} style={{ minHeight: 44, padding: '10px 20px', border: 0, borderRadius: 999, cursor: 'pointer', background: tab === k ? INK : 'transparent', color: tab === k ? PAPER : INK, font: "500 10.5px/1 'Archivo'", letterSpacing: '.14em', textTransform: 'uppercase' }}>
              {k === 'content' ? 'Konten' : 'Aset gambar'}
            </button>
          ))}
        </div>

        {tab === 'content' ? (
          <div style={{ display: 'grid', gap: 22 }}>
            <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px 16px', border: '1px solid ' + (englishComplete ? 'rgba(74,83,67,.22)' : 'rgba(138,90,18,.24)'), borderRadius: 14, background: englishComplete ? '#E3E8DC' : '#F5E7D8' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: englishComplete ? SAGE : '#8A5A12' }}>{englishComplete ? 'Terjemahan English lengkap' : 'Terjemahan English belum lengkap'}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.55, opacity: .68 }}>
                  {englishFilled}/{englishKeys.length} field tanggal dan cerita English terisi. Field kosong akan memakai versi Indonesia.
                </div>
              </div>
              <span style={{ minWidth: 50, padding: '7px 10px', borderRadius: 999, background: PAPER, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>{Math.round(englishFilled / englishKeys.length * 100)}%</span>
            </div>
            {GROUPS.map(g => (
              <div key={g.title} style={card}>
                <GroupHead title={g.title} hint={g.hint} />
                {g.photos && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,160px))', gap: 14 }}>
                      {g.photos.map(slot => <SlotCard key={slot} def={SLOT_DEF[slot]} url={cfg.assets[slot] || ''} onSet={url => setAsset(slot, url)} onPick={() => {}} />)}
                    </div>
                    <div style={{ marginTop: 8, font: "200 11px/1.6 'Archivo'", opacity: .6 }}>Klik foto untuk mengganti (atau tarik file ke kotaknya). Foto potret otomatis dipusatkan ke wajah bagian atas. {UPLOAD_NOTE[uploadMode]}</div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14, marginTop: 16 }}>
                  {g.fields.map(f => (
                    <label key={f.key} style={{ display: 'grid', gap: 6, gridColumn: f.wide ? '1 / -1' : 'auto', alignContent: 'start' }}>
                      <span style={label}>{f.label}</span>
                      {f.options
                        ? <select value={cfg[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} style={{ ...input, appearance: 'auto', cursor: 'pointer' }} className="st-in">
                            {String(cfg[f.key] ?? '') && !f.options.some(o => o.value === cfg[f.key]) && (
                              <option value={String(cfg[f.key])}>Musik upload saat ini — {cfg.musicTitle || 'tanpa judul'}</option>
                            )}
                            {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        : f.area
                        ? <textarea value={cfg[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} rows={3} placeholder={f.ph} style={{ ...input, lineHeight: 1.6, resize: 'vertical' }} className="st-in" />
                        : <input value={cfg[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.ph} style={input} className="st-in" />}
                      {f.key === 'dateISO' && isNaN(new Date(cfg.dateISO).getTime()) && (
                        <span style={{ font: "300 11px/1.5 'Archivo'", color: RED }}>Format belum valid — contoh: 2027-01-03T09:00:00+07:00</span>
                      )}
                      {f.note && <span style={{ font: "200 11px/1.6 'Archivo'", opacity: .6, textWrap: 'pretty' } as CSSProperties}>{f.note}</span>}
                    </label>
                  ))}
                </div>
                {g.musicUpload && (
                  <MusicUploader onUploaded={(url, title) => update({ ...cfg, musicUrl: url, musicTitle: title })} />
                )}
                {g.isLang && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {(['id', 'en'] as const).map(l => (
                      <button key={l} onClick={() => update({ ...cfg, lang: l })} style={{ minHeight: 44, padding: '11px 20px', border: '1px solid rgba(47,44,38,.16)', borderRadius: 999, cursor: 'pointer', background: cfg.lang === l ? SAGE : 'transparent', color: cfg.lang === l ? PAPER : INK, font: "500 10.5px/1 'Archivo'", letterSpacing: '.12em', textTransform: 'uppercase' }}>
                        {l === 'id' ? 'Bahasa Indonesia' : 'English'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <AssetsTab assets={cfg.assets} onSet={setAsset} />
        )}
      </div>

      {!narrow && previewPanel}
      {narrow && !showPreview && (
        <button onClick={() => setShowPreview(true)} style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 20, minHeight: 44, padding: '15px 22px', background: INK, color: PAPER, border: 0, borderRadius: 999, boxShadow: '0 14px 34px rgba(47,44,38,.3)', font: "500 10.5px/1 'Archivo'", letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
          Lihat pratinjau
        </button>
      )}
      {narrow && showPreview && <div style={{ position: 'fixed', inset: 0, zIndex: 30 }}>{previewPanel}</div>}
      <style>{`.st-in:focus{border-color:${RED}!important}`}</style>
    </div>
  );
}

function GroupHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
      <div style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 21, whiteSpace: 'nowrap' }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: 'rgba(47,44,38,.12)' }} />
      <div style={{ font: "500 10.5px/1.3 'Archivo'", letterSpacing: '.12em', textTransform: 'uppercase', opacity: .55, textAlign: 'right' }}>{hint}</div>
    </div>
  );
}

function MusicUploader({ onUploaded }: { onUploaded: (url: string, title: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const take = async (file?: File | null) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const uploaded = await uploadAudio(file);
      onUploaded(uploaded.url, uploaded.title);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload musik gagal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 14, padding: '14px 16px', border: '1px dashed rgba(47,44,38,.24)', borderRadius: 14, background: '#FFFFFF' }}>
      <input ref={fileRef} type="file" accept=".mp3,.m4a,.mp4,audio/mpeg,audio/mp4,video/mp4" hidden
        onChange={event => { take(event.target.files?.[0]); event.target.value = ''; }} />
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
        style={{ ...pill, borderColor: SAGE, color: SAGE, opacity: busy ? .55 : 1 }}>
        {busy ? 'Mengunggah musik…' : 'Browse & upload musik'}
      </button>
      <div style={{ marginTop: 8, font: "300 11px/1.6 'Archivo'", opacity: .65 }}>
        MP3, M4A, atau MP4 · maksimal 15 MB. File disimpan di Supabase Storage; setelah upload selesai, klik Terbitkan agar tamu memakai lagu baru.
      </div>
      {error && <div role="alert" style={{ marginTop: 7, font: "400 11px/1.5 'Archivo'", color: RED }}>{error}</div>}
    </div>
  );
}

function AssetsTab({ assets, onSet }: { assets: Record<string, string>; onSet: (slot: string, url: string) => void }) {
  const custom = Object.keys(assets).length;
  const [pickFor, setPickFor] = useState<SlotDef | null>(null);
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div style={{ padding: '16px 18px', background: '#F5E7D8', border: '1px solid rgba(169,50,39,.2)', borderRadius: 14, font: "200 12.5px/1.75 'Archivo'", textWrap: 'pretty' } as CSSProperties}>
        Pilih <b style={{ fontWeight: 500 }}>Koleksi</b> untuk memakai ornamen bawaan, atau tarik file gambar ke kotak (klik untuk memilih dari perangkat). PNG dengan latar transparan paling cocok untuk ornamen. Ornamen sudut cukup diatur sekali — undangan mencerminkannya ke keempat sudut.
        <div style={{ marginTop: 8, fontWeight: 400, color: uploadMode === 'local' ? RED : SAGE }}>{UPLOAD_NOTE[uploadMode]}</div>
        {custom > 0 && <div style={{ marginTop: 8, opacity: .8 }}>{custom} posisi memakai gambar sendiri.</div>}
      </div>
      {SLOTS.map(g => (
        <div key={g.group} style={{ ...card, padding: 22 }}>
          <GroupHead title={g.group} hint={g.items.length + ' slot'} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(132px,1fr))', gap: 14, marginTop: 12 }}>
            {g.items.map(it => <SlotCard key={it.slot} def={it} url={assets[it.slot] || ''} onSet={url => onSet(it.slot, url)} onPick={() => setPickFor(it)} />)}
          </div>
        </div>
      ))}
      {pickFor && (
        <LibraryPicker def={pickFor} current={assets[pickFor.slot] || SLOT_SRC[pickFor.slot] || ''}
          onPick={src => { onSet(pickFor.slot, src === SLOT_SRC[pickFor.slot] ? '' : src); setPickFor(null); }}
          onClose={() => setPickFor(null)} />
      )}
    </div>
  );
}

function LibraryPicker({ def, current, onPick, onClose }: { def: SlotDef; current: string; onPick: (src: string) => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={'Koleksi untuk ' + def.label} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', padding: 18 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(33,36,28,.5)' }} />
      <div style={{ position: 'relative', boxSizing: 'border-box', width: '100%', maxWidth: 760, maxHeight: '86vh', overflowY: 'auto', background: PAPER, borderRadius: 20, padding: '22px 22px 26px', boxShadow: '0 30px 80px rgba(33,36,28,.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div>
            <div style={label}>Koleksi ornamen</div>
            <div style={{ marginTop: 6, fontFamily: "'Bodoni Moda', serif", fontSize: 22 }}>{def.label}</div>
          </div>
          <button onClick={onClose} aria-label="Tutup" style={{ width: 44, height: 44, border: '1px solid rgba(47,44,38,.2)', background: 'transparent', borderRadius: '50%', cursor: 'pointer', font: "300 18px/1 'Archivo'", color: INK }}>&times;</button>
        </div>
        {LIBRARY.map(g => (
          <div key={g.group} style={{ marginTop: 18 }}>
            <div style={{ ...label, marginBottom: 10 }}>{g.group}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 10 }}>
              {g.items.map(it => {
                const on = it.src === current;
                return (
                  <button key={it.src} onClick={() => onPick(it.src)} title={it.label}
                    style={{ display: 'grid', gap: 6, padding: 8, background: '#4A5343', border: on ? '2px solid ' + RED : '2px solid transparent', borderRadius: 12, cursor: 'pointer' }}>
                    <img src={it.src} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain' }} />
                    <span style={{ font: "500 10px/1.2 'Archivo'", letterSpacing: '.08em', textTransform: 'uppercase', color: PAPER }}>{on ? '✓ ' : ''}{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotCard({ def, url, onSet, onPick }: { def: SlotDef; url: string; onSet: (url: string) => void; onPick: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const src = url || SLOT_SRC[def.slot] || '';
  const kindLabel = { orn: 'Ornamen', photo: 'Foto', petal: 'Kelopak' }[def.kind];

  const take = async (file?: File | null) => {
    if (!file) return;
    setErr(''); setBusy(true);
    try { onSet(await uploadAsset(file, def.kind)); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); };

  return (
    <div style={{ display: 'grid', gap: 7, alignContent: 'start' }}>
      <button type="button" onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        title={'Ganti: ' + def.label}
        style={{ position: 'relative', aspectRatio: def.ratio, padding: 0, background: def.kind === 'photo' ? '#E6E2D6' : '#FFFFFF', border: over ? '2px dashed ' + RED : '1px solid rgba(47,44,38,.12)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}>
        {src
          ? <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: def.kind === 'photo' ? 'cover' : 'contain', padding: def.kind === 'photo' ? 0 : 8, boxSizing: 'border-box' }} />
          : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 10, font: "300 10.5px/1.4 'Archivo'", color: 'rgba(47,44,38,.5)', textAlign: 'center' }}>+ {def.label}</span>}
        {busy && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(251,248,240,.8)', font: "500 10px/1 'Archivo'", letterSpacing: '.12em', textTransform: 'uppercase' }}>Mengunggah…</span>}
        {url && !busy && <span style={{ position: 'absolute', top: 6, left: 6, padding: '4px 7px', background: SAGE, color: PAPER, borderRadius: 999, font: "500 10px/1 'Archivo'", letterSpacing: '.08em', textTransform: 'uppercase' }}>Kustom</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }} />
      <div style={{ font: "300 11px/1.4 'Archivo'", opacity: .75, textWrap: 'pretty' } as CSSProperties}>{def.label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ font: "400 10px/1 'Archivo'", letterSpacing: '.09em', textTransform: 'uppercase', opacity: .5, marginRight: 'auto' }}>{kindLabel}</span>
        {def.kind !== 'photo' && <button type="button" onClick={onPick} style={linkBtn}>Koleksi</button>}
        {url && <button type="button" onClick={() => onSet('')} style={{ ...linkBtn, color: RED }}>{def.kind === 'photo' ? 'Hapus' : 'Default'}</button>}
      </div>
      {err && <div style={{ font: "300 10.5px/1.4 'Archivo'", color: RED }}>{err}</div>}
    </div>
  );
}

function useNarrow(px: number) {
  const q = useMemo(() => window.matchMedia('(max-width: ' + px + 'px)'), [px]);
  const [narrow, setNarrow] = useState(q.matches);
  useEffect(() => {
    const on = () => setNarrow(q.matches);
    if (q.addEventListener) {
      q.addEventListener('change', on);
      return () => q.removeEventListener('change', on);
    }
    q.addListener(on);
    return () => q.removeListener(on);
  }, [q]);
  return narrow;
}
