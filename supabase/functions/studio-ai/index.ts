// ForgeLabs App Ad Studio: the AI half of hook writing.
//
//   POST { action: "suggest_hooks", brief }               hooks by category, from docs/AD-PLAYBOOK.md's rules
//   POST { action: "check_hooks", brief, hooks: [text] }  each hook checked against the brief's facts
//   POST { action: "draft_script", brief, screens }       body lines matched to the uploaded screens
//
// Needs the ANTHROPIC_API_KEY secret. Without it every action answers 503 ai_unavailable and the
// app falls back to its templates and the in-browser hook lint. STUDIO_AI_MODEL overrides the
// model (default claude-opus-5-5). Each account gets 60 calls a day (studio_ai_allow()).
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";

const MODEL = Deno.env.get("STUDIO_AI_MODEL") ?? "claude-opus-5-5";
const KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ORIGINS = ["https://forgelaboratory.net", "https://www.forgelaboratory.net", "http://localhost:8080"];

const CATEGORIES = ["comparison", "problem", "outcome", "anti-gatekeeping", "callout", "curiosity", "values"];

const RULES = `You write the first line of short vertical video ads for apps: the hook. Most viewers decide
in about two seconds whether to keep watching, so the hook does most of the work.

The clarity test: a stranger must be able to picture the app, or feel the problem, within two
seconds of hearing the line. Clever, abstract or poetic lines fail. "It's like Tinder, but for
stocks" works because the viewer already knows how Tinder works. "Your money is already saying
something" failed: it sounds good but doesn't say what the app is.

Rules for every hook:
1. Every claim must be true of this app today, according to the brief. Never invent numbers,
   results, ratings, user counts or features. A number may appear only if it is in the brief's facts.
2. Never imply the app knows or sees something it doesn't (the brief lists what it can't do or
   see). "Where your money's been going" implies access to someone's finances.
3. Describe the situation, not the person. Ad platforms reject wording that asserts or implies
   the viewer's personal attributes: health, finances, debt, beliefs, age, sexuality, ethnicity,
   religion, disability. "Are you struggling with debt?" is a classic rejection.
4. Another brand's name may appear only as a comparison ("It's like X, but for Y").
5. One idea per hook, short enough to say in about three seconds (usually 12 words or fewer).
6. No superlatives you can't prove (best, #1, guaranteed), no "you won't believe".
7. Write in plain, natural spoken English. No hashtags, emoji or quotation marks around the line.`;

const HOOK_CATEGORIES = `Categories:
- comparison: explains the app by something familiar. "It's [known thing], but for [this app's thing]."
- problem: names a frustration the viewer already has.
- outcome: shows the result the viewer wants, without the usual pain.
- anti-gatekeeping: says the field was made to sound hard on purpose.
- callout: describes the viewer's own behaviour back to them, without asserting personal attributes.
- curiosity: opens a question the ad answers.
- values: ties the app to something the viewer cares about.`;

const hooksSchema = {
  type: "object",
  properties: {
    hooks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: CATEGORIES },
          text: { type: "string" },
          benefit: { type: "string" },
          why: { type: "string" },
        },
        required: ["category", "text", "benefit", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["hooks"],
  additionalProperties: false,
};

const checkSchema = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          verdict: { type: "string", enum: ["ok", "warn", "block"] },
          reasons: { type: "array", items: { type: "string" } },
          rewrite: { type: "string" },
        },
        required: ["text", "verdict", "reasons", "rewrite"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

const scriptSchema = {
  type: "object",
  properties: {
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          say: { type: "string" },
          head: { type: "string" },
          screen: { type: "string" },
          motion: { type: "string", enum: ["rise", "page", "zoom", "play"] },
        },
        required: ["say", "head", "screen", "motion"],
        additionalProperties: false,
      },
    },
    benefit: { type: "string" },
    end_line: { type: "string" },
  },
  required: ["body", "benefit", "end_line"],
  additionalProperties: false,
};

type Brief = Record<string, unknown>;

