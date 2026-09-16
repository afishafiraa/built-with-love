import type { WeddingConfig } from '../types';

/* Default content. The live copy is edited in /studio and published to
   Supabase; these values are the fallback (and what "Reset" in Studio returns
   to). A JSON copied from Studio can be pasted here.

   Everything below is placeholder data on purpose — this file is committed, so
   it must never hold real names, addresses or account numbers. Real content
   lives in `invitation.local.ts` (gitignored, local dev only) or Supabase.
   See `invitation.local.example.ts`. */
const TEMPLATE_CONFIG: WeddingConfig = {
  template: "blossom",
  lang: "id",
  groomName: "Pablo",
  brideName: "Ave",
  groomFull: "Pablo Andreas Wijaya",
  brideFull: "Ave Maria Larasati",
  groomParents: "Bapak Ahmad Wijaya & Ibu Siti Aminah",
  brideParents: "Bapak Joko Susilo & Ibu Dewi Lestari",
  dateISO: "2027-06-12T09:00:00+07:00",
  dateLabel: "Sabtu, 12 Juni 2027",
  dateLabelEn: "Saturday, June 12th, 2027",
  akadTime: "08.00 WIB",
  resepsiTime: "11.00 WIB",
  venue: "Gedung Serbaguna Melati",
  city: "Yogyakarta",
  address: "Jl. Mawar No. 10, Yogyakarta, DI Yogyakarta",
  mapsQuery: "Gedung Serbaguna Melati, Yogyakarta",
  story1Year: "2018",
  story1Title: "Pertemuan Pertama",
  story1Body: "Satu proyek kampus, dua orang yang belum tahu ini awal dari segalanya.",
  story1TitleEn: "",
  story1BodyEn: "",
  story2Year: "2021",
  story2Title: "Melangkah Bersama",
  story2Body: "Dua kota mengajarkan kami arti menunggu dan memilih dengan sadar.",
  story2TitleEn: "",
  story2BodyEn: "",
  story3Year: "2026",
  story3Title: "Lamaran",
  story3Body: "Di halaman rumah yang penuh bunga, satu pertanyaan dijawab dengan satu kata.",
  story3TitleEn: "",
  story3BodyEn: "",
  story4Year: "2027",
  story4Title: "Hari Bahagia",
  story4Body: "Pita yang sama, kini mengikat dua keluarga menjadi satu.",
  story4TitleEn: "",
  story4BodyEn: "",
  bank1Name: "Bank Mandiri",
  bank1Acct: "1234 5678 9012",
  bank1Holder: "Pablo Andreas Wijaya",
  bank2Name: "Bank BCA",
  bank2Acct: "0987 654 321",
  bank2Holder: "Ave Maria Larasati",
  giftAddressLabel: "Kirim Hadiah",
  giftAddress: "Ave Maria Larasati.\nJl. Mawar No. 10, RT 01 RW 02, Sleman, Yogyakarta. 55281",
  giftAddressHolder: "Ave · 0812 3456 7890",
  musicUrl: "",
  musicTitle: "",
  displayFont: "Cookie",
  bodyFont: "Quicksand",
  hashtag: "#PabloAveWedding",
  groomInstagram: "",
  brideInstagram: "",
  assets: {}
};

/* Optional local override: `src/config/invitation.local.ts`, gitignored so the
   real content never reaches the repo. A glob (not a static import) is used
   because the file is absent on CI/Vercel — an unmatched glob is simply `{}`.
   Gated on DEV so a production bundle is built from the placeholders only. */
const localModules = import.meta.glob<{ default?: Partial<WeddingConfig> }>(
  './invitation.local.ts',
  { eager: true }
);
const LOCAL_OVERRIDES = import.meta.env.DEV
  ? Object.values(localModules)[0]?.default
  : undefined;

function merge(base: WeddingConfig, partial: Partial<WeddingConfig> | null | undefined): WeddingConfig {
  const out: WeddingConfig = { ...base, assets: { ...base.assets } };
  if (!partial || typeof partial !== 'object') return out;
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined || v === null) continue;
    if (k === 'assets') { if (typeof v === 'object') out.assets = { ...(v as Record<string, string>) }; continue; }
    if (k in base) (out as unknown as Record<string, unknown>)[k] = v;
  }
  /* The visual system now uses one friendly handwriting face and one rounded
     text face. Migrate previously published font values automatically so an
     an older Studio setting cannot silently restore the formal typography. */
  if (out.displayFont !== 'custom') out.displayFont = 'Cookie';
  out.bodyFont = 'Quicksand';
  // The cover is now intentionally colour + gilding only. Discard the legacy
  // full-bleed photo slot so old published drafts cannot bring it back.
  delete out.assets['v-cover'];
  return out;
}

export const DEFAULT_CONFIG: WeddingConfig = merge(TEMPLATE_CONFIG, LOCAL_OVERRIDES);

/** Merge a partial (from Supabase, localStorage or pasted JSON) over the defaults. */
export function mergeConfig(partial: Partial<WeddingConfig> | null | undefined): WeddingConfig {
  return merge(DEFAULT_CONFIG, partial);
}
