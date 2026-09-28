import { DEFAULT_CONFIG } from '../config/invitation';
import type { WeddingConfig } from '../types';

export function waInviteText(guestName: string, link: string, c: WeddingConfig = DEFAULT_CONFIG) {
  return [
    'Kepada Yth.',
    'Bapak/Ibu/Saudara/I',
    (guestName || 'Bapak/Ibu/Saudara/i'),
    '',
    'Assalamualaikum Wr. Wb.',
    'Tanpa mengurangi rasa hormat, perkenankan kami mengundang Bapak/Ibu/Saudara/i untuk dapat hadir, dan memberikan doa restu pada acara pernikahan:',
    '',
    '💍 ' + c.groomFull + ' & ' + c.brideFull,
    '',
    'Yang insya Allah akan dilangsungkan pada : ',
    '🗓️ Tanggal : ' + c.dateLabel,
    '🕗 Pukul : 09:00 WIB - Selesai',
    '📍 Lokasi : ' + c.venue + ', ' + c.city,
    '',
    'Info lengkap dari acara, bisa kunjungi:',
    link,
    '',
    'Suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i beserta keluarga berkenan untuk dapat hadir dan memberikan doa restu kepada kami, dan kami ucapkan Terima Kasih.',
    '',
    'Hormat kami,',
    c.groomFull + ', ' + c.brideFull + ' & Keluarga 🤍',
    '',
  ].join('\n');
}

/**
 * Any of 08xx, 8xx, +62 8xx, 0812-3456-7890 -> 628xx.
 *
 * The bare `8xx` case also handles imported numeric data where the leading zero
 * was lost, so it is treated as an Indonesian number missing its 0.
 */
export function waNumber(phone: string | number | null | undefined) {
  const p = String(phone ?? '').replace(/[^0-9]/g, '');
  if (!p) return '';
  if (p.startsWith('62')) return p;
  if (p.startsWith('0')) return '62' + p.slice(1);
  if (p.startsWith('8')) return '62' + p;
  return p;
}

/** Indonesian WhatsApp number after normalisation: 62 followed by 8–13 digits. */
export function isValidWaNumber(phone: string | number | null | undefined) {
  return /^62\d{8,13}$/.test(waNumber(phone));
}

export function waLink(phone: string | number | null | undefined, text: string) {
  return 'https://wa.me/' + waNumber(phone) + '?text=' + encodeURIComponent(text);
}

/** Ping the couple when an RSVP lands (opens WA on the guest's device is intrusive —
    this variant is meant for the dashboard's "kabari" button). */
