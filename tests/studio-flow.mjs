// Walks the Studio app (/app/) through its whole flow against an in-memory fake of the Supabase
// API. App one starts from a store link with AI on: the import, five hooks with their claim
// checks, a rewrite, the pre-filled script, the panels, the frame preview, the pack's progress
// and the finished pack. App two is set up by hand with AI off. No real backend is touched.
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
// The backend the app talks to, read from the app so this always fakes the right one
const SB = readFileSync(ROOT + '/assets/studio.js', 'utf8').match(/var URL_ = "([^"]+)"/)[1];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };
const USER = { id: randomUUID(), email: 'founder@example.com' };
const db = { studio_accounts: [{ id: USER.id, email: USER.email, free_packs: 1, packs_used: 0, is_admin: false }],
  studio_projects: [], studio_assets: [], studio_hooks: [], studio_batches: [], studio_jobs: [] };
const calls = [];
const store = {};  // uploaded files, by storage path
let aiOn = true;   // studio-ai answers like the deployed function with ANTHROPIC_API_KEY set, or 503

/* studio-ai: five hooks one per angle, a claim check that blocks one of them, and a script */
function studioAi(d) {
  if (!aiOn) return [503, { error: 'ai_unavailable' }];
  if (d.action === 'suggest_angles') return [200, { hooks: [
    { angle: 'comparison', text: "It's like Duolingo, but for your habits.", benefit: 'Streaks that stick.' },
    { angle: 'pain', text: 'Your new habits fall apart by Friday.', benefit: 'Tick off habits in one tap.' },
    { angle: 'watch', text: 'Watch a messy week turn into a streak.', benefit: 'See every streak at once.' },
    { angle: 'result', text: 'A month of streaks, without the guilt.', benefit: 'Share progress with friends.' },
    { angle: 'proof', text: 'Rated 4.7 stars by over 12,000 people.', benefit: 'Daily habits, shared streaks.' }] }];
  if (d.action === 'check_hooks') return [200, { results: d.hooks.map(t => /fall apart by Friday/.test(t)
    ? { text: t, verdict: 'block', reasons: ['Implies the viewer fails at habits.'], rewrite: 'New habits are hard to keep past Friday.' }
    : { text: t, verdict: 'ok', reasons: [], rewrite: '' }) }];
  if (d.action === 'draft_script') {
    const ids = d.screens.filter(x => x.kind !== 'recording').map(x => x.id);
    return [200, { benefit: 'Streaks that stick.', end_line: 'Build habits that stick.', body: [
      { say: 'Tick off a habit in one tap.', head: 'One tap', screen: ids[0], motion: 'rise' },
      { say: "Every streak shows how far you've come.", head: 'Your streaks', screen: ids[1], motion: 'page' },
      { say: 'Friends keep you honest.', head: 'Bring a friend', screen: ids[2], motion: 'page' }] }];
  }
  return [400, { error: 'unknown_action' }];
}

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
// Postgres stores jsonb with its own key order (shorter keys first); mimic it so the app can't rely on order
function reorder(v) {
  if (Array.isArray(v)) return v.map(reorder);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map(k => [k, reorder(v[k])]));
  return v;
}
const MZ = 'https://is1-ssl.mzstatic.com/test/';  // the App Store's image host, served from the fixture
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function api(route) {
  const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
  calls.push(method + ' ' + path + url.search);
  const body = req.postData();
  if (path.startsWith('/storage/v1/object/sign/x/')) return route.fallback();
  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.startsWith('/auth/v1/')) return json(route, 200, { access_token: 'tok', refresh_token: 'ref', user: USER });
  if (path === '/functions/v1/studio-ai') { const [st, out] = studioAi(JSON.parse(body)); return json(route, st, out); }
  if (path === '/functions/v1/studio-store') {
    if (!/apps\.apple\.com\/.*id\d+/.test(JSON.parse(body).url)) return json(route, 400, { error: 'store_link' });
    // The square icon in the screenshot list stands in for a tablet shot: it must be skipped
    return json(route, 200, { store: 'apple', name: 'Habitly', seller: 'Habitly Ltd', subtitle: 'Streaks for your daily habits',
      description: 'Build habits that stick. More text.', category: 'Health & Fitness', rating: 4.7, ratings: 12345, icon: MZ + 'icon.png',
      screenshots: ['today.png', 'icon.png', 'done.png', 'stats.png'].map(f => MZ + f) });
  }
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
    const said = b.spec.hooks.map(h => h.say.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    if (p_kind === 'pack' && said.length < 3) return json(route, 400, { message: 'pack_needs_3_hooks', code: 'P0001' });
    if (new Set(said).size < said.length) return json(route, 400, { message: 'hooks_must_differ', code: 'P0001' });
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
    if (table === 'studio_batches') { row.status = 'draft'; row.spec = reorder(row.spec); }
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
await ctx.route(MZ + '**', route => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' },
  body: readFileSync(join(FIX, new URL(route.request().url()).pathname.split('/').pop())) }));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log('shot', n); };

