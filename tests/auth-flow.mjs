// The Studio's email-driven sign-in screens against a fake Supabase: resending a confirmation
// link, asking for a password reset, and landing from the reset link to choose a new password.
//
//   node tests/auth-flow.mjs
import { chromium } from '@playwright/test';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SB = readFileSync(ROOT + '/assets/studio.js', 'utf8').match(/var URL_ = "([^"]+)"/)[1];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const USER = { id: '6f1f7c1e-0000-4000-8000-000000000001', email: 'founder@example.com' };
const calls = [];
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('http://forge.test/**', route => {
  let f = join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) return route.fulfill({ status: 404, body: 'not found' });
  route.fulfill({ status: 200, contentType: TYPES[extname(f)] || 'application/octet-stream', body: readFileSync(f) });
});
await ctx.route(SB + '/**', route => {
  const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  calls.push(`${method} ${path} ${req.postData() || ''}`);
  if (path === '/auth/v1/token') return json(route, 400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
  if (path === '/auth/v1/resend' || path === '/auth/v1/recover') return json(route, 200, {});
  if (path === '/auth/v1/user') return json(route, 200, USER);
  if (path.startsWith('/rest/v1/studio_accounts')) return json(route, 200, [{ id: USER.id, email: USER.email, free_packs: 1, packs_used: 0, is_admin: false }]);
  if (path.startsWith('/rest/v1/')) return json(route, 200, []);
  return json(route, 404, {});
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) errors.push(what); };

// 1. Signing in before confirming offers to send the link again
await page.goto('http://forge.test/app/');
await page.fill('#a-email', USER.email);
await page.fill('#a-pw', 'a long password');
await page.click('button[type=submit]');
await page.click('#a-resend');
await page.waitForFunction(() => /Sent\./.test(document.getElementById('a-err').textContent));
check(calls.some(c => c.startsWith('POST /auth/v1/resend') && c.includes('"type":"signup"') && c.includes(USER.email)), 'resend sends a new confirmation link');

// 2. Forgot password emails a link
await page.click('#a-forgot');
await page.fill('#a-email', USER.email);
await page.click('button[type=submit]');
await page.waitForFunction(() => /on its way/.test(document.getElementById('a-note').textContent));
check(calls.some(c => c.startsWith('POST /auth/v1/recover') && c.includes(USER.email)), 'forgot password asks for a reset link');

// 3. The reset link lands on "choose a new password", which saves it and opens the app. An email
// link opens a fresh page, so leave this one first (a hash-only change wouldn't reload the app).
await page.goto('about:blank');
await page.goto('http://forge.test/app/#access_token=tok&refresh_token=ref&expires_in=3600&token_type=bearer&type=recovery');
await page.waitForSelector('#a-pw');
check(await page.locator('h1').innerText() === 'Choose a new password', 'reset link shows the new-password form');
check(!/access_token/.test(page.url()), 'the token is cleared from the address bar');
await page.fill('#a-pw', 'short');
await page.click('button[type=submit]');
check(/10 characters/.test(await page.locator('#a-err').innerText()), 'short passwords are refused');
await page.fill('#a-pw', 'a new long password');
await page.click('button[type=submit]');
await page.waitForSelector('#new-app, #new-app-2');
check(calls.some(c => c.startsWith('PUT /auth/v1/user') && c.includes('a new long password')), 'the new password is saved');

console.log(errors.length ? `\n${errors.length} problem(s)` : '\nall passed');
await b.close();
process.exit(errors.length ? 1 : 0);
