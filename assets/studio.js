/* ForgeLabs App Ad Studio. Plain JavaScript and no build step, matching the rest of the site.

   Security rules for anyone editing this file:
   - Briefs, hooks and labels are typed by customers and shown back to them. Text goes through
     esc(). Only links the app made itself (signed storage URLs) become an href or src.
   - The anon key is public by design. What protects data is row level security and the grants
     in supabase/migrations/. Work is queued only through studio_queue(), which checks the pack
     allowance on the server, so nothing here is trusted to enforce limits. */
(function () {
  "use strict";

  var URL_ = "https://xhtwtnsvdmabfvewjgwz.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhodHd0bnN2ZG1hYmZ2ZXdqZ3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NzU5NDEsImV4cCI6MjEwOTQ1MTk0MX0.Zgurc8l1LXPRFqtfNgUNShBQLGJUWpsg-sQ-FOcr-t4";
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
  var STEPS = [["brief", "Brief"], ["screens", "Screens"], ["hooks", "Hooks"], ["script", "Script and style"], ["make", "Make the ads"]];
  var MOTIONS = [["rise", "Phone slides up"], ["page", "Swipe across from the last screen"], ["zoom", "Zoom in on part of the screen"], ["play", "Play the recording"]];
  var ZOOMS = [["top", "Top third", [0.1, 0.45]], ["middle", "Middle third", [0.33, 0.66]], ["bottom", "Bottom third", [0.55, 0.9]]];
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
    brief_incomplete: "Fill in the app name and what it does first (Brief)."
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
    step: "brief", urls: {}, poll: null, ai: undefined, playing: null, ack: false
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
    var up = mode === "signup";
    root.innerHTML =
      '<div class="auth"><a class="brand" href="/"><i></i>ForgeLabs <span class="sub">App Ad Studio</span></a><div class="card">' +
      "<h1>" + (up ? "Make your first ads free" : "Sign in") + "</h1>" +
      (notice ? '<p class="small muted" role="status">' + esc(notice) + "</p>" : "") +
      '<form id="authf" style="margin-top:16px" novalidate>' +
      '<div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label for="a-pw">Password</label><input id="a-pw" type="password" autocomplete="' +
      (up ? "new-password" : "current-password") + '" required minlength="10">' +
      (up ? '<div class="hint">At least 10 characters.</div>' : "") + "</div>" +
      (up ? '<p class="small muted">By creating an account you agree to the <a href="/terms/">terms</a> and <a href="/privacy/">privacy policy</a>.</p>' : "") +
      '<button class="btn pri" style="width:100%" type="submit">' + (up ? "Create account" : "Sign in") + "</button>" +
      '<div class="err" id="a-err" role="alert"></div></form></div>' +
      '<div class="switch">' + (up ? "Already have an account? " : "New here? ") +
      '<button type="button" id="a-switch">' + (up ? "Sign in" : "Create an account") + "</button></div></div>";
    document.getElementById("a-switch").onclick = function () { renderAuth(up ? "signin" : "signup"); };
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
        if (r.data.error_code === "email_not_confirmed") m = "Confirm your email first: check your inbox for the link.";
        err.textContent = m || "That didn't work. Try again.";
      }).catch(function () {
        btn.disabled = false;
        err.textContent = "We couldn't reach the server. Check your connection and try again.";
      });
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
    shell('<div class="head"><div><h1>Your apps</h1><div class="muted small">One app per product. Each one keeps its brief, screens, hooks and packs.</div></div>' +
      '<span class="spacer"></span><button class="btn pri" id="new-app" type="button">New app</button></div>' +
      '<div class="banner">Free during the beta: every account gets one test pack (up to five videos with stills, captions and ad copy). Previews are free.</div>' +
      (S.projects.length ? '<div class="apps">' + cards + "</div>" :
        '<div class="card empty"><h2>Start with your app</h2><p class="muted" style="margin:8px 0 16px">Describe it, upload a few screenshots, pick your hooks and get a ready-to-test set of video ads.</p>' +
        '<button class="btn pri" id="new-app-2" type="button">Add your first app</button></div>'));
    var make = function () {
      insert("studio_projects", { name: "Untitled app", script: defaults({}) }).then(function (p) {
        location.hash = "#/app/" + p.id + "/brief";
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
    shell('<div class="head"><div><div class="small muted"><a href="#/">Your apps</a> /</div><h1>' + esc(p.name) + "</h1></div></div>" +
      '<nav class="steps" aria-label="Steps">' + steps + "</nav>" + '<div id="pane"></div>');
    ({ brief: renderBrief, screens: renderScreens, hooks: renderHooks, script: renderScript, make: renderMake }[S.step] || renderBrief)();
  }
  function pane(html) { document.getElementById("pane").innerHTML = html; }
  function go(step) { location.hash = "#/app/" + S.project.id + "/" + step; }
  function saveProject(fields) {
    fields.updated_at = new Date().toISOString();
    return patch("studio_projects", S.project.id, fields).then(function (p) {
      if (p) { p.script = defaults(p.script || {}); S.project = p; }
    });
  }
  function readiness() {
    var b = brief(), sc = script();
    return {
      brief: !!(S.project.name && S.project.name !== "Untitled app" && b.one_liner && b.cant_do),
      screens: shots().length >= 2,
      hooks: selectedHooks().length >= 1,
      script: sc.body.length >= 2 && sc.body.every(function (s) { return s.say && s.screen; }),
      make: S.batches.some(function (x) { return x.status === "done"; })
    };
  }

  /* ── 1. brief ────────────────────────────────────────────────── */
  function renderBrief() {
    var b = brief(), plat = b.platforms || ["ios"];
    function field(id, label, value, hint, ph, area) {
      return '<div class="field"><label for="' + id + '">' + label + "</label>" +
        (area ? '<textarea id="' + id + '" placeholder="' + esc(ph || "") + '">' + esc(value) + "</textarea>"
              : '<input id="' + id + '" value="' + esc(value) + '" placeholder="' + esc(ph || "") + '">') +
        (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>";
    }
    pane('<div class="card"><h2>What your app is</h2><p class="muted small" style="margin-bottom:14px">The hook writer and the claim check read this. Every claim in your ads has to be true of what you write here.</p>' +
      '<div class="cols2">' +
      field("b-name", "App name", S.project.name === "Untitled app" ? "" : S.project.name, "As it appears on screen.", "Habitly") +
      field("b-spoken", "How the voice should say it (optional)", b.spoken_name, "Spell it the way it sounds, for example <i>Stock Matcher A.I.</i>", "Habit-lee") +
      "</div>" +
      field("b-one", "What it does, in one sentence", b.one_liner, "", "A habit tracker that turns daily habits into streaks you can share with friends.") +
      '<div class="field"><label>Where people get it</label><div class="row">' +
      [["ios", "iPhone (App Store)"], ["android", "Android (Google Play)"], ["web", "Web"]].map(function (x) {
        return '<label class="check"><input type="checkbox" name="b-plat" value="' + x[0] + '"' + (plat.indexOf(x[0]) >= 0 ? " checked" : "") + "> " + x[1] + "</label>";
      }).join("") + "</div></div>" +
      '<div class="cols2">' +
      field("b-aud", "Who it's for", b.audience, "", "People who keep restarting the same habit") +
      field("b-act", "What they should do after the ad", b.action, "", "Download the app") +
      "</div>" +
      field("b-prob", "The problem they feel, in their words", b.problem, "", "I start strong every January and give up by February.", true) +
      field("b-out", "The result they want", b.outcome, "", "Keep a habit going for more than a few weeks.") +
      '<div class="field"><label>A familiar comparison (optional)</label><div class="row nowrap-row"><span class="muted">It\'s like</span>' +
      '<input id="b-ck" value="' + esc(b.comp_known) + '" placeholder="Duolingo" style="max-width:200px"><span class="muted">but for</span>' +
      '<input id="b-ct" value="' + esc(b.comp_thing) + '" placeholder="your habits" style="max-width:260px"></div>' +
      '<div class="hint">The strongest hooks explain an app by something people already know.</div></div>' +
      field("b-cant", "What your app can NOT do or see", b.cant_do, "This is what stops false claims. For example: it doesn't see anyone's bank account, give medical advice or guarantee results.", "It doesn't track habits automatically, see your health data, or give medical advice.", true) +
      field("b-facts", "Facts you can prove (optional)", b.facts, "Features, prices, numbers. Only numbers written here can appear in a hook.", "Free to download. Streaks, reminders and friends. 4.8 stars from 1,200 ratings.", true) +
      '<div class="field"><label for="b-cat">Category</label><select id="b-cat">' +
      [["general", "General"], ["finance", "Finance or investing"], ["health", "Health or fitness"], ["dating", "Dating"], ["gambling", "Gambling or crypto"], ["kids", "For children"]]
        .map(function (x) { return opt(x[0], x[1], b.category || "general"); }).join("") +
      '</select><div class="hint">Some categories have extra ad rules. We\'ll flag them.</div></div>' +
      '<div class="row"><button class="btn pri" id="b-save" type="button">Save and add screens</button><button class="btn" id="b-save2" type="button">Save</button></div></div>');
    function collect() {
      var plats = Array.prototype.slice.call(document.querySelectorAll('input[name="b-plat"]:checked')).map(function (x) { return x.value; });
      return {
        name: val("b-name") || "Untitled app",
        brief: {
          name: val("b-name"), spoken_name: val("b-spoken"), one_liner: val("b-one"), platforms: plats.length ? plats : ["ios"],
          audience: val("b-aud"), action: val("b-act"), problem: val("b-prob"), outcome: val("b-out"),
          comp_known: val("b-ck"), comp_thing: val("b-ct"),
          comparison: val("b-ck") && val("b-ct") ? "It's like " + val("b-ck") + ", but for " + val("b-ct") : "",
          cant_do: val("b-cant"), facts: val("b-facts"), category: val("b-cat")
        }
      };
    }
    function save(next) {
      var f = collect();
      if (!f.brief.name || !f.brief.one_liner) { toast("Add the app name and what it does."); return; }
      saveProject(f).then(function () { toast("Saved"); if (next) go("screens"); else renderProject(); }).catch(fail);
    }
    document.getElementById("b-save").onclick = function () { save(true); };
    document.getElementById("b-save2").onclick = function () { save(false); };
  }

  /* ── 2. screens ──────────────────────────────────────────────── */
  function shots() { return S.assets.filter(function (a) { return a.kind !== "icon"; }); }
  function icon() { return S.assets.filter(function (a) { return a.kind === "icon"; })[0]; }
  function assetLabel(a) { return a.label || (a.kind === "recording" ? "Recording" : "Screen"); }

  function renderScreens() {
    var list = shots(), ic = icon();
    signed("studio-uploads", S.assets.map(function (a) { return a.path; })).then(function () {
      var tiles = list.map(function (a, i) {
        var u = link("studio-uploads", a.path);
        var media = a.kind === "recording"
          ? '<video src="' + esc(u) + '" muted playsinline loop preload="metadata"></video>'
          : '<img src="' + esc(u) + '" alt="" loading="lazy">';
        var portrait = !a.width || a.height > a.width;
        return '<figure class="shot" data-id="' + esc(a.id) + '">' + media +
          '<figcaption><input class="lbl" data-label="' + esc(a.id) + '" value="' + esc(a.label) + '" placeholder="What this shows" aria-label="Label">' +
          (a.kind === "screen" ? '<label class="check small"><input type="checkbox" data-bar="' + esc(a.id) + '"' + (a.status_bar ? " checked" : "") + "> Has the phone's status bar</label>" : '<span class="small muted">Screen recording</span>') +
          (portrait ? "" : '<span class="small bad">Landscape: phone screenshots work best</span>') +
          '<span class="row tight"><button class="btn small" data-up="' + i + '" type="button" aria-label="Move earlier"' + (i ? "" : " disabled") + ">↑</button>" +
          '<button class="btn small" data-down="' + i + '" type="button" aria-label="Move later"' + (i < list.length - 1 ? "" : " disabled") + ">↓</button>" +
          '<span class="spacer"></span><button class="btn small" data-del="' + esc(a.id) + '" type="button">Remove</button></span></figcaption></figure>';
      }).join("");
      pane('<div class="card"><h2>Your screens</h2><p class="muted small">Upload 5 to 10 screenshots taken on a phone or simulator, ideally with the status bar (time and battery) showing. ' +
        'A short screen recording (under 30 seconds) plays inside the phone in your video. Label each one: the script uses the labels.</p>' +
        '<label class="drop" for="up"><input id="up" type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime">' +
        "<b>Add screenshots or a recording</b><span class=\"small muted\">PNG, JPEG, WebP, MP4 or MOV, up to 50 MB each</span></label>" +
        '<div id="up-status" class="small muted" role="status"></div>' +
        (list.length ? '<div class="shots">' + tiles + "</div>" : '<p class="empty">No screens yet.</p>') + "</div>" +
        '<div class="card"><h2>App icon (optional)</h2><p class="muted small">Shown on the end card of every video.</p><div class="row">' +
        (ic ? '<img class="iconprev" src="' + esc(link("studio-uploads", ic.path)) + '" alt="App icon"><button class="btn small" data-del="' + esc(ic.id) + '" type="button">Remove</button>'
            : '<label class="btn" for="up-icon">Upload icon<input id="up-icon" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>') +
        "</div></div>" +
        '<div class="row"><button class="btn pri" id="s-next" type="button"' + (list.length >= 2 ? "" : " disabled") + '>Continue to hooks</button>' +
        (list.length >= 2 ? "" : '<span class="small muted">Add at least two screens to continue.</span>') + "</div>");
      document.getElementById("up").onchange = function (e) { addFiles(e.target.files, false); };
      var upi = document.getElementById("up-icon");
      if (upi) upi.onchange = function (e) { addFiles(e.target.files, true); };
      document.getElementById("s-next").onclick = function () { go("hooks"); };
      root.querySelectorAll("[data-label]").forEach(function (el) {
        el.onchange = function () {
          var a = find(el.getAttribute("data-label"));
          patch("studio_assets", a.id, { label: el.value.trim().slice(0, 80) }).then(function () { a.label = el.value.trim().slice(0, 80); }).catch(fail);
        };
      });
      root.querySelectorAll("[data-bar]").forEach(function (el) {
        el.onchange = function () {
          var a = find(el.getAttribute("data-bar"));
          patch("studio_assets", a.id, { status_bar: el.checked }).then(function () { a.status_bar = el.checked; }).catch(fail);
        };
      });
      root.querySelectorAll("[data-del]").forEach(function (el) {
        el.onclick = function () { removeAsset(find(el.getAttribute("data-del"))); };
      });
      root.querySelectorAll("[data-up],[data-down]").forEach(function (el) {
        el.onclick = function () {
          var i = Number(el.getAttribute("data-up") || el.getAttribute("data-down"));
          var j = el.hasAttribute("data-up") ? i - 1 : i + 1;
          var l = shots(), a = l[i], b = l[j];
          Promise.all([patch("studio_assets", a.id, { sort: j }), patch("studio_assets", b.id, { sort: i })]).then(function () {
            a.sort = j; b.sort = i;
            l.forEach(function (x, k) { if (x !== a && x !== b) x.sort = k; });
            S.assets.sort(function (x, y) { return x.sort - y.sort; });
            renderScreens();
          }).catch(fail);
        };
      });
      root.querySelectorAll(".shot video").forEach(function (v) {
        v.onmouseenter = function () { v.play().catch(function () {}); };
        v.onmouseleave = function () { v.pause(); };
      });
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
      if (n) toast(n === 1 ? "Uploaded" : n + " files uploaded");
      renderScreens();
    });
  }
  function removeAsset(a) {
    if (!a || !confirm("Remove " + assetLabel(a) + "?")) return;
    del("studio_assets", a.id).then(function () {
      authed(URL_ + "/storage/v1/object/studio-uploads", { method: "DELETE", body: JSON.stringify({ prefixes: [a.path] }) }).catch(function () {});
      S.assets = S.assets.filter(function (x) { return x.id !== a.id; });
      renderScreens();
    }).catch(fail);
  }

  /* ── hook lint: checks that work without AI ──────────────────── */
  function lint(text, b) {
    var out = [], t = String(text || "").trim(), low = t.toLowerCase(), n = words(t).length;
    var facts = String(b.facts || "").toLowerCase();
    if (n > 14) out.push(["warn", "Long: about " + (n / 2.6).toFixed(1) + " seconds to say. Aim for 12 words or fewer."]);
    var nums = t.match(/\d[\d,.]*\s*%?|\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|billion|double|twice|triple|tenfold)\b/gi) || [];
    nums.forEach(function (m) {
      var k = m.toLowerCase().trim(), digits = k.replace(/[,\s%]/g, "");
      var ok = facts.indexOf(k) >= 0 || (digits && facts.replace(/,/g, "").indexOf(digits) >= 0) ||
        (NUMWORDS[k] && facts.indexOf(String(NUMWORDS[k])) >= 0);
      if (!ok) out.push(["block", "Uses a number (\"" + m.trim() + "\") that isn't in your facts. Add it to the brief if it's true, or remove it."]);
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
    var stop = { doesn: 1, isn: 1, cannot: 1, won: 1, never: 1, about: 1, anyone: 1, their: 1, there: 1, which: 1, other: 1, people: 1, users: 1, without: 1, things: 1, really: 1, every: 1, track: 1 };
    var seen = {};
    String(b.cant_do || "").toLowerCase().split(/[^a-z']+/).forEach(function (w) {
      w = w.replace(/'s$/, "");
      if (w.length >= 5 && !stop[w] && !seen[w] && new RegExp("\\b" + w + "\\b").test(low)) {
        seen[w] = 1;
        out.push(["warn", "Mentions \"" + w + "\", and your brief says the app can't do or see that. Check the claim."]);
      }
    });
    var brand = BRANDS.filter(function (x) { return new RegExp("\\b" + x + "\\b").test(t); })[0];
    if (brand) out.push(["warn", "Uses another brand's name (" + brand + "). Fine as a comparison only: no logos or styling, and keep a fallback hook."]);
    if (POLICY[b.category]) out.push(["info", POLICY[b.category]]);
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

  /* ── 3. hooks ────────────────────────────────────────────────── */
  function renderHooks() {
    var b = brief(), sel = selectedHooks().length;
    var groups = CATEGORIES.map(function (c) {
      var hs = S.hooks.filter(function (h) { return (h.category || "custom") === c[0]; });
      if (!hs.length) return "";
      return '<h3 class="cat">' + esc(c[1]) + "</h3>" + hs.map(hookCard).join("");
    }).join("");
    var tmpl = CATEGORIES.filter(function (c) { return c[2]; }).map(function (c) {
      var text = c[2];
      if (c[0] === "comparison" && b.comp_known && b.comp_thing) text = "It's like " + b.comp_known + ", but for " + b.comp_thing + ".";
      return '<button class="chip" type="button" data-tmpl="' + esc(c[0]) + '" data-text="' + esc(text) + '">' + esc(c[1]) + "</button>";
    }).join("");
    pane('<div class="card"><div class="row"><h2>Hooks</h2><span class="spacer"></span><span class="small ' + (sel ? "good" : "muted") + '">' + sel + " of " + MAX_HOOKS + " picked</span></div>" +
      '<p class="muted small">The hook is the first line of each video: the only thing that changes between your ads. Pick three to five. ' +
      "A good hook passes the two-second test: a stranger can picture your app, or feel the problem, almost instantly.</p>" +
      '<div class="row" style="margin:14px 0"><button class="btn pri" id="h-ai" type="button">Suggest hooks with AI</button>' +
      '<button class="btn" id="h-check" type="button"' + (S.hooks.length ? "" : " disabled") + ">Check claims with AI</button>" +
      '<span class="small muted" id="h-status" role="status">' + (S.ai === false ? esc(ERRORS.ai_unavailable) : "") + "</span></div>" +
      '<div class="write"><h3>Write a hook</h3><div class="small muted" style="margin:4px 0 8px">Start from a pattern: ' + tmpl + "</div>" +
      '<div class="cols3"><div class="field"><label for="h-cat">Category</label><select id="h-cat">' +
      CATEGORIES.map(function (c) { return opt(c[0], c[1], "custom"); }).join("") + "</select></div>" +
      '<div class="field grow"><label for="h-text">Hook</label><input id="h-text" maxlength="160" placeholder="It\'s like Duolingo, but for your habits."></div>' +
      '<div class="field grow"><label for="h-ben">Benefit line for image ads (optional)</label><input id="h-ben" maxlength="140" placeholder="Streaks you can see make habits stick."></div></div>' +
      '<div id="h-live" class="lint"></div><button class="btn" id="h-add" type="button">Add hook</button></div></div>' +
      (S.hooks.length ? '<div class="card">' + groups + "</div>" : "") +
      '<div class="row"><button class="btn pri" id="h-next" type="button"' + (sel ? "" : " disabled") + ">Continue to the script</button></div>");

    var text = document.getElementById("h-text");
    text.oninput = function () { document.getElementById("h-live").innerHTML = lintHtml(lint(text.value, b), text.value.trim()); };
    root.querySelectorAll("[data-tmpl]").forEach(function (el) {
      el.onclick = function () {
        document.getElementById("h-cat").value = el.getAttribute("data-tmpl");
        text.value = el.getAttribute("data-text"); text.focus(); text.oninput();
      };
    });
    document.getElementById("h-add").onclick = function () {
      var t = text.value.trim();
      if (t.length < 3) { toast("Write the hook first."); return; }
      if (/\[[^\]]*\]/.test(t)) { toast("Replace the [brackets] with your own words."); return; }
      addHook({ category: val("h-cat"), text: t, benefit: val("h-ben"), source: "user" }).then(function () { renderHooks(); });
    };
    document.getElementById("h-ai").onclick = suggestHooks;
    document.getElementById("h-check").onclick = checkHooks;
    document.getElementById("h-next").onclick = function () { go("script"); };
    root.querySelectorAll("[data-pick]").forEach(function (el) {
      el.onchange = function () {
        var h = hookById(el.getAttribute("data-pick"));
        if (el.checked && selectedHooks().length >= MAX_HOOKS) { el.checked = false; toast("Pick up to five hooks. Unpick one first."); return; }
        patch("studio_hooks", h.id, { selected: el.checked }).then(function () { h.selected = el.checked; renderHooks(); }).catch(fail);
      };
    });
    root.querySelectorAll("[data-hedit]").forEach(function (el) {
      el.onchange = function () {
        var h = hookById(el.getAttribute("data-hedit")), field = el.getAttribute("data-field"), v = el.value.trim();
        if (field === "text" && v.length < 3) { el.value = h.text; return; }
        var f = {}; f[field] = v;
        if (field === "text") f.checks = [];
        patch("studio_hooks", h.id, f).then(function () { h[field] = v; if (field === "text") h.checks = []; renderHooks(); }).catch(fail);
      };
    });
    root.querySelectorAll("[data-hdel]").forEach(function (el) {
      el.onclick = function () {
        var h = hookById(el.getAttribute("data-hdel"));
        del("studio_hooks", h.id).then(function () { S.hooks = S.hooks.filter(function (x) { return x !== h; }); renderHooks(); }).catch(fail);
      };
    });
  }
  function hookById(id) { return S.hooks.filter(function (h) { return h.id === id; })[0]; }
  function lintHtml(list, text) {
    if (!text) return "";
    if (!list.length) return '<p class="lint-ok">Passes the automatic checks.</p>';
    return "<ul>" + list.map(function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + "</li>"; }).join("") + "</ul>";
  }
  function hookCard(h) {
    var full = selectedHooks().length >= MAX_HOOKS && !h.selected;
    return '<div class="hook' + (h.selected ? " on" : "") + '"><label class="pick"><input type="checkbox" data-pick="' + esc(h.id) + '"' +
      (h.selected ? " checked" : "") + (full ? " disabled" : "") + ' aria-label="Pick this hook"></label><div class="grow">' +
      '<input class="htext" data-hedit="' + esc(h.id) + '" data-field="text" value="' + esc(h.text) + '" maxlength="160" aria-label="Hook">' +
      '<input class="hben" data-hedit="' + esc(h.id) + '" data-field="benefit" value="' + esc(h.benefit) + '" maxlength="140" placeholder="Benefit line for image ads" aria-label="Benefit line">' +
      '<div class="lint">' + lintHtml(issues(h), h.text) + "</div></div>" +
      '<div class="hmeta"><span class="pill">' + esc(h.source === "ai" ? "AI" : h.source === "template" ? "Template" : "Yours") + "</span>" +
      '<button class="btn small link" data-hdel="' + esc(h.id) + '" type="button">Delete</button></div></div>';
  }
  function addHook(h) {
    return insert("studio_hooks", { project_id: S.project.id, category: h.category || "custom", text: h.text.slice(0, 160),
      benefit: (h.benefit || "").slice(0, 140), source: h.source || "user" }).then(function (row) { S.hooks.push(row); }).catch(fail);
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
  function suggestHooks() {
    var b = brief();
    if (!b.one_liner) { toast(ERRORS.brief_incomplete); return; }
    var btn = document.getElementById("h-ai"); btn.disabled = true;
    aiCall({ action: "suggest_hooks", brief: aiBrief() }, "Writing hooks… this takes up to a minute.").then(function (d) {
      var have = {};
      S.hooks.forEach(function (h) { have[h.text.toLowerCase()] = 1; });
      var chain = Promise.resolve();
      (d.hooks || []).forEach(function (h) {
        if (have[h.text.toLowerCase()]) return;
        chain = chain.then(function () { return addHook({ category: h.category, text: h.text, benefit: h.benefit, source: "ai" }); });
      });
      return chain.then(function () { toast((d.hooks || []).length + " hooks suggested. Pick your favourites."); renderHooks(); });
    }).catch(function (e) { fail(e); renderHooks(); });
  }
  function checkHooks() {
    var list = S.hooks.filter(function (h) { return h.selected; });
    if (!list.length) list = S.hooks.slice(0, 20);
    var btn = document.getElementById("h-check"); btn.disabled = true;
    aiCall({ action: "check_hooks", brief: aiBrief(), hooks: list.map(function (h) { return h.text; }) }, "Checking claims…").then(function (d) {
      var res = d.results || [];
      return Promise.all(list.map(function (h, i) {
        var r = res[i] || res.filter(function (x) { return x.text === h.text; })[0];
        if (!r) return null;
        h.checks = [r];
        return patch("studio_hooks", h.id, { checks: [r] });
      })).then(function () { toast("Claims checked."); renderHooks(); });
    }).catch(function (e) { fail(e); renderHooks(); });
  }

  /* ── 4. script and style ─────────────────────────────────────── */
  function platformCta() {
    var b = brief(), p = b.platforms || ["ios"], name = b.spoken_name || b.name || S.project.name;
    if (p.indexOf("ios") >= 0 && p.indexOf("android") >= 0) return ["Download " + name + " free today.", "Download free today"];
    if (p.indexOf("ios") >= 0) return ["Download " + name + " free on the App Store.", "Download free on the App Store"];
    if (p.indexOf("android") >= 0) return ["Get " + name + " free on Google Play.", "Get it free on Google Play"];
    return ["Try " + name + " free today.", "Try it free"];
  }
  function renderScript() {
    var sc = script(), list = shots(), ic = icon();
    if (!sc.body.length && list.length) {
      sc.body = list.slice(0, Math.min(3, list.length)).map(function (a, i) {
        return { say: "", head: "", screen: a.id, motion: a.kind === "recording" ? "play" : (i ? "page" : "rise") };
      });
    }
    var cta = platformCta();
    var screenOpts = function (cur, imagesOnly) {
      return list.filter(function (a) { return !imagesOnly || a.kind === "screen"; })
        .map(function (a) { return opt(a.id, assetLabel(a) + (a.kind === "recording" ? " (recording)" : ""), cur); }).join("");
    };
    var scenes = sc.body.map(function (s, i) {
      return '<div class="scene"><div class="row"><b>Scene ' + (i + 1) + '</b><span class="spacer"></span>' +
        '<button class="btn small" data-sup="' + i + '" type="button"' + (i ? "" : " disabled") + ' aria-label="Move earlier">↑</button>' +
        '<button class="btn small" data-sdown="' + i + '" type="button"' + (i < sc.body.length - 1 ? "" : " disabled") + ' aria-label="Move later">↓</button>' +
        '<button class="btn small" data-sdel="' + i + '" type="button">Remove</button></div>' +
        '<div class="field"><label>What the voice says</label><input data-s="' + i + '" data-f="say" maxlength="200" value="' + esc(s.say) + '" placeholder="Tick off a habit and watch your day fill up."></div>' +
        '<div class="cols3"><div class="field"><label>Heading on screen</label><input data-s="' + i + '" data-f="head" maxlength="40" value="' + esc(s.head) + '" placeholder="Tap to tick it off"></div>' +
        '<div class="field"><label>Screen</label><select data-s="' + i + '" data-f="screen">' + screenOpts(s.screen) + "</select></div>" +
        '<div class="field"><label>Motion</label><select data-s="' + i + '" data-f="motion">' +
        MOTIONS.map(function (m) { return opt(m[0], m[1], s.motion); }).join("") + "</select></div></div>" +
        (s.motion === "zoom" ? '<div class="field"><label>Zoom on</label><select data-s="' + i + '" data-f="zoomAt">' +
          ZOOMS.map(function (z) { return opt(z[0], z[1], s.zoomAt || "middle"); }).join("") + "</select></div>" : "") + "</div>";
    }).join("");
    var voices = VOICES.map(function (v) {
      return '<label class="voice' + (sc.voice.id === v[0] ? " on" : "") + '"><input type="radio" name="voice" value="' + v[0] + '"' + (sc.voice.id === v[0] ? " checked" : "") + ">" +
        "<b>" + v[1] + '</b><span class="small muted">' + v[2] + '</span><button class="btn small" type="button" data-play="' + v[3] + '" aria-label="Play ' + v[1] + '">Play</button></label>';
    }).join("");
    var op = sc.opening, th = sc.theme;
    pane('<div class="card"><div class="row"><h2>The script</h2><span class="spacer"></span><button class="btn" id="sc-ai" type="button">Draft with AI</button></div>' +
      '<p class="muted small">Every video shares this part, so your test compares only the hooks. Show the app solving the problem the moment the hook ends: 3 or 4 short scenes, each a concrete feature.</p>' +
      '<div class="small muted" id="sc-status" role="status"></div>' + scenes +
      '<button class="btn" id="sc-add" type="button"' + (sc.body.length >= 5 ? " disabled" : "") + ">Add a scene</button></div>" +

      '<div class="card"><h2>The end card</h2><div class="cols2">' +
      '<div class="field"><label for="sc-line">One line under your app\'s name</label><input id="sc-line" maxlength="60" value="' + esc(sc.end_line) + '" placeholder="Build habits that stick."></div>' +
      '<div class="field"><label for="sc-btn">Button</label><input id="sc-btn" maxlength="40" value="' + esc(sc.button || cta[1]) + '"></div>' +
      '<div class="field"><label for="sc-say">What the voice says at the end</label><input id="sc-say" maxlength="200" value="' + esc(sc.cta_say || cta[0]) + '"></div>' +
      '<div class="field"><label for="sc-head">Ad headline (for the ad platform)</label><input id="sc-head" maxlength="60" value="' + esc(sc.headline || ("Download " + (brief().name || S.project.name) + " free")) + '"></div>' +
      '<div class="field"><label for="sc-ben">Default benefit line for image ads</label><input id="sc-ben" maxlength="140" value="' + esc(sc.benefit) + '" placeholder="Used for hooks without their own"></div>' +
      '<div class="field"><label for="sc-disc">Disclaimer (optional)</label><input id="sc-disc" maxlength="120" value="' + esc(sc.disclaimer) + '" placeholder="Not medical advice."></div>' +
      "</div>" + (ic ? "" : '<p class="small muted">Tip: add your app icon on the Screens step to show it on the end card.</p>') + "</div>" +

      '<div class="card"><h2>Opening</h2><p class="muted small">The first second decides whether people keep watching, so something should already be moving on frame one.</p>' +
      [["hand", "A hand holding the phone, already swiping (recommended)"], ["phone", "The phone, already swiping"], ["rise", "Classic: the phone slides up"]].map(function (x) {
        return '<label class="check block"><input type="radio" name="op" value="' + x[0] + '"' + (op.style === x[0] ? " checked" : "") + "> " + x[1] + "</label>";
      }).join("") +
      '<div class="cols3" style="margin-top:10px">' + [0, 1, 2].map(function (i) {
        return '<div class="field"><label>Swipe ' + (i ? "to screen " + (i + 1) : "from screen 1") + '</label><select data-op="' + i + '">' +
          opt("", "Automatic", "") + screenOpts((op.screens || [])[i] || "", true) + "</select></div>";
      }).join("") + "</div></div>" +

      '<div class="card"><h2>Colours</h2><div class="cols3">' +
      '<div class="field"><label for="th-acc">Brand colour</label><input id="th-acc" type="color" value="' + esc(th.accent || "#FF7A2E") + '"></div>' +
      '<div class="field"><label for="th-style">Background</label><select id="th-style">' + opt("dark", "Dark", th.style) + opt("light", "Light", th.style) + "</select></div>" +
      '<div class="field"><label for="th-bg">Background colour (optional)</label><div class="row tight"><input id="th-bg-on" type="checkbox"' + (th.bg ? " checked" : "") + ' aria-label="Use my own background colour">' +
      '<input id="th-bg" type="color" value="' + esc(th.bg || "#1A0F15") + '"></div></div></div>' +
      '<p class="small muted">The accent is adjusted, if needed, so text stays readable against the background.</p></div>' +

      '<div class="card"><h2>Voice</h2><div class="voices">' + voices + "</div>" +
      '<div class="field" style="max-width:260px;margin-top:12px"><label for="v-speed">Pace</label><select id="v-speed">' +
      opt("1", "Natural", sc.voice.speed) + opt("1.1", "Brisk", sc.voice.speed) + opt("1.15", "Fast (best with a moving opening)", sc.voice.speed) + "</select></div>" +
      '<p class="small muted">Voices are AI-generated by ElevenLabs.</p></div>' +
      '<div class="row"><button class="btn pri" id="sc-save" type="button">Save and continue</button><button class="btn" id="sc-save2" type="button">Save</button></div>');

    root.querySelectorAll("[data-s]").forEach(function (el) {
      el.onchange = function () {
        var f = el.getAttribute("data-f");
        readScript();
        if (f === "motion" || f === "screen") renderScript();
      };
    });
    root.querySelectorAll("[data-sdel]").forEach(function (el) {
      el.onclick = function () { readScript(); sc.body.splice(Number(el.getAttribute("data-sdel")), 1); renderScript(); };
    });
    root.querySelectorAll("[data-sup],[data-sdown]").forEach(function (el) {
      el.onclick = function () {
        readScript();
        var i = Number(el.getAttribute("data-sup") || el.getAttribute("data-sdown")), j = el.hasAttribute("data-sup") ? i - 1 : i + 1;
        var t = sc.body[i]; sc.body[i] = sc.body[j]; sc.body[j] = t;
        renderScript();
      };
    });
    document.getElementById("sc-add").onclick = function () {
      readScript();
      var a = list[sc.body.length % Math.max(1, list.length)];
      sc.body.push({ say: "", head: "", screen: a ? a.id : "", motion: "page" });
      renderScript();
    };
    root.querySelectorAll("[data-play]").forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        if (S.playing) S.playing.pause();
        S.playing = new Audio("/assets/voices/" + el.getAttribute("data-play") + ".mp3");
        S.playing.play().catch(function () { toast("Couldn't play that sample."); });
      };
    });
    root.querySelectorAll('input[name="voice"]').forEach(function (el) {
      el.onchange = function () { readScript(); renderScript(); };
    });
    document.getElementById("sc-ai").onclick = draftScript;
    document.getElementById("sc-save").onclick = function () { saveScript(true); };
    document.getElementById("sc-save2").onclick = function () { saveScript(false); };
  }
  function readScript() {
    var sc = script();
    root.querySelectorAll("[data-s]").forEach(function (el) {
      sc.body[Number(el.getAttribute("data-s"))][el.getAttribute("data-f")] = el.value.trim();
    });
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : undefined; };
    if (document.getElementById("sc-line")) {
      sc.end_line = v("sc-line"); sc.button = v("sc-btn"); sc.cta_say = v("sc-say"); sc.headline = v("sc-head");
      sc.benefit = v("sc-ben"); sc.disclaimer = v("sc-disc");
      var op = root.querySelector('input[name="op"]:checked');
      sc.opening = { style: op ? op.value : "hand", screens: [0, 1, 2].map(function (i) { return (root.querySelector('[data-op="' + i + '"]') || {}).value || ""; }).filter(Boolean) };
      sc.theme = { style: v("th-style"), accent: v("th-acc") };
      if (document.getElementById("th-bg-on").checked) sc.theme.bg = v("th-bg");
      var voice = root.querySelector('input[name="voice"]:checked');
      sc.voice = { id: voice ? voice.value : VOICES[0][0], speed: Number(v("v-speed")) || 1 };
    }
    return sc;
  }
  function saveScript(next) {
    var sc = readScript();
    var bad = sc.body.filter(function (s) { return !s.say || !s.screen; }).length;
    if (next && sc.body.length < 2) { toast("Add at least two scenes."); return; }
    if (next && bad) { toast("Every scene needs words and a screen."); return; }
    saveProject({ script: sc }).then(function () { toast("Saved"); if (next) go("make"); else renderProject(); }).catch(fail);
  }
  function draftScript() {
    readScript();
    var list = shots();
    if (!list.length) { toast("Add your screens first."); return; }
    document.getElementById("sc-ai").disabled = true;
    aiCall({ action: "draft_script", brief: aiBrief(), screens: list.map(function (a) { return { id: a.id, label: assetLabel(a), kind: a.kind }; }) },
      "Drafting the script…").then(function (d) {
      var sc = script();
      if (d.body && d.body.length) sc.body = d.body;
      if (d.benefit && !sc.benefit) sc.benefit = d.benefit;
      if (d.end_line && !sc.end_line) sc.end_line = d.end_line;
      toast("Draft ready. Edit anything that isn't right.");
      renderScript();
    }).catch(function (e) { fail(e); renderScript(); });
  }

  /* ── 5. make the ads ─────────────────────────────────────────── */
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
      return { id: "h" + (i + 1) + "-" + (slug(h.category) || "hook"), say: h.text, benefit: h.benefit || sc.benefit || "", accent_from: accentFrom(h.text) };
    });
    var body = sc.body.map(function (s) {
      used[s.screen] = 1;
      var scene = { say: s.say, head: s.head, screen: s.screen, motion: s.motion };
      if (s.motion === "zoom") scene.zoom = (ZOOMS.filter(function (z) { return z[0] === (s.zoomAt || "middle"); })[0] || ZOOMS[1])[2];
      return scene;
    });
    (sc.opening.screens || []).forEach(function (k) { used[k] = 1; });
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
      opening: { style: sc.opening.style || "hand", motion: "page", screens: sc.opening.screens || [] },
      cta: { say: sc.cta_say || cta[0], button: sc.button || cta[1], lines: sc.end_line ? [sc.end_line] : [], headline: sc.headline || "" },
      voice: { id: sc.voice.id, speed: Number(sc.voice.speed) || 1 },
      disclaimer: sc.disclaimer || ""
    };
  }
  function problems() {
    var r = readiness(), out = [];
    if (!r.brief) out.push(["brief", "Finish the brief: the app name, what it does and what it can't do."]);
    if (!r.screens) out.push(["screens", "Add at least two screens."]);
    if (!r.hooks) out.push(["hooks", "Pick at least one hook."]);
    if (!r.script) out.push(["script", "Write at least two scenes, each with words and a screen."]);
    return out;
  }
  function batchFor(kind) {
    var spec = buildSpec(), key = JSON.stringify(spec);
    var reuse = S.batches.filter(function (b) {
      return b.status !== "queued" && b.status !== "running" && JSON.stringify(b.spec) === key && (kind === "preview" ? !b.preview : !b.result);
    })[0];
    if (reuse) return Promise.resolve(reuse);
    return insert("studio_batches", { project_id: S.project.id, spec: spec }).then(function (b) { S.batches.unshift(b); return b; });
  }
  function queue(kind) {
    if (kind === "pack" && packsLeft() < 1) { toast(ERRORS.no_packs_left); return; }
    var blocked = selectedHooks().filter(function (h) { return issues(h).some(function (x) { return x[0] === "block"; }); });
    if (blocked.length && !S.ack) { toast("Fix the flagged claims, or confirm they're true, first."); return; }
    var btn = document.getElementById(kind === "pack" ? "m-pack" : "m-prev");
    if (btn) btn.disabled = true;
    batchFor(kind).then(function (b) {
      return rpc("studio_queue", { p_batch: b.id, p_kind: kind });
    }).then(function () {
      toast(kind === "pack" ? "Your pack is queued." : "Preview queued.");
      return Promise.all([loadBatches(S.project.id), loadAccount()]);
    }).then(function () { renderProject(); startPoll(); }).catch(function (e) { fail(e); renderProject(); });
  }
  function renderMake() {
    var probs = problems(), hooks = selectedHooks(), sc = script();
    var flagged = hooks.filter(function (h) { return issues(h).some(function (x) { return x[0] === "block"; }); });
    var voice = VOICES.filter(function (v) { return v[0] === sc.voice.id; })[0] || VOICES[0];
    var left = packsLeft();
    var summary = probs.length
      ? '<div class="banner">' + probs.map(function (p) { return '<div>' + esc(p[1]) + ' <a href="#/app/' + esc(S.project.id) + "/" + p[0] + '">Fix</a></div>'; }).join("") + "</div>"
      : '<ul class="sum"><li><b>' + hooks.length + " hook" + (hooks.length === 1 ? "" : "s") + "</b>: " + hooks.map(function (h) { return "“" + esc(h.text) + "”"; }).join(", ") + "</li>" +
        "<li><b>" + sc.body.length + " scenes</b> shared by every video, voiced by " + esc(voice[1]) + "</li>" +
        "<li><b>You get</b> " + hooks.length + " vertical videos (1080×1920, captions burned in), 9:16 and 4:5 images, caption files, ad copy and a test plan, in one zip.</li></ul>";
    var ack = flagged.length ? '<div class="banner warn"><b>' + flagged.length + " picked hook" + (flagged.length === 1 ? " has" : "s have") + " a flagged claim.</b> " +
      'Fix it on the <a href="#/app/' + esc(S.project.id) + '/hooks">Hooks</a> step, or confirm it\'s true.' +
      '<label class="check block" style="margin-top:8px"><input type="checkbox" id="m-ack"' + (S.ack ? " checked" : "") + "> I've checked these claims are true and allowed for my app</label></div>" : "";
    pane('<div class="card"><h2>Make the ads</h2>' + summary + ack +
      '<div class="row" style="margin-top:14px"><button class="btn" id="m-prev" type="button"' + (probs.length ? " disabled" : "") + ">Preview the frames (free)</button>" +
      '<button class="btn pri" id="m-pack" type="button"' + (probs.length || left < 1 ? " disabled" : "") + ">Make the pack" + (left === Infinity ? "" : " (uses 1 of " + left + ")") + "</button></div>" +
      '<p class="small muted" style="margin-top:8px">A preview shows one frame from each scene of every video, in seconds, without using your pack. A pack takes a few minutes once it starts.</p></div>' +
      '<div id="batches">' + batchesHtml() + "</div>");
    var a = document.getElementById("m-ack");
    if (a) a.onchange = function () { S.ack = a.checked; };
    document.getElementById("m-prev").onclick = function () { queue("preview"); };
    document.getElementById("m-pack").onclick = function () { queue("pack"); };
    wireBatches();
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
            return '<div class="vid"><video controls playsinline preload="none" data-render-video="' + esc(base + "/videos/" + f.video) + '"></video>' +
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
    root.querySelectorAll("[data-render],[data-render-video],[data-dl]").forEach(function (el) {
      paths.push(el.getAttribute("data-render") || el.getAttribute("data-render-video") || el.getAttribute("data-dl"));
    });
    if (!paths.length) return;
    signed("studio-renders", paths).then(function () {
      root.querySelectorAll("[data-render]").forEach(function (el) { el.src = link("studio-renders", el.getAttribute("data-render")); });
      root.querySelectorAll("[data-render-video]").forEach(function (el) { el.src = link("studio-renders", el.getAttribute("data-render-video")); });
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
    if (!S.session) { renderAuth(/[?&]new=1/.test(location.search) ? "signup" : "signin"); return; }
    var m = location.hash.match(/^#\/app\/([0-9a-f-]{36})(?:\/(\w+))?/);
    if (!m) {
      loadProjects().then(renderApps).catch(function (e) { if (e.pg === "42P01" || e.pg === "PGRST205") setupNeeded(); else fail(e); });
      return;
    }
    S.step = m[2] || "brief";
    var load = S.project && S.project.id === m[1] ? Promise.resolve() : loadProject(m[1]);
    load.then(function () {
      renderProject();
      if (S.batches.some(function (b) { return b.status === "queued" || b.status === "running"; })) startPoll();
    }).catch(fail);
  }
  function boot() {
    loadSession();
    if (!S.session) { route(); return; }
    loadAccount().then(route).catch(function (e) {
      if (e.pg === "42P01" || e.pg === "PGRST205") setupNeeded(); else if (S.session) route();
    });
  }
  window.addEventListener("hashchange", route);
  boot();
})();
