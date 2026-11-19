import type { Lang, WeddingConfig } from '../types';

export function formatInvitationMessage(guestName: string, link: string, c: WeddingConfig, lang: Lang) {
  if (lang === 'en') {
    return [
      'Dear ' + (guestName || 'Guest') + ',',
      '',
      'Assalamualaikum Warahmatullahi Wabarakatuh.',
      'With the grace and blessings of Allah SWT, we warmly invite you and your family to attend and bless the marriage of:',
      '',
      '💍 ' + c.groomFull + ' & ' + c.brideFull,
      '',
      'Please visit our invitation for the full details:',
      link,
      '',
      'It would be an honour and a joy to celebrate this special day with you and receive your prayers and blessings.',
      '',
      'Please accept our apologies for sending this invitation by message. Thank you for your kind attention.',
      '',
      'With warm regards,',
      c.groomName + ' & ' + c.brideName + '🤍',
      '',
      'Wassalamualaikum Warahmatullahi Wabarakatuh.'
    ].filter(line => line !== undefined).join('\n');
  }
  return [
    'Kepada Yth.',
    'Bapak/Ibu/Saudara/I',
    (guestName || 'Bapak/Ibu/Saudara/i'),
    '',
    'Assalamualaikum Warahmatullahi Wabarakatuh.',
    'Tanpa mengurangi rasa hormat, perkenankan kami mengundang Bapak/Ibu/Saudara/i untuk dapat hadir, dan memberikan doa restu pada acara pernikahan:',
    '',
    '💍 ' + c.groomFull + ' & ' + c.brideFull,
    '',
    'Berikut link undangan kami untuk info lengkap dari acara bisa kunjungi :',
    link,
    '',
    'Suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i beserta keluarga berkenan untuk dapat hadir dan memberikan doa restu kepada kami.',
    '',
    'Mohon maaf perihal undangan hanya di bagikan melalui pesan ini. Terima kasih banyak atas perhatiannya.',
    '',
    'Hormat kami,',
    c.groomName + ' & ' + c.brideName + '🤍',
    '',
    'Wassalamualaikum Warahmatullahi Wabarakatuh.'
  ].filter(line => line !== undefined).join('\n');
}
