import type { WeddingConfig } from '../types';

/* Copy this file to `invitation.local.ts` and fill in the real content.
   `invitation.local.ts` is gitignored: it stays on this computer, never
   reaches GitHub, and is only read by `npm run dev`. Any key left out falls
   back to the placeholder in `invitation.ts`.

   For the live invitation, publish the real content from /studio to the
   Sheets `Config` tab instead — guests read that, not this file. */
const LOCAL: Partial<WeddingConfig> = {
  groomName: "",
  brideName: "",
  groomFull: "",
  brideFull: "",
  groomParents: "",
  brideParents: "",
  dateISO: "",
  dateLabel: "",
  dateLabelEn: "",
  akadTime: "",
  resepsiTime: "",
  venue: "",
  city: "",
  address: "",
  mapsQuery: "",
  bank1Name: "",
  bank1Acct: "",
  bank1Holder: "",
  bank2Name: "",
  bank2Acct: "",
  bank2Holder: "",
  giftAddress: "",
  giftAddressHolder: "",
  hashtag: ""
};

export default LOCAL;
