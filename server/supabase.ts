import { randomInt, randomUUID } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type JsonRecord = Record<string, unknown>;
type DatabaseResult<T> = { data: T | null; error: { code?: string; message: string } | null };
type GuestRow = {
  id: string; invite_token: string; name: string; category: string; phone: string;
  invited: number; opened_at: string | null; rsvp: string | null; guest_count: number;
  checked_in_at: string | null; wa_sent_at: string | null; created_at: string; updated_at: string;
};
type WishRow = {
  id: string; guest_id: string | null; name: string; text: string; created_at: string;
  status: string; request_id: string;
};
type ConfigRow = { id: number; data: JsonRecord; updated_at: string };
type EventRow = { id: number; at: string; guest_id: string | null; event: string };
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
type Database = {
  public: {
    Tables: {
      guests: Table<GuestRow>;
      wishes: Table<WishRow>;
      invitation_config: Table<ConfigRow>;
      events: Table<EventRow>;
    };
    Views: Record<string, never>;
    Functions: {
      invitation_bootstrap: { Args: { p_invite_key: string }; Returns: JsonRecord };
      public_wishes: { Args: { p_invite_key: string; p_limit?: number }; Returns: JsonRecord[] };
      submit_rsvp: { Args: { p_invite_key: string; p_name: string; p_rsvp: string; p_guest_count: number }; Returns: boolean };
      submit_wish: { Args: { p_invite_key: string; p_name: string; p_text: string; p_request_id: string }; Returns: string };
      mark_invitation_opened: { Args: { p_invite_key: string; p_event: string }; Returns: boolean };
      check_in_guest: { Args: { p_guest_code: string }; Returns: boolean };
    };
  };
};

let singleton: SupabaseClient<Database> | null = null;

function databaseConfigured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(process.env.SUPABASE_URL || '')
    && /^sb_secret_[A-Za-z0-9_-]+$/.test(process.env.SUPABASE_SECRET_KEY || '');
}

function database() {
  if (!databaseConfigured()) throw new Error('database_not_configured');
  if (!singleton) {
    singleton = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return singleton;
}

function databaseError(action: string, error: { code?: string; message: string }) {
  const known = error.message.match(/invalid invitation link|invalid guest count|invalid rsvp|wish name and text required/i)?.[0];
  if (known) throw new Error(known.toLowerCase());
  console.error(JSON.stringify({ scope: 'supabase', action, code: error.code || 'unknown' }));
  throw new Error(error.code === '23505' ? 'database_conflict' : 'database_unavailable');
}

function value<T>(action: string, result: DatabaseResult<T>) {
  if (result.error) databaseError(action, result.error);
  return result.data;
}

const stringValue = (input: unknown) => input === null || input === undefined ? '' : String(input);

function guestRecord(row: JsonRecord) {
  return {
    id: stringValue(row.id),
    inviteToken: stringValue(row.invite_token),
    name: stringValue(row.name),
    category: stringValue(row.category),
    phone: stringValue(row.phone),
    invited: Number(row.invited) || 1,
    opened: stringValue(row.opened_at),
    rsvp: stringValue(row.rsvp),
    guests: Number(row.guest_count) || 0,
    checkedInAt: stringValue(row.checked_in_at),
    waSentAt: stringValue(row.wa_sent_at)
  };
}

function wishRecord(row: JsonRecord) {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    text: stringValue(row.text),
    createdAt: stringValue(row.created_at),
    status: stringValue(row.status) === 'hidden' ? 'hidden' : 'approved',
    requestId: stringValue(row.request_id)
  };
}

function inviteParts(inviteKey: string) {
  const match = inviteKey.match(/^(.+)-(\d{8})$/);
  return match ? { id: match[1], token: match[2] } : null;
}

async function findGuest(code: string) {
  const client = database();
  const parts = inviteParts(code);
  const query = client.from('guests').select('id,name');
  const result = parts
    ? await query.eq('id', parts.id).eq('invite_token', parts.token).maybeSingle()
    : await query.eq('id', code).maybeSingle();
  const row = value('getGuestById', result as DatabaseResult<JsonRecord>);
  return row ? { id: stringValue(row.id), name: stringValue(row.name) } : null;
}

