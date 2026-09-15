# Undangan Pernikahan

Vite + React SPA, Vercel Functions sebagai proxy/session, dan data di Google Sheets lewat Apps Script.
Desain: **Blossom Garden** + **Studio Undangan** dari Claude Design (handoff).

Dokumentasi audit desain, fitur, arsitektur, keamanan, roadmap, dan QA tersedia di [`docs/`](docs/README.md).

## Jalankan
```bash
cd app
cp .env.example .env      # isi server credential; jangan gunakan prefix VITE_
npm install
npm run dev               # review UI; gunakan VITE_DEMO_MODE=true
npm run dev:full          # full-stack: Vite + /api auth/proxy melalui Vercel CLI
```
`npm run dev` memang tidak menjalankan route server `/api/*`. Untuk login lokal,
Dashboard, Studio, check-in, dan Sheets gunakan `npm run dev:full`. Panduan lengkap
ada di [migrasi keamanan](docs/security-deployment.md).

## Konten asli vs konten contoh
Yang ada di repo ini **konten contoh** (Pablo & Ave) — nama, tanggal, alamat, dan
nomor rekening asli tidak pernah ikut ter-commit.

```bash
cp src/config/invitation.local.example.ts src/config/invitation.local.ts   # lalu isi data asli
```
`src/config/invitation.local.ts` ada di `.gitignore`, hanya dibaca `npm run dev`,
dan hanya menimpa kunci yang diisi. Untuk undangan yang tayang, data asli
dimasukkan lewat `/studio` → **Terbitkan** (tersimpan di tab `Config` di Sheets),
bukan lewat berkas ini.

## Rute
| Rute | Isi |
| --- | --- |
| `/` | Undangan. `?to=budi-santoso-48271935` → token diverifikasi, lalu sapaan exact dari Sheets |
| `/studio` | Atur isi & gambar, pratinjau, dan **Terbitkan** (session admin) |
| `/dashboard` | Rekap RSVP, tamu, WhatsApp, QR, moderasi, CSV (session admin) |
| `/checkin` | Scanner QR hari H (kamera/unggah foto); session admin/petugas diwajibkan |
| `/?preview=1` | Undangan yang mengikuti draf Studio (dipakai iframe pratinjau) |

## Struktur
| Path | Isi |
| --- | --- |
| `src/pages/Invitation.tsx` | Port penuh Blossom Garden v2: sampul amplop, nama per huruf, pita berjalan, countdown, love story berpita, peta, RSVP (maks. 2 tamu), ucapan, amplop digital, dock, musik, kelopak |
| `src/pages/Studio.tsx` | Port Studio Undangan: tab Konten & Aset gambar, pratinjau, Salin JSON, Reset, Terbitkan |
| `src/styles/blossom.css` | Keyframes & animasi scroll (`animation-timeline: view()`), dengan fallback & reduced-motion |
| `src/config/invitation.ts` | Konten contoh (bentuk sama dengan JSON dari Studio) + penggabungan override lokal |
| `src/config/invitation.local.ts` | Konten asli, **gitignored**, hanya untuk `npm run dev` (contoh: `invitation.local.example.ts`) |
| `src/config/slots.ts` | Semua posisi ornamen/foto + gambar bawaannya |
| `src/config/copy.ts` | Teks ID / EN |
| `src/config/fonts.ts` | Pilihan huruf judul (script) & teks; `public/fonts/` untuk font berlisensi sendiri |
| `src/lib/config.ts` | Konten terbit (Sheets) vs draf (Studio) vs bawaan |
| `src/lib/music.ts` | Musik: file .mp3, YouTube tersembunyi, atau nada lembut bawaan |
| `src/lib/sheets.ts` | Klien same-origin `/api/public` dan `/api/admin`; tidak memiliki secret |
| `api/` + `server/` | Vercel Functions, session/CSRF, validation, rate limit, proxy Apps Script |
| `src/lib/upload.ts` | Upload gambar Studio melalui authenticated proxy ke Google Drive |
| `public/assets/` | Ornamen WebP. `r1-*` mawar jingga, `r5-*` mawar & daun cokelat, `r4-*` kuning lembut, `r3-*` peony merah muda, `petal-*` kelopak — dipotong dari set referensi; `rose-*`/`bloom-*` = set lama. Semua bisa dipilih lewat **Koleksi** di Studio |
| `apps-script/Code.gs` | Backend Sheets — ikuti komentar di atas berkas |

## Alur konten
1. Buka `/studio`, ubah teks / unggah gambar per posisi → tersimpan sebagai **draf** di browser itu dan langsung tampil di pratinjau.
2. Tekan **Terbitkan** → draf ditulis ke tab `Config` di Sheets → tamu melihat versi baru.
3. Tanpa Sheets: **Salin JSON** lalu tempel ke `src/config/invitation.local.ts` (data asli, tidak ikut ter-commit).

Ornamen sudut sampul & hero cukup satu gambar (versi pojok kanan bawah); undangan mencerminkannya ke keempat sudut.

Foto kosong tidak menampilkan placeholder ke tamu: foto bulat di sampul memakai monogram
dan foto mempelai memakai inisial. Background memakai cream bertekstur, ivory, sage,
taupe, dan aksen gold sesuai tema Ivory Blossom Garden.

## Fitur & statusnya
- [x] Port penuh visual + animasi Blossom Garden v2
- [x] Studio: edit konten, unggah aset per posisi, pratinjau langsung, terbitkan ke Sheets
- [x] Link per tamu `?to=slug-token8digit` + verifikasi token + sapaan personal
- [x] RSVP ke Sheets (+ QR check-in pribadi untuk tamu yang hadir)
- [x] Ucapan langsung tampil publik; dashboard dapat menyembunyikan atau menampilkan kembali
- [x] Rekap RSVP, daftar tamu, export CSV, QR check-in hari H
- [x] Kirim undangan via WhatsApp per tamu
- [x] Bahasa ID / EN, musik latar, tampilan desktop (kolom HP di tengah)
- [ ] Multi-template (`template: 'blossom' | 'ivory' | 'modern'`)
- [ ] Domain (menyusul)

## Deploy
Vercel > Import repo > Root directory `app` > server env vars dari `.env.example`.
`vercel.json` sudah mengarahkan semua rute ke `index.html`.
Setelah mengubah `apps-script/Code.gs`: Deploy > Manage deployments > Edit > New version.

Credential Apps Script, password hash, dan session secret tidak boleh memakai prefix `VITE_` karena prefix tersebut membuat nilai masuk ke bundle browser. Ikuti urutan di [docs/security-deployment.md](docs/security-deployment.md).
