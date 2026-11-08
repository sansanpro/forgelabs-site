// Walks the Studio app (/app/) through its whole flow against an in-memory fake of the Supabase
// API: sign up, brief, uploads, hooks, script, preview and pack. No real backend is touched.
//
//   npm install && npx playwright install chromium     once
//   npm run test:ui                                    screenshots go to tests/out/
//
// The fake "worker" finishes jobs by filling in results from engine/tests/out/ (run the engine's
// fixture preview and pack first; see engine/README.md).
import { chromium } from '@playwright/test';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = ROOT + '/engine/tests/fixture';
const OUT = ROOT + '/tests/out';
mkdirSync(OUT, { recursive: true });
const SB = 'https://xhtwtnsvdmabfvewjgwz.supabase.co';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };
const USER = { id: randomUUID(), email: 'founder@example.com' };
const db = { studio_accounts: [{ id: USER.id, email: USER.email, free_packs: 1, packs_used: 0, is_admin: false }],
  studio_projects: [], studio_assets: [], studio_hooks: [], studio_batches: [], studio_jobs: [] };
const calls = [];
const store = {};  // uploaded files, by storage path

function filter(rows, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3));
    if (v.startsWith('in.(')) { const set = v.slice(4, -1).split(','); rows = rows.filter(r => set.includes(String(r[k]))); }
  }
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map(o => o.split('.'));
    rows = [...rows].sort((a, b) => { for (const [k, dir] of keys) { if (a[k] < b[k]) return dir === 'desc' ? 1 : -1; if (a[k] > b[k]) return dir === 'desc' ? -1 : 1; } return 0; });
  }
  if (params.get('limit')) rows = rows.slice(0, Number(params.get('limit')));
  return rows;
}
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function api(route) {
  const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
  calls.push(method + ' ' + path + url.search);
  const body = req.postData();
  if (path.startsWith('/storage/v1/object/sign/x/')) return route.fallback();
  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/')) return json(route, 200, { access_token: 'tok', refresh_token: 'ref', user: USER });
  if (path === '/functions/v1/studio-ai') return json(route, 503, { error: 'ai_unavailable' });
  if (path.startsWith('/storage/v1/object/sign/')) {
    const { paths } = JSON.parse(body);
    return json(route, 200, paths.map(p => ({ path: p, signedURL: '/object/sign/x/' + p + '?token=t' })));
  }
  if (path.startsWith('/storage/v1/object/studio-uploads/') && method === 'POST') {
    store[decodeURIComponent(path.replace('/storage/v1/object/studio-uploads/', ''))] = { body: req.postDataBuffer(), type: req.headers()['content-type'] };
    return json(route, 200, { Key: path });
  }
  if (path.startsWith('/storage/v1/object/')) return json(route, 200, { Key: path });
  if (path === '/rest/v1/rpc/studio_queue') {
    const { p_batch, p_kind } = JSON.parse(body);
    const b = db.studio_batches.find(x => x.id === p_batch);
    if (p_kind === 'pack') { const a = db.studio_accounts[0]; if (a.packs_used >= a.free_packs) return json(route, 400, { message: 'no_packs_left', code: 'P0001' }); a.packs_used++; }
    b.status = 'queued';
    const j = { id: randomUUID(), batch_id: b.id, owner: USER.id, kind: p_kind, status: 'queued', created_at: new Date().toISOString(), progress: null };
    db.studio_jobs.push(j);
    return json(route, 200, j);
  }
  const table = path.replace('/rest/v1/', '');
  if (!db[table]) return json(route, 404, { message: 'no table ' + table });
  const params = url.searchParams;
  if (method === 'GET') return json(route, 200, filter(db[table], params));
  if (method === 'POST') {
    const row = { id: randomUUID(), owner: USER.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...JSON.parse(body) };
    if (table === 'studio_batches') row.status = 'draft';
    if (table === 'studio_hooks') { row.selected = row.selected || false; row.checks = []; }
    if (table === 'studio_projects') { row.brief = row.brief || {}; row.brand = {}; }
    db[table].push(row);
    return json(route, 201, [row]);
  }
  if (method === 'PATCH') {
    const rows = filter(db[table], params);
    rows.forEach(r => Object.assign(r, JSON.parse(body)));
    return json(route, 200, rows);
  }
  if (method === 'DELETE') {
    const rows = filter(db[table], params);
    db[table] = db[table].filter(r => !rows.includes(r));
    return json(route, 200, rows);
  }
  return json(route, 400, { message: 'unhandled' });
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('http://forge.test/**', route => {
  let f = join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) return route.fulfill({ status: 404, body: 'not found' });
  route.fulfill({ status: 200, contentType: TYPES[extname(f)] || 'application/octet-stream', body: readFileSync(f) });
});
// Signed links: serve fixture files by name (uploads) or the engine's test output (renders)
await ctx.route(SB + '/storage/v1/object/sign/x/**', route => {
  const p = new URL(route.request().url()).pathname;
  const key = decodeURIComponent(p.replace('/storage/v1/object/sign/x/', ''));
  if (store[key]) return route.fulfill({ status: 200, contentType: store[key].type, body: store[key].body });
  const name = p.split('/').pop();
  const cands = [join(FIX, name), join(ROOT, 'engine/tests/out/fixture', name), join(ROOT, 'engine/tests/out/fixture-pack', p.split('/').slice(-2).join('/'))];
  const f = cands.find(existsSync);
  if (!f) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ status: 200, contentType: TYPES[extname(f)] || 'application/octet-stream', body: readFileSync(f) });
});
await ctx.route(SB + '/**', api);

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log('shot', n); };

