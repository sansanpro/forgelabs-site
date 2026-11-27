// End-to-end on the live site and the real backend: signs in as the test account, sets up an app
// by hand (the fixture isn't in a store), uploads the engine's fixture screens, picks three or more
// hooks, writes the script, previews and makes a pack (which spends ElevenLabs credits), then
// downloads the zip and lists it. The render worker must be running (engine/worker.py).
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
await page.waitForSelector('#start-manual', { timeout: 20000 });
await shot('01-signed-in');
await page.click('#start-manual');
await page.waitForSelector('#b-name', { timeout: 20000 });

// 1. Your app (saves as it's typed)
await page.fill('#b-name', 'Habitly');
await page.click('#b-say');
await page.fill('#b-spoken', 'Habit-lee');
await page.fill('#b-one', 'Turns daily habits into streaks you can share with friends.');
await page.fill('#b-ck', 'Duolingo'); await page.fill('#b-ct', 'your habits');
await page.setInputFiles('#up', ['today.png', 'done.png', 'stats.png', 'friends.png', 'scroll.mp4'].map(f => join(FIX, f)));
await page.waitForFunction(() => document.querySelectorAll('.shot').length === 5, null, { timeout: 60000 });
await page.setInputFiles('#up-icon', join(FIX, 'icon.png'));
await page.waitForSelector('.iconprev', { timeout: 30000 });
await page.waitForFunction(() => [...document.querySelectorAll('.shot img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 20000 });
await shot('02-app');
await page.click('#a-next');

// 2. Review. With AI on, five hooks arrive and the ones that pass come picked; with it off, the
// comparison is the only one, so two more are written by hand. Either way a pack needs three.
await page.waitForURL(/\/review$/, { timeout: 20000 });
await page.waitForFunction(() => document.querySelector('.hook') && !document.querySelector('.badge.wait') &&
  !/Writing/.test(document.getElementById('h-status').textContent), null, { timeout: 120000 });
const own = ['Starting a habit is easy. Keeping it is the hard part.', 'Watch a week of habits turn into one streak.'];
for (const t of own) {
  if (await page.locator('.hook input[type=checkbox]:checked').count() >= 3) break;
  await page.fill('#h-text', t);
  await page.press('#h-text', 'Enter');
  await page.waitForTimeout(800);
}
const picked = await page.locator('.hook input[type=checkbox]:checked').count();
console.log('hooks picked:', picked, await page.$$eval('.hook.on .htext', els => els.map(e => e.value)));
if (picked < 3) errors.push('fewer than three hooks picked');
await shot('03-hooks');

// The script: line 1 plays the recording, 2 is the streaks chart, 3 is friends (Advanced has the headings)
await page.click('[data-panel=script]');
await page.waitForSelector('[data-s="0"][data-f="say"]', { timeout: 20000 });
await page.selectOption('[data-s="0"][data-f="screen"]', { label: 'Recording 5' });
await page.waitForTimeout(500);
await page.fill('[data-s="0"][data-f="say"]', 'Tick off a habit and watch your day fill up.');
await page.selectOption('[data-s="1"][data-f="screen"]', { label: 'Screen 3' });
await page.fill('[data-s="1"][data-f="say"]', "Every streak shows how far you've come.");
await page.selectOption('[data-s="2"][data-f="screen"]', { label: 'Screen 4' });
await page.fill('[data-s="2"][data-f="say"]', 'Friends keep you honest.');
await page.click('#adv summary');
await page.fill('#adv-body [data-s="0"][data-f="head"]', 'Tick it off');
await page.fill('#adv-body [data-s="1"][data-f="head"]', 'See your streaks');
await page.fill('#adv-body [data-s="2"][data-f="head"]', 'Bring a friend');
await page.click('[data-panel=end]');
await page.fill('#sc-line', 'Build habits that stick.');
await page.waitForTimeout(1200);
await shot('04-review');

// Frames first, then the pack from the preview screen
const ack = await page.$('#m-ack');
if (ack) await ack.check();
await page.waitForSelector('#m-prev:not([disabled])', { timeout: 20000 });
await page.click('#m-prev');
await page.waitForSelector('.progress', { timeout: 20000 });
console.log('preview queued', secs());
await page.waitForSelector('.strips img', { timeout: 180000 });
await page.waitForFunction(() => [...document.querySelectorAll('.strips img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
console.log('preview ready', secs());
await shot('05-preview');

await page.click('#p-pack');
console.log('pack queued', secs());
await page.waitForSelector('.progress', { timeout: 20000 });
await page.waitForFunction(() => /Rendering the videos/.test(document.body.innerText), null, { timeout: 600000 });
await shot('06-rendering');
await page.waitForSelector('.ready video', { timeout: 600000 });
console.log('pack ready', secs());
await page.waitForTimeout(2000);
await shot('07-pack');

const zip = await page.$eval('a.btn.pri[data-dl]', a => a.href);
const r = await fetch(zip);
const buf = Buffer.from(await r.arrayBuffer());
writeFileSync(`${OUT}/pack.zip`, buf);
console.log('zip download', r.status, buf.length, 'bytes');
console.log(execFileSync('unzip', ['-l', `${OUT}/pack.zip`]).toString());
console.log(errors.length ? errors.join('\n') : 'no page errors');
await b.close();
process.exit(errors.length ? 1 : 0);
