// Obtain a Chrome Web Store API refresh token via the OAuth loopback flow.
//
// Works with the existing "Desktop app" OAuth client. The legacy out-of-band
// (OOB) flow that `wxt submit init` uses was disabled by Google, so this
// uses the loopback redirect (http://127.0.0.1:<port>) instead.
//
// Usage:
//   CHROME_CLIENT_ID=... CHROME_CLIENT_SECRET=... node scripts/get-chrome-token.mjs
//
// The printed value goes into the `CHROME_REFRESH_TOKEN` GitHub Actions secret.

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.CHROME_CLIENT_ID;
const CLIENT_SECRET = process.env.CHROME_CLIENT_SECRET;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set CHROME_CLIENT_ID and CHROME_CLIENT_SECRET env vars first.');
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
let redirectUri;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== '/') return res.writeHead(404).end();

  const error = url.searchParams.get('error');
  if (error) {
    res.end(`Authorization failed: ${error}`);
    console.error('Authorization failed:', error);
    return shutdown(1);
  }
  if (url.searchParams.get('state') !== state) {
    res.end('State mismatch — aborting.');
    console.error('State mismatch — aborting.');
    return shutdown(1);
  }

  const body = new URLSearchParams({
    code: url.searchParams.get('code'),
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await resp.json();

  if (!resp.ok || !data.refresh_token) {
    res.end('Token exchange failed — see terminal.');
    console.error('Token exchange failed:', JSON.stringify(data, null, 2));
    return shutdown(1);
  }

  res.end('Success! You can close this tab and return to the terminal.');
  console.log('\n=== CHROME_REFRESH_TOKEN ===\n');
  console.log(data.refresh_token);
  console.log('\n→ Store this as the CHROME_REFRESH_TOKEN GitHub secret.\n');
  shutdown(0);
});

function shutdown(code) {
  server.close(() => process.exit(code));
}

server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline'); // returns a refresh_token
  authUrl.searchParams.set('prompt', 'consent'); // forces a fresh refresh_token
  authUrl.searchParams.set('state', state);

  console.log('Open this URL in your browser and sign in:\n');
  console.log(authUrl.toString() + '\n');

  const opener =
    process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""'
    : 'xdg-open';
  exec(`${opener} "${authUrl}"`, () => {});
});
