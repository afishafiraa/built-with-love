import type { Lang } from '../types';

const id = {
  and: 'dan', weddingOf: 'Undangan Pernikahan', openInvite: 'Buka Undangan',
  quoteSource: 'QS. Ar-Rum 21',
  quote: 'Dan di antara tanda-tanda kekuasaan-Nya ialah Dia menciptakan untukmu pasangan hidup dari jenismu sendiri, supaya kamu dapat ketenangan hati.',
  quoteAlt: 'And among His signs is this, that He created for you mates from among yourselves, that you may dwell in tranquillity with them.',
  coupleKicker: 'Bride & Groom', coupleTitle: 'Mempelai', sonOf: 'Putra dari', daughterOf: 'Putri dari',
  eventKicker: 'Rangkaian Acara', days: 'Hari', hours: 'Jam', minutes: 'Menit', seconds: 'Detik',
  akadLabel: 'Prosesi Pertama', akadName: 'Akad Nikah', resepsiLabel: 'Prosesi Kedua', resepsiName: 'Resepsi',
  dateWord: 'Tanggal', placeWord: 'Tempat', addressWord: 'Alamat',
  saveDate: 'Simpan ke kalender',
  storyKicker: 'Our Story', storyTitle: 'Benang Merah Kami', storySub: 'Satu pita yang tak pernah putus',
  locKicker: 'Lokasi Acara', directions: 'Petunjuk arah', share: 'Bagikan', shared: 'Tautan tersalin',
  rsvpTitle: 'Konfirmasi Kehadiran', rsvpSub: 'Beri tahu kami apakah kamu bisa hadir.',
  namePh: 'Nama kamu', attend: 'Hadir', notAttend: 'Tidak hadir', guestCount: 'Jumlah tamu',
  sendRsvp: 'Kirim konfirmasi', thanks: 'Terima kasih,', change: 'Ubah jawaban',
  willAttend: 'Kami tunggu kehadiranmu bersama {n} orang.', wontAttend: 'Terima kasih sudah memberi kabar.',
  pickAttend: 'Pilih hadir atau tidak hadir dulu ya.', needName: 'Isi nama kamu dulu ya.', needWish: 'Tulis ucapanmu dulu ya.',
  sending: 'Mengirim...', sendFailed: 'Gagal mengirim. Periksa koneksi lalu coba lagi.',
  qrTitle: 'QR check-in', qrNote: 'Tunjukkan QR ini di meja penerima tamu.',
  wishKicker: 'Ucapan & Doa', wishTitle: 'Kirim Doa untuk Kami', wishSub: 'Tanpa harus mengisi konfirmasi kehadiran.',
  wishPh: 'Tulis ucapan & doa', sendWish: 'Kirim ucapan', wishPending: 'Terkirim — tampil setelah disetujui mempelai.',
  justNow: 'Baru saja', minutesAgo: '{n} menit lalu', hoursAgo: '{n} jam lalu', yesterday: 'Kemarin', daysAgo: '{n} hari lalu',
  giftKicker: 'Wedding Gift', giftTitle: 'Amplop Digital',
  giftBody: 'Doa restu Anda sudah lebih dari cukup. Bila ingin mengirim tanda kasih, kami sediakan beberapa kanal.',
  giftOpen: 'Buka amplop', giftNote: 'Terima kasih atas ketulusan dan doa yang Anda kirimkan.',
  copy: 'Salin nomor', copyAddr: 'Salin alamat', copied: '✓ Tersalin', transfer: 'Transfer', addressKind: 'Alamat', holderPrefix: 'a.n. ',
  closing: 'Atas kehadiran dan doa restu Bapak/Ibu/Saudara/i, kami mengucapkan terima kasih yang sebesar-besarnya.',
  withFamily: 'Beserta keluarga',
  watermark: 'Dibangun kami dengan ❤️',
  musicOn: 'Matikan musik', musicOff: 'Putar musik',
  navEvents: 'Acara', navStory: 'Cerita', calendarTitle: 'Pernikahan ',
  tagKicker: 'Abadikan momen dengan tagar', tagCopy: 'Salin tagar', tagSee: 'Lihat di Instagram'
};

type Copy = typeof id;

const en: Copy = {
  and: 'and', weddingOf: 'The Wedding Of', openInvite: 'Open Invitation',
  quoteSource: 'QS. Ar-Rum 21',
  quote: 'And among His signs is this, that He created for you mates from among yourselves, that you may dwell in tranquillity with them.',
  quoteAlt: 'Dan di antara tanda-tanda kekuasaan-Nya ialah Dia menciptakan untukmu pasangan hidup dari jenismu sendiri, supaya kamu dapat ketenangan hati.',
  coupleKicker: 'Bride & Groom', coupleTitle: 'The Couple', sonOf: 'Son of', daughterOf: 'Daughter of',
  eventKicker: 'The Celebration', days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds',
  akadLabel: 'First Ceremony', akadName: 'Wedding Vows', resepsiLabel: 'Second Ceremony', resepsiName: 'Reception',
  dateWord: 'Date', placeWord: 'Venue', addressWord: 'Address',
  saveDate: 'Save the date',
  storyKicker: 'Our Story', storyTitle: 'Our Red Thread', storySub: 'One ribbon that never broke',
  locKicker: 'Location', directions: 'Get directions', share: 'Share', shared: 'Link copied',
  rsvpTitle: 'Confirm Attendance', rsvpSub: 'Let us know whether you can join us.',
  namePh: 'Your name', attend: 'Attending', notAttend: 'Not attending', guestCount: 'Number of guests',
  sendRsvp: 'Send RSVP', thanks: 'Thank you,', change: 'Change answer',
  willAttend: 'We look forward to seeing you and your party of {n}.', wontAttend: 'Thank you for letting us know.',
  pickAttend: 'Please choose attending or not attending first.', needName: 'Please fill in your name first.', needWish: 'Please write your wish first.',
  sending: 'Sending...', sendFailed: 'Could not send. Check your connection and try again.',
  qrTitle: 'Check-in QR', qrNote: 'Show this QR at the reception desk.',
  wishKicker: 'Wishes & Prayers', wishTitle: 'Send Us a Wish', wishSub: 'No RSVP required.',
  wishPh: 'Write your wishes', sendWish: 'Send wish', wishPending: 'Sent — it will appear once the couple approves it.',
  justNow: 'Just now', minutesAgo: '{n} min ago', hoursAgo: '{n} h ago', yesterday: 'Yesterday', daysAgo: '{n} days ago',
  giftKicker: 'Wedding Gift', giftTitle: 'Digital Envelope',
  giftBody: 'Your presence and prayers are more than enough. If you wish to send a token of love, here are a few options.',
  giftOpen: 'Open envelope', giftNote: 'Thank you for your kindness and prayers.',
  copy: 'Copy number', copyAddr: 'Copy address', copied: '✓ Copied', transfer: 'Transfer', addressKind: 'Address', holderPrefix: 'a.n. ',
  closing: 'We would be honoured by your presence and blessing on our special day. Thank you from the bottom of our hearts.',
  withFamily: 'Together with their families',
  watermark: 'Built by us with ❤️',
  musicOn: 'Mute music', musicOff: 'Play music',
  navEvents: 'Events', navStory: 'Story', calendarTitle: 'Wedding of ',
  tagKicker: 'Share your moments with', tagCopy: 'Copy hashtag', tagSee: 'See on Instagram'
};

export const COPY: Record<Lang, Copy> = { id, en };
export type { Copy };
