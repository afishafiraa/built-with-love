/* Every ornament / photo position in the Blossom invitation, grouped the way
   the Studio shows them. `slot` is the key in `config.assets`. */
type SlotKind = 'orn' | 'photo' | 'petal';
export interface SlotDef { slot: string; label: string; kind: SlotKind; ratio: string }

const A = '/assets/';

/** Default artwork per slot — shown until another image is chosen in the Studio.
    Corner pieces are drawn for the bottom-right corner; the page mirrors them
    for the other corners so every corner is the same bouquet. */
export const SLOT_SRC: Record<string, string> = {
  'v-hero-curtains': A + 'ivory-garden/hero-curtains-v2.webp',
  'v-hero-trees': A + 'ivory-garden/garden-trees-v1.png',
  'v-hero-side-garden': A + 'ivory-garden/garden-side-cluster-v1.png',
  'v-hero-grass-carpet': A + 'ivory-garden/grass-carpet-v1.webp',
  'v-hero-shrubs': A + 'ivory-garden/garden-shrubs-v1.webp',
  'v-couple-illustration': A + 'ivory-garden/couple-clean-v2.webp',
  'v-groom-illustration': A + 'ivory-garden/groom-portrait-v2.webp',
  'v-bride-illustration': A + 'ivory-garden/bride-portrait-v2.webp',
  'v-envelope-closed': A + 'ivory-garden/envelope-closed.webp',
  'v-envelope-open': A + 'ivory-garden/envelope-open.webp',
  'ig-scallop-frame': A + 'ivory-garden/scallop-frame.webp',
  'ig-bouquet': A + 'ivory-garden/bouquet.webp',
  'ig-urn': A + 'ivory-garden/urn.webp',
  'ig-rose': A + 'ivory-garden/rose.webp',
  'ig-floral-swag': A + 'ivory-garden/floral-swag.webp',
  'ig-lavender': A + 'ivory-garden/lavender.webp',
  'ig-butterfly-garden': A + 'ivory-garden/butterfly-garden.webp',
  'orn-cover-ring': A + 'mix-wreath.webp',
  'orn-cover-corner': A + 'mix-corner.webp',
  'orn-hero-ring': A + 'mix-wreath.webp',
  'orn-hero-corner': A + 'mix-corner.webp',
  'orn-seam': A + 'mix-seam.webp',
  'orn-ticker-a': A + 'wf-1.webp',
  'orn-ticker-b': A + 'wf-2.webp',
  'orn-quote-top': A + 'mix-arch.webp',
  'orn-groom-top': A + 'r4-spray.webp',
  'orn-divider': A + 'mix-divider.webp',
  'orn-bride-top': A + 'r4-spray.webp',
  'orn-acara-ring': A + 'mix-wreath.webp',
  'orn-story-1': A + 'w-blossom.webp',
  'orn-story-2': A + 'wf-1.webp',
  'orn-story-3': A + 'r1-cluster.webp',
  'orn-story-4': A + 'w-rose.webp',
  'orn-rsvp-done': A + 'w-bouquet.webp',
  'orn-amplop': A + 'mix-arch.webp',
  'orn-gift-1': A + 'w-cluster.webp',
  'orn-gift-2': A + 'r1-bouquet.webp',
  'orn-gift-3': A + 'w-bouquet.webp',
  'orn-penutup-l': A + 'mix-corner.webp',
  'v-monogram': A + 'monogram-ha.webp',
  'petal-a': A + 'petal-w1.webp',
  'petal-b': A + 'petal-w2.webp',
  'petal-c': A + 'petal-w3.webp',
  'petal-d': A + 'petal-w4.webp',
  'petal-e': A + 'petal-w2.webp'
};

