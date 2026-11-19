import type { ApiRequest, ApiResponse } from './http.js';

type PageSources = {
  loadHtml: (req: ApiRequest) => Promise<string>;
  loadConfig: () => Promise<unknown>;
};

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function pageOrigin(req: ApiRequest) {
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return 'https://hanif-afi.my.id';
  const local = /^(localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(host);
  return (local ? 'http://' : 'https://') + host;
}

export function createInvitationPage({ loadHtml, loadConfig }: PageSources) {
  return async (req: ApiRequest, res: ApiResponse) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end();
      return;
    }

    const html = await loadHtml(req);
    let title = 'Wedding Invitation';
    try {
      const config = await loadConfig();
      if (config && typeof config === 'object') {
        const { groomName, brideName } = config as Record<string, unknown>;
        if (typeof groomName === 'string' && groomName.trim() && typeof brideName === 'string' && brideName.trim()) {
          title += ' ' + groomName.trim() + ' & ' + brideName.trim();
        }
      }
    } catch {
      // A metadata lookup must not prevent guests from opening the invitation.
      console.warn('Invitation preview names unavailable; serving generic title.');
    }
    const escapedTitle = escapeHtml(title);
    const imageUrl = escapeHtml(pageOrigin(req) + '/share-logo-v1.png');
    const shareMetadata = [
      '<meta property="og:image" content="' + imageUrl + '" />',
      '<meta property="og:image:type" content="image/png" />',
      '<meta property="og:image:width" content="2000" />',
      '<meta property="og:image:height" content="2000" />',
      '<meta property="og:image:alt" content="Wedding monogram" />',
      '<meta name="twitter:card" content="summary" />',
      '<meta name="twitter:title" content="' + escapedTitle + '" />',
      '<meta name="twitter:image" content="' + imageUrl + '" />'
    ].join('\n    ');
    const page = html
      .replace(/<title>[^<]*<\/title>/, () => '<title>' + escapedTitle + '</title>')
      .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, () => '<meta property="og:title" content="' + escapedTitle + '" />')
      .replace('</head>', () => '    ' + shareMetadata + '\n  </head>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).end(req.method === 'HEAD' ? undefined : page);
  };
}
