// Tells Bing (and the other IndexNow engines: Yandex, Seznam, Naver) that pages changed, so they
// recrawl now instead of whenever. Run after pushing a page change, once GitHub Pages has deployed:
//
//   npm run indexnow                     every page in sitemap.xml
//   npm run indexnow -- /guide/app-video-ads/    just these paths
//
// The key isn't a secret: IndexNow checks ownership by fetching it from the site's root.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'forgelaboratory.net';
const keyFile = readdirSync(ROOT).find(f => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('No IndexNow key file in the site root.'); process.exit(1); }
const key = keyFile.slice(0, -4);

const paths = process.argv.slice(2);
const urlList = paths.length
  ? paths.map(p => `https://${HOST}${p.startsWith('/') ? p : '/' + p}`)
  : [...readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }),
});
// 200 = received, 202 = received and the key is still being checked
console.log(res.status, res.statusText, `(${urlList.length} URLs)`);
for (const u of urlList) console.log('  ' + u);
if (res.status >= 300) { console.log(await res.text()); process.exit(1); }
