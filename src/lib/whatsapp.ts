import { DEFAULT_CONFIG } from '../config/invitation';
import type { Lang, WeddingConfig } from '../types';
import { formatInvitationMessage } from './whatsapp-message';
import { whatsappMessageUrl } from './whatsapp-url';
import type { WhatsAppTarget } from './whatsapp-url';
export { whatsAppTarget } from './whatsapp-url';
import { waNumber } from './phone';
export { waNumber, isValidWaNumber } from './phone';

export function waInviteText(guestName: string, link: string, c: WeddingConfig = DEFAULT_CONFIG, lang: Lang = 'id') {
  return formatInvitationMessage(guestName, link, c, lang);
}

export function waLink(phone: string | number | null | undefined, text: string, target: WhatsAppTarget = 'app') {
  return whatsappMessageUrl(waNumber(phone), text, target);
}

/** Ping the couple when an RSVP lands (opens WA on the guest's device is intrusive —
    this variant is meant for the dashboard's "kabari" button). */
