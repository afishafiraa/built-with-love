/* Fonts offered in the Studio. All come from Google Fonts (loaded in index.html)
   except "custom": drop your own licensed file (e.g. Belista, Samantha, Poppy
   Shower) into public/fonts/ as display.woff2 / display.otf / display.ttf. */
export const DISPLAY_FONTS: { value: string; label: string }[] = [
  { value: 'Great Vibes', label: 'Great Vibes — kaligrafi mengalir (nuansa Samantha)' },
  { value: 'Parisienne', label: 'Parisienne — ramping & elegan (nuansa Belista)' },
  { value: 'Allura', label: 'Allura — tulisan tangan lembut (nuansa Poppy Shower)' },
  { value: 'Pinyon Script', label: 'Pinyon Script — kaligrafi formal' },
  { value: 'Alex Brush', label: 'Alex Brush — kuas tebal' },
  { value: 'custom', label: 'Font sendiri — public/fonts/display.woff2 / .otf / .ttf' }
];

export const BODY_FONTS: { value: string; label: string }[] = [
  { value: 'Playfair Display', label: 'Playfair Display — serif klasik' },
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond — serif halus' },
  { value: 'Archivo', label: 'Archivo — sans modern (sebelumnya)' }
];

const q = (f: string) => "'" + f + "'";

/** CSS custom properties consumed by blossom.css / the invitation. */
export function fontVars(display: string, body: string): Record<string, string> {
  const d = display === 'custom' ? "'Custom Display'" : q(display || 'Great Vibes');
  const b = q(body || 'Playfair Display');
  const serif = body === 'Archivo' || !body ? "'Playfair Display'" : b;
  return {
    '--f-display': d + ", 'Great Vibes', cursive",
    '--f-serif': serif + ', Georgia, serif',
    '--f-body': b + (body === 'Archivo' ? ', system-ui, sans-serif' : ', Georgia, serif')
  };
}