/** Built-in artwork the Studio offers per slot ("Koleksi"), grouped by source set. */
export const LIBRARY: { group: string; items: { src: string; label: string }[] }[] = [
  { group: 'Campuran putih & peach', items: [
    { src: A + 'mix-corner.webp', label: 'Sudut' }, { src: A + 'mix-seam.webp', label: 'Sambungan' },
    { src: A + 'mix-seam2.webp', label: 'Sambungan 2' }, { src: A + 'mix-arch.webp', label: 'Lengkung' },
    { src: A + 'mix-divider.webp', label: 'Pembatas' }, { src: A + 'mix-wreath.webp', label: 'Lingkaran' }
  ] },
  { group: 'Bunga putih', items: [
    { src: A + 'w-rose.webp', label: 'Mawar' }, { src: A + 'w-cluster.webp', label: 'Rangkaian' },
    { src: A + 'w-bouquet.webp', label: 'Buket' }, { src: A + 'w-blossom.webp', label: 'Ranting' },
    ...[1, 2, 3, 4].map(n => ({ src: A + 'wf-' + n + '.webp', label: 'Bunga ' + n }))
  ] },
  { group: 'Mawar jingga', items: [
    { src: A + 'r1-corner.webp', label: 'Sudut' }, { src: A + 'r1-arch.webp', label: 'Lengkung' },
    { src: A + 'r1-bouquet.webp', label: 'Buket' }, { src: A + 'r1-cluster.webp', label: 'Rangkaian' },
    { src: A + 'r1-wreath.webp', label: 'Lingkaran' }
  ] },
  { group: 'Mawar & daun cokelat', items: [
    { src: A + 'r5-corner.webp', label: 'Sudut' }, { src: A + 'r5-swag.webp', label: 'Memanjang' },
    { src: A + 'r5-crescent.webp', label: 'Sabit' }, { src: A + 'r5-cluster.webp', label: 'Rangkaian' }
  ] },
  { group: 'Kuning lembut', items: [
    { src: A + 'r4-swag.webp', label: 'Memanjang' }, { src: A + 'r4-spray.webp', label: 'Tegak' },
    { src: A + 'r4-cluster.webp', label: 'Rangkaian' }
  ] },
  { group: 'Peony merah muda', items: [
    { src: A + 'r3-bouquet.webp', label: 'Buket' }, { src: A + 'r3-cluster.webp', label: 'Rangkaian' },
    { src: A + 'r3-garland.webp', label: 'Untaian' }
  ] },
  { group: 'Kelopak', items: [
    ...[1, 2, 3, 4].map(n => ({ src: A + 'petal-w' + n + '.webp', label: 'Putih ' + n })),
    ...[1, 2, 3, 4, 5, 6].map(n => ({ src: A + 'petal-' + n + '.webp', label: 'Warna ' + n }))
  ] },
  { group: 'Set lama', items: [
    { src: A + 'rose-1.webp', label: 'Mawar 1' }, { src: A + 'rose-2.webp', label: 'Mawar 2' },
    { src: A + 'rose-3.webp', label: 'Mawar 3' }, { src: A + 'rose-4.webp', label: 'Mawar 4' },
    { src: A + 'bloom-1.webp', label: 'Bunga 1' }, { src: A + 'bloom-3.webp', label: 'Bunga 3' },
    { src: A + 'bloom-4.webp', label: 'Bunga 4' }
  ] }
];

export const RIBBON = A + 'red-thread.webp';

/* Centre line of the red thread (px offset from the image centre, every 10px of
   its 980px design height) — the chapter knots sit on the thread itself. */
