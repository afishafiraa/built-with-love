export type Template = 'blossom' | 'ivory' | 'modern';
export type Lang = 'id' | 'en';

/**
 * Flat content shape — identical to what the Studio edits and what
 * "Salin JSON" copies, so a JSON export can be pasted straight into
 * `src/config/invitation.ts` or stored in the Sheets `Config` tab.
 */
export interface WeddingConfig {
  template: Template;
  lang: Lang;
  groomName: string; brideName: string;
  groomFull: string; brideFull: string;
  groomParents: string; brideParents: string;
  dateISO: string; dateLabel: string; dateLabelEn: string;
  akadTime: string; resepsiTime: string;
  venue: string; city: string; address: string; mapsQuery: string;
  story1Year: string; story1Title: string; story1Body: string;
  story2Year: string; story2Title: string; story2Body: string;
  story3Year: string; story3Title: string; story3Body: string;
  story4Year: string; story4Title: string; story4Body: string;
  story1TitleEn: string; story1BodyEn: string;
  story2TitleEn: string; story2BodyEn: string;
  story3TitleEn: string; story3BodyEn: string;
  story4TitleEn: string; story4BodyEn: string;
  bank1Name: string; bank1Acct: string; bank1Holder: string;
  bank2Name: string; bank2Acct: string; bank2Holder: string;
  giftAddressLabel: string; giftAddress: string; giftAddressHolder: string;
  musicUrl: string; musicTitle: string;
  /** Script face for headings & names, and the reading face (see src/config/fonts.ts). */
  displayFont: string; bodyFont: string;
  hashtag: string;
  /** Instagram usernames (with or without @) — the button hides when empty. */
  groomInstagram: string; brideInstagram: string;
  /** slot id -> image URL. Empty / missing = the default artwork. */
  assets: Record<string, string>;
}

export interface Guest {
  id: string;          // slug used in ?to=
  name: string;
  category?: string;   // keluarga / teman / kantor
  phone?: string;      // 62...
  invited: number;     // seat allowance
  opened?: string;     // first-open timestamp
  rsvp?: 'yes' | 'no' | '';
  guests?: number;
  checkedInAt?: string;
  /** Manually confirmed after the personal WhatsApp chat has been sent. */
  waSentAt?: string;
}

export interface Wish {
  id: string; name: string; text: string; createdAt: string;
  /** `approved` means visible to everyone. Kept for compatibility with existing Sheets rows. */
  status: 'approved' | 'hidden';
}
