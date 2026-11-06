/** VPS cron: verify the authenticated database read and email on failure or recovery.
 * Run with `node --env-file=.env.monitor scripts/monitor-availability.mjs`.
 * The env file must stay on the VPS and out of Git. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import { shouldSendAlert } from './monitor-policy.mjs';

const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} belum diatur`);
  return value;
};

const site = new URL(required('MONITOR_URL'));
if (site.protocol !== 'https:' || site.pathname !== '/' || site.search || site.hash) throw new Error('MONITOR_URL harus berupa origin HTTPS tanpa path/query');
const secret = required('KEEPALIVE_SECRET');
if (secret.length < 32) throw new Error('KEEPALIVE_SECRET minimal 32 karakter');

const recipient = required('ALERT_TO_EMAIL');
const sender = required('ALERT_FROM_EMAIL');
const smtpHost = required('ALERT_SMTP_HOST');
const smtpUser = required('ALERT_SMTP_USER');
const smtpPassword = required('ALERT_SMTP_PASSWORD');
const smtpPort = Number(process.env.ALERT_SMTP_PORT || 465);
if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('ALERT_SMTP_PORT tidak valid');

const statePath = resolve(process.env.MONITOR_STATE_FILE || '.monitor-state.json');
const reminderHours = Number(process.env.MONITOR_REMINDER_HOURS || 24);
if (!Number.isFinite(reminderHours) || reminderHours < 1) throw new Error('MONITOR_REMINDER_HOURS tidak valid');
const transport = nodemailer.createTransport({
  host: smtpHost, port: smtpPort, secure: smtpPort === 465, requireTLS: smtpPort !== 465,
  auth: { user: smtpUser, pass: smtpPassword }, connectionTimeout: 15000, socketTimeout: 15000
});

async function sendEmail(subject, body) {
  await transport.sendMail({ from: sender, to: recipient, subject, text: body });
}

async function readState() {
  try { return JSON.parse(await readFile(statePath, 'utf8')); }
  catch { return { status: 'unknown', lastNotifiedAt: '' }; }
}

async function writeState(state) {
  await mkdir(dirname(statePath), { recursive: true });
  const temp = `${statePath}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, statePath);
}

async function check() {
  try {
    const response = await fetch(new URL('/api/keep-alive', site), {
      method: 'GET', headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20000), cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) throw new Error(`HTTP ${response.status}`);
    return { healthy: true, reason: 'HTTP 200 + ok:true' };
  } catch (error) {
    return { healthy: false, reason: error instanceof Error ? error.message : 'request gagal' };
  }
}

if (process.argv.includes('--test-email')) {
  await sendEmail('[Undangan] Tes alert monitoring', `Email uji dari monitor undangan untuk ${site.origin}.`);
  console.log('Email uji terkirim.');
  process.exit(0);
}

const now = new Date();
const state = await readState();
const result = await check();
const status = result.healthy ? 'healthy' : 'failed';
const shouldNotify = shouldSendAlert(state, result.healthy, now.getTime(), reminderHours);

if (shouldNotify) {
  const subject = result.healthy ? '[Undangan] Pulih: Supabase dapat diakses' : '[Undangan] Gagal: periksa Supabase';
  const body = [
    `Waktu: ${now.toISOString()}`,
    `Situs: ${site.origin}`,
    `Hasil: ${result.reason}`,
    result.healthy ? 'Layanan kembali merespons.' : 'Periksa Vercel Functions, project Supabase, dan secret keep-alive.'
  ].join('\n');
  await sendEmail(subject, body);
}

await writeState({ status, lastCheckedAt: now.toISOString(), lastNotifiedAt: shouldNotify ? now.toISOString() : state.lastNotifiedAt || '' });
console.log(JSON.stringify({ status, reason: result.reason, checkedAt: now.toISOString(), emailSent: shouldNotify }));
if (!result.healthy) process.exitCode = 1;