export const THREAD_X: (number | null)[] = [null, null, -26.0, -24.5, -22.0, -18.5, -14.5, -10.0, -6.0, -2.0, 2.0, 5.0, 3.0, 5.0, 0.5, -4.0, -8.5, -12.5, -16.0, -18.5, -20.0, -20.5, -20.0, -18.5, -16.5, -14.8, -13.0, -11.2, -10.0, -8.8, -8.0, -7.5, -7.2, -6.2, -5.2, -4.2, -3.2, -2.8, -1.8, -1.2, -0.8, -0.2, 0.2, 0.2, 0.5, 0.2, 0.2, 0.2, -0.2, -0.8, -1.2, -2.2, -3.2, -4.2, -5.8, -7.0, -8.5, -10.2, -12.0, -13.8, -15.8, -17.8, -19.8, -22.0, -24.0, -25.8, -27.5, -29.0, -30.5, -31.8, -32.8, -33.8, -34.2, -34.8, -34.8, -34.8, -34.2, -33.8, -33.0, -32.2, -31.0, -30.0, -28.5, -27.0, -25.5, -24.2, -23.0, -21.8, -20.5, -19.5, -18.8, -17.8, -17.8, -17.2, -17.5, null, null, null];
export const THREAD = { width: 180, height: 980, top: 140, row: 210 };

