// End-to-end on the live site and the real backend: signs in as the test account, adds an app,
// uploads the engine's fixture screens, writes hooks, scripts, previews and makes a pack (which
// spends ElevenLabs credits), then downloads the zip and lists it. The render worker must be
// running (engine/worker.py).
//
//   node --env-file=.env.local tests/live-flow.mjs [https://forgelaboratory.net]
//
// Needs STUDIO_TEST_EMAIL and STUDIO_TEST_PASSWORD in .env.local (an is_admin test account).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.argv[2] || 'https://forgelaboratory.net';
const FIX = ROOT + '/engine/tests/fixture';
const OUT = ROOT + '/tests/out/live';
mkdirSync(OUT, { recursive: true });
const email = process.env.STUDIO_TEST_EMAIL, password = process.env.STUDIO_TEST_PASSWORD;
if (!email || !password) throw new Error('STUDIO_TEST_EMAIL and STUDIO_TEST_PASSWORD must be set');

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
// The AI function answers 503 until ANTHROPIC_API_KEY is set; the browser logs that as an error
page.on('console', m => { if (m.type() === 'error' && !/status of 503/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log('step', n); };
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';

await page.goto(SITE + '/app/');
await page.fill('#a-email', email);
await page.fill('#a-pw', password);
await page.click('button[type=submit]');
await page.waitForSelector('#new-app', { timeout: 20000 });
await shot('01-signed-in');
await page.click('#new-app');
await page.waitForSelector('#b-name', { timeout: 20000 });

await page.fill('#b-name', 'Habitly');
await page.fill('#b-spoken', 'Habit-lee');
await page.fill('#b-one', 'A habit tracker that turns daily habits into streaks you can share with friends.');
await page.fill('#b-aud', 'People who keep restarting the same habit');
await page.fill('#b-prob', 'I start strong every January and give up by February.');
await page.fill('#b-out', 'Keep a habit going for more than a few weeks.');
await page.fill('#b-ck', 'Duolingo'); await page.fill('#b-ct', 'your habits');
await page.fill('#b-cant', "It doesn't see your health data or give medical advice.");
await page.fill('#b-facts', 'Free to download. Streaks, reminders and friends.');
await page.click('#b-save');

await page.waitForSelector('#up', { state: 'attached', timeout: 20000 });
await page.setInputFiles('#up', ['today.png', 'done.png', 'stats.png', 'friends.png', 'scroll.mp4'].map(f => join(FIX, f)));
await page.waitForFunction(() => document.querySelectorAll('.shot').length === 5, null, { timeout: 60000 });
await page.setInputFiles('#up-icon', join(FIX, 'icon.png'));
await page.waitForSelector('.iconprev', { timeout: 30000 });
const labels = ['Today list', 'Habit done', 'Streaks chart', 'Friends', 'Ticking a habit'];
for (let i = 0; i < labels.length; i++) {
  const el = page.locator('[data-label]').nth(i);
  await el.fill(labels[i]); await el.dispatchEvent('change'); await page.waitForTimeout(300);
}
await page.waitForFunction(() => [...document.querySelectorAll('.shot img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 20000 });
await shot('02-screens');
await page.click('#s-next');

await page.waitForSelector('#h-text', { timeout: 20000 });
await page.click('#h-ai');
await page.waitForFunction(() => /switched on yet/.test(document.body.innerText), null, { timeout: 30000 });
await page.waitForSelector('#h-text');
await page.click('[data-tmpl="comparison"]');
await page.click('#h-add');
await page.waitForSelector('.hook', { timeout: 20000 });
await page.selectOption('#h-cat', 'problem');
await page.fill('#h-text', 'Starting a habit is easy. Keeping it is the hard part.');
await page.click('#h-add');
await page.waitForFunction(() => document.querySelectorAll('.hook').length === 2, null, { timeout: 20000 });
for (let i = 0; i < 2; i++) { await page.locator('[data-pick]').nth(i).check(); await page.waitForTimeout(800); }
await shot('03-hooks');
await page.click('#h-next');

await page.waitForSelector('[data-s="0"][data-f="say"]', { timeout: 20000 });
// Scene 1 plays the recording, 2 swipes to the streaks chart, 3 swipes to friends
await page.selectOption('[data-s="0"][data-f="screen"]', { label: 'Ticking a habit (recording)' });
await page.waitForTimeout(300);
await page.selectOption('[data-s="0"][data-f="motion"]', 'play');
await page.waitForTimeout(300);
await page.fill('[data-s="0"][data-f="say"]', 'Tick off a habit and watch your day fill up.');
await page.fill('[data-s="0"][data-f="head"]', 'Tap to tick it off');
await page.selectOption('[data-s="1"][data-f="screen"]', { label: 'Streaks chart' });
await page.waitForTimeout(300);
await page.fill('[data-s="1"][data-f="say"]', "Every streak shows how far you've come.");
await page.fill('[data-s="1"][data-f="head"]', 'See your streaks');
await page.selectOption('[data-s="2"][data-f="screen"]', { label: 'Friends' });
await page.waitForTimeout(300);
await page.fill('[data-s="2"][data-f="say"]', 'Friends keep you honest.');
await page.fill('[data-s="2"][data-f="head"]', 'Bring a friend');
await page.fill('#sc-line', 'Build habits that stick.');
await shot('04-script');
await page.click('#sc-save');

await page.waitForSelector('#m-prev', { timeout: 20000 });
await page.click('#m-prev');
await page.waitForSelector('.batch', { timeout: 20000 });
console.log('preview queued', secs());
await page.waitForSelector('.strips img', { timeout: 180000 });
await page.waitForFunction(() => [...document.querySelectorAll('.strips img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
console.log('preview ready', secs());
await shot('05-preview');

await page.click('#m-pack');
console.log('pack queued', secs());
await page.waitForSelector('.vids video', { timeout: 600000 });
console.log('pack ready', secs());
await page.waitForTimeout(2000);
await shot('06-pack');

const zip = await page.$eval('a.btn.pri[data-dl]', a => a.href);
const r = await fetch(zip);
const buf = Buffer.from(await r.arrayBuffer());
writeFileSync(`${OUT}/pack.zip`, buf);
console.log('zip download', r.status, buf.length, 'bytes');
console.log(execFileSync('unzip', ['-l', `${OUT}/pack.zip`]).toString());
console.log(errors.length ? errors.join('\n') : 'no page errors');
await b.close();
process.exit(errors.length ? 1 : 0);
