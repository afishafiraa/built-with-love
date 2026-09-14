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
 *       SECRET   = same value as VITE_SHEETS_TOKEN in app/.env
 *       SHEET_ID = spreadsheet id (standalone projects only)
 *  3. Run `setup` once from the editor's Run menu. It creates the Guests, Wishes,
 *     Events and Config tabs with the right headers. Grant the permissions it asks for.
 *  4. Deploy > New deployment > Web app > Execute as: me, Access: anyone.
 *  5. Put the /exec URL in VITE_SHEETS_ENDPOINT.
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
  Guests: ['id', 'name', 'category', 'phone', 'invited', 'opened', 'rsvp', 'guests', 'checkedInAt', 'waSentAt'],
  Wishes: ['id', 'name', 'text', 'createdAt', 'status'],
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
  ['id', 'phone'].forEach(function (col) {
    guests.getRange(1, TABS.Guests.indexOf(col) + 1, guests.getMaxRows(), 1).setNumberFormat('@');
  });

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
    'Pastikan app/.env berisi:\nVITE_SHEETS_TOKEN=' + secret
  );
  return secret;
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

function assetFolder_() {
  var it = DriveApp.getFoldersByName('Undangan Assets');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Undangan Assets');
}

function configSheet_() {
  var sh = sheet_('Config');
  if (!sh) { sh = ss_().insertSheet('Config'); sh.appendRow(['key', 'value']); }
  return sh;
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
    var reads = { listGuests: 1, listWishes: 1, getConfig: 1, getGuest: 1, uploadImage: 1 };
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
    case 'listGuests':
      return json_({ data: rows_('Guests') });

    case 'getGuest': {
      var gr = findRow_('Guests', 'id', body.id);
      if (gr < 0) return json_({ data: null });
      var head = sheet_('Guests').getDataRange().getValues()[0];
      return json_({ data: { name: sheet_('Guests').getRange(gr, head.indexOf('name') + 1).getValue() } });
    }

    case 'uploadImage': {
      // Studio photo/ornament upload -> "Undangan Assets" folder in your Drive, shared view-only by link.
      var mime = String(body.mime || 'image/jpeg');
      if (mime.indexOf('image/') !== 0) return json_({ error: 'not an image' });
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
      if (row < 0) {
        sheet_('Guests').appendRow([guestId, guestName, guestCategory, guestPhone, invited, '', '', '', '', '']);
      } else {
        setCell_('Guests', row, 'name', guestName);
        if (g.category !== undefined) setCell_('Guests', row, 'category', guestCategory);
        if (g.phone !== undefined) setCell_('Guests', row, 'phone', guestPhone);
        if (g.invited !== undefined) setCell_('Guests', row, 'invited', invited);
      }
      return json_({ data: null });
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
      var rsvpGuestId = String(body.guestId || '').trim().slice(0, 100);
      var rsvpName = String(body.name || '').trim().slice(0, 80);
      if (!rsvpGuestId || !rsvpName) return json_({ error: 'guest id and name required' });
      // Enforce the same max-two rule server-side: altered browser requests
      // cannot overbook seats.
      var party = body.rsvp === 'yes' ? Math.min(2, Math.max(1, Number(body.guests) || 1)) : 0;
      var r = findRow_('Guests', 'id', rsvpGuestId);
      if (r < 0) { sheet_('Guests').appendRow([rsvpGuestId, rsvpName, '', '', 2, now, body.rsvp, party, '', '']); }
      else {
        setCell_('Guests', r, 'rsvp', body.rsvp);
        setCell_('Guests', r, 'guests', party);
        if (!sheet_('Guests').getRange(r, 6).getValue()) setCell_('Guests', r, 'opened', now);
      }
      return json_({ data: null });
    }

    case 'checkIn': {
      var checkInId = String(body.guestId || '').trim().slice(0, 100);
      if (!checkInId) return json_({ error: 'guest id required' });
      var cr = findRow_('Guests', 'id', checkInId);
      if (cr < 0) return json_({ data: false });
      setCell_('Guests', cr, 'checkedInAt', now);
      return json_({ data: true });
    }

    case 'listWishes': {
      var all = !!body.all;
      // Wishes are public immediately. Legacy "pending" rows remain public;
      // only an intentional hide action removes one from the wall.
      var list = rows_('Wishes').filter(function (w) { return all || w.status !== 'hidden'; });
      return json_({ data: list.reverse() });
    }

    case 'addWish': {
      var wishName = String(body.name || '').trim().slice(0, 80);
      var wishText = String(body.text || '').trim().slice(0, 600);
      if (!wishName || !wishText) return json_({ error: 'wish name and text required' });
      sheet_('Wishes').appendRow([Utilities.getUuid(), wishName, wishText, now, 'approved']);
      return json_({ data: null });
    }

    case 'getConfig': {
      var cv = configSheet_().getDataRange().getValues();
      for (var ci = 1; ci < cv.length; ci++) if (cv[ci][0] === 'config') return json_({ data: JSON.parse(cv[ci][1] || 'null') });
      return json_({ data: null });
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
      sheet_('Events').appendRow([now, body.guestId || '', body.event]);
      var er = findRow_('Guests', 'id', body.guestId);
      if (er > 0 && !sheet_('Guests').getRange(er, 6).getValue()) setCell_('Guests', er, 'opened', now);
      return json_({ data: null });
    }
  }
  return json_({ error: 'unknown action' });
}
