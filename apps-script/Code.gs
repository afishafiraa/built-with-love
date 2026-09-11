/**
 * Google Sheets backend for the wedding invitation.
 *
 * Setup
 *  1. Create a spreadsheet with four tabs: Guests, Wishes, Events, Config.
 *     Guests header:  id | name | category | phone | invited | opened | rsvp | guests | checkedInAt
 *     Wishes header:  id | name | text | createdAt | status
 *     Events header:  at | guestId | event
 *     Config header:  key | value        (written by /studio "Terbitkan"; created automatically if missing)
 *  2. Extensions > Apps Script, paste this file, set SECRET below.
 *  3. Deploy > New deployment > Web app > Execute as: me, Access: anyone.
 *  4. Put the /exec URL in VITE_SHEETS_ENDPOINT and SECRET in VITE_SHEETS_TOKEN.
 *  After editing this file: Deploy > Manage deployments > Edit > Version: New version
 *  (the /exec URL stays the same). The first deploy after this version asks for Google
 *  Drive permission — photos uploaded in /studio are saved in Drive > "Undangan Assets".
 */
var SECRET = 'ganti-dengan-rahasia';
var SS = SpreadsheetApp.getActiveSpreadsheet();

function sheet_(name) { return SS.getSheetByName(name); }

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
  if (!sh) { sh = SS.insertSheet('Config'); sh.appendRow(['key', 'value']); }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents || '{}');
  if (body.token !== SECRET) return json_({ error: 'unauthorized' });
  var now = new Date().toISOString();

  // Serialise writes so two RSVPs arriving together can't overwrite each other.
  var reads = { listGuests: 1, listWishes: 1, getConfig: 1, getGuest: 1, uploadImage: 1 };
  var lock = null;
  if (!reads[body.action]) { lock = LockService.getScriptLock(); lock.waitLock(15000); }
  try { return handle_(body, now); } finally { if (lock) lock.releaseLock(); }
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
      var row = findRow_('Guests', 'id', g.id);
      if (row < 0) {
        sheet_('Guests').appendRow([g.id, g.name, g.category || '', g.phone || '', g.invited || 1, '', '', '', '']);
      } else {
        ['name', 'category', 'phone', 'invited'].forEach(function (k) {
          if (g[k] !== undefined) setCell_('Guests', row, k, g[k]);
        });
      }
      return json_({ data: null });
    }

    case 'rsvp': {
      var r = findRow_('Guests', 'id', body.guestId);
      if (r < 0) { sheet_('Guests').appendRow([body.guestId || body.name, body.name, '', '', body.guests, now, body.rsvp, body.guests, '']); }
      else {
        setCell_('Guests', r, 'rsvp', body.rsvp);
        setCell_('Guests', r, 'guests', body.guests);
        if (!sheet_('Guests').getRange(r, 6).getValue()) setCell_('Guests', r, 'opened', now);
      }
      return json_({ data: null });
    }

    case 'checkIn': {
      var cr = findRow_('Guests', 'id', body.guestId);
      if (cr > 0) setCell_('Guests', cr, 'checkedInAt', now);
      return json_({ data: null });
    }

    case 'listWishes': {
      var all = !!body.all;
      var list = rows_('Wishes').filter(function (w) { return all || w.status === 'approved'; });
      return json_({ data: list.reverse() });
    }

    case 'addWish':
      sheet_('Wishes').appendRow([Utilities.getUuid(), String(body.name || '').slice(0, 80), String(body.text || '').slice(0, 600), now, 'pending']);
      return json_({ data: null });

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