// Sign up: the apps page leads with the paste box
await page.goto('http://forge.test/app/?new=1');
await page.fill('#a-email', USER.email); await page.fill('#a-pw', 'correct horse battery');
await page.click('button[type=submit]');
await page.waitForSelector('#start-link'); await shot('01-apps-empty');
await page.fill('#start-link', 'https://example.com/not-a-store');
await page.click('#start-go');
await page.waitForFunction(() => /isn't an App Store or Google Play link/.test(document.getElementById('start-status').textContent));

// 1. Paste the store link: the import starts by itself and ends on review
await page.fill('#start-link', 'https://apps.apple.com/us/app/habitly/id1234567890');
await page.dispatchEvent('#start-link', 'paste');
await page.waitForSelector('.importing', { timeout: 10000 });
await shot('02-importing');
await page.waitForURL(/\/review$/, { timeout: 30000 });
await page.waitForFunction(() => document.querySelectorAll('.hook').length === 5 && !document.querySelector('.badge.wait'), null, { timeout: 15000 });
await page.waitForTimeout(1200);
await shot('03-review');
const p1 = db.studio_projects[0], a1 = db.studio_assets.filter(a => a.project_id === p1.id);
if (p1.name !== 'Habitly' || p1.brief.one_liner !== 'Streaks for your daily habits' || p1.brief.store_ratings !== 12345)
  errors.push('the import did not fill in the brief: ' + JSON.stringify([p1.name, p1.brief]));
if (a1.filter(a => a.kind === 'screen').length !== 3 || a1.filter(a => a.kind === 'icon').length !== 1)
  errors.push('the import should add 3 phone screenshots (not the square one) and the icon');
if (!(await page.isVisible('text=Setting up')) && !/\/review$/.test(page.url())) errors.push('the import should show its steps');
const angles = await page.$$eval('.hook .angle', els => els.map(e => e.textContent));
if (angles.join() !== 'Comparison,Pain point,Watch this,Result,Social proof') errors.push('hooks should carry their angles, got ' + angles);
if (await page.locator('.badge.bad').count() !== 1) errors.push('the claim check should block one hook');
if (await page.locator('.hook input[type=checkbox]:checked').count() !== 4) errors.push('the four hooks that can pass should come picked');
if (p1.script.body.filter(x => x.say).length !== 3) errors.push('the script should be pre-filled');
if (!/^#[0-9a-f]{6}$/i.test(p1.script.theme.accent) || p1.script.theme.accent.toLowerCase() === '#ff7a2e') errors.push('the brand colour should come from the icon, got ' + p1.script.theme.accent);

// 2. Review: rewrite the blocked hook in one click, refuse a duplicate, use the panels
await page.click('[data-rewrite]');
await page.waitForFunction(() => !document.querySelector('.badge.bad') && !document.querySelector('.badge.wait'), null, { timeout: 10000 });
await page.fill('#h-text', 'its like DUOLINGO but for your habits!');
await page.click('#h-add');
await page.waitForFunction(() => /already have that hook/.test(document.getElementById('toast').textContent));
await page.click('[data-panel=voice]');
await page.click('.voice:nth-child(2)');
await page.click('[data-panel=end]');
await page.fill('#sc-line', 'Build habits that stick.');
await page.click('#adv summary');
await page.selectOption('[data-s="2"][data-f="move"]', 'zoom:bottom');
await page.waitForTimeout(900);
await shot('04-review-panels');

// Frames first (free), then the pack from the preview screen
await page.waitForSelector('#m-prev:not([disabled])');
await page.click('#m-prev');
await page.waitForURL(/\/make$/, { timeout: 10000 });
await page.waitForSelector('.progress', { timeout: 10000 });
const batch = db.studio_batches[0], job = db.studio_jobs[0];
job.status = 'done'; batch.status = 'preview_ready';
batch.preview = { base: USER.id + '/' + batch.id + '/' + job.id, files: [], manifest: { kind: 'preview', strips: { 'h1-comparison': 'h1-comparison-preview.jpg', 'h2-callout': 'h2-callout-preview.jpg' } } };
await page.waitForSelector('.strips img', { timeout: 15000 });
await page.waitForTimeout(1500);
await shot('05-preview');
await page.click('#p-pack');
await page.waitForFunction(() => /Making your 5 ads/.test(document.body.innerText), null, { timeout: 10000 });
const job2 = db.studio_jobs[1];
job2.status = 'running'; job2.progress = 'Rendering video 2 of 5'; batch.status = 'running';
await page.waitForFunction(() => /video 2 of 5/.test(document.body.innerText) && /left/.test(document.body.innerText), null, { timeout: 15000 });
await shot('06-rendering');
job2.status = 'done'; batch.status = 'done';
batch.result = { base: USER.id + '/' + batch.id + '/' + job2.id, files: [], manifest: JSON.parse(readFileSync(ROOT + '/engine/tests/out/fixture-pack/manifest.json', 'utf8')) };
await page.waitForSelector('.ready video', { timeout: 15000 });
await page.waitForTimeout(1500);
await shot('07-ready');
const links = await page.$$eval('[data-dl]', els => els.map(e => e.getAttribute('href')));
console.log('download links:', links.length, links.slice(0, 3));
console.log('batches:', db.studio_batches.length, '(preview and pack should share one)');
if (db.studio_batches.length !== 1) errors.push('the pack did not reuse the preview batch');
if (batch.spec.opening.screens.length !== 3) errors.push('the opening should have three screens');
const said = batch.spec.hooks.map(h => h.say);
console.log('spec hooks:', JSON.stringify(batch.spec.hooks));
if (said.length !== 5 || new Set(said.map(x => x.toLowerCase())).size !== 5) errors.push('the pack should have five different hooks, got ' + said);
if (!said.includes('New habits are hard to keep past Friday.') || said.includes('Your new habits fall apart by Friday.')) errors.push('the rewrite should replace the blocked hook');
const motions = batch.spec.body.map(s => s.motion).join(',');
if (motions !== 'rise,page,zoom') errors.push('scene motions should be rise,page,zoom, got ' + motions);
if (batch.spec.voice.id !== 'Xb7hH8MSUJpSbSDYk0k2') errors.push('the picked voice (Alice) did not reach the spec');
if (batch.spec.cta.lines[0] !== 'Build habits that stick.') errors.push('the end-card line did not reach the spec');

// App two, set up by hand, with AI off: hooks are written by hand and a pack needs three
aiOn = false;
await page.goto('http://forge.test/app/');
await page.waitForSelector('#start-manual');
await page.click('#start-manual');
await page.waitForSelector('#b-name');
await page.fill('#b-name', 'Habitly');
await page.click('#b-say');
await page.fill('#b-spoken', 'Habit-lee');
await page.fill('#b-one', 'Turns daily habits into streaks you can share with friends.');
await page.fill('#b-ck', 'Duolingo'); await page.fill('#b-ct', 'your habits');
await page.click('#a-next');
await page.waitForFunction(() => /two screenshots/.test(document.getElementById('a-need').textContent));
await page.setInputFiles('#up', ['today.png', 'done.png', 'stats.png', 'friends.png', 'scroll.mp4'].map(f => join(FIX, f)));
await page.waitForFunction(() => document.querySelectorAll('.shot').length === 5, null, { timeout: 15000 });
await page.setInputFiles('#up-icon', join(FIX, 'icon.png'));
await page.waitForSelector('.iconprev', { timeout: 15000 });
await page.waitForTimeout(900);
await shot('08-by-hand');
const p2 = db.studio_projects[1];
if (p2.name !== 'Habitly' || p2.brief.comparison !== "It's like Duolingo, but for your habits" || p2.brief.spoken_name !== 'Habit-lee')
  errors.push('step 1 did not save itself: ' + JSON.stringify([p2.name, p2.brief]));
await page.click('#a-next');
await page.waitForURL(/\/review$/);
await page.waitForFunction(() => document.querySelectorAll('.hook.on').length === 1, null, { timeout: 10000 });
if (!/claim check is off/.test(await page.textContent('#h-note'))) errors.push('the review should say the AI check is off');
if (!(await page.isDisabled('#m-pack'))) errors.push('one hook: the pack should wait for three');
await page.click('[data-tmpl="pain"]');
await page.fill('#h-text', 'Starting a habit is easy. Keeping it is the hard part.');
await page.press('#h-text', 'Enter');
await page.fill('#h-text', 'Watch a week of habits turn into one streak.');
await page.press('#h-text', 'Enter');
await page.waitForFunction(() => document.querySelectorAll('.hook.on').length === 3);
await page.click('[data-panel=script]');
await page.fill('[data-s="0"][data-f="say"]', 'Tick off a habit and watch your day fill up.');
await page.fill('[data-s="1"][data-f="say"]', "Every streak shows how far you've come.");
await page.fill('[data-s="2"][data-f="say"]', 'Friends keep you honest.');
await page.waitForTimeout(900);
await shot('09-by-hand-review');
const label = await page.textContent('#m-pack');
console.log('pack button:', label);
if (label !== 'No free packs left') errors.push('the free pack is used: the button should say so, got ' + label);
if (await page.isDisabled('#m-prev')) errors.push('the frame check should be free and ready');

console.log(errors.length ? errors.join('\n') : 'no page errors');
await b.close();
process.exit(errors.length ? 1 : 0);
