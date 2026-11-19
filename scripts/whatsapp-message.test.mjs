import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatInvitationMessage } from '../src/lib/whatsapp-message.ts';
import { whatsappMessageUrl } from '../src/lib/whatsapp-url.ts';
import { guestLink } from '../src/lib/invite.ts';

const config = {
  groomName: 'Groom', brideName: 'Bride', groomFull: 'Groom Full Name', brideFull: 'Bride Full Name',
  dateLabel: 'Minggu, 3 Januari 2027', dateLabelEn: 'Sunday, 3 January 2027', dateISO: '2027-01-02T18:00:00Z'
};
const guest = 'Élodie & Keluarga';
const link = guestLink('https://invitation.example', guest, '12345678');

test('Indonesian version includes the couple and personal link without duplicating event details', () => {
  const text = formatInvitationMessage(guest, link, config, 'id');
  assert.ok(text.startsWith('Kepada Yth.\nBapak/Ibu/Saudara/I\n' + guest));
  assert.ok(text.includes('💍 Groom Full Name & Bride Full Name'));
  assert.ok(text.includes('Groom & Bride🤍'));
  assert.doesNotMatch(text, /Tanggal :|Minggu, 3 Januari 2027/);
  assert.ok(text.includes('Mohon maaf perihal undangan hanya di bagikan melalui pesan ini. Terima kasih banyak atas perhatiannya.'));
  assert.ok(text.includes(link));
  assert.ok(text.endsWith('Wassalamualaikum Warahmatullahi Wabarakatuh.'));
});

test('English version uses the same couple, recipient and personal link', () => {
  const text = formatInvitationMessage(guest, link, config, 'en');
  assert.ok(text.startsWith('Dear ' + guest + ','));
  assert.ok(text.includes('💍 Groom Full Name & Bride Full Name'));
  assert.ok(text.includes('Groom & Bride🤍'));
  assert.equal(text.split(link).length, 2);
  assert.doesNotMatch(text, /Kepada Yth|Tanggal :|Date:|Sunday, 3 January 2027|Minggu|Januari/);
});

test('missing recipient and event dates still produce usable messages in both languages', () => {
  for (const lang of ['id', 'en']) {
    const text = formatInvitationMessage('', link, { ...config, dateLabelEn: '', dateLabel: '', dateISO: '' }, lang);
    assert.ok(text.startsWith(lang === 'en' ? 'Dear Guest,' : 'Kepada Yth.\nBapak/Ibu/Saudara/I\nBapak/Ibu/Saudara/i'));
    assert.ok(text.includes(link));
    assert.doesNotMatch(text, /Date:|Tanggal :|undefined|Invalid Date/);
  }
});

for (const language of ['id', 'en']) {
  for (const target of ['web', 'app']) {
    test(`${language} ${target}: the exact preview body round-trips through WhatsApp with Unicode and the full query string`, () => {
      const preview = formatInvitationMessage(guest, link, config, language);
      const wa = new URL(whatsappMessageUrl('6280000000000', preview, target));
      assert.equal(wa.searchParams.get('text'), preview);
      assert.ok(wa.searchParams.get('text').includes(link));
      assert.doesNotMatch(preview, /\uFFFD/);
    });
  }
}
