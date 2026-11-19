/** WhatsApp URLs use digits only; an explicit + keeps its country code. */
export function waNumber(phone: string | number | null | undefined) {
  const input = String(phone ?? '').trim();
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits || input.startsWith('+')) return digits;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('08')) return '62' + digits.slice(1);
  // Numeric spreadsheet imports can lose the Indonesian leading zero.
  if (digits.startsWith('8')) return '62' + digits;
  return digits;
}

export function isValidWaNumber(phone: string | number | null | undefined) {
  return /^[1-9]\d{7,14}$/.test(waNumber(phone));
}