function cut(v: unknown, n: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

function describe(brief: Brief): string {
  const lines = [
    `App name: ${cut(brief.name, 80)}`,
    `What it does, in one sentence: ${cut(brief.one_liner, 300)}`,
    `Platforms: ${cut(brief.platforms, 80) || "not stated"}`,
    `Who it's for: ${cut(brief.audience, 300)}`,
    `The problem they feel: ${cut(brief.problem, 400)}`,
    `The outcome they want: ${cut(brief.outcome, 300)}`,
    `A familiar comparison, if any: ${cut(brief.comparison, 200) || "none given"}`,
    `What the app can NOT do or see: ${cut(brief.cant_do, 600) || "not stated - be conservative"}`,
    `Provable facts and numbers (the only numbers allowed): ${cut(brief.facts, 800) || "none"}`,
    `Category, for ad policy: ${cut(brief.category, 80) || "general"}`,
    `The one action after the ad: ${cut(brief.action, 120) || "download the app"}`,
  ];
  return lines.join("\n");
}

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

async function allowed(auth: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/studio_ai_allow`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  return r.ok && (await r.json()) === true;
}

async function ask(client: Anthropic, system: string, prompt: string, schema: Record<string, unknown>, effort: "low" | "medium" | "high") {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") return { declined: true as const };
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`no text in the reply (stop reason ${response.stop_reason})`);
  return { declined: false as const, data: JSON.parse(text.text) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });
  if (!KEY) return json(req, 503, { error: "ai_unavailable" });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(req, 401, { error: "not_signed_in" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "bad_json" });
  }
  if (!(await allowed(auth))) return json(req, 429, { error: "ai_daily_limit" });

  const brief = (body.brief ?? {}) as Brief;
  if (!cut(brief.name, 80) || !cut(brief.one_liner, 300)) return json(req, 400, { error: "brief_incomplete" });
  const client = new Anthropic({ apiKey: KEY });

  try {
    if (body.action === "suggest_hooks") {
      const r = await ask(client, `${RULES}\n\n${HOOK_CATEGORIES}`,
        `${describe(brief)}\n\nWrite two hooks for each category (14 in total). For each, give a benefit line of ` +
          `at most 60 characters that sits under the hook on an image ad and says what the app does, and one ` +
          `short sentence on why the hook works. Skip a category rather than break a rule.`,
        hooksSchema, "medium");
      if (r.declined) return json(req, 422, { error: "ai_declined" });
      const hooks = (r.data.hooks ?? []).map((h: Record<string, string>) => ({
        category: CATEGORIES.includes(h.category) ? h.category : "custom",
        text: cut(h.text, 160), benefit: cut(h.benefit, 140), why: cut(h.why, 300),
      })).filter((h: { text: string }) => h.text.length >= 3);
      return json(req, 200, { hooks });
    }

    if (body.action === "check_hooks") {
      const hooks = (Array.isArray(body.hooks) ? body.hooks : []).map((t) => cut(t, 160)).filter(Boolean).slice(0, 20);
      if (!hooks.length) return json(req, 400, { error: "no_hooks" });
      const r = await ask(client, `${RULES}\n\nYou are now the claim checker. Judge each hook against the brief and the rules.
verdict "block": a false or unsupported claim, an invented number, implied access to data the app can't see, or
personal-attribute wording a platform would likely reject. "warn": true but risky or unclear (a brand name, a
regulated category, vague wording, too long to say in three seconds). "ok": passes. Give short plain reasons,
and for block or warn a rewrite that fixes the problem while keeping the idea (empty for ok).`,
        `${describe(brief)}\n\nHooks to check, one per line:\n${hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")}`,
        checkSchema, "medium");
      if (r.declined) return json(req, 422, { error: "ai_declined" });
      return json(req, 200, { results: r.data.results ?? [] });
    }

    if (body.action === "draft_script") {
      const screens = (Array.isArray(body.screens) ? body.screens : []).slice(0, 30).map((s: Record<string, unknown>) => ({
        id: cut(s.id, 60), label: cut(s.label, 80), kind: s.kind === "recording" ? "recording" : "screen",
      })).filter((s) => s.id);
      if (!screens.length) return json(req, 400, { error: "no_screens" });
      const r = await ask(client, `${RULES}\n\nYou are now writing the body of the ad: what comes after the hook. It must be
solution-first: the moment the hook ends, the viewer sees the app doing the thing. Three or four scenes.
Each scene: one spoken line of at most 14 words naming a concrete feature (no adjectives like smart or
powerful), a heading of at most 28 characters for the top of the screen, the id of the screen that shows
it, and a motion: "rise" (the phone slides up), "page" (swipes across from the previous scene's screen),
"zoom" (enlarges part of the screen so small text is readable) or "play" (only for screen recordings).
End on the most satisfying moment. Also give a benefit line (at most 60 characters) and an end-card
line (at most 40 characters) that says what the app does.`,
        `${describe(brief)}\n\nScreens you can use (id: label, kind):\n${screens.map((s) => `${s.id}: ${s.label || "unlabelled"} (${s.kind})`).join("\n")}`,
        scriptSchema, "low");
      if (r.declined) return json(req, 422, { error: "ai_declined" });
      const ids = new Set(screens.map((s) => s.id));
      const body_ = (r.data.body ?? []).filter((s: Record<string, string>) => ids.has(s.screen)).slice(0, 5)
        .map((s: Record<string, string>) => ({ say: cut(s.say, 160), head: cut(s.head, 40), screen: s.screen, motion: s.motion }));
      return json(req, 200, { body: body_, benefit: cut(r.data.benefit, 140), end_line: cut(r.data.end_line, 60) });
    }

    return json(req, 400, { error: "unknown_action" });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(req, 429, { error: "ai_busy" });
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic", e.status, e.message);
      return json(req, 502, { error: "ai_failed" });
    }
    console.error("studio-ai", e);
    return json(req, 500, { error: "ai_failed" });
  }
});