export const SLOTS: { group: string; items: SlotDef[] }[] = [
  { group: 'Ivory Garden Pavilion', items: [
    { slot: 'v-hero-curtains', label: 'Tirai ivory transparan', kind: 'orn', ratio: '2/3' },
    { slot: 'v-hero-trees', label: 'Pohon watercolor transparan', kind: 'orn', ratio: '3/2' },
    { slot: 'v-hero-side-garden', label: 'Garden bunga sisi curtain', kind: 'orn', ratio: '2/3' },
    { slot: 'v-hero-grass-carpet', label: 'Karpet rumput watercolor', kind: 'orn', ratio: '2/1' },
    { slot: 'v-hero-shrubs', label: 'Semak watercolor', kind: 'orn', ratio: '3/1' },
    { slot: 'v-couple-illustration', label: 'Ilustrasi pasangan', kind: 'photo', ratio: '2/3' },
    { slot: 'v-groom-illustration', label: 'Portrait wajah mempelai pria', kind: 'photo', ratio: '1/1' },
    { slot: 'v-bride-illustration', label: 'Portrait wajah mempelai wanita', kind: 'photo', ratio: '1/1' },
    { slot: 'v-envelope-closed', label: 'Amplop tertutup', kind: 'orn', ratio: '15/14' },
    { slot: 'v-envelope-open', label: 'Amplop terbuka', kind: 'orn', ratio: '10/9' },
    { slot: 'ig-scallop-frame', label: 'Bingkai watercolor scallop', kind: 'orn', ratio: '4/5' },
    { slot: 'ig-bouquet', label: 'Buket ivory', kind: 'orn', ratio: '1/1' },
    { slot: 'ig-urn', label: 'Standing flower', kind: 'orn', ratio: '3/4' },
    { slot: 'ig-rose', label: 'Mawar ivory', kind: 'orn', ratio: '1/1' },
    { slot: 'ig-floral-swag', label: 'Untaian bunga blush', kind: 'orn', ratio: '2/1' },
    { slot: 'ig-lavender', label: 'Rumpun lavender blush', kind: 'orn', ratio: '5/4' },
    { slot: 'ig-butterfly-garden', label: 'Bunga & kupu-kupu', kind: 'orn', ratio: '5/4' }
  ] },
  { group: 'Sampul (cover)', items: [
    { slot: 'v-cover-round', label: 'Foto bulat tengah (opsional)', kind: 'photo', ratio: '1/1' },
    { slot: 'orn-cover-ring', label: 'Lingkaran bunga di belakang foto', kind: 'orn', ratio: '1/1' },
    { slot: 'orn-cover-corner', label: 'Sudut — dipakai di 4 sudut (dicerminkan)', kind: 'orn', ratio: '5/4' }
  ] },
  { group: 'Hero (halaman pembuka)', items: [
    { slot: 'v-hero', label: 'Foto latar hero', kind: 'photo', ratio: '3/4' },
    { slot: 'orn-hero-ring', label: 'Lingkaran di belakang nama', kind: 'orn', ratio: '1/1' },
    { slot: 'orn-hero-corner', label: 'Sudut — dipakai di 4 sudut (dicerminkan)', kind: 'orn', ratio: '5/4' }
  ] },
  { group: 'Sambungan antar bagian', items: [
    { slot: 'orn-seam', label: 'Buket sambungan — sisi kiri, dicerminkan ke kanan (dipakai di perpindahan besar saja)', kind: 'orn', ratio: '3/2' }
  ] },
  { group: 'Pita berjalan & kutipan', items: [
    { slot: 'orn-ticker-a', label: 'Ikon pita berjalan 1', kind: 'orn', ratio: '1/1' },
    { slot: 'orn-ticker-b', label: 'Ikon pita berjalan 2', kind: 'orn', ratio: '1/1' },
    { slot: 'orn-quote-top', label: 'Ornamen atas kutipan', kind: 'orn', ratio: '3/2' }
  ] },
  { group: 'Mempelai', items: [
    { slot: 'v-groom', label: 'Foto mempelai pria', kind: 'photo', ratio: '1/1' },
    { slot: 'v-bride', label: 'Foto mempelai wanita', kind: 'photo', ratio: '1/1' },
    { slot: 'orn-groom-top', label: 'Ornamen atas kartu pria', kind: 'orn', ratio: '1/1' },
    { slot: 'orn-divider', label: 'Pembatas antar mempelai', kind: 'orn', ratio: '3/1' },
    { slot: 'orn-bride-top', label: 'Ornamen atas kartu wanita', kind: 'orn', ratio: '1/1' }
  ] },
  { group: 'Acara', items: [
    { slot: 'orn-acara-ring', label: 'Lingkaran di atas countdown', kind: 'orn', ratio: '1/1' }
  ] },
  { group: 'Love story', items: [
    { slot: 'orn-story-1', label: 'Ornamen babak 1', kind: 'orn', ratio: '3/2' },
    { slot: 'orn-story-2', label: 'Ornamen babak 2', kind: 'orn', ratio: '3/2' },
    { slot: 'orn-story-3', label: 'Ornamen babak 3', kind: 'orn', ratio: '3/2' },
    { slot: 'orn-story-4', label: 'Ornamen babak 4', kind: 'orn', ratio: '3/2' }
  ] },
  { group: 'RSVP', items: [
    { slot: 'orn-rsvp-done', label: 'Ornamen kartu terima kasih', kind: 'orn', ratio: '1/1' }
  ] },
  { group: 'Amplop digital', items: [
    { slot: 'orn-amplop', label: 'Ornamen atas amplop', kind: 'orn', ratio: '3/2' },
    { slot: 'orn-gift-1', label: 'Ornamen kartu bank 1', kind: 'orn', ratio: '1/1' },
    { slot: 'orn-gift-2', label: 'Ornamen kartu bank 2', kind: 'orn', ratio: '1/1' },
    { slot: 'orn-gift-3', label: 'Ornamen kartu alamat', kind: 'orn', ratio: '1/1' }
  ] },
  { group: 'Penutup', items: [
    { slot: 'orn-penutup-l', label: 'Sudut bawah — kiri & kanan (dicerminkan)', kind: 'orn', ratio: '5/4' },
    { slot: 'v-monogram', label: 'Monogram / logo', kind: 'orn', ratio: '1/1' }
  ] },
  { group: 'Kelopak berjatuhan', items: [
    { slot: 'petal-a', label: 'Kelopak 1', kind: 'petal', ratio: '1/1' },
    { slot: 'petal-b', label: 'Kelopak 2', kind: 'petal', ratio: '1/1' },
    { slot: 'petal-c', label: 'Kelopak 3', kind: 'petal', ratio: '1/1' },
    { slot: 'petal-d', label: 'Kelopak 4', kind: 'petal', ratio: '1/1' },
    { slot: 'petal-e', label: 'Kelopak 5', kind: 'petal', ratio: '1/1' }
  ] }
];

/** Uploaded image for a slot, else its default artwork ('' for empty photo slots). */
export function slotSrc(assets: Record<string, string>, slot: string): string {
  return (assets && assets[slot]) || SLOT_SRC[slot] || '';
}
