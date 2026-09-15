/**
 * Google Sheets backend for the wedding invitation.
 *
 * Works both ways:
 *  - bound   — made with Extensions > Apps Script from inside the spreadsheet.
 *  - standalone — made at script.google.com. Then set Script property SHEET_ID to
 *    the id in the spreadsheet URL (.../spreadsheets/d/<SHEET_ID>/edit).
 *
 * Setup
 *  1. Paste this file into the Apps Script editor, Save.
 *  2. Project Settings > Script properties:
 *       SECRET   = same value as SHEETS_TOKEN in Vercel server environment
 *       SHEET_ID = spreadsheet id (standalone projects only)
 *  3. Run `setup` once from the editor's Run menu. It creates the Guests, Wishes,
 *     Events and Config tabs with the right headers. Grant the permissions it asks for.
 *  4. Deploy > New deployment > Web app > Execute as: me, Access: anyone.
 *  5. Put the /exec URL in the server-only SHEETS_ENDPOINT variable in Vercel.
 *
 *  The secret lives in Script properties, never in this file — this file is committed.
 *  After editing this file: Deploy > Manage deployments > Edit > Version: New version
 *  (the /exec URL stays the same). The first deploy after this version asks for Google
 *  Drive permission — photos uploaded in /studio are saved in Drive > "Undangan Assets".
 */
var SS_CACHE = null;

/** The spreadsheet: SHEET_ID when standalone, the container when bound. */
function ss_() {
  if (SS_CACHE) return SS_CACHE;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  SS_CACHE = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_CACHE) {
    throw new Error(
      'Spreadsheet tidak ketemu. Project ini standalone, jadi isi Script property ' +
      'SHEET_ID dengan id dari URL spreadsheet (.../spreadsheets/d/<SHEET_ID>/edit).'
    );
  }
  return SS_CACHE;
}

var TABS = {
  Guests: ['id', 'name', 'category', 'phone', 'invited', 'opened', 'rsvp', 'guests', 'checkedInAt', 'waSentAt', 'inviteToken'],
  Wishes: ['id', 'name', 'text', 'createdAt', 'status', 'requestId'],
  Events: ['at', 'guestId', 'event'],
  Config: ['key', 'value']
};

/** Shared secret, kept in Script properties so it never lands in the repo. */
function secret_() {
  return PropertiesService.getScriptProperties().getProperty('SECRET') || '';
}

/**
 * Run once from the editor. Safe to re-run: existing tabs and SECRET are left
 * alone, while newly introduced columns are appended when missing.
 */
function setup() {
  var ss = ss_();
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    ensureHeaders_(name);
    sh.setFrozenRows(1);
  });

  // Kolom yang harus teks. Nomor HP yang tersimpan sebagai angka kehilangan nol
  // depannya (085740894090 -> 85740894090) dan tidak bisa dipulihkan.
  var guests = ss.getSheetByName('Guests');
  ['id', 'phone', 'inviteToken'].forEach(function (col) {
    guests.getRange(1, TABS.Guests.indexOf(col) + 1, guests.getMaxRows(), 1).setNumberFormat('@');
  });
  ensureInviteTokens_();

  // Tab bawaan ("Sheet1") biasanya tertinggal kosong setelah tab di atas dibuat.
  // Hanya dihapus kalau benar-benar kosong, namanya masih bawaan, dan bukan satu-satunya tab.
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    var empty = sh.getLastRow() === 0 && sh.getLastColumn() === 0;
    if (!TABS[name] && empty && /^(sheet ?1|untitled)$/i.test(name) && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });

  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SECRET', secret);
  }
  Logger.log(
    'Spreadsheet: ' + ss.getName() + ' (' + ss.getId() + ')\n' +
    'Tab siap: ' + Object.keys(TABS).join(', ') + '\n' +
    'SECRET siap di Script Properties. Jangan salin nilainya ke source code atau VITE_*.'
  );
  return 'setup complete';
}

function sheet_(name) { return ss_().getSheetByName(name); }

/** Add schema columns without moving or overwriting existing guest data. */
function ensureHeaders_(name) {
  var sh = sheet_(name);
  var expected = TABS[name] || [];
  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.getRange(1, 1, 1, expected.length).setValues([expected]);
    return;
  }
  var actual = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  expected.forEach(function (header) {
    if (actual.indexOf(header) < 0) {
      actual.push(header);
      sh.getRange(1, actual.length).setValue(header);
    }
  });
}

