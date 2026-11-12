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
  var STEPS = [["app", "Your app"], ["hooks", "Hooks"], ["make", "Make the ads"]];
  /* Links from before the flow had three steps */
  var OLD_STEPS = { brief: "app", screens: "app", script: "make" };
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
    hooks_1_to_5: "Pick between one and five hooks.",
    ai_unavailable: "AI suggestions aren't switched on yet. Use the templates, or write your own.",
    ai_daily_limit: "You've used today's AI suggestions. They reset tomorrow.",
    ai_busy: "The AI is busy. Try again in a minute.",
    ai_declined: "The AI declined that request. Try different wording in your brief.",
    ai_failed: "The AI didn't answer. Try again.",
    brief_incomplete: "Add the app name and what it does first."
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
    session: null, account: null, projects: [], project: null, assets: [], hooks: [], batches: [], jobs: {},
    step: "app", urls: {}, poll: null, ai: undefined, playing: null, ack: false, suggested: {}, saveT: null
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
        });
    });
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
  function renderApps() {
    S.project = null;
    var cards = S.projects.map(function (p) {
      var b = p.brief || {};
      return '<a class="appcard" href="#/app/' + esc(p.id) + '"><h2>' + esc(p.name) + "</h2>" +
        '<p class="muted small">' + esc(b.one_liner || "No brief yet") + "</p>" +
        '<p class="small muted">Edited ' + esc(when(p.updated_at)) + "</p></a>";
    }).join("");
    shell('<div class="head"><div><h1>Your apps</h1></div>' +
      '<span class="spacer"></span><button class="btn pri" id="new-app" type="button">New app</button></div>' +
      '<div class="banner">Free in beta: one test pack of up to five videos. Previews are always free.</div>' +
      (S.projects.length ? '<div class="apps">' + cards + "</div>" :
        '<div class="card empty"><h2>Start with your app</h2><p class="muted" style="margin:8px 0 16px">Three steps: your app and its screenshots, your hooks, then the ads.</p>' +
        '<button class="btn pri" id="new-app-2" type="button">Add your first app</button></div>'));
    var make = function () {
      insert("studio_projects", { name: "Untitled app", script: defaults({}) }).then(function (p) {
        location.hash = "#/app/" + p.id + "/app";
      }).catch(fail);
    };
    document.getElementById("new-app").onclick = make;
    var b2 = document.getElementById("new-app-2");
    if (b2) b2.onclick = make;
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
    ({ app: renderApp, hooks: renderHooks, make: renderMake }[S.step] || renderApp)();
  }
  function pane(html) { document.getElementById("pane").innerHTML = html; }
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
    var b = brief(), sc = script();
    return {
      app: !!(S.project.name && S.project.name !== "Untitled app" && b.one_liner) && shots().length >= 2,
      hooks: selectedHooks().length >= 1,
      make: S.batches.some(function (x) { return x.status === "done"; }),
      script: sc.body.length >= 2 && sc.body.every(function (s) { return s.say && s.screen; })
    };
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
    var b = brief(), plat = b.platforms || ["ios"];
    pane('<div class="card flow">' +
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
      '<div class="row"><button class="btn pri" id="a-next" type="button">Continue</button><span class="small muted" id="a-need"></span></div>');

    function read() {
      var plats = Array.prototype.slice.call(document.querySelectorAll('input[name="b-plat"]:checked')).map(function (x) { return x.value; });
      var nb = Object.assign({}, brief(), {
        name: val("b-name"), one_liner: val("b-one"), platforms: plats.length ? plats : ["ios"],
        comp_known: val("b-ck"), comp_thing: val("b-ct"),
        comparison: val("b-ck") && val("b-ct") ? "It's like " + val("b-ck") + ", but for " + val("b-ct") : "",
        category: category(val("b-one"))
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
    document.getElementById("a-next").onclick = function () {
      var r = readiness();
      if (!r.app) { need(true); return; }
      go("hooks");
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
          (!a.width || a.height > a.width ? "" : '<span class="warnbadge">Landscape</span>') + "</figure>";
      }).join("") + "</div>" : "";
      document.getElementById("icon-row").innerHTML = ic
        ? '<img class="iconprev" src="' + esc(link("studio-uploads", ic.path)) + '" alt="App icon"><span class="small muted">App icon, on the end card</span><button class="btn small link" data-del="' + esc(ic.id) + '" type="button">Remove</button>'
        : '<label class="btn small" for="up-icon">Add your app icon<input id="up-icon" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><span class="small muted">Optional, for the end card</span>';
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
    var files = Array.prototype.slice.call(fileList || []);
    var status = document.getElementById("up-status");
    if (S.assets.length + files.length > MAX_ASSETS) { toast("Keep it to " + MAX_ASSETS + " files per app."); return; }
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
          var path = uid() + "/" + S.project.id + "/" + rand() + "." + ext;
          var kind = asIcon ? "icon" : (file.type.indexOf("video") === 0 ? "recording" : "screen");
          return upload(path, file).then(function () {
            return insert("studio_assets", {
              project_id: S.project.id, kind: kind, path: path, label: asIcon ? "App icon" : file.name.replace(/\.[^.]+$/, "").slice(0, 60),
              status_bar: true, width: d.w || null, height: d.h || null, bytes: file.size, sort: S.assets.length
            });
          }).then(function (a) { S.assets.push(a); n++; });
        });
      }).catch(function (e) { fail(e); });
    });
    chain.then(function () {
      var st = document.getElementById("up-status");
      if (st) st.textContent = "";
      if (n) toast(n === 1 ? "Uploaded" : n + " files uploaded");
      renderShots();
    });
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
    var known = [b.one_liner, b.facts].join(" ").toLowerCase();
    if (n > 14) out.push(["warn", "Long: about " + (n / 2.6).toFixed(1) + " seconds to say. Aim for 12 words or fewer."]);
    var nums = t.match(/\d[\d,.]*\s*%?|\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|billion|double|twice|triple|tenfold)\b/gi) || [];
    nums.forEach(function (m) {
      var k = m.toLowerCase().trim(), digits = k.replace(/[,\s%]/g, "");
      var ok = known.indexOf(k) >= 0 || (digits && known.replace(/,/g, "").indexOf(digits) >= 0) ||
        (NUMWORDS[k] && known.indexOf(String(NUMWORDS[k])) >= 0);
      if (!ok) out.push(["warn", "Uses a number (\"" + m.trim() + "\"). Make sure it's true today."]);
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
  function issues(h) {
    var list = lint(h.text, brief());
    (Array.isArray(h.checks) ? h.checks : []).forEach(function (c) {
      if (c.verdict === "block" || c.verdict === "warn") {
        (c.reasons || []).forEach(function (r) { list.push([c.verdict, "AI check: " + r]); });
        if (c.rewrite) list.push(["info", "Suggested: " + c.rewrite]);
      }
    });
    return list;
  }
  function selectedHooks() { return S.hooks.filter(function (h) { return h.selected; }); }

  /* ── 2. hooks ────────────────────────────────────────────────── */
  var PATTERNS = ["comparison", "problem", "outcome", "callout", "curiosity", "values"];
  function renderHooks() {
    var b = brief(), pid = S.project.id;
    /* A comparison from step 1 is already a strong hook, so it starts on the list, picked */
    if (!S.hooks.length && b.comparison && !S.suggested[pid + ":seed"]) {
      S.suggested[pid + ":seed"] = 1;
      addHook({ category: "comparison", text: b.comparison + ".", source: "template", selected: true }).then(renderHooks);
      return;
    }
    var sel = selectedHooks().length;
    var chips = CATEGORIES.filter(function (c) { return PATTERNS.indexOf(c[0]) >= 0; }).map(function (c) {
      return '<button class="chip" type="button" data-tmpl="' + esc(c[0]) + '" data-text="' + esc(c[2]) + '">' + esc(c[1]) + "</button>";
    }).join("");
    pane('<div class="card flow"><div class="row"><h2>Pick your hooks</h2><span class="spacer"></span>' +
      '<span class="small ' + (sel ? "good" : "muted") + '" id="h-count">' + sel + " of " + MAX_HOOKS + "</span></div>" +
      '<p class="muted small">The opening line. Each video tries a different one, so you learn which works.</p>' +
      (POLICY[b.category] ? '<div class="banner warn small">' + esc(POLICY[b.category]) + "</div>" : "") +
      '<div id="h-list">' + S.hooks.map(hookCard).join("") + "</div>" +
      (S.ai === false ? "" : '<div class="row" style="margin:6px 0 2px"><button class="btn' + (S.hooks.length ? "" : " pri") + '" id="h-ai" type="button">' +
        (S.hooks.some(function (h) { return h.source === "ai"; }) ? "More ideas" : "Suggest hooks") + '</button><span class="small muted" id="h-status" role="status"></span></div>') +
      '<div class="write"><div class="row nowrap-row"><input id="h-text" maxlength="160" placeholder="Write a hook, like: It\'s like Duolingo, but for habits." aria-label="New hook">' +
      '<button class="btn" id="h-add" type="button">Add</button></div>' +
      '<div class="small muted chips">Start from: ' + chips + "</div><div id=\"h-live\" class=\"lint\"></div></div></div>" +
      '<div class="row"><button class="btn pri" id="h-next" type="button"' + (sel ? "" : " disabled") + ">Continue</button>" +
      (sel ? "" : '<span class="small muted">Pick at least one.</span>') + "</div>");

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
      addHook({ category: cat, text: t, source: "user", selected: selectedHooks().length < MAX_HOOKS }).then(renderHooks);
    };
    var ai = document.getElementById("h-ai");
    if (ai) ai.onclick = function () { suggestHooks(false); };
    document.getElementById("h-next").onclick = function () {
      go("make");
      /* Hooks people wrote themselves get the AI claim check on the way; AI ideas were written to the same rules */
      if (S.ai) {
        var todo = selectedHooks().filter(function (h) { return h.source !== "ai" && !(h.checks && h.checks.length); });
        if (todo.length) checkHooks(todo);
      }
    };
    root.querySelectorAll("[data-pick]").forEach(function (el) {
      el.onchange = function () {
        var h = hookById(el.getAttribute("data-pick"));
        if (el.checked && selectedHooks().length >= MAX_HOOKS) { el.checked = false; toast("Up to five. Unpick one first."); return; }
        patch("studio_hooks", h.id, { selected: el.checked }).then(function () { h.selected = el.checked; renderHooks(); }).catch(fail);
      };
    });
    root.querySelectorAll("[data-hedit]").forEach(function (el) {
      el.onchange = function () {
        var h = hookById(el.getAttribute("data-hedit")), v = el.value.trim();
        if (v.length < 3) { el.value = h.text; return; }
        patch("studio_hooks", h.id, { text: v, checks: [] }).then(function () { h.text = v; h.checks = []; renderHooks(); }).catch(fail);
      };
    });
    root.querySelectorAll("[data-hdel]").forEach(function (el) {
      el.onclick = function () {
        var h = hookById(el.getAttribute("data-hdel"));
        del("studio_hooks", h.id).then(function () { S.hooks = S.hooks.filter(function (x) { return x !== h; }); renderHooks(); }).catch(fail);
      };
    });
    /* AI ideas load by themselves the first time, when AI is on */
    if (S.ai !== false && !S.suggested[pid] && !S.hooks.some(function (h) { return h.source === "ai"; })) suggestHooks(true);
  }
  function hookById(id) { return S.hooks.filter(function (h) { return h.id === id; })[0]; }
  function lintHtml(list, text) {
    if (!text || !list.length) return "";
    return "<ul>" + list.map(function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + "</li>"; }).join("") + "</ul>";
  }
  function hookCard(h) {
    var full = selectedHooks().length >= MAX_HOOKS && !h.selected;
    return '<div class="hook' + (h.selected ? " on" : "") + '"><label class="pick"><input type="checkbox" data-pick="' + esc(h.id) + '"' +
      (h.selected ? " checked" : "") + (full ? " disabled" : "") + ' aria-label="Pick this hook"></label><div class="grow">' +
      '<input class="htext" data-hedit="' + esc(h.id) + '" value="' + esc(h.text) + '" maxlength="160" aria-label="Hook">' +
      '<div class="lint">' + lintHtml(issues(h), h.text) + "</div></div>" +
      (h.source === "ai" ? '<span class="pill">AI</span>' : "") +
      '<button class="btn small link" data-hdel="' + esc(h.id) + '" type="button" aria-label="Delete">✕</button></div>';
  }
  function addHook(h) {
    return insert("studio_hooks", { project_id: S.project.id, category: h.category || "custom", text: h.text.slice(0, 160),
      benefit: (h.benefit || "").slice(0, 140), source: h.source || "user", selected: !!h.selected }).then(function (row) { S.hooks.push(row); }).catch(fail);
  }
  function aiBrief() {
    var b = Object.assign({}, brief());
    b.name = b.name || S.project.name;
    b.platforms = (b.platforms || []).join(", ");
    return b;
  }
  function aiCall(body, status) {
    var st = document.getElementById("h-status") || document.getElementById("sc-status");
    if (st) st.textContent = status;
    return fn("studio-ai", body).then(function (r) {
      if (st) st.textContent = "";
      if (r.status === 503 || r.status === 404) { S.ai = false; throw Object.assign(new Error(ERRORS.ai_unavailable), { code: "ai_unavailable" }); }
      if (!r.ok) throw Object.assign(new Error(errText(r.data.error)), { code: r.data.error });
      S.ai = true;
      return r.data;
    }, function (e) { if (st) st.textContent = ""; throw e; });
  }
  /* quiet: the automatic first run, which says nothing if AI is off */
  function suggestHooks(quiet) {
    var pid = S.project.id;
    S.suggested[pid] = 1;
    if (!brief().one_liner) { if (!quiet) toast(ERRORS.brief_incomplete); return; }
    var btn = document.getElementById("h-ai"); if (btn) btn.disabled = true;
    aiCall({ action: "suggest_hooks", brief: aiBrief() }, "Writing hook ideas…").then(function (d) {
      var have = {};
      S.hooks.forEach(function (h) { have[h.text.toLowerCase()] = 1; });
      var chain = Promise.resolve();
      (d.hooks || []).forEach(function (h) {
        if (have[h.text.toLowerCase()]) return;
        chain = chain.then(function () { return addHook({ category: h.category, text: h.text, benefit: h.benefit, source: "ai" }); });
      });
      return chain.then(function () { if (S.step === "hooks" && S.project && S.project.id === pid) renderHooks(); });
    }).catch(function (e) {
      if (!(quiet && e.code === "ai_unavailable")) fail(e);
      if (S.step === "hooks" && S.project && S.project.id === pid) renderHooks();
    });
  }
  function checkHooks(list) {
    aiCall({ action: "check_hooks", brief: aiBrief(), hooks: list.map(function (h) { return h.text; }) }, "Checking claims…").then(function (d) {
      var res = d.results || [];
      return Promise.all(list.map(function (h, i) {
        var r = res[i] || res.filter(function (x) { return x.text === h.text; })[0];
        if (!r) return null;
        h.checks = [r];
        return patch("studio_hooks", h.id, { checks: [r] });
      })).then(function () { if (S.step === "make") renderGo(); });
    }).catch(function () {});
  }

  /* ── 3. make the ads ─────────────────────────────────────────── */
  function platformCta() {
    var b = brief(), p = b.platforms || ["ios"], name = b.spoken_name || b.name || S.project.name;
    if (p.indexOf("ios") >= 0 && p.indexOf("android") >= 0) return ["Download " + name + " free today.", "Download free today"];
    if (p.indexOf("ios") >= 0) return ["Download " + name + " free on the App Store.", "Download free on the App Store"];
    if (p.indexOf("android") >= 0) return ["Get " + name + " free on Google Play.", "Get it free on Google Play"];
    return ["Try " + name + " free today.", "Try it free"];
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
  function renderMake() {
    var sc = seedScript(), list = shots(), cta = platformCta(), b = brief(), th = sc.theme, op = sc.opening;
    var screenOpts = function (cur) { return list.map(function (a) { return opt(a.id, assetLabel(a), cur); }).join(""); };
    var scenes = sc.body.map(function (s, i) {
      var a = find(s.screen), rec = a && a.kind === "recording";
      return '<div class="line"><img class="thumb" data-asset="' + esc(s.screen) + '" alt="">' +
        '<div class="grow"><input data-s="' + i + '" data-f="say" maxlength="200" value="' + esc(s.say) + '" placeholder="' +
        (i ? "The next thing it does." : "What this screen shows, like: Tick off a habit and watch your streak grow.") + '" aria-label="Line ' + (i + 1) + '">' +
        '<div class="row tight opts"><select data-s="' + i + '" data-f="screen" aria-label="Screen">' + screenOpts(s.screen) + "</select>" +
        '<select data-s="' + i + '" data-f="move" aria-label="Motion">' + (rec ? opt("auto", "Play recording", "auto")
          : opt("auto", "Slide in", moveOf(s)) + ZOOMS.map(function (z) { return opt("zoom:" + z[0], z[1], moveOf(s)); }).join("")) + "</select>" +
        '<input data-s="' + i + '" data-f="head" maxlength="40" value="' + esc(s.head) + '" placeholder="Heading (optional)" aria-label="Heading"></div></div>' +
        '<button class="btn small link" data-sdel="' + i + '" type="button" aria-label="Remove line"' + (sc.body.length > 1 ? "" : " disabled") + ">✕</button></div>";
    }).join("");
    var voices = VOICES.map(function (v) {
      return '<label class="voice' + (sc.voice.id === v[0] ? " on" : "") + '"><input type="radio" name="voice" value="' + v[0] + '"' + (sc.voice.id === v[0] ? " checked" : "") + ">" +
        "<b>" + v[1] + '</b><span class="small muted">' + v[2].split(",")[0] + '</span><button class="btn small link" type="button" data-play="' + v[3] + '" aria-label="Play ' + v[1] + '">▶</button></label>';
    }).join("");
    pane('<div class="card flow"><div class="row"><h2>The script</h2><span class="spacer"></span>' +
      (S.ai === false ? "" : '<button class="btn small" id="sc-ai" type="button">Write it for me</button>') + "</div>" +
      '<p class="muted small">Plays after every hook. One line per screen: what the app is doing there.</p>' +
      '<div class="small muted" id="sc-status" role="status"></div>' + scenes +
      '<button class="btn small" id="sc-add" type="button"' + (sc.body.length >= 5 ? " disabled" : "") + ">Add a line</button></div>" +

      '<div class="card flow"><h2>Voice and look</h2><div class="voices">' + voices + "</div>" +
      '<div class="row look"><label class="check"><input id="th-acc" type="color" value="' + esc(th.accent || "#FF7A2E") + '"> Brand colour</label>' +
      '<span class="seg">' + [["dark", "Dark"], ["light", "Light"]].map(function (x) {
        return '<label><input type="radio" name="th-style" value="' + x[0] + '"' + ((th.style || "dark") === x[0] ? " checked" : "") + "><span>" + x[1] + "</span></label>";
      }).join("") + "</span></div>" +
      '<details class="more"><summary>More options</summary>' +
      '<div class="field"><label>Opening</label>' +
      [["hand", "A hand holding the phone, already swiping"], ["phone", "Just the phone, already swiping"], ["rise", "The phone slides up"]].map(function (x) {
        return '<label class="check block"><input type="radio" name="op" value="' + x[0] + '"' + ((op.style || "hand") === x[0] ? " checked" : "") + "> " + x[1] + "</label>";
      }).join("") + "</div>" +
      '<div class="cols2">' +
      '<div class="field"><label for="sc-line">Line on the end card</label><input id="sc-line" maxlength="60" value="' + esc(sc.end_line) + '" placeholder="Build habits that stick."></div>' +
      '<div class="field"><label for="sc-btn">Button</label><input id="sc-btn" maxlength="40" value="' + esc(sc.button) + '" placeholder="' + esc(cta[1]) + '"></div>' +
      '<div class="field"><label for="sc-say">Last thing the voice says</label><input id="sc-say" maxlength="200" value="' + esc(sc.cta_say) + '" placeholder="' + esc(cta[0]) + '"></div>' +
      '<div class="field"><label for="sc-head">Ad headline</label><input id="sc-head" maxlength="60" value="' + esc(sc.headline) + '" placeholder="Download ' + esc(b.name || S.project.name) + ' free"></div>' +
      '<div class="field"><label for="sc-disc">Disclaimer</label><input id="sc-disc" maxlength="120" value="' + esc(sc.disclaimer) + '" placeholder="' +
        esc(b.category === "finance" ? "Educational only. Not financial advice." : b.category === "health" ? "Not medical advice." : "None") + '"></div>' +
      '<div class="field"><label for="v-speed">Voice pace</label><select id="v-speed">' +
      opt("1", "Natural", sc.voice.speed) + opt("1.1", "Brisk", sc.voice.speed) + opt("1.15", "Fast", sc.voice.speed) + "</select></div>" +
      "</div></details></div>" +
      '<div id="m-card"></div><div id="batches">' + batchesHtml() + "</div>");

    fillThumbs();
    root.querySelectorAll("#pane input:not([type=radio]):not([data-play]), #pane select").forEach(function (el) {
      el.addEventListener(el.tagName === "SELECT" || el.type === "color" ? "change" : "input", function () {
        readScript();
        if (el.getAttribute("data-f") === "screen") {
          var img = el.closest(".line").querySelector(".thumb");
          img.setAttribute("data-asset", el.value); fillThumbs();
          if ((find(el.value) || {}).kind === "recording") renderMake();
        }
      });
    });
    root.querySelectorAll('#pane input[type="radio"]').forEach(function (el) {
      el.onchange = function () {
        readScript();
        root.querySelectorAll(".voice").forEach(function (v) { v.classList.toggle("on", v.querySelector("input").checked); });
      };
    });
    root.querySelectorAll("[data-sdel]").forEach(function (el) {
      el.onclick = function () { readScript(); sc.body.splice(Number(el.getAttribute("data-sdel")), 1); later({ script: sc }); renderMake(); };
    });
    document.getElementById("sc-add").onclick = function () {
      readScript();
      var usedIds = sc.body.map(function (s) { return s.screen; });
      var a = list.filter(function (x) { return usedIds.indexOf(x.id) < 0; })[0] || list[sc.body.length % Math.max(1, list.length)];
      sc.body.push({ say: "", head: "", screen: a ? a.id : "", motion: "auto" });
      later({ script: sc });
      renderMake();
      var inputs = root.querySelectorAll('[data-f="say"]'); if (inputs.length) inputs[inputs.length - 1].focus();
    };
    root.querySelectorAll("[data-play]").forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        if (S.playing) S.playing.pause();
        S.playing = new Audio("/assets/voices/" + el.getAttribute("data-play") + ".mp3");
        S.playing.play().catch(function () { toast("Couldn't play that sample."); });
      };
    });
    var ai = document.getElementById("sc-ai");
    if (ai) ai.onclick = draftScript;
    renderGo();
    wireBatches();
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
  function readScript() {
    var sc = script();
    root.querySelectorAll("[data-s]").forEach(function (el) {
      var s = sc.body[Number(el.getAttribute("data-s"))], f = el.getAttribute("data-f"), v = el.value.trim();
      if (f === "move") {
        if (v.indexOf("zoom:") === 0) { s.motion = "zoom"; s.zoomAt = v.slice(5); } else { s.motion = "auto"; delete s.zoomAt; }
      } else s[f] = v;
    });
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
    sc.end_line = v("sc-line"); sc.button = v("sc-btn"); sc.cta_say = v("sc-say"); sc.headline = v("sc-head"); sc.disclaimer = v("sc-disc");
    var op = root.querySelector('input[name="op"]:checked'), st = root.querySelector('input[name="th-style"]:checked');
    sc.opening = { style: op ? op.value : "hand", screens: sc.opening.screens || [] };
    sc.theme = Object.assign({}, sc.theme, { style: st ? st.value : "dark", accent: v("th-acc") || "#FF7A2E" });
    var voice = root.querySelector('input[name="voice"]:checked');
    sc.voice = { id: voice ? voice.value : VOICES[0][0], speed: Number(v("v-speed")) || 1.15 };
    later({ script: sc });
    renderGo();
    return sc;
  }
  function draftScript() {
    readScript();
    var list = shots();
    if (!list.length) { toast("Add your screenshots first."); return; }
    document.getElementById("sc-ai").disabled = true;
    aiCall({ action: "draft_script", brief: aiBrief(), screens: list.map(function (a) { return { id: a.id, label: assetLabel(a), kind: a.kind }; }) },
      "Writing the script…").then(function (d) {
      var sc = script();
      if (d.body && d.body.length) sc.body = d.body.map(function (s) { return { say: s.say, head: s.head, screen: s.screen, motion: s.motion === "zoom" ? "zoom" : "auto" }; });
      if (d.benefit && !sc.benefit) sc.benefit = d.benefit;
      if (d.end_line && !sc.end_line) sc.end_line = d.end_line;
      later({ script: sc });
      toast("Done. Change anything that isn't right.");
      renderMake();
    }).catch(function (e) { fail(e); renderMake(); });
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
               theme: { style: sc.theme.style, accent: sc.theme.accent, bg: sc.theme.bg } },
      screens: screens, hooks: hooks, body: body,
      opening: { style: sc.opening.style || "hand", motion: "page", screens: opening },
      cta: { say: sc.cta_say || cta[0], button: sc.button || cta[1], lines: sc.end_line ? [sc.end_line] : [], headline: sc.headline || "" },
      voice: { id: sc.voice.id, speed: Number(sc.voice.speed) || 1 },
      disclaimer: sc.disclaimer || ""
    };
  }
  function problems() {
    var r = readiness(), out = [];
    if (!r.app) out.push(["app", "Finish step 1: the name, what it does and two screenshots."]);
    if (!r.hooks) out.push(["hooks", "Pick at least one hook."]);
    if (!r.script) out.push(["make", "Write at least two lines of the script."]);
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
    if (kind === "pack" && packsLeft() < 1) { toast(ERRORS.no_packs_left); return; }
    var blocked = selectedHooks().filter(function (h) { return issues(h).some(function (x) { return x[0] === "block"; }); });
    if (blocked.length && !S.ack) { toast("Fix the flagged hooks, or confirm they're true, first."); return; }
    var btn = document.getElementById(kind === "pack" ? "m-pack" : "m-prev");
    if (btn) btn.disabled = true;
    flush().then(function () { return batchFor(kind); }).then(function (b) {
      return rpc("studio_queue", { p_batch: b.id, p_kind: kind });
    }).then(function () {
      toast(kind === "pack" ? "Your pack is queued." : "Preview queued.");
      return Promise.all([loadBatches(S.project.id), loadAccount()]);
    }).then(function () { renderProject(); startPoll(); }).catch(function (e) { fail(e); renderProject(); });
  }
  /* The card with the two buttons, redrawn as the script changes */
  function renderGo() {
    var box = document.getElementById("m-card");
    if (!box) return;
    var probs = problems(), hooks = selectedHooks(), left = packsLeft();
    var flagged = hooks.filter(function (h) { return issues(h).some(function (x) { return x[0] === "block"; }); });
    box.innerHTML = '<div class="card flow go">' +
      (probs.length
        ? '<ul class="todo">' + probs.map(function (p) {
            return "<li>" + esc(p[1]) + (p[0] === "make" ? "" : ' <a href="#/app/' + esc(S.project.id) + "/" + p[0] + '">Go</a>') + "</li>";
          }).join("") + "</ul>"
        : '<p class="small">' + hooks.length + " video" + (hooks.length === 1 ? "" : "s") + ", one per hook, plus images, captions, ad copy and a test plan.</p>") +
      (flagged.length ? '<div class="banner warn small">' + flagged.length + " picked hook" + (flagged.length === 1 ? " is" : "s are") + ' flagged. <a href="#/app/' + esc(S.project.id) + '/hooks">Fix</a>, or ' +
        '<label class="check"><input type="checkbox" id="m-ack"' + (S.ack ? " checked" : "") + "> I've checked it's true</label></div>" : "") +
      '<div class="row"><button class="btn" id="m-prev" type="button"' + (probs.length ? " disabled" : "") + ">Preview (free)</button>" +
      '<button class="btn pri" id="m-pack" type="button"' + (probs.length || left < 1 ? " disabled" : "") + ">" +
      (left < 1 ? "No free packs left" : "Make the pack" + (left === Infinity ? "" : " (uses 1 of " + left + ")")) + "</button></div>" +
      (left < 1 ? '<p class="small muted note">The beta includes one free pack. Email <a href="mailto:' + SUPPORT + '">' + SUPPORT + "</a> for another.</p>"
                : '<p class="small muted note">The preview shows a frame from every scene in seconds. The pack takes a few minutes.</p>') + "</div>";
    var a = document.getElementById("m-ack");
    if (a) a.onchange = function () { S.ack = a.checked; };
    document.getElementById("m-prev").onclick = function () { queue("preview"); };
    document.getElementById("m-pack").onclick = function () { queue("pack"); };
  }
  function batchesHtml() {
    if (!S.batches.length) return "";
    return S.batches.map(function (b) {
      var j = S.jobs[b.id], st = b.status, busy = st === "queued" || st === "running";
      var label = { draft: "Draft", queued: "Queued", running: "Rendering", preview_ready: "Preview ready", done: "Pack ready", failed: "Failed" }[st] || st;
      var html = '<div class="card batch"><div class="row"><b>' + esc(when(b.created_at)) + '</b><span class="pill ' + esc(st === "preview_ready" ? "done" : st) + '">' + esc(label) + "</span>" +
        '<span class="small muted">' + esc((b.spec.hooks || []).map(function (h) { return h.say; }).join(" · ")) + "</span></div>";
      if (busy) {
        var waiting = j && j.status === "queued" && Date.now() - new Date(j.created_at).getTime() > 120000;
        html += '<p class="small"><span class="spin" aria-hidden="true"></span> ' + esc((j && j.progress) || (j && j.status === "queued" ? "Waiting for the renderer" : "Working")) + "…</p>" +
          (waiting ? '<p class="small muted">During the beta the renderer can take a few minutes to pick up a job. You can leave this page; it keeps going.</p>' : "");
      }
      if (st === "failed" && b.error) html += '<p class="small bad">' + esc(b.error) + "</p>";
      if (b.preview && b.preview.base) {
        html += '<h3>Preview</h3><div class="strips">' + Object.keys(b.preview.manifest.strips || {}).map(function (id) {
          var p = b.preview.base + "/" + b.preview.manifest.strips[id];
          return '<figure><img data-render="' + esc(p) + '" alt="Review frames for ' + esc(id) + '"><figcaption class="small muted">' + esc(id) + "</figcaption></figure>";
        }).join("") + "</div>";
      }
      if (b.result && b.result.base) {
        var m = b.result.manifest, base = b.result.base;
        html += '<h3>Your pack</h3><p><a class="btn pri" data-dl="' + esc(base + "/" + m.zip) + '" href="#">Download everything (.zip)</a></p><div class="vids">' +
          (m.ads || []).map(function (ad) {
            var f = ad.files, nc = ad.name_check;
            var cover = f.stills && f.stills["9x16"] ? ' data-render-poster="' + esc(base + "/images/" + f.stills["9x16"]) + '"' : "";
            return '<div class="vid"><video controls playsinline preload="none" data-render-video="' + esc(base + "/videos/" + f.video) + '"' + cover + "></video>" +
              '<p class="small"><b>' + esc(ad.hook) + "</b></p>" +
              '<p class="small"><a href="#" data-dl="' + esc(base + "/videos/" + f.video) + '">Video</a>' +
              Object.keys(f.stills || {}).map(function (k) { return ' · <a href="#" data-dl="' + esc(base + "/images/" + f.stills[k]) + '">Image ' + esc(k.replace("x", ":")) + "</a>"; }).join("") +
              (f.srt ? ' · <a href="#" data-dl="' + esc(base + "/captions/" + f.srt) + '">Captions</a>' : "") + "</p>" +
              (nc && nc.passed === false ? '<p class="small bad">Listen to how your app\'s name is said: the check heard “' + esc(nc.heard) + "”.</p>" : "") + "</div>";
          }).join("") + "</div>" +
          '<p class="small"><a href="#" data-dl="' + esc(base + "/ad-copy.txt") + '">Ad copy</a> · <a href="#" data-dl="' + esc(base + "/test-plan.txt") + '">Test plan</a></p>' +
          '<p class="small muted">Watch every video once with sound on and once with it off, and check every claim is true today, before you run them.</p>';
      }
      return html + "</div>";
    }).join("");
  }
  function wireBatches() {
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
      var busy = S.batches.some(function (b) { return b.status === "queued" || b.status === "running"; });
      if (!busy) { clearInterval(S.poll); S.poll = null; return; }
      loadBatches(S.project.id).then(function () {
        if (S.step === "make" && document.getElementById("batches")) {
          document.getElementById("batches").innerHTML = batchesHtml();
          wireBatches();
          if (!S.batches.some(function (b) { return b.status === "queued" || b.status === "running"; })) loadAccount().then(renderProject);
        }
      }).catch(function () {});
    }, 4000);
  }

  /* ── routing and boot ────────────────────────────────────────── */
  function route() {
    flush();
    if (!S.session) { renderAuth(/[?&]new=1/.test(location.search) ? "signup" : "signin"); return; }
    var m = location.hash.match(/^#\/app\/([0-9a-f-]{36})(?:\/(\w+))?/);
    if (!m) {
      loadProjects().then(renderApps).catch(function (e) { if (e.pg === "42P01" || e.pg === "PGRST205") setupNeeded(); else fail(e); });
      return;
    }
    S.step = OLD_STEPS[m[2]] || m[2] || "app";
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
