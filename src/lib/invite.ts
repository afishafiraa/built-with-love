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

export function currentInviteParam() {
  return parseInviteParam(new URLSearchParams(location.search).get('to') || '');
}