function rows_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var head = values.shift();
  return values.map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function findRow_(name, key, value) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var head = values[0];
  var col = head.indexOf(key);
  for (var i = 1; i < values.length; i++) if (String(values[i][col]) === String(value)) return i + 1;
  return -1;
}

function setCell_(name, row, key, value) {
  var sh = sheet_(name);
  var head = sh.getDataRange().getValues()[0];
  sh.getRange(row, head.indexOf(key) + 1).setValue(value);
}

/** Eight decimal digits, generated from a SHA-256 digest and unique in Guests. */
function newInviteToken_() {
  for (var attempt = 0; attempt < 30; attempt++) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + ':' + new Date().getTime() + ':' + Math.random()
    );
    var unsigned = (digest[0] & 255) * 16777216 + (digest[1] & 255) * 65536 +
      (digest[2] & 255) * 256 + (digest[3] & 255);
    var token = String(10000000 + (unsigned % 90000000));
    if (findRow_('Guests', 'inviteToken', token) < 0) return token;
  }
  throw new Error('invite token generation failed');
}

/** Migration used by setup(): existing development rows receive a token once. */
function ensureInviteTokens_() {
  var sh = sheet_('Guests');
  if (!sh || sh.getLastRow() < 2) return;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var tokenCol = head.indexOf('inviteToken') + 1;
  var seen = {};
  for (var row = 2; row <= sh.getLastRow(); row++) {
    var current = String(sh.getRange(row, tokenCol).getValue() || '').trim();
    if (!/^\d{8}$/.test(current) || seen[current]) {
      current = newInviteToken_();
      sh.getRange(row, tokenCol).setValue(current).setNumberFormat('@');
    }
    seen[current] = true;
  }
}

function guestAtRow_(row) {
  if (row < 2) return null;
  var sh = sheet_('Guests');
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var values = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  var guest = {};
  head.forEach(function (key, index) { guest[key] = values[index]; });
  return guest;
}

/** Resolve only the exact public `slug-12345678` key; bare slugs are rejected. */
function guestFromInviteKey_(value) {
  var key = String(value || '').trim().toLowerCase();
  var match = key.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d{8})$/);
  if (!match) return null;
  var row = findRow_('Guests', 'id', match[1]);
  var guest = guestAtRow_(row);
  return guest && String(guest.inviteToken) === match[2] ? guest : null;
}

/** Admin check-in may receive the internal id or the public `slug-token` key. */
function guestFromCheckInCode_(value) {
  var code = String(value || '').trim().toLowerCase();
  var direct = guestAtRow_(findRow_('Guests', 'id', code));
  if (direct) return direct;
  if (/-\d{8}$/.test(code)) return guestFromInviteKey_(code);
  return null;
}

function assetFolder_() {
  var it = DriveApp.getFoldersByName('Undangan Assets');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Undangan Assets');
}

function configSheet_() {
  var sh = sheet_('Config');
  if (!sh) { sh = ss_().insertSheet('Config'); sh.appendRow(['key', 'value']); }
  return sh;
}

function readConfig_() {
  var values = configSheet_().getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === 'config') return JSON.parse(values[i][1] || 'null');
  }
  return null;
}

