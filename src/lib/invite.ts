import { decodeInviteRef, encodeInviteRef } from '../../shared/invite-ref.mjs';

export type InviteParam = {
  id: string;
  inviteToken: string;
  key: string;
  supplied: boolean;
};

function parseInviteParam(rawValue: string): InviteParam {
  const raw = String(rawValue || '').trim().toLowerCase();
  const match = raw.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d{8})$/);
  return {
    id: match?.[1] || '',
    inviteToken: match?.[2] || '',
    key: match ? raw : '',
    supplied: !!raw
  };
}

export function parseInviteSearch(search: string): InviteParam {
  const params = new URLSearchParams(search);
  if (params.has('ref')) {
    const ref = (params.get('ref') || '').trim().toUpperCase();
    const token = params.getAll('ref').length === 1 ? decodeInviteRef(ref) : '';
    return { id: '', inviteToken: token, key: token ? ref : '', supplied: true };
  }
  return parseInviteParam(params.get('to') || '');
}

export function currentInviteParam() {
  return parseInviteSearch(location.search);
}

export function guestLink(origin: string, name: string, inviteToken: string) {
  const ref = encodeInviteRef(inviteToken);
  if (!name.trim() || !ref) return '';
  const params = new URLSearchParams({ to: name.trim(), ref });
  return origin + '/?' + params.toString();
}
