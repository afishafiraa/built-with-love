# Undangan Pernikahan

Undangan digital React/Vite dengan Vercel Functions sebagai security boundary dan satu project Supabase PostgreSQL + Storage sebagai backend production.

## Menjalankan aplikasi

```bash
cp .env.example .env
npm install
npm run dev:full
```

`npm run dev:full` menjalankan frontend dan `/api/*`, sehingga login, Dashboard, Studio, RSVP, ucapan, upload, dan check-in dapat diuji lokal. `npm run dev` hanya cocok untuk review visual jika `VITE_DEMO_MODE=true`.

## Environment

Server-only, wajib di lokal dan Vercel:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET` (minimal 32 karakter acak)

Browser-visible, opsional: `VITE_DEMO_MODE=true` hanya untuk demo visual lokal; hapus atau set `false` di production.

Jangan pernah memberi prefix `VITE_` pada credential server. Detail setup dan smoke test ada di [konfigurasi production](docs/production-configuration.md).

## Rute

| Rute | Fungsi |
| --- | --- |
| `/?to=slug-token8digit` | Undangan pribadi dengan token tervalidasi |
| `/studio` | Edit, preview, upload aset, dan publish konfigurasi |
| `/dashboard` | Tamu, RSVP, WhatsApp, ucapan, QR, dan CSV |
| `/checkin` | Scan/unggah QR untuk check-in |
| `/?preview=1` | Preview draf Studio |

Rute admin memakai session cookie, CSRF, dan same-origin API. Credential Supabase tidak pernah dikirim ke browser.

## Struktur penting

| Path | Isi |
| --- | --- |
| `src/pages/` | Invitation, Studio, Dashboard, dan CheckIn |
| `src/lib/api.ts` | Client same-origin `/api/public` dan `/api/admin` |
| `api/` + `server/` | Auth, validation, rate limit, dan akses Supabase server-only |
| `src/config/` | Placeholder, teks ID/EN, font, dan slot aset |
| `src/styles/blossom.css` | Layout, tema, motion, fallback browser, dan reduced-motion |
| `supabase/migrations/` | Schema production, RPC, constraint, RLS, dan bucket |
| `public/assets/` | Aset visual yang masih tersedia di Studio |

Data asli dipublish dari `/studio`. Untuk override visual lokal saja, salin `src/config/invitation.local.example.ts` menjadi `src/config/invitation.local.ts`; file tersebut di-ignore Git dan tidak dipakai production.

## Verifikasi sebelum production

```bash
npm run check:database
npm run preflight
```

`preflight` menjalankan lint, typecheck server, pemeriksaan kontrak API, build, dan audit kebocoran credential. Rencana yang belum diterapkan tersedia di [docs](docs/README.md).