function wishes_(all) {
  return rows_('Wishes').filter(function (wish) { return all || wish.status !== 'hidden'; }).reverse();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Every failure is returned as JSON. An uncaught throw would make Apps Script
   answer with an HTML error page, which the client can only report as "not JSON". */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = secret_();
    if (!secret) return json_({ error: 'SECRET belum diatur di Script properties — jalankan setup() dari editor Apps Script' });
    if (body.token !== secret) return json_({ error: 'unauthorized' });
    if (!sheet_('Guests') || !sheet_('Wishes') || !sheet_('Events')) {
      return json_({ error: 'tab Guests/Wishes/Events belum ada — jalankan setup()' });
    }
    var now = new Date().toISOString();

    // Serialise writes so two RSVPs arriving together can't overwrite each other.
    var reads = { listGuests: 1, listWishes: 1, getConfig: 1, getGuest: 1, getGuestById: 1, bootstrap: 1, dashboardData: 1, uploadImage: 1 };
    var lock = null;
    if (!reads[body.action]) { lock = LockService.getScriptLock(); lock.waitLock(15000); }
    try { return handle_(body, now); } finally { if (lock) lock.releaseLock(); }
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

/** Opening the /exec URL in a browser should say something useful, not crash. */
function doGet() {
  return json_({ ok: true, hint: 'Backend undangan aktif. Semua aksi lewat POST.' });
}

function handle_(body, now) {
  switch (body.action) {
    case 'bootstrap': {
      var bootstrapGuest = guestFromInviteKey_(body.inviteKey);
      return json_({ data: {
        config: readConfig_(),
        guest: bootstrapGuest ? { id: bootstrapGuest.id, name: bootstrapGuest.name } : null
      } });
    }

    case 'dashboardData':
      return json_({ data: { guests: rows_('Guests'), wishes: wishes_(true), config: readConfig_() } });

    case 'listGuests':
      return json_({ data: rows_('Guests') });

    case 'getGuest': {
      var publicGuest = guestFromInviteKey_(body.inviteKey);
      return json_({ data: publicGuest ? { id: publicGuest.id, name: publicGuest.name } : null });
    }

    case 'getGuestById': {
      var privateGuest = guestFromCheckInCode_(body.guestId);
      return json_({ data: privateGuest ? { id: privateGuest.id, name: privateGuest.name } : null });
    }

    case 'uploadImage': {
      // Studio photo/ornament upload -> "Undangan Assets" folder in your Drive, shared view-only by link.
      var mime = String(body.mime || 'image/jpeg').toLowerCase();
      if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) return json_({ error: 'invalid image type' });
      if (!body.data || String(body.data).length > 4000000) return json_({ error: 'image too large' });
      var blob = Utilities.newBlob(Utilities.base64Decode(body.data), mime, String(body.name || 'gambar').slice(0, 80));
      var file = assetFolder_().createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return json_({ data: { url: 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1600' } });
    }

    case 'upsertGuest': {
      var g = body.guest || {};
      var guestId = String(g.id || '').trim().slice(0, 100);
      var guestName = String(g.name || '').trim().slice(0, 80);
      if (!guestId) return json_({ error: 'guest id required' });
      if (!guestName) return json_({ error: 'guest name required' });
      var guestPhone = String(g.phone || '').trim().slice(0, 30);
      var guestCategory = String(g.category || '').trim().slice(0, 50);
      var invited = Math.min(2, Math.max(1, Number(g.invited) || 1));
      var row = findRow_('Guests', 'id', guestId);
      var inviteToken = '';
      if (row < 0) {
        inviteToken = newInviteToken_();
        sheet_('Guests').appendRow([guestId, guestName, guestCategory, guestPhone, invited, '', '', '', '', '', inviteToken]);
      } else {
        setCell_('Guests', row, 'name', guestName);
        if (g.category !== undefined) setCell_('Guests', row, 'category', guestCategory);
        if (g.phone !== undefined) setCell_('Guests', row, 'phone', guestPhone);
        if (g.invited !== undefined) setCell_('Guests', row, 'invited', invited);
        var existingGuest = guestAtRow_(row);
        inviteToken = String(existingGuest.inviteToken || '');
        if (!/^\d{8}$/.test(inviteToken)) {
          inviteToken = newInviteToken_();
          setCell_('Guests', row, 'inviteToken', inviteToken);
        }
      }
      return json_({ data: { id: guestId, inviteToken: inviteToken } });
    }

    case 'deleteGuest': {
      var guestId = String(body.id || '').trim();
      if (!guestId) return json_({ error: 'guest id required' });
      var guestRow = findRow_('Guests', 'id', guestId);
      if (guestRow < 0) return json_({ data: false });
      sheet_('Guests').deleteRow(guestRow);
      return json_({ data: true });
    }

    case 'markGuestWaSent': {
      var waGuestId = String(body.id || '').trim();
      if (!waGuestId) return json_({ error: 'guest id required' });
      ensureHeaders_('Guests');
      var waGuestRow = findRow_('Guests', 'id', waGuestId);
      if (waGuestRow < 0) return json_({ error: 'guest not found' });
      var waSentAt = body.sent === false ? '' : now;
      setCell_('Guests', waGuestRow, 'waSentAt', waSentAt);
      return json_({ data: waSentAt });
    }

    case 'rsvp': {
      if (body.rsvp !== 'yes' && body.rsvp !== 'no') return json_({ error: 'invalid rsvp' });
      var rsvpGuest = guestFromInviteKey_(body.inviteKey);
      var rsvpName = String(body.name || '').trim().slice(0, 80);
      if (!rsvpGuest || !rsvpName) return json_({ error: 'invalid invitation link' });
      // Enforce the same max-two rule server-side: altered browser requests
      // cannot overbook seats.
      var party = body.rsvp === 'yes' ? Math.min(2, Math.max(1, Number(body.guests) || 1)) : 0;
      var r = findRow_('Guests', 'id', rsvpGuest.id);
      setCell_('Guests', r, 'rsvp', body.rsvp);
      setCell_('Guests', r, 'guests', party);
      if (!sheet_('Guests').getRange(r, 6).getValue()) setCell_('Guests', r, 'opened', now);
      return json_({ data: null });
    }

    case 'checkIn': {
      var checkInId = String(body.guestId || '').trim().slice(0, 130);
      if (!checkInId) return json_({ error: 'guest id required' });
      var checkInGuest = guestFromCheckInCode_(checkInId);
      if (!checkInGuest) return json_({ data: false });
      var cr = findRow_('Guests', 'id', checkInGuest.id);
      setCell_('Guests', cr, 'checkedInAt', now);
      return json_({ data: true });
    }

    case 'listWishes': {
      var all = !!body.all;
      // Wishes are public immediately. Legacy "pending" rows remain public;
      // only an intentional hide action removes one from the wall.
      return json_({ data: wishes_(all) });
    }

    case 'addWish': {
      var wishGuest = guestFromInviteKey_(body.inviteKey);
      var wishName = String(body.name || '').trim().slice(0, 80);
      var wishText = String(body.text || '').trim().slice(0, 600);
      var requestId = String(body.requestId || '').trim();
      if (!wishGuest) return json_({ error: 'invalid invitation link' });
      if (!wishName || !wishText) return json_({ error: 'wish name and text required' });
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) return json_({ error: 'invalid request id' });
      ensureHeaders_('Wishes');
      var existingWishRow = findRow_('Wishes', 'requestId', requestId);
      if (existingWishRow > 0) {
        var existingWish = rows_('Wishes')[existingWishRow - 2];
        return json_({ data: { id: existingWish.id } });
      }
      var wishId = Utilities.getUuid();
      sheet_('Wishes').appendRow([wishId, wishName, wishText, now, 'approved', requestId]);
      return json_({ data: { id: wishId } });
    }

    case 'getConfig': {
      return json_({ data: readConfig_() });
    }

    case 'saveConfig': {
      var csh = configSheet_();
      var text = JSON.stringify(body.config || {});
      if (text.length > 49000) return json_({ error: 'config too large' });
      var crow = findRow_('Config', 'key', 'config');
      if (crow < 0) csh.appendRow(['config', text]); else csh.getRange(crow, 2).setValue(text);
      var urow = findRow_('Config', 'key', 'updatedAt');
      if (urow < 0) csh.appendRow(['updatedAt', now]); else csh.getRange(urow, 2).setValue(now);
      return json_({ data: null });
    }

    case 'moderateWish': {
      if (body.status !== 'approved' && body.status !== 'hidden') return json_({ error: 'invalid wish status' });
      var wr = findRow_('Wishes', 'id', body.id);
      if (wr > 0) setCell_('Wishes', wr, 'status', body.status);
      return json_({ data: null });
    }

    case 'track': {
      var trackGuest = guestFromInviteKey_(body.inviteKey);
      if (!trackGuest) return json_({ data: null });
      if (body.event !== 'open' && body.event !== 'open-invitation') return json_({ error: 'invalid event' });
      sheet_('Events').appendRow([now, trackGuest.id, body.event]);
      var er = findRow_('Guests', 'id', trackGuest.id);
      if (er > 0 && !sheet_('Guests').getRange(er, 6).getValue()) setCell_('Guests', er, 'opened', now);
      return json_({ data: null });
    }
  }
  return json_({ error: 'unknown action' });
}
