import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { IScannerControls } from '@zxing/browser';
import AdminGate from '../components/AdminGate';
import { api, backendReady } from '../lib/api';

type State = 'idle' | 'scanning' | 'loading' | 'ready' | 'saving' | 'ok' | 'missing' | 'err';

/** Protected reception desk: /checkin can scan, while /checkin?g=<code> opens directly. */
export default function CheckIn() {
  return <AdminGate title="Check-in Petugas"><CheckInInner /></AdminGate>;
}

function codeFromQr(rawValue: string) {
  const raw = rawValue.trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, location.origin);
    const queryCode = (url.searchParams.get('g') || url.searchParams.get('to') || '').trim().toLowerCase();
    if (queryCode) return queryCode;
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(raw) ? raw.toLowerCase() : '';
  } catch {
    return raw.toLowerCase();
  }
}

function initialCode() {
  return codeFromQr(new URLSearchParams(location.search).get('g') || '');
}

function CheckInInner() {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [state, setState] = useState<State>(code ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanHandled = useRef(false);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const selectCode = (value: string) => {
    const next = codeFromQr(value);
    if (!next) {
      setError('QR tidak berisi kode tamu yang valid.');
      setState('err');
      return;
    }
    stopCamera();
    setName('');
    setError('');
    setState('loading');
    setCode(next);
    const url = new URL(location.href);
    url.searchParams.set('g', next);
    history.replaceState(null, '', url);
  };

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (!code) return;
    if (!backendReady) {
      setError('Backend Supabase belum tersambung.');
      setState('err');
      return;
    }
    let active = true;
    setState('loading');
    api.getGuestById(code)
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
  }, [code]);

  const startCamera = async () => {
    stopCamera();
    setError('');
    setName('');
    scanHandled.current = false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Kamera memerlukan HTTPS dan browser yang mendukung akses kamera. Gunakan unggah foto QR sebagai alternatif.');
      setState('err');
      return;
    }
    setState('scanning');
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180 });
      controlsRef.current = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        videoRef.current || undefined,
        (result, _error, controls) => {
          if (!result || scanHandled.current) return;
          scanHandled.current = true;
          controls.stop();
          controlsRef.current = null;
          selectCode(result.getText());
        }
      );
    } catch (err) {
      stopCamera();
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setError(denied
        ? 'Izin kamera ditolak. Izinkan kamera di pengaturan browser atau unggah foto QR.'
        : 'Kamera tidak dapat dibuka. Coba unggah foto QR dari galeri.');
      setState('err');
    }
  };

  const scanImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    stopCamera();
    setError('');
    setState('loading');
    const objectUrl = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(objectUrl);
      selectCode(result.getText());
    } catch {
      setError('QR tidak terbaca dari foto. Pastikan gambar tajam, terang, dan seluruh QR terlihat.');
      setState('err');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const confirm = async () => {
    setState('saving');
    setError('');
    try {
      const saved = await api.checkIn(code);
      setState(saved === false ? 'missing' : 'ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan check-in.');
      setState('err');
    }
  };

  const reset = () => {
    stopCamera();
    setCode('');
    setName('');
    setError('');
    setState('idle');
    const url = new URL(location.href);
    url.searchParams.delete('g');
    history.replaceState(null, '', url);
  };

  const message = state === 'scanning' ? 'Arahkan kamera ke QR tamu.'
    : state === 'loading' ? 'Memeriksa data tamu…'
    : state === 'ready' ? 'Pastikan nama tamu sudah benar sebelum mencatat kehadiran.'
    : state === 'saving' ? 'Menyimpan check-in…'
    : state === 'ok' ? 'Check-in tercatat. Selamat datang!'
    : state === 'missing' ? 'Kode tamu tidak ditemukan atau token undangan salah.'
    : state === 'err' ? error || 'Gagal memproses QR. Coba lagi.'
    : 'Scan QR dari kamera atau unggah fotonya dari galeri.';

  const actionStyle = { width: '100%', minHeight: 46, padding: '13px 18px', border: 0, borderRadius: 999, background: '#FFF9EF', color: '#3E352C', font: '600 12px/1 system-ui', cursor: 'pointer' } as const;
  const outlineStyle = { ...actionStyle, background: 'transparent', color: '#FFF9EF', border: '1px solid rgba(255,249,239,.38)' } as const;

  return (
    <main className="app-min-screen" style={{ display: 'grid', placeItems: 'center', background: '#686F4D', color: '#FFF9EF', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>
      <div style={{ boxSizing: 'border-box', width: '100%', maxWidth: 410, padding: '30px 24px', border: '1px solid rgba(255,249,239,.28)', borderRadius: 22, background: 'rgba(74,83,67,.42)', boxShadow: '0 24px 70px rgba(34,38,29,.2)' }}>
        <div style={{ font: '500 10px/1 system-ui', letterSpacing: '.3em', textTransform: 'uppercase', color: '#D8B873' }}>Check-in</div>
        <h1 style={{ margin: '17px 0 8px', fontSize: name ? 32 : 27, fontWeight: 500, textTransform: 'capitalize' }}>{name || (state === 'scanning' ? 'Scan QR tamu' : 'Meja penerima tamu')}</h1>
        <p role={state === 'err' || state === 'missing' ? 'alert' : 'status'} style={{ margin: '0 auto', opacity: .82, fontSize: 14, lineHeight: 1.65 }}>{message}</p>

        {state === 'scanning' && (
          <div style={{ position: 'relative', marginTop: 20, overflow: 'hidden', aspectRatio: '1 / 1', borderRadius: 18, background: '#292D24' }}>
            <video ref={videoRef} muted playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden="true" style={{ position: 'absolute', inset: '15%', border: '2px solid #D8B873', borderRadius: 16, boxShadow: '0 0 0 999px rgba(0,0,0,.22)' }} />
          </div>
        )}

        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          {state === 'idle' && <button type="button" onClick={startCamera} style={actionStyle}>Scan QR dengan kamera</button>}
          {state === 'ready' && <button type="button" onClick={confirm} style={actionStyle}>Konfirmasi check-in</button>}
          {state === 'scanning' && <button type="button" onClick={reset} style={outlineStyle}>Batalkan kamera</button>}
          {(state === 'ok' || state === 'missing') && <button type="button" onClick={startCamera} style={actionStyle}>Scan tamu berikutnya</button>}
          {state === 'err' && <button type="button" onClick={startCamera} style={actionStyle}>Coba kamera lagi</button>}
          {state !== 'ready' && state !== 'saving' && state !== 'loading' && state !== 'scanning' && (
            <label style={{ ...outlineStyle, position: 'relative', boxSizing: 'border-box', display: 'grid', placeItems: 'center' }}>
              Unggah foto QR
              <input type="file" accept="image/*" onChange={scanImage} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
            </label>
          )}
          {(state === 'ready' || state === 'err') && code && <button type="button" onClick={reset} style={outlineStyle}>Kembali ke scanner</button>}
        </div>
      </div>
    </main>
  );
}
