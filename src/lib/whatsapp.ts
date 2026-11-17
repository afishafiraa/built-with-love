import { DEFAULT_CONFIG } from '../config/invitation';
import type { Lang, WeddingConfig } from '../types';
import { formatInvitationMessage } from './whatsapp-message';
import { whatsappMessageUrl } from './whatsapp-url';
import type { WhatsAppTarget } from './whatsapp-url';
export { whatsAppTarget } from './whatsapp-url';

export function waInviteText(guestName: string, link: string, c: WeddingConfig = DEFAULT_CONFIG, lang: Lang = 'id') {
  return formatInvitationMessage(guestName, link, c, lang);
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

export function waLink(phone: string | number | null | undefined, text: string, target: WhatsAppTarget = 'app') {
  return whatsappMessageUrl(waNumber(phone), text, target);
}

/** Ping the couple when an RSVP lands (opens WA on the guest's device is intrusive —
    this variant is meant for the dashboard's "kabari" button). */