async function listGuests() {
  const result = await database().from('guests').select('*').order('created_at', { ascending: true });
  const rows = value('listGuests', result as DatabaseResult<JsonRecord[]>) || [];
  return rows.map(guestRecord);
}

async function listWishes() {
  const result = await database().from('wishes').select('*').order('created_at', { ascending: false });
  const rows = value('listWishes', result as DatabaseResult<JsonRecord[]>) || [];
  return rows.map(wishRecord);
}

async function readConfig() {
  const result = await database().from('invitation_config').select('data').eq('id', 1).maybeSingle();
  const row = value('getConfig', result as DatabaseResult<{ data: JsonRecord }>) as { data: JsonRecord } | null;
  return row?.data || null;
}

async function upsertGuest(payload: JsonRecord) {
  const guest = payload.guest as JsonRecord;
  const client = database();
  const guestId = stringValue(guest.id);
  const existingResult = await client.from('guests').select('id,invite_token').eq('id', guestId).maybeSingle();
  const existing = value('upsertGuest', existingResult as DatabaseResult<JsonRecord>);

  if (existing) {
    const changes: Partial<GuestRow> = { name: stringValue(guest.name) };
    if (guest.category !== undefined) changes.category = stringValue(guest.category);
    if (guest.phone !== undefined) changes.phone = stringValue(guest.phone);
    if (guest.invited !== undefined) changes.invited = Number(guest.invited);
    const updateResult = await client.from('guests').update(changes).eq('id', guestId).select('id,invite_token').single();
    const updated = value('upsertGuest', updateResult as DatabaseResult<JsonRecord>);
    if (!updated) throw new Error('database_unavailable');
    return { id: stringValue(updated.id), inviteToken: stringValue(updated.invite_token) };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteToken = String(randomInt(10_000_000, 100_000_000));
    const insertResult = await client.from('guests').insert({
      id: guestId,
      invite_token: inviteToken,
      name: stringValue(guest.name),
      category: stringValue(guest.category),
      phone: stringValue(guest.phone),
      invited: Number(guest.invited) || 1
    }).select('id,invite_token').single();
    if (!insertResult.error && insertResult.data) {
      const inserted = insertResult.data as JsonRecord;
      return { id: stringValue(inserted.id), inviteToken: stringValue(inserted.invite_token) };
    }
    if (insertResult.error?.code !== '23505') databaseError('upsertGuest', insertResult.error!);

    // Another request may have created this exact guest while this one waited.
    const concurrent = await client.from('guests').select('id,invite_token').eq('id', guestId).maybeSingle();
    if (concurrent.data) {
      const row = concurrent.data as JsonRecord;
      return { id: stringValue(row.id), inviteToken: stringValue(row.invite_token) };
    }
  }
  throw new Error('database_conflict');
}

async function uploadImage(payload: JsonRecord) {
  const mime = stringValue(payload.mime);
  const extension = ({
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'
  } as Record<string, string>)[mime];
  if (!extension) throw new Error('invalid image type');
  const bytes = Buffer.from(stringValue(payload.data), 'base64');
  if (!bytes.length || bytes.length > 3_000_000) throw new Error('image too large');

  const path = `${new Date().getUTCFullYear()}/${randomUUID()}.${extension}`;
  const result = await database().storage.from('invitation-assets').upload(path, bytes, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false
  });
  if (result.error) databaseError('uploadImage', result.error);
  const publicUrl = database().storage.from('invitation-assets').getPublicUrl(path).data.publicUrl;
  return { url: publicUrl };
}

async function createAudioUpload(payload: JsonRecord) {
  const mime = stringValue(payload.mime);
  const extension = ({
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'video/mp4': 'mp4'
  } as Record<string, string>)[mime];
  const size = Number(payload.size);
  if (!extension) throw new Error('invalid audio type');
  if (!Number.isInteger(size) || size < 1 || size > 15_000_000) throw new Error('audio too large');

  const path = `${new Date().getUTCFullYear()}/${randomUUID()}.${extension}`;
  const bucket = database().storage.from('invitation-audio');
  const signed = await bucket.createSignedUploadUrl(path);
  if (signed.error) databaseError('createAudioUpload', signed.error);
  if (!signed.data) throw new Error('database_unavailable');
  return {
    signedUrl: signed.data.signedUrl,
    url: bucket.getPublicUrl(path).data.publicUrl
  };
}

