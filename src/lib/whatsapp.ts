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

export function waLink(phone: string, text: string) {
  const p = phone.replace(/[^0-9]/g, '').replace(/^0/, '62');
  return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text);
}

/** Ping the couple when an RSVP lands (opens WA on the guest's device is intrusive —
    this variant is meant for the dashboard's "kabari" button). */
export function notifyCouple(text: string) {
  return waLink(import.meta.env.VITE_WA_NUMBER as string, text);
}
