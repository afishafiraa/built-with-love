import { callBackend } from '../server/data.js';
import { loadInvitationHtml } from '../server/invitation-html.js';
import { createInvitationPage } from '../server/invitation-page.js';

export default createInvitationPage({
  loadHtml: loadInvitationHtml,
  loadConfig: () => callBackend('getConfig')
});