// Sign up
await page.goto('http://forge.test/app/?new=1');
await page.fill('#a-email', USER.email); await page.fill('#a-pw', 'correct horse battery');
await page.click('button[type=submit]');
await page.waitForSelector('#new-app'); await shot('01-apps-empty');
await page.click('#new-app-2');
await page.waitForSelector('#b-name');

// Brief
await page.fill('#b-name', 'Habitly');
await page.fill('#b-spoken', 'Habit-lee');
await page.fill('#b-one', 'A habit tracker that turns daily habits into streaks you can share with friends.');
await page.fill('#b-aud', 'People who keep restarting the same habit');
await page.fill('#b-prob', 'I start strong every January and give up by February.');
await page.fill('#b-out', 'Keep a habit going for more than a few weeks.');
await page.fill('#b-ck', 'Duolingo'); await page.fill('#b-ct', 'your habits');
await page.fill('#b-cant', "It doesn't see your health data or give medical advice.");
await page.fill('#b-facts', 'Free to download. Streaks, reminders and friends.');
await shot('02-brief');
await page.click('#b-save');

// Screens
await page.waitForSelector('#up', { state: 'attached' });
await page.setInputFiles('#up', ['today.png', 'done.png', 'stats.png', 'friends.png', 'scroll.mp4'].map(f => join(FIX, f)));
await page.waitForFunction(() => document.querySelectorAll('.shot').length === 5, null, { timeout: 15000 });
await page.setInputFiles('#up-icon', join(FIX, 'icon.png'));
await page.waitForSelector('.iconprev', { timeout: 15000 });
await page.fill('[data-label]:nth-of-type(1)', 'Today list');
await shot('03-screens');
await page.click('#s-next');

// Hooks
await page.waitForSelector('#h-text');
await page.click('[data-tmpl="comparison"]');
await page.waitForTimeout(200);
await shot('04a-hook-template');
await page.click('#h-add');
await page.waitForSelector('.hook');
await page.fill('#h-text', "You've restarted the same habit five times this year.");
await page.dispatchEvent('#h-text', 'input');
await page.selectOption('#h-cat', 'callout');
await page.click('#h-add');
await page.waitForFunction(() => document.querySelectorAll('.hook').length === 2);
for (let i = 0; i < 2; i++) { await page.locator('[data-pick]').nth(i).check(); await page.waitForTimeout(400); }
await page.click('#h-ai');
await page.waitForTimeout(800);
await shot('04b-hooks');
await page.click('#h-next');

// Script
await page.waitForSelector('[data-s="0"][data-f="say"]');
await page.fill('[data-s="0"][data-f="say"]', 'Tick off a habit and watch your day fill up.');
await page.fill('[data-s="0"][data-f="head"]', 'Tap to tick it off');
await page.fill('[data-s="1"][data-f="say"]', "Every streak shows how far you've come.");
await page.fill('[data-s="1"][data-f="head"]', 'See your streaks');
await page.fill('[data-s="2"][data-f="say"]', 'Friends keep you honest.');
await page.fill('#sc-line', 'Build habits that stick.');
await page.selectOption('[data-s="2"][data-f="motion"]', 'zoom');
await page.waitForSelector('[data-f="zoomAt"]');
await shot('05-script');
await page.click('#sc-save');

// Make: preview
await page.waitForSelector('#m-prev');
await shot('06a-make');
const ack = await page.$('#m-ack');
if (ack) await ack.check();
await page.click('#m-prev');
await page.waitForSelector('.batch .pill.queued', { timeout: 10000 });
await shot('06b-queued');
// The "worker" finishes the preview
const batch = db.studio_batches[0], job = db.studio_jobs[0];
job.status = 'done'; batch.status = 'preview_ready';
batch.preview = { base: USER.id + '/' + batch.id + '/' + job.id, files: [], manifest: { kind: 'preview', strips: { 'h1-comparison': 'h1-comparison-preview.jpg', 'h2-callout': 'h2-callout-preview.jpg' } } };
await page.waitForSelector('.strips img', { timeout: 15000 });
await page.waitForTimeout(1500);
await shot('06c-preview');

// Make: pack
await page.click('#m-pack');
await page.waitForFunction(() => document.querySelector('.batch .pill.queued'), null, { timeout: 10000 });
const job2 = db.studio_jobs[1];
job2.status = 'running'; job2.progress = 'Recording the voiceovers'; batch.status = 'running';
await page.waitForFunction(() => /Recording the voiceovers/.test(document.body.innerText), null, { timeout: 15000 });
await shot('07a-rendering');
job2.status = 'done'; batch.status = 'done';
batch.result = { base: USER.id + '/' + batch.id + '/' + job2.id, files: [], manifest: JSON.parse(readFileSync(ROOT + '/engine/tests/out/fixture-pack/manifest.json', 'utf8')) };
await page.waitForSelector('.vids video', { timeout: 15000 });
await page.waitForTimeout(1500);
await shot('07b-pack');
const links = await page.$$eval('[data-dl]', els => els.map(e => e.getAttribute('href')));
console.log('download links:', links.length, links.slice(0, 3));
console.log('packs used:', db.studio_accounts[0].packs_used, 'hooks:', db.studio_hooks.map(h => h.text + (h.selected ? ' [picked]' : '')));
console.log('spec hooks:', JSON.stringify(batch.spec.hooks));
console.log('spec body:', JSON.stringify(batch.spec.body));
console.log('spec opening/voice/cta:', JSON.stringify([batch.spec.opening, batch.spec.voice, batch.spec.cta, batch.spec.brand]));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await b.close();
process.exit(errors.length ? 1 : 0);
