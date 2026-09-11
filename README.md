# Undangan Pernikahan

Vite + React SPA, deploy ke Vercel, data di Google Sheets lewat Apps Script.
Desain: **Blossom Garden** + **Studio Undangan** dari Claude Design (handoff).

## Jalankan
```bash
cd app
cp .env.example .env      # isi endpoint, token, PIN, Cloudinary
npm install
npm run dev               # http://localhost:5173
```
Tanpa `.env` pun jalan (mode demo): undangan pakai konten bawaan dan contoh ucapan,
RSVP/ucapan tidak dikirim ke mana-mana.

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
| `/` | Undangan. `?to=budi-santoso` → sapaan "Budi Santoso" di sampul + nama terisi di RSVP & ucapan |
| `/studio` | Atur isi & gambar undangan, pratinjau HP langsung, tombol **Terbitkan** (PIN) |
| `/dashboard` | Rekap RSVP, daftar tamu, WhatsApp, QR, moderasi ucapan, CSV (PIN) |
| `/checkin?g=<id>` | Endpoint scan QR hari H |
| `/?preview=1` | Undangan yang mengikuti draf Studio (dipakai iframe pratinjau) |

## Struktur
| Path | Isi |
| --- | --- |
| `src/pages/Invitation.tsx` | Port penuh Blossom Garden v2: sampul amplop, nama per huruf, pita berjalan, countdown, love story berpita, peta, RSVP, ucapan, amplop digital, dock, musik, kelopak |
| `src/pages/Studio.tsx` | Port Studio Undangan: tab Konten & Aset gambar, pratinjau, Salin JSON, Reset, Terbitkan |
| `src/styles/blossom.css` | Keyframes & animasi scroll (`animation-timeline: view()`), dengan fallback & reduced-motion |
| `src/config/invitation.ts` | Konten contoh (bentuk sama dengan JSON dari Studio) + penggabungan override lokal |
| `src/config/invitation.local.ts` | Konten asli, **gitignored**, hanya untuk `npm run dev` (contoh: `invitation.local.example.ts`) |
| `src/config/slots.ts` | Semua posisi ornamen/foto + gambar bawaannya |
| `src/config/copy.ts` | Teks ID / EN |
| `src/config/fonts.ts` | Pilihan huruf judul (script) & teks; `public/fonts/` untuk font berlisensi sendiri |
| `src/lib/config.ts` | Konten terbit (Sheets) vs draf (Studio) vs bawaan |
| `src/lib/music.ts` | Musik: file .mp3, YouTube tersembunyi, atau nada lembut bawaan |
| `src/lib/sheets.ts` | Klien Apps Script |
| `src/lib/upload.ts` | Upload gambar Studio ke Cloudinary (unsigned) |
| `public/assets/` | Ornamen WebP. `r1-*` mawar jingga, `r5-*` mawar & daun cokelat, `r4-*` kuning lembut, `r3-*` peony merah muda, `petal-*` kelopak — dipotong dari set referensi; `rose-*`/`bloom-*` = set lama. Semua bisa dipilih lewat **Koleksi** di Studio |
| `apps-script/Code.gs` | Backend Sheets — ikuti komentar di atas berkas |

## Alur konten
1. Buka `/studio`, ubah teks / unggah gambar per posisi → tersimpan sebagai **draf** di browser itu dan langsung tampil di pratinjau.
2. Tekan **Terbitkan** → draf ditulis ke tab `Config` di Sheets → tamu melihat versi baru.
3. Tanpa Sheets: **Salin JSON** lalu tempel ke `src/config/invitation.local.ts` (data asli, tidak ikut ter-commit).

Ornamen sudut sampul & hero cukup satu gambar (versi pojok kanan bawah); undangan mencerminkannya ke keempat sudut.

Foto kosong tidak menampilkan placeholder ke tamu: foto bulat di sampul memakai monogram,
foto mempelai memakai inisial, latar sampul/hero tetap hijau sage.

## Fitur & statusnya
- [x] Port penuh visual + animasi Blossom Garden v2
- [x] Studio: edit konten, unggah aset per posisi, pratinjau langsung, terbitkan ke Sheets
- [x] Link per tamu `?to=` + sapaan personal
- [x] RSVP ke Sheets (+ QR check-in pribadi untuk tamu yang hadir)
- [x] Ucapan ke Sheets, tampil setelah dimoderasi
- [x] Rekap RSVP, daftar tamu, export CSV, QR check-in hari H
- [x] Kirim undangan via WhatsApp per tamu
- [x] Bahasa ID / EN, musik latar, tampilan desktop (kolom HP di tengah)
- [ ] Multi-template (`template: 'blossom' | 'ivory' | 'modern'`)
- [ ] Domain (menyusul)

## Deploy
Vercel > Import repo > Root directory `app` > env vars dari `.env.example`.
`vercel.json` sudah mengarahkan semua rute ke `index.html`.
Setelah mengubah `apps-script/Code.gs`: Deploy > Manage deployments > Edit > New version.

> Catatan keamanan: nilai `VITE_*` ikut terbundel ke browser, jadi PIN dan token Sheets
> bisa dibaca orang yang paham. Cukup untuk undangan, tapi jangan pakai PIN yang sama
> dengan akun penting.
