// ForgeLabs App Ad Studio: start a project from a store link.
//
//   POST { url }   an App Store or Google Play link
//   200  { store, name, seller, subtitle, description, category, icon, screenshots: [url] }
//
// Only reads public listings, and only from Apple and Google: the app's id is taken out of the link
// and the request is built here, so a link can never point this function anywhere else. The App
// Store comes from Apple's lookup service plus the listing page (for the subtitle); Google Play
// from its listing page. The images stay on the stores' own hosts, which allow browsers to fetch
// them, and the app uploads them like any screenshot.

const ORIGINS = ["https://forgelaboratory.net", "https://www.forgelaboratory.net", "http://localhost:8080"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const IMAGE_HOST = /^https:\/\/(is\d-ssl\.mzstatic\.com|play-lh\.googleusercontent\.com)\//;
const MAX_SHOTS = 10;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

function text(s: unknown, n: number): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

function unescape(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

/* A signed-in account, not just the site's public key (which also passes the gateway's check) */
async function signedIn(auth: string): Promise<boolean> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: auth },
  });
  return r.ok && !!(await r.json()).id;
}

async function get(url: string): Promise<Response> {
  return await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(10000) });
}

/* Which store, and the app's id in it, or null for anything else */
export function parse(link: string): { store: "apple"; id: string; country: string } | { store: "google"; id: string } | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (host === "apps.apple.com" || host === "itunes.apple.com") {
    const id = u.pathname.match(/\/id(\d{5,12})(?:\/|$)/)?.[1] ?? u.searchParams.get("id")?.match(/^\d{5,12}$/)?.[0];
    if (!id) return null;
    const country = u.pathname.match(/^\/([a-z]{2})\//i)?.[1]?.toLowerCase() ?? "us";
    return { store: "apple", id, country };
  }
  if (host === "play.google.com") {
    const id = u.searchParams.get("id");
    if (!id || !/^[A-Za-z][\w]*(\.[A-Za-z0-9_]+)+$/.test(id) || id.length > 150) return null;
    return { store: "google", id };
  }
  return null;
}

export async function apple(id: string, country: string) {
  const r = await get(`https://itunes.apple.com/lookup?id=${id}&country=${country}&entity=software`);
  if (!r.ok) throw new Error(`lookup ${r.status}`);
  const app = (await r.json()).results?.[0];
  if (!app) return null;
  // The listing page is the only place with the subtitle; without it the description still works
  let subtitle = "";
  try {
    const page = await get(`https://apps.apple.com/${country}/app/id${id}`);
    if (page.ok) {
      const html = await page.text();
      const after = html.slice(Math.max(0, html.indexOf("<h1")));
      subtitle = unescape(after.match(/<p class="subtitle[^"]*">([^<]{2,80})<\/p>/)?.[1] ?? "");
    }
  } catch (e) {
    console.error("no subtitle:", (e as Error).message);
  }
  // Apple serves each image at any size up to the original; ask for the original
  const full = (u: string) => u.replace(/\/[^/]+$/, "/2000x0w.png");
  return {
    store: "apple",
    name: app.trackName,
    seller: app.sellerName,
    subtitle,
    description: app.description,
    category: app.primaryGenreName,
    icon: app.artworkUrl512 ? app.artworkUrl512.replace(/\/[^/]+$/, "/1024x1024bb.png") : "",
    screenshots: (app.screenshotUrls ?? []).map(full),
  };
}

export async function google(id: string) {
  const r = await get(`https://play.google.com/store/apps/details?id=${encodeURIComponent(id)}&hl=en_US&gl=US`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`play ${r.status}`);
  const html = await r.text();
  const meta = (p: string) => unescape(html.match(new RegExp(`<meta[^>]+(?:name|property)="${p}"[^>]*content="([^"]*)"`))?.[1] ?? "");
  const name = meta("og:title").replace(/\s*-\s*Apps on Google Play\s*$/, "");
  if (!name) return null;
  // Each screenshot appears more than once (sizes); keep the first of each, at full width
  const shots: string[] = [];
  for (const m of html.matchAll(/<img[^>]+src="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)[^"]*"[^>]*alt="Screenshot image"/g)) {
    if (!shots.includes(m[1])) shots.push(m[1]);
  }
  const icon = meta("og:image").split("=")[0];
  return {
    store: "google",
    name,
    seller: unescape(html.match(/<div class="[^"]*"><a href="\/store\/apps\/dev(?:eloper)?\?id=[^"]*"[^>]*><span>([^<]+)<\/span>/)?.[1] ?? ""),
    subtitle: meta("og:description"),
    description: meta("og:description"),
    category: (html.match(/"applicationCategory":"([A-Z_]+)"/)?.[1] ?? "").replace(/_/g, " ").toLowerCase(),
    icon: icon ? `${icon}=s1024` : "",
    screenshots: shots.map((s) => `${s}=w1080`),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !(await signedIn(auth))) return json(req, 401, { error: "not_signed_in" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "bad_json" });
  }
  const where = parse(text(body.url, 500));
  if (!where) return json(req, 400, { error: "store_link" });

  try {
    const app = where.store === "apple" ? await apple(where.id, where.country) : await google(where.id);
    if (!app) return json(req, 404, { error: "store_not_found" });
    const safe = (u: unknown) => typeof u === "string" && IMAGE_HOST.test(u) ? u : "";
    return json(req, 200, {
      store: app.store,
      name: text(app.name, 80),
      seller: text(app.seller, 80),
      subtitle: text(app.subtitle, 200),
      description: text(app.description, 1000),
      category: text(app.category, 60),
      icon: safe(app.icon),
      screenshots: app.screenshots.map(safe).filter(Boolean).slice(0, MAX_SHOTS),
    });
  } catch (e) {
    console.error("store import failed:", (e as Error).message);
    return json(req, 502, { error: "store_unreachable" });
  }
});
