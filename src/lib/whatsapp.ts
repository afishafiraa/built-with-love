import { DEFAULT_CONFIG } from '../config/invitation';
import type { WeddingConfig } from '../types';

export function waInviteText(guestName: string, link: string, c: WeddingConfig = DEFAULT_CONFIG) {
  return [
    'Assalamualaikum Wr. Wb.',
    '',
    'Yth. ' + (guestName || 'Bapak/Ibu/Saudara/i'),
    '',
    'Tanpa mengurangi rasa hormat, kami mengundang Anda untuk hadir di acara pernikahan kami:',
    '',
    c.groomFull + ' & ' + c.brideFull,
    c.dateLabel,
    c.venue + ', ' + c.city,
    '',
    'Undangan lengkap:',
    link,
    '',
    'Merupakan kebahagiaan bagi kami apabila Anda berkenan hadir.',
    'Terima kasih.'
  ].join('\n');
}

/**
 * Any of 08xx, 8xx, +62 8xx, 0812-3456-7890 -> 628xx.
 *
 * The bare `8xx` case is not hypothetical: Sheets parses a phone typed as
 * 085740894090 into the number 85740894090 and the leading zero is gone for good,
 * so a number starting with 8 is treated as an Indonesian one missing its 0.
 */
export function waNumber(phone: string | number | null | undefined) {
  const p = String(phone ?? '').replace(/[^0-9]/g, '');
  if (!p) return '';
  if (p.startsWith('62')) return p;
  if (p.startsWith('0')) return '62' + p.slice(1);
  if (p.startsWith('8')) return '62' + p;
  return p;
}

export function waLink(phone: string | number | null | undefined, text: string) {
  return 'https://wa.me/' + waNumber(phone) + '?text=' + encodeURIComponent(text);
}

/** Ping the couple when an RSVP lands (opens WA on the guest's device is intrusive —
    this variant is meant for the dashboard's "kabari" button). */
export function notifyCouple(text: string) {
  return waLink(import.meta.env.VITE_WA_NUMBER as string, text);
}
