export type WhatsAppTarget = 'web' | 'app';

export function whatsAppTarget(userAgent: string, maxTouchPoints = 0): WhatsAppTarget {
  const mobile = /Android|iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  return mobile ? 'app' : 'web';
}

/** Keep Unicode intact and encode once; desktop avoids the wa.me handoff. */
export function whatsappMessageUrl(phone: string, text: string, target: WhatsAppTarget) {
  const base = target === 'web'
    ? 'https://web.whatsapp.com/send?phone=' + phone + '&text='
    : 'https://wa.me/' + phone + '?text=';
  return base + encodeURIComponent(text);
}
