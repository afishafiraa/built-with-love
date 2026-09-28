import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="app-min-screen" style={{ display: 'grid', placeItems: 'center', padding: 24, background: '#F3EADB', color: '#3E352C', fontFamily: "'Quicksand', system-ui, sans-serif", textAlign: 'center' }}>
      <div style={{ boxSizing: 'border-box', width: '100%', maxWidth: 420, padding: '38px 26px', border: '1px solid rgba(104,111,77,.18)', borderRadius: 24, background: '#FFF9EF', boxShadow: '0 24px 70px rgba(62,53,44,.12)' }}>
        <div style={{ color: '#C9A15D', fontSize: 12, fontWeight: 700, letterSpacing: '.24em' }}>404</div>
        <h1 style={{ margin: '12px 0 8px', font: "400 42px/1.1 'Cookie', cursive" }}>Halaman tidak ditemukan</h1>
        <p style={{ margin: '0 auto', maxWidth: 320, fontSize: 14, lineHeight: 1.7, opacity: .72 }}>Tautan ini mungkin tidak lengkap atau sudah berubah. Kembali ke halaman utama undangan.</p>
        <Link to="/" style={{ display: 'inline-grid', placeItems: 'center', minHeight: 44, marginTop: 22, padding: '0 22px', borderRadius: 999, background: '#686F4D', color: '#FFF9EF', textDecoration: 'none', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Kembali ke undangan</Link>
      </div>
    </main>
  );
}
