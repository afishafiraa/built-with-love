/* Fonts offered in the Studio. All come from Google Fonts (loaded in index.html)
   except "custom": drop your own licensed file (e.g. Belista, Samantha, Poppy
   Shower) into public/fonts/ as display.woff2 / display.otf / display.ttf. */
export const DISPLAY_FONTS: { value: string; label: string }[] = [
  { value: 'Cookie', label: 'Cookie — formal, romantis & tetap terbaca' },
  { value: 'custom', label: 'Font sendiri — public/fonts/display.woff2 / .otf / .ttf' }
];

export const BODY_FONTS: { value: string; label: string }[] = [
  { value: 'Quicksand', label: 'Quicksand — rounded, santai & mudah dibaca' }
];

const q = (f: string) => "'" + f + "'";

/** CSS custom properties consumed by blossom.css / the invitation. */
export function fontVars(display: string, body: string): Record<string, string> {
  const d = display === 'custom' ? "'Custom Display'" : q(display || 'Cookie');
  const b = q(body || 'Quicksand');
  return {
    '--f-display': d + ", 'Cookie', cursive",
    '--f-serif': b + ', ui-rounded, system-ui, sans-serif',
    '--f-body': b + ', ui-rounded, system-ui, sans-serif',
    '--f-ui': b + ', ui-rounded, system-ui, sans-serif'
  };
}
