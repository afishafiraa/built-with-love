/** Copy text in secure and legacy browser contexts (including older mobile browsers). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the synchronous selection-based browser fallback.
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.inset = '0 auto auto -9999px';
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, field.value.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
