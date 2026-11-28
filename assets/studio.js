/* ForgeLabs App Ad Studio. Plain JavaScript and no build step, matching the rest of the site.

   Security rules for anyone editing this file:
   - Briefs, hooks and labels are typed by customers and shown back to them. Text goes through
     esc(). Only links the app made itself (signed storage URLs) become an href or src.
   - The anon key is public by design. What protects data is row level security and the grants
     in supabase/migrations/. Work is queued only through studio_queue(), which checks the pack
     allowance on the server, so nothing here is trusted to enforce limits. */
(function () {
  "use strict";

  var URL_ = "https://cuijqoorjgvlyiyizgxi.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1aWpxb29yamd2bHlpeWl6Z3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxNTUwMjMsImV4cCI6MjEwOTczMTAyM30.jwsfTktibmwUHKj3Gn6Ulk-TQJv__xczdQ5VgQvbXx8";
  var SUPPORT = "hassan@forgelaboratory.net";
  var MAX_HOOKS = 5, MAX_ASSETS = 30, MAX_BYTES = 50 * 1024 * 1024;

  /* The worker accepts only these voices (engine/worker.py VOICES) */
  var VOICES = [
    ["JBFqnCBsd6RMkjVDRZzb", "George", "British, warm storyteller", "george"],
    ["Xb7hH8MSUJpSbSDYk0k2", "Alice", "British, clear and engaging", "alice"],
    ["nPczCjzI2devNBz1zQrb", "Brian", "American, deep and resonant", "brian"],
    ["EXAVITQu4vr4xnSDxMaL", "Sarah", "American, confident and reassuring", "sarah"],
    ["TX3LPaxmHKxFdv7VOQHJ", "Liam", "American, energetic creator", "liam"],
    ["cgSgspJ2msm6clMCkdW9", "Jessica", "American, bright and playful", "jessica"],
    ["IKne3meq5aSn9XLyUdCD", "Charlie", "Australian, deep and energetic", "charlie"],
    ["SAz9YHcvj6GT2YYXdXww", "River", "American, relaxed and neutral", "river"]
  ];
  var CATEGORIES = [
    ["comparison", "Comparison", "It's like [an app everyone knows], but for [what yours does]."],
    ["problem", "Problem", "Everyone says [common advice]. Nobody explains [the hard part]."],
    ["outcome", "Outcome", "[The result people want] without [the usual pain]."],
    ["anti-gatekeeping", "Anti-gatekeeping", "[Experts] made [your field] sound hard on purpose."],
    ["callout", "Callout", "You've been meaning to [goal] for [time] now."],
    ["curiosity", "Curiosity", "Nobody ever explained what [jargon] actually means."],
    ["values", "Values", "You'd [do something good]. Could you name one [way to do it]?"],
    ["custom", "Your own", ""]
  ];
  /* Paste the store link, review what the Studio filled in, then the ads */
  var STEPS = [["app", "Your app"], ["review", "Review"], ["make", "Your ads"]];
  /* Links from earlier versions of the flow */
  var OLD_STEPS = { brief: "app", screens: "app", hooks: "review", script: "review" };
  /* A pack is three to five videos, each opening with a different hook, so it compares them */
  var MIN_HOOKS = 3;
  /* The five angles the Studio writes a hook from (studio-ai suggest_angles), with a template for
     writing one yourself */
  var ANGLES = [
    ["pain", "Pain point", "[The annoying part] shouldn't take [how long it takes now]."],
    ["result", "Result", "[The result people want], without [the usual pain]."],
    ["watch", "Watch this", "Watch this turn [something messy] into [something useful]."],
    ["comparison", "Comparison", "It's like [an app everyone knows], but for [what yours does]."],
    ["proof", "Social proof", "Rated [your rating] stars by [how many] people."]
  ];
  /* Hooks written before angles had categories; these are the angles closest to them */
  var ANGLE_FROM_CATEGORY = { problem: "pain", outcome: "result", curiosity: "watch", comparison: "comparison" };
  var ZOOMS = [["top", "Zoom: top", [0.1, 0.45]], ["middle", "Zoom: middle", [0.33, 0.66]], ["bottom", "Zoom: bottom", [0.55, 0.9]]];
  /* The ad-policy category, read from the one-line description instead of asked for. First match wins. */
  var CATEGORY_WORDS = [
    ["gambling", /\b(crypto\w*|bitcoin|betting|bets?|casinos?|poker|gambl\w*|lotter(y|ies)|sportsbooks?)\b/i],
    ["finance", /\b(invest\w*|stocks?|shares|trading|traders?|portfolios?|brokerage|etfs?|budget\w*|banking|loans?|credit|savings|money|financ\w*|tax(es)?)\b/i],
    ["dating", /\b(dating|singles|matchmaking)\b/i],
    ["health", /\b(health\w*|fitness|workouts?|diet\w*|weight|calories|meditat\w*|sleep|therapy|mental|medical|symptoms?|fertility|gym)\b/i],
    ["kids", /\b(kids?|children|child|toddlers?|preschool\w*)\b/i]
  ];
  var POLICY = {
    finance: "Finance and investing ads have extra rules. On Meta in the US you must declare the Financial products and services category, and ads can't promote investments unless you're a licensed advisor or broker.",
    health: "Health and fitness ads can't imply a viewer's condition, or promise results. Check the platform's health policy.",
    dating: "Dating ads need approval on Meta and Google, and can't be sexual or target by relationship status in the copy.",
    gambling: "Gambling and crypto ads need written permission from Meta and Google before they run.",
    kids: "Apps for children have strict ad rules (and COPPA in the US). Check the platform's policy first."
  };
  var ERRORS = {
    not_signed_in: "Sign in again.",
    no_packs_left: "You've used your free pack. Email " + SUPPORT + " during the beta and we'll add more.",
    preview_limit: "That's 40 previews today. Previews reset tomorrow.",
    already_queued: "That pack is already queued.",
    too_many_queued: "You already have two renders waiting. Start this one when one of them is done.",
    hooks_1_to_5: "Pick between one and five hooks.",
    pack_needs_3_hooks: "Pick at least three hooks. Each video opens with its own, so the pack compares them.",
    hooks_must_differ: "Two of the picked hooks are the same. Each video needs a different one.",
    ai_unavailable: "AI suggestions aren't switched on yet. Use the templates, or write your own.",
    ai_daily_limit: "AI suggestions are used up for today. They reset tomorrow; the templates still work.",
    ai_busy: "The AI is busy. Try again in a minute.",
    ai_declined: "The AI declined that request. Try different wording in your brief.",
    ai_failed: "The AI didn't answer. Try again.",
    brief_incomplete: "Add the app name and what it does first.",
    store_link: "That isn't an App Store or Google Play link. Copy it from your app's store page.",
    store_not_found: "That app isn't on the store, or isn't public yet.",
    store_unreachable: "The store didn't answer. Try again, or add your screenshots below."
  };
  var BRANDS = ("Tinder Spotify Netflix Uber Lyft Airbnb Duolingo Instagram TikTok Facebook Google Apple Amazon Strava " +
    "Notion Slack Venmo Robinhood Peloton Calm Headspace Bumble Hinge YouTube Shazam Pinterest Snapchat WhatsApp " +
    "ChatGPT Wordle Zillow Yelp Grammarly Canva Figma Discord DoorDash Shopify Fitbit MyFitnessPal Monzo Revolut " +
    "Coinbase PayPal Etsy LinkedIn Reddit Twitch Zoom Trello Asana Todoist Evernote Dropbox Audible Kindle Goodreads " +
    "Letterboxd Pokemon Uber Eats Instacart Tesla Nike Starbucks").split(" ");
  var NUMWORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
    twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000,
    million: 1000000, billion: 1000000000, double: 2, twice: 2, triple: 3, tenfold: 10 };

  var S = {
    session: null, account: null, projects: [], project: null, assets: [], hooks: [], batches: [], jobs: {}, queue: {},
    step: "app", urls: {}, poll: null, ai: undefined, playing: null, ack: false, saveT: null,
    importing: {}, manual: {}, prefilled: {}, checking: {}, seen: {}, writing: false, refreshLater: false,
    panel: null, adv: false, earlier: false, pv: null, batchId: null
  };
  var root = document.getElementById("root");

  /* ── helpers ─────────────────────────────────────────────────── */
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 3800);
  }
  function errText(code, fallback) { return ERRORS[code] || fallback || "Something went wrong. Try again."; }
  function fail(e) { toast(errText(e && e.code, e && e.message)); }
  function uid() { return S.session && S.session.user && S.session.user.id; }
  function rand() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  }
  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24); }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function opt(v, label, cur) {
    return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? " selected" : "") + ">" + esc(label) + "</option>";
  }
  function words(s) { return String(s || "").trim().split(/\s+/).filter(Boolean); }
  /* JSON with sorted keys: Postgres stores jsonb with its own key order, so compare like this */
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
        .map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
    }
    return JSON.stringify(v);
  }
  function brief() { return (S.project && S.project.brief) || {}; }
  function script() { return (S.project && S.project.script) || {}; }

  /* ── session and API ─────────────────────────────────────────── */
  function loadSession() {
    try { S.session = JSON.parse(localStorage.getItem("fl_studio_session") || "null"); } catch (e) { S.session = null; }
  }
  function saveSession(s) {
    S.session = s;
    try {
      if (s) localStorage.setItem("fl_studio_session", JSON.stringify(s));
      else localStorage.removeItem("fl_studio_session");
    } catch (e) { /* private window: the session lasts until reload */ }
  }
  function authCall(path, body) {
    return fetch(URL_ + "/auth/v1/" + path, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; });
    });
  }
  function refresh() {
    if (!S.session || !S.session.refresh_token) return Promise.resolve(false);
    return authCall("token?grant_type=refresh_token", { refresh_token: S.session.refresh_token }).then(function (r) {
      if (r.ok && r.data.access_token) { saveSession(r.data); return true; }
      return false;
    });
  }
  function authed(url, opts, retried) {
    opts = opts || {};
    var h = Object.assign({ apikey: ANON, Authorization: "Bearer " + (S.session && S.session.access_token),
                            "Content-Type": "application/json" }, opts.headers || {});
    return fetch(url, Object.assign({}, opts, { headers: h })).then(function (r) {
      if (r.status === 401 && !retried) {
        return refresh().then(function (ok) {
          if (ok) return authed(url, opts, true);
          signOut(); throw new Error("Your session ended. Sign in again.");
        });
      }
      return r;
    });
  }
  function rest(path, opts) { return authed(URL_ + "/rest/v1/" + path, opts); }
  function restJson(path, opts) {
    return rest(path, opts).then(function (r) {
      return r.text().then(function (t) {
        var d = t ? JSON.parse(t) : null;
        if (!r.ok) { var e = new Error((d && d.message) || "Request failed"); e.code = d && d.message; e.pg = d && d.code; throw e; }
        return d;
      });
    });
  }
  function rpc(name, args) { return restJson("rpc/" + name, { method: "POST", body: JSON.stringify(args || {}) }); }
  function insert(table, row) {
    return restJson(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) })
      .then(function (d) { return d[0]; });
  }
  function patch(table, id, fields) {
    return restJson(table + "?id=eq." + encodeURIComponent(id), { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(fields) })
      .then(function (d) { return d && d[0]; });
  }
  function del(table, id) { return restJson(table + "?id=eq." + encodeURIComponent(id), { method: "DELETE" }); }
  function fn(name, body) {
    return authed(URL_ + "/functions/v1/" + name, { method: "POST", body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    });
  }
  function encodePath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  function upload(path, file) {
    return authed(URL_ + "/storage/v1/object/studio-uploads/" + encodePath(path), {
      method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, body: file
    }).then(function (r) {
      if (r.ok) return;
      return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || d.error || "That upload failed."); });
    });
  }
  /* Signed links, an hour long, cached until ten minutes before they expire */
  function signed(bucket, paths) {
    var now = Date.now(), need = paths.filter(function (p) { var c = S.urls[bucket + ":" + p]; return !c || c.exp < now; });
    if (!need.length) return Promise.resolve();
    return authed(URL_ + "/storage/v1/object/sign/" + bucket, { method: "POST", body: JSON.stringify({ expiresIn: 3600, paths: need }) })
      .then(function (r) { return r.json(); }).then(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (x) {
          if (x.signedURL) S.urls[bucket + ":" + x.path] = { url: URL_ + "/storage/v1" + x.signedURL, exp: now + 50 * 60 * 1000 };
        });
      }).catch(function () {});
  }
  function link(bucket, path) { var c = S.urls[bucket + ":" + path]; return c ? c.url : ""; }

  function loadAccount() {
    return restJson("studio_accounts?select=*").then(function (a) { S.account = a[0] || null; });
  }
  function loadProjects() {
    return restJson("studio_projects?select=id,name,updated_at,brief&order=updated_at.desc").then(function (d) { S.projects = d; });
  }
  function loadProject(id) {
    return Promise.all([
      restJson("studio_projects?select=*&id=eq." + encodeURIComponent(id)),
      restJson("studio_assets?select=*&project_id=eq." + encodeURIComponent(id) + "&order=sort,created_at"),
      restJson("studio_hooks?select=*&project_id=eq." + encodeURIComponent(id) + "&order=created_at"),
      loadBatches(id)
    ]).then(function (r) {
      S.project = r[0][0] || null;
      S.assets = r[1]; S.hooks = r[2];
      if (S.project) {
        S.project.brief = S.project.brief || {};
        S.project.brand = S.project.brand || {};
        S.project.script = defaults(S.project.script || {});
      }
    });
  }
  function loadBatches(id) {
    return restJson("studio_batches?select=*&project_id=eq." + encodeURIComponent(id) + "&order=created_at.desc&limit=12").then(function (b) {
      S.batches = b;
      if (!b.length) { S.jobs = {}; return; }
      return restJson("studio_jobs?select=*&batch_id=in.(" + b.map(function (x) { return x.id; }).join(",") + ")&order=created_at.desc")
        .then(function (jobs) {
          S.jobs = {};
          jobs.forEach(function (j) { if (!S.jobs[j.batch_id]) S.jobs[j.batch_id] = j; });
          return loadQueue();
        });
    });
  }
  /* Where each waiting job stands (studio_queue_status). If that fails, the batch just says it's waiting. */
  function loadQueue() {
    var waiting = Object.keys(S.jobs).map(function (k) { return S.jobs[k]; }).filter(function (j) { return j.status === "queued"; });
    var q = {};
    return Promise.all(waiting.map(function (j) {
      return rpc("studio_queue_status", { p_job: j.id }).then(function (r) { if (r) q[j.id] = r; }).catch(function () {});
    })).then(function () { S.queue = q; });
  }
  function defaults(sc) {
    sc.body = Array.isArray(sc.body) ? sc.body : [];
    sc.opening = sc.opening || { style: "hand", screens: [] };
    sc.theme = sc.theme || { style: "dark", accent: "#FF7A2E" };
    sc.voice = sc.voice || { id: VOICES[0][0], speed: 1.15 };
    return sc;
  }
  function packsLeft() {
    var a = S.account;
    if (!a) return 0;
    return a.is_admin ? Infinity : Math.max(0, a.free_packs - a.packs_used);
  }

  function signOut() {
    saveSession(null);
    S.account = null; S.projects = []; S.project = null; S.urls = {};
    clearInterval(S.poll); S.poll = null;
    renderAuth("signin");
  }

  /* ── sign in ─────────────────────────────────────────────────── */
  function renderAuth(mode, notice) {
    if (mode === "forgot" || mode === "reset") { renderPassword(mode, notice); return; }
    var up = mode === "signup";
    root.innerHTML =
      '<div class="auth"><a class="brand" href="/"><i></i>ForgeLabs <span class="sub">App Ad Studio</span></a><div class="card">' +
      "<h1>" + (up ? "Make your first ads free" : "Sign in") + "</h1>" +
      (notice ? '<p class="small muted" role="status">' + esc(notice) + "</p>" : "") +
      '<form id="authf" style="margin-top:16px" novalidate>' +
      '<div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label for="a-pw">Password</label><input id="a-pw" type="password" autocomplete="' +
      (up ? "new-password" : "current-password") + '" required minlength="10">' +
      (up ? '<div class="hint">At least 10 characters.</div>' : '<div class="hint"><button type="button" class="btn link small" id="a-forgot">Forgot your password?</button></div>') + "</div>" +
      (up ? '<p class="small muted">By creating an account you agree to the <a href="/terms/">terms</a> and <a href="/privacy/">privacy policy</a>.</p>' : "") +
      '<button class="btn pri" style="width:100%" type="submit">' + (up ? "Create account" : "Sign in") + "</button>" +
      '<div class="err" id="a-err" role="alert"></div></form></div>' +
      '<div class="switch">' + (up ? "Already have an account? " : "New here? ") +
      '<button type="button" id="a-switch">' + (up ? "Sign in" : "Create an account") + "</button></div></div>";
    document.getElementById("a-switch").onclick = function () { renderAuth(up ? "signin" : "signup"); };
    if (!up) document.getElementById("a-forgot").onclick = function () { renderAuth("forgot"); };
    document.getElementById("authf").onsubmit = function (e) {
      e.preventDefault();
      var email = val("a-email"), pw = document.getElementById("a-pw").value, err = document.getElementById("a-err");
      err.textContent = "";
      if (!email || !pw) { err.textContent = "Enter your email and password."; return; }
      if (up && pw.length < 10) { err.textContent = "Use at least 10 characters."; return; }
      var btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      authCall(up ? "signup" : "token?grant_type=password", { email: email, password: pw }).then(function (r) {
        btn.disabled = false;
        if (up && r.ok && window.flVisit) window.flVisit("signup");
        if (r.ok && r.data.access_token) { saveSession(r.data); boot(); return; }
        if (up && r.ok) { renderAuth("signin", "Check your email to confirm your account, then sign in."); return; }
        var m = r.data.msg || r.data.error_description || r.data.message;
        if (r.data.error_code === "invalid_credentials") m = "That email and password don't match.";
        if (r.data.error_code === "user_already_exists") m = "That email already has an account. Sign in instead.";
        err.textContent = m || "That didn't work. Try again.";
        if (r.data.error_code === "email_not_confirmed") {
          err.innerHTML = "Confirm your email first: check your inbox for the link. " +
            '<button type="button" class="btn link small" id="a-resend">Send it again</button>';
          document.getElementById("a-resend").onclick = function () {
            authCall("resend", { type: "signup", email: email }).then(function (x) {
              err.textContent = x.ok ? "Sent. Check your inbox, and your spam folder." : (x.data.msg || "Wait a minute, then try again.");
            });
          };
        }
      }).catch(function () {
        btn.disabled = false;
        err.textContent = "We couldn't reach the server. Check your connection and try again.";
      });
    };
  }

  /* "forgot" emails a reset link; "reset" is where that link lands, already signed in */
  function renderPassword(mode, notice) {
    var forgot = mode === "forgot";
    root.innerHTML =
      '<div class="auth"><a class="brand" href="/"><i></i>ForgeLabs <span class="sub">App Ad Studio</span></a><div class="card">' +
      "<h1>" + (forgot ? "Reset your password" : "Choose a new password") + "</h1>" +
      '<p class="small muted" role="status" id="a-note">' + esc(notice || (forgot ? "We'll email you a link to choose a new one." : "")) + "</p>" +
      '<form id="authf" style="margin-top:16px" novalidate>' +
      (forgot ? '<div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" required></div>'
              : '<div class="field"><label for="a-pw">New password</label><input id="a-pw" type="password" autocomplete="new-password" required minlength="10"><div class="hint">At least 10 characters.</div></div>') +
      '<button class="btn pri" style="width:100%" type="submit">' + (forgot ? "Email me a link" : "Save and continue") + "</button>" +
      '<div class="err" id="a-err" role="alert"></div></form></div>' +
      (forgot ? '<div class="switch"><button type="button" id="a-switch">Back to sign in</button></div>' : "") + "</div>";
    if (forgot) document.getElementById("a-switch").onclick = function () { renderAuth("signin"); };
    document.getElementById("authf").onsubmit = function (e) {
      e.preventDefault();
      var err = document.getElementById("a-err"), btn = e.target.querySelector("button[type=submit]");
      err.textContent = "";
      if (forgot) {
        var email = val("a-email");
        if (!email) { err.textContent = "Enter your email."; return; }
        btn.disabled = true;
        authCall("recover", { email: email }).then(function (r) {
          btn.disabled = false;
          if (r.ok) { document.getElementById("a-note").textContent = "If that email has an account, a link is on its way. Check your spam folder too."; return; }
          err.textContent = r.data.msg || "Wait a minute, then try again.";
        }).catch(function () { btn.disabled = false; err.textContent = "We couldn't reach the server. Try again."; });
        return;
      }
      var pw = document.getElementById("a-pw").value;
      if (pw.length < 10) { err.textContent = "Use at least 10 characters."; return; }
      btn.disabled = true;
      authed(URL_ + "/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: pw }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (r) {
          btn.disabled = false;
          if (r.ok) { boot(); return; }
          err.textContent = r.data.error_code === "same_password" ? "That's your current password. Choose a different one."
            : (r.data.msg || "That didn't work. Try again.");
        }).catch(function (x) { btn.disabled = false; err.textContent = x.message || "That didn't work. Try again."; });
    };
  }

  /* ── shell ───────────────────────────────────────────────────── */
  function shell(inner) {
    var left = packsLeft();
    root.innerHTML = '<header class="top"><a class="brand" href="/"><i></i>ForgeLabs <span class="sub">App Ad Studio</span></a>' +
      '<a class="tab' + (S.project ? "" : " on") + '" href="#/">Your apps</a>' +
      '<span class="spacer"></span>' +
      (S.account ? '<span class="small muted packs">' + (left === Infinity ? "Unlimited packs" : left + " free pack" + (left === 1 ? "" : "s") + " left") + "</span>" : "") +
      '<button class="btn link" id="signout" type="button">Sign out</button></header>' +
      "<main>" + inner + "</main>";
    document.getElementById("signout").onclick = signOut;
  }
  function setupNeeded() {
    shell('<div class="card"><h1>The Studio is being set up</h1><p class="muted" style="margin-top:10px">' +
      "Your account works, but the Studio's database isn't switched on yet. Try again soon, or email " +
      '<a href="mailto:' + SUPPORT + '">' + SUPPORT + "</a>.</p></div>");
  }

  /* ── your apps ───────────────────────────────────────────────── */
  /* The whole first step is pasting the store link: the Studio fills in the rest (runImport) */
  var STORE_LINK = /^https?:\/\/(apps\.apple\.com|itunes\.apple\.com|play\.google\.com)\/\S+$/i;
  function renderApps() {
    S.project = null;
    var cards = S.projects.map(function (p) {
      var b = p.brief || {};
      return '<a class="appcard" href="#/app/' + esc(p.id) + '"><h2>' + esc(p.name) + "</h2>" +
        '<p class="muted small">' + esc(b.one_liner || "No brief yet") + "</p>" +
        '<p class="small muted">Edited ' + esc(when(p.updated_at)) + "</p></a>";
    }).join("");
    shell('<div class="card flow start">' + startHtml("h1") + "</div>" +
      '<div class="banner">Free in beta: one test pack of three to five videos, each opening with a different hook. Previews are always free.</div>' +
      (S.projects.length ? '<h2 class="list-head">Your apps</h2><div class="apps">' + cards + "</div>" : ""));
    wireStart(function (url) {
      return newProject({ store_url: url }).then(function (p) {
        S.importing[p.id] = { url: url };
        location.hash = "#/app/" + p.id + "/app";
      });
    }, function () {
      newProject({}).then(function (p) { S.manual[p.id] = 1; location.hash = "#/app/" + p.id + "/app"; }).catch(fail);
    });
  }
  function newProject(b) { return insert("studio_projects", { name: "Untitled app", brief: b, script: defaults({}) }); }
  /* The paste box: on the apps page, and on a project that has nothing in it yet */
  function startHtml(tag) {
    return "<" + tag + ">Paste your app's store link</" + tag + ">" +
      '<p class="muted">From the App Store or Google Play. The Studio brings in the name, icon and screenshots, then writes five hooks and a script for you to check.</p>' +
      '<div class="row nowrap-row"><input id="start-link" type="url" inputmode="url" placeholder="https://apps.apple.com/us/app/…" autocomplete="off" aria-label="Your store link">' +
      '<button class="btn pri" id="start-go" type="button">Start</button></div>' +
      '<div class="hint" id="start-status" role="status"></div>' +
      '<p class="small muted">Not in a store yet? <button class="btn link small" id="start-manual" type="button">Set it up by hand</button></p>';
  }
  /* A pasted link starts by itself; a typed one starts on Enter or the button */
  function wireStart(begin, manual) {
    var input = document.getElementById("start-link"), btn = document.getElementById("start-go"), busy = false;
    var say = function (t) { document.getElementById("start-status").textContent = t; };
    var start = function () {
      var url = input.value.trim();
      if (busy) return;
      if (!STORE_LINK.test(url)) { say(url ? ERRORS.store_link : "Paste your App Store or Google Play link first."); return; }
      busy = true; btn.disabled = true; say("Starting…");
      Promise.resolve().then(function () { return begin(url); }).catch(function (e) { busy = false; btn.disabled = false; say(""); fail(e); });
    };
    input.addEventListener("paste", function () { setTimeout(function () { if (STORE_LINK.test(input.value.trim())) start(); }, 0); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") start(); });
    btn.onclick = start;
    document.getElementById("start-manual").onclick = manual;
    if (!window.matchMedia || !matchMedia("(hover: none)").matches) input.focus();
  }

  /* ── one app ─────────────────────────────────────────────────── */
  function renderProject() {
    var p = S.project;
    if (!p) { shell('<div class="card empty">That app isn\'t in your account. <a href="#/">Back to your apps</a></div>'); return; }
    var done = readiness();
    var steps = STEPS.map(function (s, i) {
      return '<a class="step' + (S.step === s[0] ? " on" : "") + (done[s[0]] ? " done" : "") + '" href="#/app/' + esc(p.id) + "/" + s[0] + '">' +
        '<b>' + (i + 1) + "</b>" + esc(s[1]) + "</a>";
    }).join("");
    shell('<div class="head"><div><div class="small muted"><a href="#/">Your apps</a> /</div><h1 id="p-name">' + esc(p.name) + "</h1></div></div>" +
      '<nav class="steps" aria-label="Steps">' + steps + "</nav>" + '<div id="pane"></div>');
    ({ app: renderApp, review: renderReview, make: renderMake }[S.step] || renderApp)();
  }
  function pane(html, wide) {
    var el = document.getElementById("pane");
    el.className = wide ? "wide" : "";
    el.innerHTML = html;
  }
  function go(step) { flush().then(function () { location.hash = "#/app/" + S.project.id + "/" + step; }); }
  /* Edits save themselves: changes go into S.project at once and reach the server shortly after.
     flush() sends anything still waiting, before leaving a step or queueing a render. */
  var pending = {};
  function later(fields) {
    Object.assign(pending, fields);
    clearTimeout(S.saveT);
    S.saveT = setTimeout(flush, 700);
  }
  function flush() {
    clearTimeout(S.saveT);
    if (!S.project || !Object.keys(pending).length) return Promise.resolve();
    var f = pending; pending = {};
    f.updated_at = new Date().toISOString();
    return patch("studio_projects", S.project.id, f).catch(fail);
  }
  function readiness() {
    var b = brief(), sc = script(), sel = selectedHooks();
    var r = {
      app: !!(S.project.name && S.project.name !== "Untitled app" && b.one_liner) && shots().length >= 2,
      hooks: sel.length >= MIN_HOOKS && !dupes(sel),
      script: sc.body.length >= 2 && sc.body.every(function (s) { return s.say && s.screen; }),
      make: S.batches.some(function (x) { return x.status === "done"; })
    };
    r.review = r.hooks && r.script;
    return r;
  }
  function category(text) {
    var hit = CATEGORY_WORDS.filter(function (c) { return c[1].test(text || ""); })[0];
    return hit ? hit[0] : "general";
  }

  /* ── 1. your app ─────────────────────────────────────────────── */
  function shots() { return S.assets.filter(function (a) { return a.kind !== "icon"; }); }
  function icon() { return S.assets.filter(function (a) { return a.kind === "icon"; })[0]; }
  function assetLabel(a) {
    var list = shots(), i = list.indexOf(a);
    if (a.kind === "icon") return "App icon";
    return (a.kind === "recording" ? "Recording " : "Screen ") + (i + 1);
  }

  function renderApp() {
    var b = brief(), plat = b.platforms || ["ios"], pid = S.project.id, imp = S.importing[pid];
    if (imp && !imp.started) runImport(imp.url);
    /* A project with nothing in it yet starts with the paste box */
    if (!S.importing[pid] && !b.store_url && !b.name && !S.assets.length && !S.manual[pid]) {
      pane('<div class="card flow start">' + startHtml("h2") + "</div>");
      wireStart(function (url) { runImport(url); renderApp(); }, function () { S.manual[pid] = 1; renderApp(); });
      return;
    }
    pane('<div id="import"></div><div class="card flow">' +
      '<div class="field"><label for="b-store">App Store or Google Play link</label>' +
      '<div class="row nowrap-row"><input id="b-store" type="url" inputmode="url" value="' + esc(b.store_url) + '" placeholder="Paste your store link" autocomplete="off">' +
      '<button class="btn" id="b-import" type="button">Fill in from the store</button></div>' +
      '<div class="hint">Fills in the name, what it does, the icon and your screenshots, then writes your hooks and script.</div></div>' +
      '<div class="field"><label for="b-name">App name</label><input id="b-name" value="' + esc(S.project.name === "Untitled app" ? "" : S.project.name) + '" placeholder="Habitly" autocomplete="off">' +
      '<div class="hint" id="b-spoken-wrap">' + (b.spoken_name
        ? '<label for="b-spoken" class="small">Said as</label><input id="b-spoken" value="' + esc(b.spoken_name) + '" placeholder="Habit-lee">'
        : '<button type="button" class="btn link small" id="b-say">Hard to pronounce?</button>') + "</div></div>" +
      '<div class="field"><label for="b-one">What does it do?</label><input id="b-one" value="' + esc(b.one_liner) + '" maxlength="200" placeholder="Turns daily habits into streaks you can share with friends."></div>' +
      '<div class="field"><label>Like… <span class="muted">(optional, makes the best hooks)</span></label><div class="row nowrap-row like">' +
      '<span class="muted">It\'s like</span><input id="b-ck" value="' + esc(b.comp_known) + '" placeholder="Duolingo">' +
      '<span class="muted">but for</span><input id="b-ct" value="' + esc(b.comp_thing) + '" placeholder="habits"></div></div>' +
      '<div class="field"><label>Available on</label><div class="row">' +
      [["ios", "iPhone"], ["android", "Android"], ["web", "Web"]].map(function (x) {
        return '<label class="check"><input type="checkbox" name="b-plat" value="' + x[0] + '"' + (plat.indexOf(x[0]) >= 0 ? " checked" : "") + "> " + x[1] + "</label>";
      }).join("") + "</div></div></div>" +
      '<div class="card flow"><h2>Screenshots</h2><p class="muted small">Two or more, straight from your phone. A short screen recording works too.</p>' +
      '<label class="drop" for="up"><input id="up" type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime">' +
      '<b>Add screenshots</b><span class="small muted">or drop them here</span></label>' +
      '<div id="up-status" class="small muted" role="status"></div><div id="shots"></div>' +
      '<div class="row icon-row" id="icon-row"></div></div>' +
      '<div class="row"><button class="btn pri" id="a-next" type="button">Continue to review</button><span class="small muted" id="a-need"></span></div>');
    renderImport();

    function read() {
      var plats = Array.prototype.slice.call(document.querySelectorAll('input[name="b-plat"]:checked')).map(function (x) { return x.value; });
      var nb = Object.assign({}, brief(), {
        store_url: val("b-store"), name: val("b-name"), one_liner: val("b-one"), platforms: plats.length ? plats : ["ios"],
        comp_known: val("b-ck"), comp_thing: val("b-ct"),
        comparison: val("b-ck") && val("b-ct") ? "It's like " + val("b-ck") + ", but for " + val("b-ct") : "",
        category: category(val("b-one") + " " + (brief().store_category || ""))
      });
      if (document.getElementById("b-spoken")) nb.spoken_name = val("b-spoken");
      S.project.brief = nb;
      S.project.name = nb.name || "Untitled app";
      document.getElementById("p-name").textContent = S.project.name;
      later({ name: S.project.name, brief: nb });
      need();
    }
    root.querySelectorAll("#pane input:not([type=file])").forEach(function (el) {
      el.addEventListener(el.type === "checkbox" ? "change" : "input", read);
    });
    var say = document.getElementById("b-say");
    if (say) say.onclick = function () {
      document.getElementById("b-spoken-wrap").innerHTML = '<label for="b-spoken" class="small">Said as</label><input id="b-spoken" placeholder="Spell it how it sounds, like Habit-lee">';
      var sp = document.getElementById("b-spoken"); sp.addEventListener("input", read); sp.focus();
    };
    var drop = root.querySelector(".drop");
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files, false); });
    document.getElementById("up").onchange = function (e) { addFiles(e.target.files, false); };
    var store = document.getElementById("b-store");
    var fromStore = function () {
      var u = store.value.trim(), st = S.importing[pid];
      if (st && st.started && !st.finished && !st.failed) return;
      if (!STORE_LINK.test(u)) { toast(u ? ERRORS.store_link : "Paste your App Store or Google Play link first."); return; }
      runImport(u);
    };
    document.getElementById("b-import").onclick = fromStore;
    store.addEventListener("keydown", function (e) { if (e.key === "Enter") fromStore(); });
    store.addEventListener("paste", function () { setTimeout(function () { if (STORE_LINK.test(store.value.trim())) fromStore(); }, 0); });
    document.getElementById("a-next").onclick = function () {
      var r = readiness();
      if (!r.app) { need(true); return; }
      go("review");
    };
    renderShots();
  }
  /* What's still missing before step 2, under the Continue button */
  function need(loud) {
    var el = document.getElementById("a-need");
    if (!el) return;
    var b = brief(), miss = [];
    if (!b.name) miss.push("the app name");
    if (!b.one_liner) miss.push("what it does");
    if (shots().length < 2) miss.push(shots().length ? "one more screenshot" : "two screenshots");
    el.textContent = miss.length ? "Add " + miss.join(", ").replace(/, ([^,]*)$/, " and $1") + "." : "";
    el.className = "small " + (loud && miss.length ? "bad" : "muted");
  }
  /* A phone screenshot is about twice as tall as it's wide; anything squarer is shown whole on a
     blurred background rather than cropped. 1.96 matches fit() in engine/forge_engine/render.py. */
  function phoneShaped(a) { return !a.width || !a.height || a.height / a.width >= 1.96; }
  function renderShots() {
    var list = shots(), ic = icon();
    signed("studio-uploads", S.assets.map(function (a) { return a.path; })).then(function () {
      var box = document.getElementById("shots");
      if (!box) return;
      box.innerHTML = list.length ? '<div class="shots">' + list.map(function (a, i) {
        var u = link("studio-uploads", a.path);
        var media = a.kind === "recording"
          ? '<video src="' + esc(u ? u + "#t=0.1" : "") + '" muted playsinline loop preload="metadata"></video>'
          : '<img src="' + esc(u) + '" alt="' + esc(assetLabel(a)) + '" loading="lazy">';
        return '<figure class="shot" data-id="' + esc(a.id) + '">' + media +
          '<span class="num">' + (i + 1) + "</span>" +
          '<span class="tools"><button class="btn small" data-up="' + i + '" type="button" aria-label="Move earlier"' + (i ? "" : " disabled") + ">←</button>" +
          '<button class="btn small" data-down="' + i + '" type="button" aria-label="Move later"' + (i < list.length - 1 ? "" : " disabled") + ">→</button>" +
          '<button class="btn small" data-del="' + esc(a.id) + '" type="button" aria-label="Remove">✕</button></span>' +
          (phoneShaped(a) ? "" : '<span class="warnbadge">' + (a.width >= a.height ? "Landscape" : "Tablet shape") + "</span>") + "</figure>";
      }).join("") + "</div>" : "";
      if (!list.every(phoneShaped)) {
        box.innerHTML += '<p class="small muted">Marked screens aren\'t phone-shaped. They\'ll be shown whole inside the phone, on a blurred copy of themselves; ' +
          "a screenshot taken on a phone fills the screen and looks better.</p>";
      }
      if (list.some(function (a) { return /^Store screenshot/.test(a.label || ""); })) {
        box.innerHTML += '<p class="small muted">These came from your store listing. Store screenshots often have captions or a phone frame already; ' +
          "plain screenshots from your phone make cleaner ads, so swap any that look busy.</p>";
      }
      document.getElementById("icon-row").innerHTML = ic
        ? '<img class="iconprev" src="' + esc(link("studio-uploads", ic.path)) + '" alt="App icon"><span class="small muted">App icon, on the end card</span><button class="btn small link" data-del="' + esc(ic.id) + '" type="button">Remove</button>'
        : '<label class="btn small" for="up-icon">Add your app icon<input id="up-icon" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><span class="small muted">For the end card. Without it, the end card shows only your app\'s name.</span>';
      var upi = document.getElementById("up-icon");
      if (upi) upi.onchange = function (e) { addFiles(e.target.files, true); };
      root.querySelectorAll("#shots [data-del], #icon-row [data-del]").forEach(function (el) {
        el.onclick = function () { removeAsset(find(el.getAttribute("data-del"))); };
      });
      root.querySelectorAll("#shots [data-up], #shots [data-down]").forEach(function (el) {
        el.onclick = function () {
          var i = Number(el.getAttribute("data-up") || el.getAttribute("data-down"));
          var j = el.hasAttribute("data-up") ? i - 1 : i + 1;
          var l = shots(), a = l[i], b = l[j];
          Promise.all([patch("studio_assets", a.id, { sort: j }), patch("studio_assets", b.id, { sort: i })]).then(function () {
            a.sort = j; b.sort = i;
            l.forEach(function (x, k) { if (x !== a && x !== b) x.sort = k; });
            S.assets.sort(function (x, y) { return x.sort - y.sort; });
            renderShots();
          }).catch(fail);
        };
      });
      root.querySelectorAll(".shot video").forEach(function (v) {
        v.onmouseenter = function () { v.play().catch(function () {}); };
        v.onmouseleave = function () { v.pause(); };
      });
      need();
    });
  }
  function find(id) { return S.assets.filter(function (a) { return a.id === id; })[0]; }
  function dims(file) {
    return new Promise(function (res) {
      var u = URL.createObjectURL(file);
      if (file.type.indexOf("video") === 0) {
        var v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = function () { res({ w: v.videoWidth, h: v.videoHeight, d: v.duration }); URL.revokeObjectURL(u); };
        v.onerror = function () { res({}); URL.revokeObjectURL(u); };
        v.src = u;
      } else {
        var im = new Image();
        im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(u); };
        im.onerror = function () { res({}); URL.revokeObjectURL(u); };
        im.src = u;
      }
    });
  }
  function addFiles(fileList, asIcon) {
    var files = Array.prototype.slice.call(fileList || []), pid = S.project.id;
    var status = document.getElementById("up-status");
    if (S.assets.length + files.length > MAX_ASSETS) { toast("Keep it to " + MAX_ASSETS + " files per app."); return Promise.resolve(); }
    var okType = /^(image\/(png|jpeg|webp)|video\/(mp4|quicktime))$/;
    var n = 0, chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        if (!okType.test(file.type)) { toast(file.name + ": use PNG, JPEG, WebP, MP4 or MOV."); return; }
        if (file.size > MAX_BYTES) { toast(file.name + " is over 50 MB."); return; }
        if (asIcon && file.type.indexOf("image") !== 0) { toast("The icon must be an image."); return; }
        if (status) status.textContent = "Uploading " + file.name + "…";
        return dims(file).then(function (d) {
          if (d.d && d.d > 60) throw new Error(file.name + " is longer than a minute. Trim it to under 30 seconds.");
          var ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" }[file.type];
          var path = uid() + "/" + pid + "/" + rand() + "." + ext;
          var kind = asIcon ? "icon" : (file.type.indexOf("video") === 0 ? "recording" : "screen");
          return upload(path, file).then(function () {
            return insert("studio_assets", {
              project_id: pid, kind: kind, path: path, label: asIcon ? "App icon" : file.name.replace(/\.[^.]+$/, "").slice(0, 60),
              status_bar: true, width: d.w || null, height: d.h || null, bytes: file.size, sort: S.assets.length
            });
          }).then(function (a) { if (S.project && S.project.id === pid) S.assets.push(a); n++; });
        });
      }).catch(function (e) { fail(e); });
    });
    return chain.then(function () {
      var st = document.getElementById("up-status");
      if (st) st.textContent = "";
      if (n) toast(n === 1 ? "Uploaded" : n + " files uploaded");
      renderShots();
    });
  }

  /* ── start from a store link ─────────────────────────────────── */
  var STORE_SHOTS = 6;
  var IMPORT_STEPS = [["listing", "Reading your store listing"], ["shots", "Bringing in your screenshots and icon"],
    ["hooks", "Writing five hooks, one per angle"], ["check", "Checking every claim"], ["script", "Writing the script"]];
  /* The store's own short line, or the description's first sentence */
  function storeLine(d) {
    var t = (d.subtitle || d.description || "").trim();
    var first = t.match(/^.{12,200}?[.!?](\s|$)/);
    return (first ? first[0] : t).trim().slice(0, 200);
  }
  function storeFile(url, name) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("image " + r.status);
      return r.blob();
    }).then(function (blob) {
      var ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[blob.type];
      if (!ext) throw new Error("image type " + blob.type);
      return new File([blob], name + "." + ext, { type: blob.type });
    });
  }
  /* Phone screenshots only: the stores also list tablet and desktop ones, which are wider */
  function storeShots(urls, want) {
    var out = [], i = 0;
    function next() {
      if (out.length >= want || i >= Math.min(urls.length, 16)) return Promise.resolve(out);
      var url = urls[i++];
      return storeFile(url, "Store screenshot " + (out.length + 1)).then(function (f) {
        return dims(f).then(function (d) { if (d.w && d.h >= d.w * 1.6) out.push(f); });
      }).catch(function () {}).then(next);
    }
    return next();
  }
  /* Everything a store link fills in, in order: the listing, the screenshots, icon and brand
     colour, then the hooks, their claim checks and the script (prefill). Each part keeps what the
     customer already has, and it ends on the review step. Leaving the app stops it. */
  function runImport(url) {
    var pid = S.project.id;
    var st = S.importing[pid] = { url: url, started: true, on: "listing", done: {}, notes: {} };
    var here = function () { return S.project && S.project.id === pid; };
    var show = function () { if (here() && S.step === "app") renderImport(); };
    var mark = function (k, note, next) { st.done[k] = true; if (note) st.notes[k] = note; if (next) st.on = next; show(); };
    var stay = function () { if (!here()) throw Object.assign(new Error(""), { code: "left" }); };
    show();
    return fn("studio-store", { url: url }).then(function (r) {
      if (!r.ok) throw Object.assign(new Error(errText(r.data.error, "Couldn't read that listing. Try again, or fill in the details yourself.")), { code: r.data.error });
      stay();
      applyListing(r.data, url);
      if (S.step === "app") renderApp();
      mark("listing", r.data.name, "shots");
      return storeMedia(r.data);
    }).then(function (note) {
      stay();
      mark("shots", note, "hooks");
      S.prefilled[pid] = 1;
      return prefill(mark);
    }).then(function () {
      st.finished = true;
      if (here() && S.step === "app") go("review");
    }).catch(function (e) {
      if (e.code === "left") { delete S.importing[pid]; return; }
      st.failed = true;
      st.error = e.message || "Couldn't read that listing.";
      show();
    });
  }
  function renderImport() {
    var box = document.getElementById("import"), st = S.project && S.importing[S.project.id];
    if (!box) return;
    if (!st || st.finished) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="card flow importing"><h2>' + (st.failed ? "That didn't work" : "Setting up " + esc(brief().name || "your app")) + "</h2>" +
      '<ol class="stages">' + IMPORT_STEPS.map(function (s, i) {
        var done = st.done[s[0]], on = !done && !st.failed && (i < 2 ? st.on === s[0] : !!st.done.shots);
        return '<li class="' + (done ? "done" : on ? "on" : "") + '">' + (on ? '<span class="spin" aria-hidden="true"></span> ' : "") + esc(s[1]) +
          (st.notes[s[0]] ? ' <span class="muted">' + esc(st.notes[s[0]]) + "</span>" : "") + "</li>";
      }).join("") + "</ol>" +
      (st.failed ? '<p class="small bad" role="alert">' + esc(st.error) + '</p><p class="small muted">Check the link and try again, or fill in the details below yourself.</p>'
                 : '<p class="small muted">About a minute. You can change everything after.</p>') + "</div>";
  }
  function applyListing(d, url) {
    var b = brief(), plats = (b.platforms || []).slice(), store = d.store === "apple" ? "ios" : "android";
    if (plats.indexOf(store) < 0) plats.push(store);
    var nb = Object.assign({}, b, {
      store_url: url, platforms: plats, store_text: String(d.description || "").slice(0, 1500), store_category: d.category || "",
      store_rating: d.rating || null, store_ratings: d.ratings || null
    });
    if (!b.name) nb.name = d.name;
    if (!b.one_liner) nb.one_liner = storeLine(d);
    nb.category = category(nb.one_liner + " " + nb.store_category);
    S.project.brief = nb;
    S.project.name = nb.name || "Untitled app";
    var h = document.getElementById("p-name");
    if (h) h.textContent = S.project.name;
    later({ name: S.project.name, brief: nb });
    flush();
  }
  /* Screenshots only for a project that has none yet, so a second import never duplicates them */
  function storeMedia(d) {
    var room = MAX_ASSETS - S.assets.length - (icon() ? 0 : 1);
    var want = shots().length ? 0 : Math.max(0, Math.min(STORE_SHOTS, room));
    return Promise.all([
      storeShots(d.screenshots || [], want),
      !icon() && d.icon ? storeFile(d.icon, "App icon").catch(function () { return null; }) : null
    ]).then(function (got) {
      return addFiles(got[0], false).then(function () {
        if (got[1]) return addFiles([got[1]], true).then(function () { return useIconColour(got[1]); });
      }).then(function () {
        var kept = got[0].length;
        if (want === 0) return "Kept your screenshots";
        if (!kept) return "The listing had no phone screenshots: add yours below";
        return kept + " screenshot" + (kept === 1 ? "" : "s") + (got[1] ? " and your icon" : "");
      });
    });
  }
  /* The icon's main colour, for the brand colour: the hue with the most strong colour in it,
     ignoring white, black and grey. null when the icon has too little colour to go on. */
  function iconColour(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = function () {
        try {
          var c = document.createElement("canvas"), n = 48;
          c.width = c.height = n;
          var x = c.getContext("2d");
          x.drawImage(im, 0, 0, n, n);
          var px = x.getImageData(0, 0, n, n).data, bins = {}, count = 0;
          for (var i = 0; i < px.length; i += 4) {
            var r = px[i], g = px[i + 1], b = px[i + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b);
            if (px[i + 3] < 200 || hi < 60 || (hi - lo) / hi < 0.35) continue;
            var d = hi - lo, hue = hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
            var k = Math.floor(hue * 3), w = (hi - lo) / hi * hi;
            var bin = bins[k] || (bins[k] = { w: 0, r: 0, g: 0, b: 0 });
            bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w; count++;
          }
          var best = null;
          Object.keys(bins).forEach(function (k) { if (!best || bins[k].w > best.w) best = bins[k]; });
          if (!best || count < n * n * 0.05) { res(null); return; }
          res("#" + [best.r, best.g, best.b].map(function (v) { return ("0" + Math.round(v / best.w).toString(16)).slice(-2); }).join(""));
        } catch (e) { res(null); }
      };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }
  /* The brand colour starts as the icon's, until the customer picks one */
  function useIconColour(file) {
    var u = URL.createObjectURL(file);
    return iconColour(u).then(function (c) {
      URL.revokeObjectURL(u);
      var sc = script();
      if (c) {
        sc.theme = Object.assign({}, sc.theme, sc.theme.picked ? {} : { accent: c }, { from_icon: c });
        later({ script: sc });
      }
      return c;
    });
  }
  /* Hooks, their claim checks and the script, so review is the next step. Each part is skipped
     when the customer already has one. Without AI, a comparison from step 1 becomes a hook and the
     store listing's feature lines become the script. */
  function prefill(mark) {
    var pid = S.project.id, here = function () { return S.project && S.project.id === pid; };
    mark = mark || function () {};
    var hooks = S.hooks.length ? Promise.resolve("Kept your hooks") : suggestAngles().then(function (n) {
      return n ? n + " hooks" : "";
    }, function (e) {
      if (e.code !== "ai_unavailable") fail(e);
      var b = brief();
      if (here() && b.comparison && !hasHook(b.comparison + ".")) {
        return addHook({ category: "comparison", text: b.comparison + ".", source: "template", selected: true }).then(function () { return "AI is off: add your own below"; });
      }
      return "AI is off: write yours below";
    });
    var checked = hooks.then(function (note) {
      mark("hooks", note, "check");
      if (!here()) return;
      return checkHooks(S.hooks.filter(needsCheck)).then(function () { if (here()) return preselect(); });
    }).then(function () { mark("check", S.ai === false ? "the quick check in your browser" : ""); });
    var scripted = script().body.some(function (s) { return s.say; }) ? Promise.resolve("Kept your script") : draftScript(true);
    return Promise.all([
      checked.catch(function () {}),
      scripted.then(function (note) { mark("script", note || ""); }, function () { mark("script", ""); })
    ]).then(function () { if (here()) { refreshHooks(); renderChips(); renderPanel(); renderAdvanced(); } });
  }
  function removeAsset(a) {
    if (!a || !confirm("Remove " + assetLabel(a) + "?")) return;
    del("studio_assets", a.id).then(function () {
      authed(URL_ + "/storage/v1/object/studio-uploads", { method: "DELETE", body: JSON.stringify({ prefixes: [a.path] }) }).catch(function () {});
      S.assets = S.assets.filter(function (x) { return x.id !== a.id; });
      renderShots();
    }).catch(fail);
  }
  /* ── hook lint: checks that work without AI ──────────────────── */
  function lint(text, b) {
    var out = [], t = String(text || "").trim(), n = words(t).length;
    /* Numbers the description already states are fine; any other number is the most common false claim */
    var known = [b.one_liner, b.facts, b.store_text, b.store_rating, b.store_ratings].join(" ").toLowerCase();
    if (n > 14) out.push(["warn", "Long: about " + (n / 2.6).toFixed(1) + " seconds to say. Aim for 12 words or fewer."]);
    var nums = t.match(/\d[\d,.]*\s*%?|\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|billion|double|twice|triple|tenfold)\b/gi) || [];
    nums.forEach(function (m) {
      var k = m.toLowerCase().trim(), digits = k.replace(/[,\s%]/g, "");
      var ok = known.indexOf(k) >= 0 || (digits && known.replace(/,/g, "").indexOf(digits) >= 0) ||
        (NUMWORDS[k] && known.indexOf(String(NUMWORDS[k])) >= 0);
      if (!ok) out.push(["warn", "Uses a number (\"" + m.trim() + "\"). Make sure it's true today.", "num"]);
    });
    if (/\b(guarantee[ds]?|risk[- ]free|get rich|cures?|cured|miracle|never lose|100% (?:safe|accurate|guaranteed))\b/i.test(t))
      out.push(["block", "Promises a result no app can guarantee."]);
    if (/\b(best|#1|number one|top[- ]rated|world'?s first|instant(?:ly)?|overnight|revolutionary|game[- ]changer|unlock your)\b/i.test(t))
      out.push(["warn", "Unprovable or vague wording (best, #1, instant…). Say what the app actually does."]);
    if (/\b(are you|you're|you are|for (?:people|anyone) who (?:are|is))\b[^.?!]{0,40}\b(broke|in debt|depressed|anxious|overweight|fat|obese|single|lonely|sick|ill|diabetic|gay|lesbian|trans|christian|muslim|jewish|hindu|old|elderly|pregnant|addicted|poor|bankrupt|unemployed|divorced|disabled)\b/i.test(t) ||
        /\byour (debt|debts|anxiety|depression|weight|diagnosis|credit score|condition|disease|illness|sexuality|religion|faith|addiction|divorce|bankruptcy|salary|income)\b/i.test(t))
      out.push(["block", "Says something about the viewer's personal situation. Ad platforms reject this: describe the situation, not the person."]);
    var data = t.match(/\b(?:your|you've been)\s+(spending|money's|money has|bank(?: account)?|transactions|purchases|browsing|location|messages|photos|contacts|health data|sleep data|portfolio|holdings)\b/i);
    if (data) out.push(["warn", "Sounds like the app sees the viewer's " + data[1].toLowerCase() + ". Make sure it really does, or reword."]);
    var brand = BRANDS.filter(function (x) { return new RegExp("\\b" + x + "\\b").test(t); })[0];
    if (brand) out.push(["info", "Uses " + brand + "'s name: fine as a comparison, without their logo or colours."]);
    return out;
  }
  /* One badge per hook: "Won't pass" when anything blocks it, "Check this" when something needs a
     look, otherwise "Passes". When the AI check has passed a hook, it outranks the browser's
     number check: it knows the store rating and the listing, the browser only knows the brief. */
  function verdict(h) {
    var ai = (Array.isArray(h.checks) ? h.checks : [])[0] || null;
    /* Once the AI has looked, its reasons replace the browser's notes (but never its blocks) */
    var list = lint(h.text, brief()).filter(function (x) { return !(ai && (x[0] === "info" || (ai.verdict === "ok" && x[2] === "num"))); });
    if (ai && (ai.verdict === "warn" || ai.verdict === "block")) (ai.reasons || []).forEach(function (r) { list.push([ai.verdict, r]); });
    var level = list.some(function (x) { return x[0] === "block"; }) ? "block" : list.some(function (x) { return x[0] === "warn"; }) ? "warn" : "ok";
    return { level: level, reasons: list, ai: !!ai, pending: !ai && !!S.checking[h.id],
             rewrite: ai && ai.verdict !== "ok" && ai.rewrite && norm(ai.rewrite) !== norm(h.text) ? ai.rewrite : "" };
  }
  function badge(v) {
    if (v.pending) return '<span class="badge wait"><span class="spin" aria-hidden="true"></span> Checking</span>';
    var t = { ok: ["ok", "Passes"], warn: ["warn", "Check this"], block: ["bad", "Won't pass"] }[v.level];
    return '<span class="badge ' + t[0] + '" title="' + (v.ai ? "Checked by AI against your app's listing" : "The quick check in your browser") + '">' + t[1] + "</span>";
  }
  /* Two hooks are the same when only case, spacing or punctuation differ. The worker and
     studio_queue() compare them the same way. */
  function norm(t) { return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
  function hasHook(t, except) { return S.hooks.some(function (h) { return h !== except && norm(h.text) === norm(t); }); }
  function dupes(list) {
    var seen = {};
    return list.some(function (h) { var k = norm(h.text); if (seen[k]) return true; seen[k] = 1; return false; });
  }
  function selectedHooks() { return S.hooks.filter(function (h) { return h.selected; }); }
  function needsCheck(h) { return !(Array.isArray(h.checks) && h.checks.length); }
  function hookById(id) { return S.hooks.filter(function (h) { return h.id === id; })[0]; }
  function angleOf(cat) { return ANGLES.some(function (a) { return a[0] === cat; }) ? cat : ANGLE_FROM_CATEGORY[cat]; }
  function angleLabel(cat) {
    var a = ANGLES.filter(function (x) { return x[0] === cat; })[0] || CATEGORIES.filter(function (x) { return x[0] === cat; })[0];
    return a ? a[1] : "Your own";
  }

  /* ── 2. review: hooks with their checks and a live preview, then the rest of the ad ── */
  function renderReview() {
    var b = brief(), pid = S.project.id;
    seedScript();
    pane('<div class="review"><div class="rv-main">' +
      '<div class="card flow"><div class="row"><h2>Your hooks</h2><span class="spacer"></span><span class="small" id="h-count"></span></div>' +
      '<p class="muted small">Each video opens with a different hook, so the pack shows which one works. Pick three to five.</p>' +
      (POLICY[b.category] ? '<div class="banner warn small">' + esc(POLICY[b.category]) + "</div>" : "") +
      '<div id="h-note"></div><div id="h-list"></div>' +
      '<div class="row h-more">' + (S.ai === false ? "" : '<button class="btn small" id="h-ai" type="button">Five more ideas</button>') +
      '<span class="small muted" id="h-status" role="status"></span></div>' +
      '<div class="write"><div class="row nowrap-row"><input id="h-text" maxlength="160" placeholder="Write your own hook" aria-label="New hook">' +
      '<button class="btn" id="h-add" type="button">Add</button></div>' +
      '<div class="small muted chips">Start from: ' + ANGLES.map(function (a) {
        return '<button class="chip" type="button" data-tmpl="' + esc(a[0]) + '" data-text="' + esc(a[2]) + '">' + esc(a[1]) + "</button>";
      }).join("") + '</div><div id="h-live" class="lint"></div></div></div>' +
      '<div class="card flow"><div class="row"><h2>The rest of the ad</h2><span class="spacer"></span><span class="small muted" id="sc-status" role="status"></span></div>' +
      '<p class="muted small">Filled in for you, and the same in every video, so only the hook changes. Tap one to change it.</p>' +
      '<div class="pchips" id="pchips"></div><div id="panel"></div>' +
      '<details class="more" id="adv"' + (S.adv ? " open" : "") + '><summary>Advanced</summary><div id="adv-body"></div></details></div>' +
      '<div id="m-card"></div></div>' +
      '<aside class="rv-side"><div class="pv"><canvas id="pv" width="540" height="960" role="img" aria-label="Preview: the hook over your app\'s first screen"></canvas></div>' +
      '<p class="small muted" id="pv-cap"></p></aside></div>', true);

    var text = document.getElementById("h-text"), cat = "custom";
    text.oninput = function () { document.getElementById("h-live").innerHTML = lintHtml(lint(text.value, b), text.value.trim()); };
    text.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); document.getElementById("h-add").click(); } };
    root.querySelectorAll("[data-tmpl]").forEach(function (el) {
      el.onclick = function () {
        cat = el.getAttribute("data-tmpl");
        text.value = el.getAttribute("data-text"); text.focus();
        /* Select the first [blank], so typing replaces it */
        var i = text.value.indexOf("["), j = text.value.indexOf("]");
        if (i >= 0 && j > i) text.setSelectionRange(i, j + 1);
        text.oninput();
      };
    });
    document.getElementById("h-add").onclick = function () {
      var t = text.value.trim();
      if (t.length < 3) { toast("Write the hook first."); return; }
      if (/\[[^\]]*\]/.test(t)) { toast("Fill in the [blanks] with your own words."); return; }
      if (hasHook(t)) { toast("You already have that hook. Each video needs a different one."); return; }
      addHook({ category: cat, text: t, source: "user", selected: selectedHooks().length < MAX_HOOKS }).then(function (row) {
        text.value = ""; cat = "custom"; text.oninput();
        refreshHooks(); preview(row); checkSoon();
      }).catch(fail);
    };
    var ai = document.getElementById("h-ai");
    if (ai) ai.onclick = function () {
      ai.disabled = true;
      suggestAngles().then(function (n) {
        if (!n) toast("No new ideas this time. Try again, or write your own.");
        return checkHooks(S.hooks.filter(needsCheck));
      }).catch(fail).then(function () { var x = document.getElementById("h-ai"); if (x) x.disabled = false; });
    };
    document.getElementById("adv").addEventListener("toggle", function (e) { S.adv = e.target.open; });
    renderHookList(); renderChips(); renderPanel(); renderAdvanced(); renderGo();
    preview(hookById(S.pv) || selectedHooks()[0] || S.hooks[0]);
    /* A project set up by hand gets the same start as a store import: hooks, checks and a script */
    if (!S.prefilled[pid]) {
      S.prefilled[pid] = 1;
      if (!S.hooks.length || !script().body.some(function (s) { return s.say; })) prefill();
      else checkHooks(S.hooks.filter(needsCheck));
    }
  }
  function lintHtml(list, text) {
    if (!text || !list.length) return "";
    return "<ul>" + list.map(function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + "</li>"; }).join("") + "</ul>";
  }
  /* Redraws the hook list, unless someone is typing in it: then it waits until they leave the field */
  function refreshHooks() {
    var a = document.activeElement;
    if (a && a.classList && a.classList.contains("htext")) { S.refreshLater = true; return; }
    S.refreshLater = false;
    renderHookList(); renderGo();
  }
  function renderHookList() {
    var box = document.getElementById("h-list");
    if (!box) return;
    var sel = selectedHooks().length, c = document.getElementById("h-count");
    c.textContent = sel + " of " + MAX_HOOKS + " picked";
    c.className = "small " + (sel >= MIN_HOOKS ? "good" : "muted");
    document.getElementById("h-note").innerHTML = S.ai === false
      ? '<p class="small muted">The AI claim check is off right now, so these badges come from a quick check in your browser. Read every hook as a stranger would.</p>' : "";
    box.innerHTML = S.hooks.length ? S.hooks.map(hookCard).join("")
      : S.writing ? '<p class="small muted"><span class="spin" aria-hidden="true"></span> Writing five hooks from your listing…</p>'
      : '<p class="small muted">No hooks yet. Write three to five below, or start from an angle.</p>';
    box.querySelectorAll("[data-pick]").forEach(function (el) {
      el.onchange = function () {
        var h = hookById(el.getAttribute("data-pick"));
        if (el.checked && selectedHooks().length >= MAX_HOOKS) { el.checked = false; toast("Up to five. Unpick one first."); return; }
        if (el.checked && selectedHooks().some(function (x) { return norm(x.text) === norm(h.text); })) {
          el.checked = false; toast("You've picked that hook already. Each video needs a different one."); return;
        }
        patch("studio_hooks", h.id, { selected: el.checked }).then(function () {
          h.selected = el.checked;
          if (h.selected) preview(h);
          refreshHooks();
        }).catch(fail);
      };
    });
    box.querySelectorAll("[data-hedit]").forEach(function (el) {
      /* A hook is one line, however narrow the screen: the box grows to fit it, and Enter saves */
      var fit = function () { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; };
      fit();
      el.oninput = fit;
      el.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); el.blur(); } };
      el.onchange = function () {
        var h = hookById(el.getAttribute("data-hedit")), v = el.value.replace(/\s+/g, " ").trim();
        if (v.length < 3 || v === h.text) { el.value = h.text; return; }
        if (hasHook(v, h)) { el.value = h.text; toast("You already have that hook. Each video needs a different one."); return; }
        patch("studio_hooks", h.id, { text: v, checks: [] }).then(function () {
          h.text = v; h.checks = [];
          preview(h); refreshHooks(); checkSoon();
        }).catch(fail);
      };
      el.onblur = function () { if (S.refreshLater) setTimeout(refreshHooks, 0); };
    });
    box.querySelectorAll("[data-hdel]").forEach(function (el) {
      el.onclick = function () {
        var h = hookById(el.getAttribute("data-hdel"));
        del("studio_hooks", h.id).then(function () {
          S.hooks = S.hooks.filter(function (x) { return x !== h; });
          if (S.pv === h.id) preview(selectedHooks()[0] || S.hooks[0]);
          refreshHooks();
        }).catch(fail);
      };
    });
    box.querySelectorAll("[data-rewrite]").forEach(function (el) {
      el.onclick = function () {
        var h = hookById(el.getAttribute("data-rewrite")), v = verdict(h).rewrite;
        if (!v) return;
        if (hasHook(v, h)) { toast("You already have that hook."); return; }
        /* Using the rewrite means using the hook: it's picked too, when there's room */
        var pick = h.selected || selectedHooks().length < MAX_HOOKS;
        patch("studio_hooks", h.id, { text: v.slice(0, 160), checks: [], selected: pick }).then(function () {
          h.text = v.slice(0, 160); h.checks = []; h.selected = pick;
          preview(h);
          return checkHooks([h]);
        }).catch(fail);
      };
    });
    box.querySelectorAll("[data-regen]").forEach(function (el) {
      el.onclick = function () { regenHook(hookById(el.getAttribute("data-regen"))); };
    });
    box.querySelectorAll("[data-pv]").forEach(function (el) {
      el.onclick = function () { preview(hookById(el.getAttribute("data-pv"))); };
    });
  }
  function hookCard(h) {
    var full = selectedHooks().length >= MAX_HOOKS && !h.selected, v = verdict(h);
    var why = v.reasons.length ? "<ul>" + v.reasons.map(function (r) { return '<li class="' + r[0] + '">' + esc(r[1]) + "</li>"; }).join("") + "</ul>" : "";
    return '<div class="hook' + (h.selected ? " on" : "") + (S.pv === h.id ? " pv" : "") + '" data-card="' + esc(h.id) + '">' +
      '<label class="pick"><input type="checkbox" data-pick="' + esc(h.id) + '"' + (h.selected ? " checked" : "") + (full ? " disabled" : "") + ' aria-label="Use this hook"></label>' +
      '<div class="grow"><div class="hmeta"><span class="angle">' + esc(angleLabel(h.category)) + "</span>" + badge(v) + "</div>" +
      '<textarea class="htext" data-hedit="' + esc(h.id) + '" rows="1" maxlength="160" aria-label="Hook">' + esc(h.text) + "</textarea>" +
      '<div class="lint">' + why + "</div>" +
      '<div class="hacts">' +
      (v.rewrite ? '<button class="btn small" type="button" data-rewrite="' + esc(h.id) + '">Use the rewrite</button><span class="small muted rw">“' + esc(v.rewrite) + "”</span>" : "") +
      (S.ai !== false && angleOf(h.category) ? '<button class="btn small link" type="button" data-regen="' + esc(h.id) + '">New idea</button>' : "") +
      '<button class="btn small link" type="button" data-pv="' + esc(h.id) + '">Preview</button></div></div>' +
      '<button class="btn small link" data-hdel="' + esc(h.id) + '" type="button" aria-label="Delete this hook">✕</button></div>';
  }
  /* Adds a hook to the project it was written for, even if the customer has moved on to another */
  function addHook(h, pid) {
    pid = pid || S.project.id;
    return insert("studio_hooks", { project_id: pid, category: h.category || "custom", text: h.text.slice(0, 160),
      benefit: (h.benefit || "").slice(0, 140), source: h.source || "user", selected: !!h.selected }).then(function (row) {
      if (S.project && S.project.id === pid) S.hooks.push(row);
      return row;
    });
  }
  function aiBrief() {
    var b = Object.assign({}, brief());
    b.name = b.name || S.project.name;
    b.platforms = (b.platforms || []).join(", ");
    return b;
  }
  /* The screens the copywriter sees: its id, label and kind, and the upload path it signs to look at */
  function aiScreens(list) {
    return list.map(function (a) { return { id: a.id, label: assetLabel(a), kind: a.kind, path: a.path }; });
  }
  function aiCall(body, status) {
    var st = document.getElementById(body.action === "draft_script" ? "sc-status" : "h-status");
    if (st) st.textContent = status;
    return fn("studio-ai", body).then(function (r) {
      if (st) st.textContent = "";
      if (r.status === 503 || r.status === 404) { S.ai = false; throw Object.assign(new Error(ERRORS.ai_unavailable), { code: "ai_unavailable" }); }
      if (!r.ok) throw Object.assign(new Error(errText(r.data.error)), { code: r.data.error });
      S.ai = true;
      return r.data;
    }, function (e) { if (st) st.textContent = ""; throw e; });
  }
  /* Hooks from studio-ai: one per angle, strongest first, or several for one angle. A studio-ai
     deployed before angles answers unknown_action; then its categories stand in for the angles
     closest to them, and social proof waits for the redeploy. */
  function askAngles(angle) {
    var body = { action: "suggest_angles", brief: aiBrief(), screens: aiScreens(shots()) };
    if (angle) { body.angle = angle; body.avoid = S.hooks.map(function (h) { return h.text; }); }
    var label = angle ? "Writing a new " + angleLabel(angle).toLowerCase() + " hook…" : "Writing five hooks…";
    return aiCall(body, label).then(function (d) { return d.hooks || []; }, function (e) {
      if (e.code !== "unknown_action") throw e;
      return aiCall({ action: "suggest_hooks", brief: aiBrief(), screens: aiScreens(shots()) }, label).then(function (d) {
        var got = {}, out = [];
        (d.hooks || []).forEach(function (h) {
          var a = ANGLE_FROM_CATEGORY[h.category];
          if (a && (angle ? a === angle : !got[a])) { got[a] = 1; out.push({ angle: a, text: h.text, benefit: h.benefit }); }
        });
        return out;
      });
    });
  }
  /* Writes hooks into the project, skipping any it already has. Resolves to how many were added. */
  function suggestAngles() {
    var pid = S.project.id;
    if (!brief().one_liner) return Promise.reject(Object.assign(new Error(ERRORS.brief_incomplete), { code: "brief_incomplete" }));
    S.writing = true; refreshHooks();
    return askAngles().then(function (list) {
      var n = 0, chain = Promise.resolve();
      list.forEach(function (h) {
        chain = chain.then(function () {
          if (S.project && S.project.id === pid && hasHook(h.text)) return;
          return addHook({ category: h.angle, text: h.text, benefit: h.benefit, source: "ai" }, pid).then(function () { n++; });
        });
      });
      return chain.then(function () { return n; });
    }).then(function (n) { S.writing = false; refreshHooks(); return n; }, function (e) { S.writing = false; refreshHooks(); throw e; });
  }
  /* "New idea": the same angle, written again, in place */
  function regenHook(h) {
    var angle = h && angleOf(h.category);
    if (!angle) return;
    S.checking[h.id] = 1; refreshHooks();
    askAngles(angle).then(function (list) {
      var n = list.filter(function (x) { return !hasHook(x.text); })[0];
      if (!n) { toast("No new idea this time. Try again, or write your own."); return; }
      return patch("studio_hooks", h.id, { text: n.text.slice(0, 160), benefit: (n.benefit || "").slice(0, 140), checks: [], category: angle }).then(function () {
        h.text = n.text.slice(0, 160); h.benefit = (n.benefit || "").slice(0, 140); h.checks = []; h.category = angle;
        delete S.checking[h.id];
        if (S.pv === h.id) preview(h);
        return checkHooks([h]);
      });
    }).catch(fail).then(function () { delete S.checking[h.id]; refreshHooks(); });
  }
  /* The AI claim check, for hooks that haven't had one. A hook edited while its check was out
     keeps waiting for the next one. */
  function checkHooks(list) {
    list = list.filter(function (h) { return h && !S.checking[h.id]; });
    if (!list.length || S.ai === false) return Promise.resolve();
    var sent = list.map(function (h) { return h.text; });
    list.forEach(function (h) { S.checking[h.id] = 1; });
    refreshHooks();
    return aiCall({ action: "check_hooks", brief: aiBrief(), hooks: sent }, "Checking claims…").then(function (d) {
      var res = d.results || [];
      return Promise.all(list.map(function (h, i) {
        var r = res.filter(function (x) { return x.text === sent[i]; })[0] || res[i];
        if (!r || h.text !== sent[i]) return null;
        h.checks = [r];
        return patch("studio_hooks", h.id, { checks: [r] }).catch(function () {});
      }));
    }).catch(function () {}).then(function () {
      list.forEach(function (h) { delete S.checking[h.id]; });
      refreshHooks();
    });
  }
  var checkT;
  function checkSoon() {
    clearTimeout(checkT);
    checkT = setTimeout(function () { if (S.project) checkHooks(S.hooks.filter(needsCheck)); }, 900);
  }
  /* After the Studio writes hooks, the strongest that pass or only need a look come picked: one per
     angle, up to five. A customer who has already picked their own keeps them. */
  function preselect() {
    if (selectedHooks().length) return Promise.resolve();
    var pick = [], seen = {};
    S.hooks.forEach(function (h) {
      if (pick.length < MAX_HOOKS && verdict(h).level !== "block" && !seen[h.category]) { seen[h.category] = 1; pick.push(h); }
    });
    return Promise.all(pick.map(function (h) {
      return patch("studio_hooks", h.id, { selected: true }).then(function () { h.selected = true; }).catch(function () {});
    })).then(function () { if (pick.length && !S.pv) preview(pick[0]); });
  }

  /* ── the rest of the ad: chips that open a panel, and the Advanced drawer ── */
  function platformCta() {
    var b = brief(), p = b.platforms || ["ios"], name = b.spoken_name || b.name || S.project.name;
    /* No "free" by default: not every app is. People with a free app can add it on the end card. */
    if (p.indexOf("ios") >= 0 && p.indexOf("android") >= 0) return ["Download " + name + " today.", "Download today"];
    if (p.indexOf("ios") >= 0) return ["Download " + name + " on the App Store.", "Download on the App Store"];
    if (p.indexOf("android") >= 0) return ["Get " + name + " on Google Play.", "Get it on Google Play"];
    return ["Try " + name + " today.", "Try it today"];
  }
  /* A new script starts as one line per screenshot, up to three, in upload order */
  function seedScript() {
    var sc = script(), list = shots();
    if (!sc.body.length && list.length) {
      sc.body = list.slice(0, Math.min(3, list.length)).map(function (a) { return { say: "", head: "", screen: a.id, motion: "auto" }; });
    }
    return sc;
  }
  function moveOf(s) { return s.motion === "zoom" ? "zoom:" + (s.zoomAt || "middle") : "auto"; }
  function accent() { var a = script().theme.accent; return /^#[0-9a-f]{6}$/i.test(a || "") ? a : "#FF7A2E"; }
  function renderChips() {
    var box = document.getElementById("pchips");
    if (!box) return;
    var sc = script(), cta = platformCta(), v = VOICES.filter(function (x) { return x[0] === sc.voice.id; })[0] || VOICES[0];
    var lines = sc.body.filter(function (s) { return s.say; }).length;
    var list = [
      ["script", "Script", esc(lines >= 2 ? lines + " lines" : "Needs two lines"), lines < 2],
      ["voice", "Voice", esc(v[1] + ", " + v[2].split(",")[0])],
      ["look", "Colour", '<i class="sw" style="background:' + accent() + '"></i>' + (sc.theme.style === "light" ? "Light" : "Dark")],
      ["end", "End card", esc(sc.button || cta[1])]
    ];
    box.innerHTML = list.map(function (c) {
      return '<button type="button" class="pchip' + (S.panel === c[0] ? " on" : "") + (c[3] ? " need" : "") + '" data-panel="' + c[0] + '" aria-expanded="' + (S.panel === c[0]) + '">' +
        '<span class="small muted">' + c[1] + "</span><b><span>" + c[2] + "</span></b></button>";
    }).join("");
    box.querySelectorAll("[data-panel]").forEach(function (el) {
      el.onclick = function () { var k = el.getAttribute("data-panel"); S.panel = S.panel === k ? null : k; renderChips(); renderPanel(); };
    });
  }
  function renderPanel() {
    var box = document.getElementById("panel");
    if (!box) return;
    var html = { script: scriptPanel, voice: voicePanel, look: lookPanel, end: endPanel }[S.panel];
    box.innerHTML = html ? '<div class="panel">' + html() + "</div>" : "";
    if (!html) return;
    wireFields(box);
    var sc = script(), list = shots();
    box.querySelectorAll("[data-sdel]").forEach(function (el) {
      el.onclick = function () { readScript(); sc.body.splice(Number(el.getAttribute("data-sdel")), 1); later({ script: sc }); renderPanel(); renderAdvanced(); renderChips(); };
    });
    var add = document.getElementById("sc-add");
    if (add) add.onclick = function () {
      readScript();
      var usedIds = sc.body.map(function (s) { return s.screen; });
      var a = list.filter(function (x) { return usedIds.indexOf(x.id) < 0; })[0] || list[sc.body.length % Math.max(1, list.length)];
      sc.body.push({ say: "", head: "", screen: a ? a.id : "", motion: "auto" });
      later({ script: sc });
      renderPanel(); renderAdvanced();
      var inputs = box.querySelectorAll('[data-f="say"]'); if (inputs.length) inputs[inputs.length - 1].focus();
    };
    var ai = document.getElementById("sc-ai");
    if (ai) ai.onclick = function () { ai.disabled = true; readScript(); draftScript(false).catch(fail).then(function () { renderPanel(); renderAdvanced(); renderChips(); renderGo(); }); };
    box.querySelectorAll("[data-play]").forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        if (S.playing) S.playing.pause();
        S.playing = new Audio("/assets/voices/" + el.getAttribute("data-play") + ".mp3");
        S.playing.play().catch(function () { toast("Couldn't play that sample."); });
      };
    });
    var fromIcon = document.getElementById("th-icon");
    if (fromIcon) fromIcon.onclick = function () {
      sc.theme = Object.assign({}, sc.theme, { accent: sc.theme.from_icon, picked: false });
      later({ script: sc }); renderPanel(); renderChips(); drawPreview();
    };
    if (S.panel === "script") fillThumbs();
  }
  function scriptPanel() {
    var sc = script(), list = shots();
    var screenOpts = function (cur) { return list.map(function (a) { return opt(a.id, assetLabel(a), cur); }).join(""); };
    return '<div class="row"><p class="small muted grow">Plays after every hook. One line per screen: what the app is doing there.</p>' +
      (S.ai === false ? "" : '<button class="btn small" id="sc-ai" type="button">' + (sc.body.some(function (s) { return s.say; }) ? "Write it again" : "Write it for me") + "</button>") + "</div>" +
      sc.body.map(function (s, i) {
        return '<div class="line"><img class="thumb" data-asset="' + esc(s.screen) + '" alt="">' +
          '<div class="grow"><input data-s="' + i + '" data-f="say" maxlength="200" value="' + esc(s.say) + '" placeholder="' +
          (i ? "The next thing it does." : "What this screen shows, like: Tick off a habit and watch your streak grow.") + '" aria-label="Line ' + (i + 1) + '">' +
          '<div class="row tight opts"><select data-s="' + i + '" data-f="screen" aria-label="Screen for line ' + (i + 1) + '">' + screenOpts(s.screen) + "</select></div></div>" +
          '<button class="btn small link" data-sdel="' + i + '" type="button" aria-label="Remove line"' + (sc.body.length > 1 ? "" : " disabled") + ">✕</button></div>";
      }).join("") +
      '<button class="btn small" id="sc-add" type="button"' + (sc.body.length >= 5 ? " disabled" : "") + ">Add a line</button>";
  }
  function voicePanel() {
    var sc = script();
    return '<div class="voices">' + VOICES.map(function (v) {
      return '<label class="voice' + (sc.voice.id === v[0] ? " on" : "") + '"><input type="radio" name="voice" value="' + v[0] + '"' + (sc.voice.id === v[0] ? " checked" : "") + ">" +
        "<b>" + v[1] + '</b><span class="small muted">' + v[2].split(",")[0] + '</span><button class="btn small link" type="button" data-play="' + v[3] + '" aria-label="Play ' + v[1] + '">▶</button></label>';
    }).join("") + "</div>" +
      '<div class="field pace"><label for="v-speed">Pace</label><select id="v-speed">' +
      opt("1", "Natural", sc.voice.speed) + opt("1.1", "Brisk", sc.voice.speed) + opt("1.15", "Fast", sc.voice.speed) + "</select></div>";
  }
  function lookPanel() {
    var th = script().theme;
    return '<div class="row look"><label class="check"><input id="th-acc" type="color" value="' + accent() + '"> Brand colour</label>' +
      (th.from_icon && th.from_icon.toLowerCase() !== accent().toLowerCase() ? '<button class="btn small link" id="th-icon" type="button">Use my icon\'s colour</button>' : "") +
      '<span class="seg">' + [["dark", "Dark"], ["light", "Light"]].map(function (x) {
        return '<label><input type="radio" name="th-style" value="' + x[0] + '"' + ((th.style || "dark") === x[0] ? " checked" : "") + "><span>" + x[1] + "</span></label>";
      }).join("") + "</span></div>" +
      (th.from_icon && !th.picked ? '<p class="small muted">Taken from your app icon.</p>' : "");
  }
  function endPanel() {
    var sc = script(), cta = platformCta();
    return '<div class="cols2">' +
      '<div class="field"><label for="sc-line">Line on the end card</label><input id="sc-line" maxlength="60" value="' + esc(sc.end_line) + '" placeholder="Build habits that stick."></div>' +
      '<div class="field"><label for="sc-btn">Button</label><input id="sc-btn" maxlength="40" value="' + esc(sc.button) + '" placeholder="' + esc(cta[1]) + '"></div>' +
      '<div class="field"><label for="sc-say">Last thing the voice says</label><input id="sc-say" maxlength="200" value="' + esc(sc.cta_say) + '" placeholder="' + esc(cta[0]) + '"></div></div>' +
      (icon() ? "" : '<p class="small muted">Add your app icon in <a href="#/app/' + esc(S.project.id) + '/app">step 1</a> and it goes on the end card too.</p>');
  }
  function renderAdvanced() {
    var box = document.getElementById("adv-body");
    if (!box) return;
    var sc = script(), b = brief(), op = sc.opening;
    box.innerHTML =
      '<label class="check block fxrow"><input type="checkbox" id="sc-fx"' + (sc.effects === false ? "" : " checked") + "> Typing text and zooms</label>" +
      '<label class="check block fxrow"><input type="checkbox" id="sc-sfx"' + (sc.sfx === true ? " checked" : "") + "> Sound effects</label>" +
      '<div class="field"><label>Opening</label>' +
      [["hand", "A hand holding the phone, already swiping"], ["phone", "Just the phone, already swiping"], ["rise", "The phone slides up"]].map(function (x) {
        return '<label class="check block"><input type="radio" name="op" value="' + x[0] + '"' + ((op.style || "hand") === x[0] ? " checked" : "") + "> " + x[1] + "</label>";
      }).join("") + "</div>" +
      '<div class="field"><label>Each line\'s heading and move</label>' + sc.body.map(function (s, i) {
        var a = find(s.screen), rec = a && a.kind === "recording";
        return '<div class="row tight opts adv-line"><span class="small muted">' + (i + 1) + "</span>" +
          '<input data-s="' + i + '" data-f="head" maxlength="40" value="' + esc(s.head) + '" placeholder="Heading (optional)" aria-label="Heading for line ' + (i + 1) + '">' +
          '<select data-s="' + i + '" data-f="move" aria-label="Move for line ' + (i + 1) + '">' + (rec ? opt("auto", "Play recording", "auto")
            : opt("auto", "Chosen for you", moveOf(s)) + ZOOMS.map(function (z) { return opt("zoom:" + z[0], z[1], moveOf(s)); }).join("")) + "</select></div>";
      }).join("") + "</div>" +
      '<div class="cols2">' +
      '<div class="field"><label for="sc-head">Ad headline</label><input id="sc-head" maxlength="60" value="' + esc(sc.headline) + '" placeholder="Download ' + esc(b.name || S.project.name) + '"></div>' +
      '<div class="field"><label for="sc-disc">Disclaimer</label><input id="sc-disc" maxlength="120" value="' + esc(sc.disclaimer) + '" placeholder="' +
        esc(b.category === "finance" ? "Educational only. Not financial advice." : b.category === "health" ? "Not medical advice." : "None") + '"></div></div>';
    wireFields(box);
  }
  /* Every field saves itself as it changes */
  function wireFields(box) {
    box.querySelectorAll("input:not([type=radio]), select").forEach(function (el) {
      el.addEventListener(el.tagName === "SELECT" || el.type === "color" || el.type === "checkbox" ? "change" : "input", function () {
        readScript();
        if (el.getAttribute("data-f") === "screen") {
          var img = el.closest(".line").querySelector(".thumb");
          img.setAttribute("data-asset", el.value); fillThumbs();
          renderAdvanced();
        }
      });
    });
    box.querySelectorAll('input[type="radio"]').forEach(function (el) {
      el.onchange = function () {
        readScript();
        box.querySelectorAll(".voice").forEach(function (v) { v.classList.toggle("on", v.querySelector("input").checked); });
      };
    });
  }
  function fillThumbs() {
    signed("studio-uploads", S.assets.map(function (a) { return a.path; })).then(function () {
      root.querySelectorAll("[data-asset]").forEach(function (el) {
        var a = find(el.getAttribute("data-asset"));
        el.src = a ? link("studio-uploads", a.path) : "";
        el.classList.toggle("rec", !!(a && a.kind === "recording"));
      });
    });
  }
  /* Reads whichever fields are on screen into the script; fields that aren't open keep their values */
  function readScript() {
    var sc = script(), q = function (id) { return document.getElementById(id); };
    root.querySelectorAll("[data-s]").forEach(function (el) {
      var s = sc.body[Number(el.getAttribute("data-s"))], f = el.getAttribute("data-f"), v = el.value.trim();
      if (!s) return;
      if (f === "move") {
        if (v.indexOf("zoom:") === 0) { s.motion = "zoom"; s.zoomAt = v.slice(5); } else { s.motion = "auto"; delete s.zoomAt; }
      } else s[f] = v;
    });
    [["sc-line", "end_line"], ["sc-btn", "button"], ["sc-say", "cta_say"], ["sc-head", "headline"], ["sc-disc", "disclaimer"]].forEach(function (x) {
      if (q(x[0])) sc[x[1]] = q(x[0]).value.trim();
    });
    if (q("sc-fx")) sc.effects = q("sc-fx").checked;
    if (q("sc-sfx")) sc.sfx = q("sc-sfx").checked;
    var op = root.querySelector('input[name="op"]:checked');
    if (op) sc.opening = { style: op.value, screens: sc.opening.screens || [] };
    var st = root.querySelector('input[name="th-style"]:checked');
    if (st) sc.theme = Object.assign({}, sc.theme, { style: st.value });
    var acc = q("th-acc");
    if (acc && acc.value.toLowerCase() !== accent().toLowerCase()) sc.theme = Object.assign({}, sc.theme, { accent: acc.value, picked: true });
    var voice = root.querySelector('input[name="voice"]:checked');
    if (voice) sc.voice = Object.assign({}, sc.voice, { id: voice.value });
    if (q("v-speed")) sc.voice = Object.assign({}, sc.voice, { speed: Number(q("v-speed").value) || 1.15 });
    later({ script: sc });
    renderChips(); renderGo(); drawPreview();
    return sc;
  }
  /* The script from studio-ai. quiet: the automatic first draft, which falls back to the store
     listing's own lines when AI is off. Resolves to a note for the import list. */
  function draftScript(quiet) {
    var list = shots(), pid = S.project.id;
    if (!list.length) return Promise.resolve(quiet ? "Add your screenshots first" : "");
    return aiCall({ action: "draft_script", brief: aiBrief(), screens: aiScreens(list) }, "Writing the script…").then(function (d) {
      if (!S.project || S.project.id !== pid) return "";
      var sc = script();
      if (d.body && d.body.length) sc.body = d.body.map(function (s) { return { say: s.say, head: s.head, screen: s.screen, motion: s.motion === "zoom" ? "zoom" : "auto" }; });
      if (d.benefit && !sc.benefit) sc.benefit = d.benefit;
      if (d.end_line && !sc.end_line) sc.end_line = d.end_line;
      later({ script: sc });
      if (!quiet) toast("Done. Change anything that isn't right.");
      return sc.body.length + " lines";
    }, function (e) {
      if (!quiet || e.code !== "ai_unavailable") throw e;
      return listingScript() ? "From your store listing: check it" : "Write two lines yourself";
    });
  }
  /* Without AI: up to three of the store listing's own feature sentences, one per screenshot.
     Sentences with numbers or big claims are skipped; the browser check would flag them anyway. */
  function listingScript() {
    var sc = script(), list = shots(), b = brief();
    if (sc.body.some(function (s) { return s.say; }) || !list.length || !b.store_text) return false;
    var lines = b.store_text.replace(/([.!?])\s+/g, "$1\n").split(/\n|[•●▪◦★✓✔]/).map(function (t) { return t.trim().replace(/^[-–—*:]+\s*/, ""); })
      .filter(function (t) { var n = words(t).length; return n >= 4 && n <= 14 && !/\d/.test(t) && !lint(t, b).length; }).slice(0, Math.min(3, list.length));
    if (lines.length < 2) return false;
    sc.body = lines.map(function (t, i) { return { say: t, head: "", screen: list[i].id, motion: "auto" }; });
    later({ script: sc });
    return true;
  }

  function accentFrom(text) {
    var w = words(text), ends = 0;
    for (var i = 0; i < w.length; i++) if (/[.?!]$/.test(w[i])) ends++;
    if (ends >= 2) return undefined; // two sentences: the second one is the accent
    for (var j = 0; j < w.length - 1; j++) if (/[,;:]$/.test(w[j])) return j + 1;
    return Math.max(1, Math.ceil(w.length * 0.55));
  }
  function buildSpec() {
    var b = brief(), sc = script(), ic = icon(), used = {};
    var hooks = selectedHooks().map(function (h, i) {
      return { id: "h" + (i + 1) + "-" + (slug(h.category) || "hook"), say: h.text, benefit: h.benefit || sc.benefit || sc.end_line || "", accent_from: accentFrom(h.text) };
    });
    var body = sc.body.map(function (s, i) {
      used[s.screen] = 1;
      var a = find(s.screen);
      /* "auto": the first scene slides up, later ones swipe across from the one before; recordings play */
      var motion = a && a.kind === "recording" ? "play" : s.motion === "zoom" ? "zoom"
        : (s.motion === "rise" || s.motion === "page") ? s.motion : (i ? "page" : "rise");
      var scene = { say: s.say, head: s.head, screen: s.screen, motion: motion };
      /* Left on auto: with AI on, the director picks the move from the screenshot and the line */
      if (!(a && a.kind === "recording") && ["rise", "page", "zoom"].indexOf(s.motion) < 0) scene.auto = true;
      if (motion === "zoom") scene.zoom = (ZOOMS.filter(function (z) { return z[0] === (s.zoomAt || "middle"); })[0] || ZOOMS[1])[2];
      return scene;
    });
    /* The opening swipes across three different screens: the ones picked, then the uploads in order */
    var opening = (sc.opening.screens || []).filter(function (k) { return find(k); });
    shots().forEach(function (a) { if (opening.length < 3 && a.kind === "screen" && opening.indexOf(a.id) < 0) opening.push(a.id); });
    opening.forEach(function (k) { used[k] = 1; });
    if (ic) used[ic.id] = 1;
    var screens = {};
    S.assets.forEach(function (a) {
      if (used[a.id]) screens[a.id] = { path: a.path, kind: a.kind === "recording" ? "video" : (a.kind === "icon" ? "icon" : "image"), status_bar: a.status_bar };
    });
    var cta = platformCta();
    return {
      brand: { name: b.name || S.project.name, spoken_name: b.spoken_name || "", icon: ic ? ic.id : null,
               theme: { style: sc.theme.style, accent: accent(), bg: sc.theme.bg } },
      screens: screens, hooks: hooks, body: body,
      opening: { style: sc.opening.style || "hand", motion: "page", screens: opening },
      cta: { say: sc.cta_say || cta[0], button: sc.button || cta[1], lines: sc.end_line ? [sc.end_line] : [], headline: sc.headline || "" },
      voice: { id: sc.voice.id, speed: Number(sc.voice.speed) || 1 },
      disclaimer: sc.disclaimer || "",
      effects: sc.effects !== false,
      sfx: sc.sfx === true,
      brief: { one_liner: b.one_liner || "", comparison: b.comparison || "", category: b.category || category(b.one_liner || "") }
    };
  }
  /* What stops a render. A pack needs three to five different hooks, one per video, so the pack
     compares them; a preview needs one. */
  function problems(kind) {
    var r = readiness(), out = [], sel = selectedHooks(), more = MIN_HOOKS - sel.length;
    if (!r.app) out.push(["app", "Finish step 1: the name, what it does and two screenshots."]);
    if (!sel.length) out.push(["hooks", "Pick your hooks."]);
    else if (kind === "pack" && more > 0) out.push(["hooks", "Pick " + more + " more hook" + (more === 1 ? "" : "s") + ". Each video opens with its own, so a pack compares at least three."]);
    if (dupes(sel)) out.push(["hooks", "Two picked hooks say the same thing. Each video needs a different one."]);
    if (!r.script) out.push(["script", "The script needs at least two lines, each with words and a screen."]);
    return out;
  }
  function batchFor(kind) {
    var spec = buildSpec(), key = stable(spec);
    var reuse = S.batches.filter(function (b) {
      return b.status !== "queued" && b.status !== "running" && stable(b.spec) === key && (kind === "preview" ? !b.preview : !b.result);
    })[0];
    if (reuse) return Promise.resolve(reuse);
    return insert("studio_batches", { project_id: S.project.id, spec: spec }).then(function (b) { S.batches.unshift(b); return b; });
  }
  function queue(kind) {
    var probs = problems(kind), pid = S.project.id;
    if (probs.length) { toast(probs[0][1]); return; }
    if (kind === "pack" && packsLeft() < 1) { toast(ERRORS.no_packs_left); return; }
    var blocked = selectedHooks().filter(function (h) { return verdict(h).level === "block"; });
    if (blocked.length && !S.ack) { toast("A picked hook won't pass as written. Use the rewrite, or confirm it's true, first."); return; }
    root.querySelectorAll("#m-pack, #m-prev, #p-pack").forEach(function (b) { b.disabled = true; });
    flush().then(function () { return batchFor(kind); }).then(function (b) {
      return rpc("studio_queue", { p_batch: b.id, p_kind: kind });
    }).then(function () {
      if (kind === "pack" && window.flVisit) window.flVisit("pack");
      return Promise.all([loadBatches(pid), loadAccount()]);
    }).then(function () {
      S.batchId = null;
      if (S.step === "make") renderProject(); else location.hash = "#/app/" + pid + "/make";
      startPoll();
    }).catch(function (e) { fail(e); renderProject(); });
  }
  /* The card with the buttons, redrawn as the hooks and the script change */
  function renderGo() {
    var box = document.getElementById("m-card");
    if (!box) return;
    var probs = problems("pack"), hooks = selectedHooks(), left = packsLeft(), n = hooks.length;
    var flagged = hooks.filter(function (h) { return verdict(h).level === "block"; });
    var busy = S.batches.some(function (b) { return b.status === "queued" || b.status === "running"; });
    box.innerHTML = '<div class="card flow go">' +
      (busy ? '<div class="banner small">A render is under way. <a href="#/app/' + esc(S.project.id) + '/make">See how it\'s going</a></div>' : "") +
      (probs.length
        ? '<ul class="todo">' + probs.map(function (p) {
            return "<li>" + esc(p[1]) + (p[0] === "app" ? ' <a href="#/app/' + esc(S.project.id) + '/app">Go</a>' : p[0] === "script" ? ' <button class="btn link small" type="button" data-open="script">Open the script</button>' : "") + "</li>";
          }).join("") + "</ul>"
        : '<p class="small">' + n + " videos, each opening with a different hook, plus images, captions, ad copy and a test plan.</p>") +
      (flagged.length ? '<div class="banner warn small">' + flagged.length + " picked hook" + (flagged.length === 1 ? " won't" : "s won't") + " pass as written. Use the rewrite, or " +
        '<label class="check"><input type="checkbox" id="m-ack"' + (S.ack ? " checked" : "") + "> I've checked it's true</label></div>" : "") +
      '<div class="row"><button class="btn pri big" id="m-pack" type="button"' + (probs.length || left < 1 ? " disabled" : "") + ">" +
      (left < 1 ? "No free packs left" : "Make " + (n >= MIN_HOOKS && !probs.length ? n + " ads" : "the ads")) + "</button>" +
      '<button class="btn" id="m-prev" type="button"' + (problems("preview").length ? " disabled" : "") + ">Check the frames first (free)</button></div>" +
      (left < 1 ? '<p class="small muted note">The beta includes one free pack. Email <a href="mailto:' + SUPPORT + '">' + SUPPORT + "</a> for another.</p>"
        : '<p class="small muted note">' + (left === Infinity ? "" : left === 1 ? "Uses your free pack. " : "Uses 1 of your " + left + " free packs. ") +
          "About " + minutes(estimate("pack", Math.max(n, MIN_HOOKS))) + " once it starts. The frame check is free and takes seconds.</p>") + "</div>";
    var a = document.getElementById("m-ack");
    if (a) a.onchange = function () { S.ack = a.checked; };
    var o = box.querySelector("[data-open]");
    if (o) o.onclick = function () { S.panel = "script"; renderChips(); renderPanel(); document.getElementById("panel").scrollIntoView({ block: "nearest" }); };
    document.getElementById("m-prev").onclick = function () { queue("preview"); };
    document.getElementById("m-pack").onclick = function () { queue("pack"); };
  }

  /* ── live preview: the hook typed over the app's first screen, laid out like the ad's first
     second (forge_engine/render.py hook_frame and draw_phone, theme.py), at half size ── */
  var PV = { text: "", t0: 0, raf: 0, img: null, src: "", typed: 0, caret: true };
  function mixRgb(a, b, t) { return a.map(function (v, i) { return Math.round(v * t + b[i] * (1 - t)); }); }
  function lum(c) {
    var ch = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function towards(c, target, against, need) {
    for (var i = 0; i <= 20; i++) { var out = mixRgb(target, c, i / 20); if (contrast(out, against) >= need) return out; }
    return target;
  }
  function adTheme() {
    var h = accent().slice(1), acc = [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
    var light = script().theme.style === "light";
    var bg = light ? mixRgb(acc, [255, 255, 255], 0.05) : mixRgb(acc, [12, 8, 10], 0.08);
    var a = towards(acc, light ? [0, 0, 0] : [255, 255, 255], bg, 4.5);
    return { bg: bg, text: light ? [26, 18, 22] : [250, 243, 238], accent: a, glow: mixRgb(a, bg, light ? 0.16 : 0.26) };
  }
  function pvScreen() {
    var first = (script().opening.screens || []).map(find).filter(Boolean)[0];
    return first || shots().filter(function (a) { return a.kind === "screen"; })[0] || null;
  }
  function drawPreview() {
    var cv = document.getElementById("pv");
    if (!cv) return false;
    var x = cv.getContext("2d"), W = cv.width, H = cv.height, k = W / 1080, th = adTheme();
    var css = function (c, a) { return "rgba(" + c.join(",") + "," + (a == null ? 1 : a) + ")"; };
    x.fillStyle = css(th.bg); x.fillRect(0, 0, W, H);
    x.save(); x.translate(W / 2, 0); x.scale(1.5, 1);
    var g = x.createRadialGradient(0, 0, 0, 0, 0, 820 * k);
    g.addColorStop(0, css(th.glow)); g.addColorStop(0.6, css(th.glow, 0.55)); g.addColorStop(1, css(th.glow, 0));
    x.fillStyle = g; x.fillRect(-W, 0, 2 * W, H); x.restore();

    var ws = PV.text.split(/\s+/).filter(Boolean), size = 96, lines;
    var wrapAt = function (s) {
      x.font = "700 " + s * k + "px Inter, system-ui, sans-serif";
      var out = [[]], cur = 0, sp = x.measureText(" ").width, max = (1080 - 2 * 66) * k;
      ws.forEach(function (w) {
        var l = x.measureText(w).width;
        if (out[out.length - 1].length && cur + sp + l > max) { out.push([]); cur = 0; }
        cur += (out[out.length - 1].length ? sp : 0) + l;
        out[out.length - 1].push(w);
      });
      return out;
    };
    lines = wrapAt(size);
    while (lines.length > 3 && size > 40) { size -= 6; lines = wrapAt(size); }
    /* Words after accent_from (or after the first sentence) are in the accent colour */
    var af = accentFrom(PV.text), nq = ws.length - 1;
    if (af !== undefined) nq = af - 1;
    else for (var q = 0; q < ws.length; q++) if (/[.?]$/.test(ws[q])) { nq = q; break; }
    var lh = size * 1.14 * k, y = 269 * k, i = 0, left = PV.typed, caret = null;
    x.textBaseline = "top";
    lines.forEach(function (line) {
      var cx = 66 * k;
      line.forEach(function (w) {
        var col = i > nq ? th.accent : th.text, part = w.slice(0, Math.max(0, left));
        left -= w.length + 1;
        if (part) { x.fillStyle = css(col); x.fillText(part, cx, y); caret = [cx + x.measureText(part).width + 6 * k, y, col]; }
        cx += x.measureText(w + " ").width; i++;
      });
      y += lh;
    });
    if (!caret) caret = [66 * k, 269 * k, th.text];
    if (PV.caret && PV.text) { x.fillStyle = css(caret[2]); x.fillRect(caret[0], caret[1] + size * 0.12 * k, 7 * k, size * 0.86 * k); }

    /* The phone, 640 wide at full size, below the text: the body, the screen, the island */
    var s = 640 * k / 1247, pw = 1247 * s, ph = 2789 * s, px = (W - pw) / 2, py = (269 + Math.max(1, lines.length) * size * 1.14 + 46) * k;
    var rr = function (l, t, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(l, t, w, h, r); else x.rect(l, t, w, h); };
    rr(px, py, pw, ph, 170 * s); x.fillStyle = "rgb(10,6,8)"; x.fill();
    x.lineWidth = 5 * s; x.strokeStyle = "rgb(84,70,76)"; x.stroke();
    var sx = px + 34 * s, sy = py + 34 * s, sw = 1179 * s, sh = 2721 * s;
    x.save(); rr(sx, sy, sw, sh, 136 * s); x.clip();
    x.fillStyle = "#1b1b1f"; x.fillRect(sx, sy, sw, sh);
    if (PV.img && PV.img.naturalWidth) {
      var im = PV.img, r = Math.max(sw / im.naturalWidth, sh / im.naturalHeight);
      x.drawImage(im, sx + (sw - im.naturalWidth * r) / 2, sy, im.naturalWidth * r, im.naturalHeight * r);
    }
    x.restore();
    rr(px + (34 + 1179 / 2 - 190) * s, py + (34 + 36) * s, 380 * s, 104 * s, 52 * s); x.fillStyle = "#000"; x.fill();
    return true;
  }
  /* Picking a hook types it out, the caret blinks a few times, then the preview rests */
  function preview(h) {
    var cap = document.getElementById("pv-cap");
    S.pv = h ? h.id : null;
    PV.text = h ? h.text : "";
    root.querySelectorAll(".hook[data-card]").forEach(function (el) { el.classList.toggle("pv", el.getAttribute("data-card") === S.pv); });
    if (cap) cap.textContent = h ? "The first second of the " + angleLabel(h.category).toLowerCase() + " video. The real one moves, with your voiceover."
      : "Pick a hook to see it over your app's first screen.";
    if (!document.getElementById("pv")) return;
    var a = pvScreen(), start = function () {
      cancelAnimationFrame(PV.raf);
      PV.t0 = performance.now();
      tick();
    };
    var fonts = document.fonts && document.fonts.load ? document.fonts.load("700 48px Inter").catch(function () {}) : Promise.resolve();
    if (!a) { PV.img = null; PV.src = ""; }
    if (!a || PV.src === a.path) { fonts.then(start); return; }
    signed("studio-uploads", [a.path]).then(function () {
      var im = new Image();
      im.onload = function () { PV.img = im; PV.src = a.path; fonts.then(start); };
      im.onerror = function () { PV.img = null; fonts.then(start); };
      im.src = link("studio-uploads", a.path);
    });
  }
  function tick() {
    var t = performance.now() - PV.t0, n = PV.text.length, still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    PV.typed = still ? n : Math.min(n, Math.floor(t / 38));
    PV.caret = PV.typed < n || Math.floor(t / 530) % 2 === 0;
    if (!drawPreview()) return;
    if (!still && t < n * 38 + 3200) PV.raf = requestAnimationFrame(tick);
    else { PV.caret = false; drawPreview(); }
  }

  /* ── 3. your ads: the render's progress, then the finished pack ── */
  /* The stages, matched from the worker's progress line (engine/worker.py, forge_engine/pack.py) */
  var PACK_STAGES = [
    ["queued", "Waiting for the renderer"],
    ["fetch", "Getting your screens", /^Fetching your screens/],
    ["direct", "Planning the scenes", /^(Directing the scenes|the director)/],
    ["voice", "Recording the voiceovers", /^(Recording the voiceovers|Recording voiceover|voice )/],
    ["check", "Checking every ad", /^(Checking the ads|Recording .+ again|the quality check)/],
    ["render", "Rendering the videos", /^(Rendering video|video )/],
    ["upload", "Uploading your pack", /^Uploading/]
  ];
  var PREVIEW_STAGES = [PACK_STAGES[0], PACK_STAGES[1], PACK_STAGES[2],
    ["frames", "Drawing the frames", /^(Drawing the review frames|preview )/], ["upload", "Uploading", /^Uploading/]];
  /* About how long each stage takes for a pack of n ads, in seconds, measured with real Claude and
     ElevenLabs calls on the render PC (docs/PLAN.md, "Render capacity"): a 3-ad pack takes about
     2.7 minutes with three packs side by side, a video renders in about 35 s of that. */
  var RENDER_S = 35;
  function stageSeconds(k, n) {
    return { fetch: 5, direct: 5, voice: 6 * n, check: 10 + 3 * n, render: RENDER_S * n, upload: 4 * n, frames: 3 * n }[k] || 0;
  }
  function stagesFor(kind) { return kind === "preview" ? PREVIEW_STAGES : PACK_STAGES; }
  function estimate(kind, n) { return stagesFor(kind).reduce(function (t, s) { return t + stageSeconds(s[0], n); }, 0); }
  function minutes(sec) { var m = Math.max(1, Math.round(sec / 60)); return m + " minute" + (m === 1 ? "" : "s"); }
  function progress(b, j) {
    var kind = j ? j.kind : "pack", list = stagesFor(kind), n = (b.spec.hooks || []).length || 1, t = (j && j.progress) || "", at = 0;
    if (j && j.status === "running") { at = 1; list.forEach(function (s, i) { if (s[2] && s[2].test(t)) at = i; }); }
    /* When this page first saw each stage, for the part of the bar that moves with time */
    var seen = S.seen[j ? j.id : b.id] || (S.seen[j ? j.id : b.id] = {});
    if (seen.at !== at) { seen.at = at; seen.since = Date.now(); }
    var m = t.match(/^(?:Rendering video|Recording voiceover) (\d+) of (\d+)/), v = t.match(/^video h(\d+)-/), frac;
    if (m) frac = (Number(m[1]) - 1) / Number(m[2]);
    else if (v) frac = Math.min(1, Number(v[1]) / n);
    else frac = Math.min(0.9, (Date.now() - seen.since) / 1000 / Math.max(1, stageSeconds(list[at][0], n)));
    var total = 0, done = 0;
    list.forEach(function (s, i) { var sec = stageSeconds(s[0], n); total += sec; if (i < at) done += sec; else if (i === at) done += sec * frac; });
    var q = j && j.status === "queued" ? S.queue[j.id] : null;
    return { list: list, at: at, n: n, q: q, step: m ? m[0].replace(/^Rendering video/, "video").replace(/^Recording voiceover/, "voiceover") : "",
             pct: at ? Math.max(3, Math.round(100 * done / total)) : 2,
             /* Waiting: studio_queue_status's wait already counts this render's own time */
             left: at ? total - done : (q && q.wait_s ? q.wait_s : total) };
  }
  /* The batch this screen is about: the one in the link, or the newest that was queued */
  function shownBatch() {
    return S.batches.filter(function (b) { return b.id === S.batchId; })[0] ||
      S.batches.filter(function (b) { return b.status !== "draft"; })[0] || null;
  }
  function renderMake() {
    var b = shownBatch();
    if (!b) {
      pane('<div class="card flow empty"><h2>Nothing rendered yet</h2><p class="muted">Check your hooks, then make your ads.</p>' +
        '<p><a class="btn pri" href="#/app/' + esc(S.project.id) + '/review">Go to review</a></p></div>');
      return;
    }
    pane('<div id="now">' + nowHtml(b) + "</div>" + earlierHtml(b));
    var e = root.querySelector("details.earlier");
    if (e) e.addEventListener("toggle", function () { S.earlier = e.open; });
    wireBatches();
  }
  function wireNow() {
    var p = document.getElementById("p-pack");
    if (p) p.onclick = function () { queue("pack"); };
  }
  function nowHtml(b) {
    var j = S.jobs[b.id], st = b.status;
    if (st === "queued" || st === "running") return progressHtml(b, j);
    if (st === "failed") return failedHtml(b, j);
    if (b.result && b.result.base) return readyHtml(b);
    if (b.preview && b.preview.base) return previewHtml(b);
    return '<div class="card flow"><p class="muted">This render hasn\'t started. <a href="#/app/' + esc(S.project.id) + '/review">Back to review</a></p></div>';
  }
  function progressHtml(b, j) {
    var p = progress(b, j), pack = !j || j.kind === "pack", hooks = b.spec.hooks || [];
    var lead = p.at ? "" : p.q && !p.q.workers ? "The renderer is off right now. Your " + (pack ? "pack" : "preview") + " stays in line and starts when it's back."
      : p.q && p.q.ahead ? p.q.ahead + " render" + (p.q.ahead === 1 ? " is" : "s are") + " ahead of yours." : "It starts in a moment.";
    return '<div class="card flow progress"><h2>' + (pack ? "Making your " + hooks.length + " ads" : "Drawing your preview frames") + "</h2>" +
      '<div class="bar" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.pct + '"><i style="width:' + p.pct + '%"></i></div>' +
      '<p class="small"><b>' + (p.left < 45 && p.at ? "Almost done" : "About " + minutes(p.left) + " left") + "</b>" + (lead ? " · " + esc(lead) : "") + "</p>" +
      '<ol class="stages">' + p.list.map(function (s, i) {
        return '<li class="' + (i < p.at ? "done" : i === p.at ? "on" : "") + '">' + (i === p.at ? '<span class="spin" aria-hidden="true"></span> ' : "") + esc(s[1]) +
          (i === p.at && p.step ? ' <span class="muted">' + esc(p.step) + "</span>" : "") + "</li>";
      }).join("") + "</ol>" +
      '<p class="small muted">You can leave this page. It keeps going, and your ads will be here when you come back.</p>' +
      (pack ? '<h3>One video per hook</h3><ol class="hooklist">' + hooks.map(function (h) { return "<li>" + esc(h.say) + "</li>"; }).join("") + "</ol>" : "") + "</div>";
  }
  function failedHtml(b, j) {
    var pack = !j || j.kind === "pack";
    return '<div class="card flow"><h2>' + (pack ? "Your pack didn't finish" : "The preview didn't finish") + "</h2>" +
      '<p class="bad">' + esc(b.error || "Something went wrong while rendering.") + "</p>" +
      (pack ? '<p class="small muted">It didn\'t use up your pack. Fix what it says, then make it again.</p>' : "") +
      '<p><a class="btn pri" href="#/app/' + esc(S.project.id) + '/review">Back to review</a></p></div>';
  }
  function adAngle(ad) { var m = String(ad.id || "").match(/^h\d+-(.+)$/); return m ? angleLabel(m[1]) : ""; }
  function readyHtml(b) {
    var m = b.result.manifest, base = b.result.base, ads = m.ads || [];
    return '<div class="card flow ready"><h2>Your ads are ready</h2>' +
      '<p class="muted">' + ads.length + " video" + (ads.length === 1 ? "" : "s") + ", each opening with a different hook. Play them, then download the pack and test them against each other.</p>" +
      (m.quality && m.quality.ran === false
        ? '<div class="banner warn small">The quality check didn\'t run on this pack (' + esc(m.quality.reason) + "). Nothing was reviewed for zooms, headings, misread words or claims, so watch every video and check every claim yourself before you run them.</div>"
        : "") +
      '<div class="row"><a class="btn pri" data-dl="' + esc(base + "/" + m.zip) + '" href="#">Download everything (.zip)</a>' +
      '<a class="btn" href="#/app/' + esc(S.project.id) + '/review">Make another pack</a></div>' +
      '<div class="vids">' + ads.map(function (ad) {
        var f = ad.files, nc = ad.name_check;
        var cover = f.stills && f.stills["9x16"] ? ' data-render-poster="' + esc(base + "/images/" + f.stills["9x16"]) + '"' : "";
        return '<div class="vid"><video controls playsinline preload="metadata" data-render-video="' + esc(base + "/videos/" + f.video) + '"' + cover + "></video>" +
          (adAngle(ad) ? '<p class="small"><span class="angle">' + esc(adAngle(ad)) + "</span></p>" : "") +
          '<p class="small"><b>' + esc(ad.hook) + "</b></p>" +
          '<p class="small"><a href="#" data-dl="' + esc(base + "/videos/" + f.video) + '">Video</a>' +
          Object.keys(f.stills || {}).map(function (k) { return ' · <a href="#" data-dl="' + esc(base + "/images/" + f.stills[k]) + '">Image ' + esc(k.replace("x", ":")) + "</a>"; }).join("") +
          (f.srt ? ' · <a href="#" data-dl="' + esc(base + "/captions/" + f.srt) + '">Captions</a>' : "") + "</p>" +
          (nc && nc.passed === false ? '<p class="small bad">Listen to how your app\'s name is said: the check heard “' + esc(nc.heard) + "”.</p>" : "") + "</div>";
      }).join("") + "</div>" +
      '<p class="small"><a href="#" data-dl="' + esc(base + "/ad-copy.txt") + '">Ad copy</a> · <a href="#" data-dl="' + esc(base + "/test-plan.txt") + '">Test plan</a>' +
      (m.quality ? ' · <a href="#" data-dl="' + esc(base + "/quality-check.txt") + '">Quality check</a>' : "") + "</p>" +
      '<p class="small muted">Watch every video once with sound on and once with it off, and check every claim is true today, before you run them.</p></div>';
  }
  function previewHtml(b) {
    var strips = b.preview.manifest.strips || {}, base = b.preview.base;
    return '<div class="card flow"><h2>Your preview frames</h2><p class="muted small">A frame from every scene of each video, from estimated timings. The pack records the voices and renders the full videos.</p>' +
      '<div class="strips">' + Object.keys(strips).map(function (id) {
        return '<figure><img data-render="' + esc(base + "/" + strips[id]) + '" alt="Frames for ' + esc(id) + '"><figcaption class="small muted">' + esc(id) + "</figcaption></figure>";
      }).join("") + "</div>" +
      '<div class="row"><button class="btn pri" id="p-pack" type="button">Looks right: make the pack</button>' +
      '<a class="btn" href="#/app/' + esc(S.project.id) + '/review">Change something</a></div></div>';
  }
  function earlierHtml(now) {
    var rest = S.batches.filter(function (b) { return b !== now && b.status !== "draft"; });
    if (!rest.length) return "";
    var label = { queued: "Queued", running: "Rendering", preview_ready: "Preview", done: "Pack", failed: "Failed" };
    return '<details class="more earlier"' + (S.earlier ? " open" : "") + "><summary>Earlier renders (" + rest.length + ")</summary>" + rest.map(function (b) {
      var m = b.result && b.result.manifest;
      return '<div class="card batch"><div class="row"><b>' + esc(when(b.created_at)) + '</b><span class="pill ' + esc(b.status === "preview_ready" ? "done" : b.status) + '">' + esc(label[b.status] || b.status) + "</span>" +
        '<span class="small muted">' + esc((b.spec.hooks || []).map(function (h) { return h.say; }).join(" · ")) + "</span>" +
        '<a class="btn small" href="#/app/' + esc(S.project.id) + "/make/" + esc(b.id) + '">Open</a>' +
        (m && m.zip ? '<a class="btn small" href="#" data-dl="' + esc(b.result.base + "/" + m.zip) + '">Download (.zip)</a>' : "") + "</div></div>";
    }).join("") + "</details>";
  }
  function wireBatches() {
    wireNow();
    var paths = [];
    root.querySelectorAll("[data-render],[data-render-video],[data-render-poster],[data-dl]").forEach(function (el) {
      ["data-render", "data-render-video", "data-render-poster", "data-dl"].forEach(function (a) {
        if (el.hasAttribute(a)) paths.push(el.getAttribute(a));
      });
    });
    if (!paths.length) return;
    signed("studio-renders", paths).then(function () {
      root.querySelectorAll("[data-render]").forEach(function (el) { el.src = link("studio-renders", el.getAttribute("data-render")); });
      root.querySelectorAll("[data-render-video]").forEach(function (el) { el.src = link("studio-renders", el.getAttribute("data-render-video")); });
      root.querySelectorAll("[data-render-poster]").forEach(function (el) { el.poster = link("studio-renders", el.getAttribute("data-render-poster")); });
      root.querySelectorAll("[data-dl]").forEach(function (el) {
        var u = link("studio-renders", el.getAttribute("data-dl"));
        if (u) { el.href = u + (u.indexOf("?") >= 0 ? "&" : "?") + "download="; el.setAttribute("download", ""); }
      });
    });
  }
  function startPoll() {
    clearInterval(S.poll);
    S.poll = setInterval(function () {
      if (!S.project) { clearInterval(S.poll); S.poll = null; return; }
      var busy = function () { return S.batches.some(function (b) { return b.status === "queued" || b.status === "running"; }); };
      if (!busy()) { clearInterval(S.poll); S.poll = null; return; }
      loadBatches(S.project.id).then(function () {
        var now = document.getElementById("now");
        if (S.step === "review") renderGo();
        if (S.step !== "make" || !now) return;
        if (!busy()) { loadAccount().then(renderProject); return; }
        now.innerHTML = nowHtml(shownBatch());
        wireBatches();
      }).catch(function () {});
    }, 4000);
  }
  /* ── routing and boot ────────────────────────────────────────── */
  function route() {
    flush();
    if (!S.session) { renderAuth(/[?&]new=1/.test(location.search) ? "signup" : "signin"); return; }
    var m = location.hash.match(/^#\/app\/([0-9a-f-]{36})(?:\/(\w+))?(?:\/([0-9a-f-]{36}))?/);
    if (!m) {
      loadProjects().then(renderApps).catch(function (e) { if (e.pg === "42P01" || e.pg === "PGRST205") setupNeeded(); else fail(e); });
      return;
    }
    S.step = OLD_STEPS[m[2]] || m[2] || "app";
    S.batchId = m[3] || null;
    var load = S.project && S.project.id === m[1] ? Promise.resolve() : loadProject(m[1]);
    load.then(function () {
      renderProject();
      if (S.batches.some(function (b) { return b.status === "queued" || b.status === "running"; })) startPoll();
    }).catch(fail);
  }
  /* A confirmation or reset email's link lands here with the new session in the hash */
  function fromLink() {
    var h = location.hash.slice(1);
    if (h.indexOf("access_token=") < 0 && h.indexOf("error_description=") < 0) return Promise.resolve(null);
    var p = new URLSearchParams(h);
    history.replaceState(null, "", location.pathname + location.search);
    if (p.get("error_description")) return Promise.resolve({ notice: p.get("error_description") + ". Sign in, or ask for a new link." });
    var s = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: Number(p.get("expires_in")) };
    return fetch(URL_ + "/auth/v1/user", { headers: { apikey: ANON, Authorization: "Bearer " + s.access_token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (u) {
        if (u && u.id) { s.user = u; saveSession(s); }
        return u && u.id && p.get("type") === "recovery" ? { reset: true } : null;
      })
      .catch(function () { return null; });
  }
  function boot() {
    fromLink().then(function (res) {
      loadSession();
      if (res && res.notice) { renderAuth("signin", res.notice); return; }
      if (res && res.reset) { renderAuth("reset"); return; }
      if (!S.session) { route(); return; }
      loadAccount().then(route).catch(function (e) {
        if (e.pg === "42P01" || e.pg === "PGRST205") setupNeeded(); else if (S.session) route();
      });
    });
  }
  window.addEventListener("hashchange", route);
  boot();
})();
