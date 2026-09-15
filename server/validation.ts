const stringValue = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function invitationKey(value: unknown) {
  const key = stringValue(value, 130).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{8}$/.test(key)) throw new Error('invalid invitation link');
  return key;
}

export function guestId(value: unknown) {
  const id = stringValue(value, 100).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('invalid guest id');
  return id;
}

export function text(value: unknown, label: string, max: number) {
  const result = stringValue(value, max);
  if (!result) throw new Error(`${label} required`);
  return result;
}

export function optionalText(value: unknown, max: number) {
  return stringValue(value, max);
}

export function actionName(value: unknown) {
  return stringValue(value, 40);
}
