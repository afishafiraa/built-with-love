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
- `CRON_SECRET` (minimal 32 karakter acak; dikirim otomatis oleh Vercel Cron)

Opsional: `KEEPALIVE_SECRET` hanya diperlukan jika endpoint keep-alive juga akan
dipanggil dari VPS.

Browser-visible, opsional: `VITE_DEMO_MODE=true` hanya untuk demo visual lokal; hapus atau set `false` di production.

Jangan pernah memberi prefix `VITE_` pada credential server. Detail setup dan smoke test ada di [konfigurasi production](docs/production-configuration.md).

Untuk memakai password admin pilihan sendiri, jalankan `npm run security:set-password`, lalu salin hash yang dihasilkan ke `ADMIN_PASSWORD_HASH`. Password asli tidak disimpan di source code atau environment.

## Menjaga Supabase Free tetap aktif

Setelah project di-resume melalui Supabase Dashboard, deploy aplikasi dengan
`CRON_SECRET` yang kuat. Nilai acak dapat dibuat bersama credential lain dengan
`npm run security:generate`. Vercel Cron sudah dijadwalkan melalui `vercel.json`
untuk membaca satu konfigurasi Supabase setiap hari pukul 03:17 UTC. Jangan
menaruh secret di source code, URL, atau environment frontend.

### Cadangan melalui VPS

VPS tidak diperlukan untuk jadwal harian di atas. Jika ingin menjalankan
keep-alive lebih sering dari VPS, tambahkan `KEEPALIVE_SECRET` terpisah di
environment production lalu gunakan konfigurasi berikut.

Di VPS, simpan konfigurasi berikut sebagai `/etc/wedding-invitation/keepalive.env`
dan batasi aksesnya dengan `chmod 600`:

```bash
KEEPALIVE_URL=https://domain-undangan.example
KEEPALIVE_SECRET=nilai-yang-sama-dengan-environment-production
```

Buat `/usr/local/bin/wedding-supabase-keepalive`:

```bash
#!/usr/bin/env bash
set -euo pipefail
source /etc/wedding-invitation/keepalive.env
curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer ${KEEPALIVE_SECRET}" \
  "${KEEPALIVE_URL}/api/keep-alive"
```

Setelah file executable dengan `chmod 700`, jalankan sekali untuk memastikan
responsnya `{"ok":true,...}`. Kemudian tambahkan cron berikut melalui
`sudo crontab -e` agar ada aktivitas database tiga kali sehari:

```cron
17 */8 * * * /usr/local/bin/wedding-supabase-keepalive >> /var/log/wedding-supabase-keepalive.log 2>&1
```

Keep-alive mengurangi risiko project Free dipause karena tidak aktif, tetapi
bukan jaminan layanan. Untuk workload production yang harus selalu tersedia,
gunakan plan Supabase yang tidak menerapkan auto-pause.

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