export async function callSupabase(action: string, payload: JsonRecord = {}) {
  const client = database();

  if (action === 'bootstrap') {
    const result = await client.rpc('invitation_bootstrap', { p_invite_key: stringValue(payload.inviteKey) });
    return value(action, result as DatabaseResult<JsonRecord>) || { config: null, guest: null };
  }
  if (action === 'dashboardData') {
    const [guests, wishes, config] = await Promise.all([listGuests(), listWishes(), readConfig()]);
    return { guests, wishes, config };
  }
  if (action === 'listGuests') return listGuests();
  if (action === 'getGuest' || action === 'getGuestById') {
    return findGuest(stringValue(action === 'getGuest' ? payload.inviteKey : payload.guestId));
  }
  if (action === 'uploadImage') return uploadImage(payload);
  if (action === 'createAudioUpload') return createAudioUpload(payload);
  if (action === 'upsertGuest') return upsertGuest(payload);
  if (action === 'deleteGuest') {
    const result = await client.from('guests').delete().eq('id', stringValue(payload.id)).select('id');
    const rows = value(action, result as DatabaseResult<JsonRecord[]>) || [];
    return rows.length > 0;
  }
  if (action === 'markGuestWaSent') {
    const waSentAt = payload.sent === false ? null : new Date().toISOString();
    const result = await client.from('guests').update({ wa_sent_at: waSentAt }).eq('id', stringValue(payload.id)).select('id').maybeSingle();
    const row = value(action, result as DatabaseResult<JsonRecord>);
    if (!row) throw new Error('guest not found');
    return waSentAt || '';
  }
  if (action === 'rsvp') {
    const result = await client.rpc('submit_rsvp', {
      p_invite_key: stringValue(payload.inviteKey),
      p_name: stringValue(payload.name),
      p_rsvp: stringValue(payload.rsvp),
      p_guest_count: Number(payload.guests)
    });
    value(action, result as DatabaseResult<boolean>);
    return null;
  }
  if (action === 'checkIn') {
    const result = await client.rpc('check_in_guest', { p_guest_code: stringValue(payload.guestId) });
    return value(action, result as DatabaseResult<boolean>) || false;
  }
  if (action === 'listWishes') {
    if (payload.all === true) return listWishes();
    const result = await client.rpc('public_wishes', { p_invite_key: stringValue(payload.inviteKey), p_limit: 100 });
    return value(action, result as DatabaseResult<JsonRecord[]>) || [];
  }
  if (action === 'addWish') {
    const result = await client.rpc('submit_wish', {
      p_invite_key: stringValue(payload.inviteKey),
      p_name: stringValue(payload.name),
      p_text: stringValue(payload.text),
      p_request_id: stringValue(payload.requestId)
    });
    const id = value(action, result as DatabaseResult<string>);
    return { id: stringValue(id) };
  }
  if (action === 'moderateWish') {
    const result = await client.from('wishes').update({ status: stringValue(payload.status) }).eq('id', stringValue(payload.id));
    value(action, result as DatabaseResult<null>);
    return null;
  }
  if (action === 'deleteWish') {
    const result = await client.from('wishes').delete().eq('id', stringValue(payload.id)).select('id');
    const rows = value(action, result as DatabaseResult<Array<Pick<WishRow, 'id'>>>) || [];
    return rows.length > 0;
  }
  if (action === 'getConfig') return readConfig();
  if (action === 'saveConfig') {
    const result = await client.from('invitation_config').upsert({ id: 1, data: payload.config as JsonRecord }, { onConflict: 'id' });
    value(action, result as DatabaseResult<null>);
    return null;
  }
  if (action === 'track') {
    const result = await client.rpc('mark_invitation_opened', {
      p_invite_key: stringValue(payload.inviteKey),
      p_event: stringValue(payload.event)
    });
    value(action, result as DatabaseResult<boolean>);
    return null;
  }
  throw new Error('unknown action');
}
