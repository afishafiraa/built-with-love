import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { callBackend } from '../server/data.js';
import { createInvitationPage } from '../server/invitation-page.js';

export default createInvitationPage({
  loadHtml: () => readFile(join(process.cwd(), 'dist/invitation-shell.html'), 'utf8'),
  loadConfig: () => callBackend('getConfig')
});
