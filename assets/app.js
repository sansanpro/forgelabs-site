/* ForgeLabs app. Plain JavaScript and no build step, matching the rest of the site.

   Security rules for anyone editing this file:
   - Everything in a lead comes from scraped ads written by strangers. Text goes
     through esc() and links through href(). No exceptions.
   - The anon key is public by design. What protects data is row level security
     and the column grants in product/migrations/001_schema.sql. */
(function () {
  "use strict";

  var URL_ = "https://xhtwtnsvdmabfvewjgwz.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhodHd0bnN2ZG1hYmZ2ZXdqZ3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NzU5NDEsImV4cCI6MjEwOTQ1MTk0MX0.Zgurc8l1LXPRFqtfNgUNShBQLGJUWpsg-sQ-FOcr-t4";
  var SUPPORT = "hassan@forgelaboratory.net";

  var VERTICALS = [
    ["roofing", "Roofing"], ["hvac", "HVAC"], ["plumbing", "Plumbing"], ["electrical", "Electrical"],
    ["foundation_repair", "Foundation repair"], ["pest_control", "Pest control"], ["pool", "Pools"],
    ["landscaping", "Landscaping and tree"], ["fencing", "Fencing"], ["remodeling", "Remodeling"],
    ["garage_doors", "Garage doors"], ["cleaning", "Cleaning and pressure washing"],
    ["medspa", "Medspa"], ["dental", "Dental"], ["physical_therapy", "Physical therapy and chiro"],
    ["auto_repair", "Auto repair"], ["other", "Something else (type it below)"]
  ];
  var STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
  var LIMITS = { none: { leads: 0 }, starter: { leads: 200, send: false }, outreach: { leads: 200, send: true } };
  var ACCOUNT_COLS = "id,email,plan,sub_status,period_start,period_end,leads_used,credits_used,company,sender_name,website,booking_link,postal_address,offer_line,webhook_url,webhook_header_name,webhook_header_value,api_key_hint";
  var ERRORS = {
    no_active_plan: "Pick a plan first. Searches start once you're subscribed.",
    monthly_leads_used: "You've used this month's leads. They reset when your billing period does.",
    too_many_open_searches: "You already have three searches waiting. Give them a moment to finish.",
    bad_city: "Enter a city name.", bad_state: "Pick a state.", bad_vertical: "Pick a vertical.",
    bad_keyword: "That keyword is too long.",
    billing_not_configured: "Checkout isn't switched on yet. Email " + SUPPORT + " and we'll set up your account by hand.",
    billing_failed: "Stripe couldn't complete that. Try again in a minute.",
    plan_required: "Sending needs the Outreach plan.",
    address_required: "Add your company name and postal address in Settings first. The law requires them in every commercial email.",
    no_mailbox: "Connect your mailbox in Settings first.",
    suppressed: "This address has unsubscribed from your emails.",
    daily_limit: "You've reached today's sending limit of 50.",
    send_failed: "Your mail server refused the message.",
    lead_has_no_email: "This lead has no email address.",
    login_failed: "Your mail server refused that login. Gmail and Google Workspace need an app password.",
    bad_webhook_url: "Save an https webhook URL in Settings first.",
    bad_host: "That mail server name doesn't look right.", bad_from: "That from address doesn't look right.",
    missing_login: "Enter the mailbox username and password."
  };

  var S = {
    session: null, account: null, tab: "leads", searches: [], leads: [], templates: [], emailLog: [],
    filters: { q: "", grade: "", funnel: "", contact: "", search: "", status: "active" },
    selected: {}, open: null, poll: null, connection: undefined, justCreatedKey: null
  };
  var root = document.getElementById("root");

  /* ── helpers ─────────────────────────────────────────────────── */
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* Only web links ever become an href. A scraped javascript: URL stays text. */
  function href(u) {
    return /^https?:\/\//i.test(String(u || "")) ? esc(u) : "#";
  }
  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""; }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 3500);
  }
  function errText(code, fallback) { return ERRORS[code] || fallback || "Something went wrong. Try again."; }
  function vLabel(v) {
    var hit = VERTICALS.filter(function (x) { return x[0] === v; })[0];
    return hit ? hit[1] : v;
  }

  /* ── session and API ─────────────────────────────────────────── */
  function loadSession() {
    try { S.session = JSON.parse(localStorage.getItem("fl_session") || "null"); } catch (e) { S.session = null; }
  }
  function saveSession(s) {
    S.session = s;
    try {
      if (s) localStorage.setItem("fl_session", JSON.stringify(s));
      else localStorage.removeItem("fl_session");
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
        if (!r.ok) { var e = new Error((d && d.message) || "Request failed"); e.code = d && d.message; throw e; }
        return d;
      });
    });
  }
  function fn(name, opts) {
    return authed(URL_ + "/functions/v1/" + name, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, data: d };
      });
    });
  }

  function loadAccount() {
    return restJson("accounts?select=" + ACCOUNT_COLS).then(function (a) { S.account = a[0] || null; });
  }
  function loadSearches() {
    return restJson("searches?select=*&order=created_at.desc&limit=100").then(function (d) { S.searches = d; });
  }
  function loadLeads() {
    return restJson("leads?select=*&order=created_at.desc&limit=2000").then(function (d) { S.leads = d; });
  }
  function loadTemplates() {
    return restJson("templates?select=key,label,subject,body&order=key").then(function (d) { S.templates = d; });
  }

  function signOut() {
    saveSession(null);
    S.account = null; S.leads = []; S.searches = []; S.templates = []; S.selected = {}; S.open = null;
    clearInterval(S.poll);
    renderAuth("signin");
  }

  /* ── sign in ─────────────────────────────────────────────────── */
  function renderAuth(mode, notice) {
    var up = mode === "signup";
    root.innerHTML =
      '<div class="auth"><a class="brand" href="/"><i></i>ForgeLabs</a><div class="card">' +
      "<h1>" + (up ? "Create your account" : "Sign in") + "</h1>" +
      (notice ? '<p class="small muted">' + esc(notice) + "</p>" : "") +
      '<form id="authf" style="margin-top:16px" novalidate>' +
      '<div class="field"><label for="a-email">Work email</label><input id="a-email" type="email" autocomplete="email" required></div>' +
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
      var email = document.getElementById("a-email").value.trim();
      var pw = document.getElementById("a-pw").value;
      var err = document.getElementById("a-err");
      err.textContent = "";
      if (!email || !pw) { err.textContent = "Enter your email and password."; return; }
      if (up && pw.length < 10) { err.textContent = "Use at least 10 characters."; return; }
      var btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      authCall(up ? "signup" : "token?grant_type=password", { email: email, password: pw }).then(function (r) {
        btn.disabled = false;
        if (r.ok && r.data.access_token) { saveSession(r.data); boot(); return; }
        var m = r.data.msg || r.data.error_description || r.data.message;
        if (r.data.error_code === "invalid_credentials") m = "That email and password don't match.";
        if (r.data.error_code === "user_already_exists") m = "That email already has an account. Sign in instead.";
        err.textContent = m || "That didn't work. Try again.";
      }).catch(function () {
        btn.disabled = false;
        err.textContent = "We couldn't reach the server. Check your connection and try again.";
      });
    };
  }

  /* ── shell ───────────────────────────────────────────────────── */
  var TABS = [["leads", "Leads"], ["searches", "Searches"], ["templates", "Email templates"],
              ["settings", "Settings"], ["billing", "Billing"]];

  function shell(inner) {
    var tabs = TABS.map(function (t) {
      return '<a class="tab' + (S.tab === t[0] ? " on" : "") + '" href="#' + t[0] + '">' + t[1] + "</a>";
    }).join("");
    root.innerHTML = '<header class="top"><a class="brand" href="/"><i></i>ForgeLabs</a>' + tabs +
      '<span class="spacer"></span><button class="btn link" id="signout" type="button">Sign out</button></header>' +
      "<main>" + inner + "</main>";
    document.getElementById("signout").onclick = signOut;
  }

  function planActive() {
    var a = S.account;
    return a && a.plan !== "none" && ["active", "trialing", "comp"].indexOf(a.sub_status) >= 0;
  }
  function usage() {
    var a = S.account, lim = LIMITS[a.plan] || LIMITS.none;
    return { used: a.leads_used, total: lim.leads, left: Math.max(0, lim.leads - a.leads_used) };
  }
  function planBanner() {
    if (planActive()) return "";
    return '<div class="banner">Pick a plan to run searches. <a href="#billing">See plans</a></div>';
  }

  /* ── leads ───────────────────────────────────────────────────── */
  function has(v) { return !!String(v == null ? "" : v).trim(); }

  function filtered() {
    var f = S.filters, q = f.q.toLowerCase();
    return S.leads.filter(function (l) {
      if (f.status === "active" && l.status === "dismissed") return false;
      if (f.status && f.status !== "active" && l.status !== f.status) return false;
      if (f.grade && l.grade !== f.grade) return false;
      if (f.funnel && l.funnel_type !== f.funnel) return false;
      if (f.search && l.search_id !== f.search) return false;
      if (f.contact === "email" && !has(l.email)) return false;
      if (f.contact === "phone" && !has(l.phone)) return false;
      if (f.contact === "both" && !(has(l.email) && has(l.phone))) return false;
      if (q && (l.business + " " + (l.city || "") + " " + (l.vertical || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function selectedLeads() {
    var ids = Object.keys(S.selected).filter(function (k) { return S.selected[k]; });
    if (!ids.length) return filtered();
    return S.leads.filter(function (l) { return S.selected[l.id]; });
  }
  function opt(v, label, cur) {
    return '<option value="' + esc(v) + '"' + (cur === v ? " selected" : "") + ">" + esc(label) + "</option>";
  }

  function renderLeads() {
    var f = S.filters, rows = filtered();
    var funnels = {};
    S.leads.forEach(function (l) { if (l.funnel_type) funnels[l.funnel_type] = 1; });
    var nSel = Object.keys(S.selected).filter(function (k) { return S.selected[k]; }).length;
    var scope = nSel ? nSel + " selected" : rows.length + " shown";

    var body = rows.map(function (l) {
      return '<tr class="click" data-lead="' + esc(l.id) + '">' +
        '<td><input type="checkbox" aria-label="Select ' + esc(l.business) + '" data-sel="' + esc(l.id) + '"' + (S.selected[l.id] ? " checked" : "") + "></td>" +
        '<td><div class="name">' + esc(l.business) + '</div><div class="small muted">' + esc(vLabel(l.vertical)) + "</div></td>" +
        '<td class="nowrap">' + esc([l.city, l.state].filter(Boolean).join(", ")) + "</td>" +
        '<td><span class="pill ' + (l.grade === "A" ? "a" : "b") + '">' + esc(l.grade) + "</span></td>" +
        "<td>" + esc(FLExport.funnelLabel(l.funnel_type)) + "</td>" +
        '<td class="small">' + (has(l.email) ? esc(l.email) : '<span class="muted">No email</span>') + "<br>" +
        (has(l.phone) ? esc(l.phone) : '<span class="muted">No phone</span>') + "</td>" +
        '<td class="small muted nowrap">' + esc(l.status) + (l.pushed_at ? " · sent to CRM" : "") + "</td></tr>";
    }).join("");

    shell(
      '<div class="head"><div><h1>Leads</h1><div class="muted small">' + S.leads.length + " in your account</div></div>" +
      '<span class="spacer"></span><a class="btn pri" href="#searches">New search</a></div>' +
      planBanner() +
      '<div class="card"><div class="cols">' +
      '<div><label for="f-q">Search</label><input id="f-q" value="' + esc(f.q) + '" placeholder="Business, city or trade"></div>' +
      '<div><label for="f-grade">Grade</label><select id="f-grade">' + opt("", "Any", f.grade) + opt("A", "A: ready to send", f.grade) + opt("B", "B: needs a look", f.grade) + "</select></div>" +
      '<div><label for="f-funnel">Where the ad goes</label><select id="f-funnel">' + opt("", "Any", f.funnel) +
      Object.keys(funnels).sort().map(function (k) { return opt(k, FLExport.funnelLabel(k), f.funnel); }).join("") + "</select></div>" +
      '<div><label for="f-contact">Contact</label><select id="f-contact">' + opt("", "Any", f.contact) + opt("email", "Has email", f.contact) + opt("phone", "Has phone", f.contact) + opt("both", "Has both", f.contact) + "</select></div>" +
      '<div><label for="f-status">Status</label><select id="f-status">' + opt("active", "All but dismissed", f.status) + opt("new", "New", f.status) + opt("exported", "Exported", f.status) + opt("contacted", "Contacted", f.status) + opt("dismissed", "Dismissed", f.status) + "</select></div>" +
      "</div></div>" +
      '<div class="row" style="margin-bottom:12px"><span class="muted small" id="scope">' + esc(scope) + '</span><span class="spacer"></span>' +
      '<button class="btn" data-export="csv" type="button">CSV</button><button class="btn" data-export="xlsx" type="button">Excel</button>' +
      '<button class="btn" data-export="pdf" type="button">PDF report</button><button class="btn" data-export="docx" type="button">Word report</button>' +
      '<button class="btn" id="push" type="button">Send to CRM</button></div>' +
      '<div class="tablewrap"><table><thead><tr><th><input type="checkbox" id="sel-all" aria-label="Select all shown"></th><th>Business</th><th>Area</th><th>Grade</th><th>Where the ad goes</th><th>Contact</th><th>Status</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="7"><div class="empty">' + (S.leads.length ? "No leads match those filters." : 'No leads yet. <a href="#searches">Run your first search.</a>') + "</div></td></tr>") +
      "</tbody></table></div>"
    );

    [["f-q", "q"], ["f-grade", "grade"], ["f-funnel", "funnel"], ["f-contact", "contact"], ["f-status", "status"]].forEach(function (p) {
      var el = document.getElementById(p[0]);
      el.addEventListener(p[1] === "q" ? "input" : "change", function () {
        S.filters[p[1]] = el.value;
        var pos = el.selectionStart;
        renderLeads();
        var again = document.getElementById(p[0]);
        again.focus();
        if (p[1] === "q") again.setSelectionRange(pos, pos);
      });
    });
    document.getElementById("sel-all").onchange = function (e) {
      rows.forEach(function (l) { S.selected[l.id] = e.target.checked; });
      renderLeads();
    };
    root.querySelectorAll("[data-sel]").forEach(function (c) {
      c.addEventListener("click", function (e) { e.stopPropagation(); });
      c.addEventListener("change", function () { S.selected[c.getAttribute("data-sel")] = c.checked; renderLeads(); });
    });
    root.querySelectorAll("tr[data-lead]").forEach(function (tr) {
      tr.onclick = function () { openLead(tr.getAttribute("data-lead")); };
    });
    root.querySelectorAll("[data-export]").forEach(function (b) {
      b.onclick = function () { doExport(b.getAttribute("data-export")); };
    });
    document.getElementById("push").onclick = pushToCrm;
    if (S.open) renderDrawer();
  }

  /* ── one lead ────────────────────────────────────────────────── */
  function openLead(id) { S.open = id; renderDrawer(); }
  function closeDrawer() {
    S.open = null;
    var d = document.getElementById("drawer-host");
    if (d) d.remove();
  }

  function renderDrawer() {
    var l = S.leads.filter(function (x) { return x.id === S.open; })[0];
    if (!l) return;
    var old = document.getElementById("drawer-host");
    if (old) old.remove();
    var d = FLExport.draft(l, S.account, S.templates);
    var ev = FLExport.evidence(l), pf = FLExport.pageFindings(l);
    var canSend = planActive() && (LIMITS[S.account.plan] || {}).send;
    var host = document.createElement("div");
    host.id = "drawer-host";
    host.innerHTML = '<div class="scrim" id="d-scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(l.business) + '">' +
      '<div class="row"><h2 style="flex:1">' + esc(l.business) + '</h2><button class="btn link" id="d-close" type="button">Close</button></div>' +
      '<div class="small muted">' + esc(vLabel(l.vertical)) + " · " + esc([l.city, l.state].filter(Boolean).join(", ")) + " · checked " + esc(day(l.checked_at)) + "</div>" +
      '<div style="margin-top:8px"><span class="pill ' + (l.grade === "A" ? "a" : "b") + '">Grade ' + esc(l.grade) + "</span> " +
      (l.score_word ? '<span class="pill">' + esc(l.score_word) + "</span>" : "") + "</div>" +
      ((l.grade_notes || []).length ? '<p class="small muted">Worth checking: ' + esc(l.grade_notes.join("; ")) + "</p>" : "") +
      "<h3>Where the ad goes</h3><p>" + esc(FLExport.funnelLabel(l.funnel_type)) + (l.funnel_reason ? ': <span class="muted">' + esc(l.funnel_reason) + "</span>" : "") + "</p>" +
      (ev.length ? "<h3>What was found</h3><ul>" + ev.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") +
      (pf.length ? "<h3>On the landing page</h3><ul>" + pf.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") +
      "<h3>Check it yourself</h3><dl class=\"kv\">" +
      '<dt>The ad</dt><dd><a href="' + href(l.ad_url) + '" target="_blank" rel="noopener noreferrer">Ad Library ' + esc(l.ad_library_id) + "</a></dd>" +
      (l.page_url ? '<dt>Page</dt><dd><a href="' + href(l.page_url) + '" target="_blank" rel="noopener noreferrer">Facebook Page</a></dd>' : "") +
      (l.destination_url ? '<dt>Lands on</dt><dd><a href="' + href(l.destination_url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.destination_url) + "</a></dd>" : "") +
      "</dl>" +
      "<h3>Contact</h3><dl class=\"kv\">" +
      "<dt>Email</dt><dd>" + (has(l.email) ? esc(l.email) : '<span class="muted">Not found</span>') + "</dd>" +
      "<dt>Phone</dt><dd>" + (has(l.phone) ? esc(l.phone) : '<span class="muted">Not found</span>') + "</dd>" +
      "<dt>Website</dt><dd>" + (has(l.domain) ? esc(l.domain) : '<span class="muted">Not found</span>') + "</dd>" +
      (has(l.owner_name) ? "<dt>Owner</dt><dd>" + esc(l.owner_name) + ' <span class="muted small">(inferred from the email, so check it)</span></dd>' : "") +
      "</dl>" +
      (l.ad_text ? '<h3>The ad copy</h3><div class="adtext">' + esc(l.ad_text) + "</div>" : "") +
      "<h3>Email</h3>" + (d ?
        '<div class="field"><label for="d-subj">Subject</label><input id="d-subj" value="' + esc(d.subject) + '"></div>' +
        '<div class="field"><label for="d-body">Body</label><textarea id="d-body" style="min-height:240px">' + esc(d.body) + "</textarea></div>" +
        '<div class="row"><button class="btn" id="d-copy" type="button">Copy email</button>' +
        (canSend ? '<button class="btn pri" id="d-send" type="button"' + (has(l.email) ? "" : " disabled") + ">Send from my mailbox</button>" :
          '<a class="btn" href="#billing">Sending is on Outreach</a>') + "</div>" +
        (canSend ? '<p class="small muted">Your postal address and an unsubscribe link are added to the bottom automatically.' + (l.emailed_at ? " Sent " + esc(when(l.emailed_at)) + "." : "") + "</p>" : "")
        : '<p class="muted">No template fits this lead.</p>') +
      "<h3>Your notes</h3>" +
      '<textarea id="d-note" placeholder="Only you can see this.">' + esc(l.note || "") + "</textarea>" +
      '<div class="row" style="margin-top:10px"><button class="btn" id="d-savenote" type="button">Save note</button>' +
      '<button class="btn" id="d-dismiss" type="button">' + (l.status === "dismissed" ? "Restore" : "Dismiss") + "</button>" +
      '<button class="btn" id="d-dispute" type="button">' + (l.disputed ? "Finding is correct after all" : "This finding is wrong") + "</button></div>" +
      (l.disputed ? '<p class="small bad">You marked this finding as wrong.</p>' : "") +
      "</aside>";
    document.body.appendChild(host);
    document.getElementById("d-close").onclick = closeDrawer;
    document.getElementById("d-scrim").onclick = closeDrawer;
    document.getElementById("d-close").focus();
    var copy = document.getElementById("d-copy");
    if (copy) copy.onclick = function () {
      var txt = "Subject: " + document.getElementById("d-subj").value + "\n\n" + document.getElementById("d-body").value;
      navigator.clipboard.writeText(txt).then(function () { toast("Copied."); },
        function () { toast("Your browser blocked copying. Select the text instead."); });
    };
    var send = document.getElementById("d-send");
    if (send) send.onclick = function () {
      if (!window.confirm("Send this email to " + l.email + " from your mailbox?")) return;
      send.disabled = true;
      fn("email-send", { method: "POST", body: JSON.stringify({ lead_id: l.id,
        subject: document.getElementById("d-subj").value, body: document.getElementById("d-body").value }) })
        .then(function (r) {
          send.disabled = false;
          if (r.ok) {
            l.emailed_at = new Date().toISOString(); l.status = "contacted";
            toast("Sent."); renderDrawer();
          } else toast(errText(r.data.error));
        }).catch(function (e) { send.disabled = false; toast(e.message); });
    };
    document.getElementById("d-savenote").onclick = function () {
      var v = document.getElementById("d-note").value;
      updateLead(l, { note: v }, "Saved.");
    };
    document.getElementById("d-dismiss").onclick = function () {
      updateLead(l, { status: l.status === "dismissed" ? "new" : "dismissed" }, "Updated.");
    };
    document.getElementById("d-dispute").onclick = function () {
      updateLead(l, { disputed: !l.disputed }, "Updated.");
    };
  }

  function updateLead(l, patch, msg) {
    restJson("leads?id=eq." + encodeURIComponent(l.id), { method: "PATCH", body: JSON.stringify(patch) })
      .then(function () {
        Object.assign(l, patch);
        toast(msg);
        renderDrawer();
      }).catch(function () { toast("That didn't save. Try again."); });
  }

  /* ── export and CRM ──────────────────────────────────────────── */
  function download(name, type, data) {
    var url = URL.createObjectURL(new Blob([data], { type: type }));
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function doExport(kind) {
    var leads = selectedLeads();
    if (!leads.length) { toast("There are no leads to export."); return; }
    var stamp = new Date().toISOString().slice(0, 10);
    var name = "forgelabs-leads-" + stamp + "." + kind;
    var opts = { date: day(new Date().toISOString()), includeEmail: true };
    try {
      if (kind === "csv") download(name, "text/csv;charset=utf-8", "﻿" + FLExport.toCSV(leads, S.account, S.templates));
      if (kind === "xlsx") download(name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", FLExport.toXLSX(leads, S.account, S.templates));
      if (kind === "docx") download(name, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", FLExport.toDOCX(leads, S.account, S.templates, opts));
      if (kind === "pdf") {
        if (!window.jspdf) { toast("The PDF tool didn't load. Refresh and try again."); return; }
        download(name, "application/pdf", FLExport.toPDF(leads, S.account, S.templates, opts, window.jspdf.jsPDF));
      }
    } catch (e) {
      console.error(e);
      toast("That export failed. Try fewer leads, or another format.");
      return;
    }
    /* Mark what actually left the app, but never downgrade a contacted lead. */
    var ids = leads.filter(function (l) { return l.status === "new"; }).map(function (l) { return l.id; });
    if (ids.length) {
      restJson("leads?id=in.(" + ids.join(",") + ")", { method: "PATCH", body: JSON.stringify({ status: "exported" }) })
        .then(function () {
          leads.forEach(function (l) { if (l.status === "new") l.status = "exported"; });
          if (S.tab === "leads") renderLeads();
        }).catch(function () { /* the file is already downloaded; the label can wait */ });
    }
    toast(leads.length + (leads.length === 1 ? " lead" : " leads") + " exported.");
  }

  function pushToCrm() {
    if (!S.account.webhook_url) { toast("Add your webhook URL in Settings first."); location.hash = "settings"; return; }
    var leads = selectedLeads().slice(0, 200);
    if (!leads.length) { toast("There are no leads to send."); return; }
    if (!window.confirm("Send " + leads.length + " leads to " + S.account.webhook_url + "?")) return;
    toast("Sending…");
    fn("crm-push", { method: "POST", body: JSON.stringify({ lead_ids: leads.map(function (l) { return l.id; }) }) })
      .then(function (r) {
        if (!r.ok) { toast(errText(r.data.error)); return; }
        toast(r.data.sent + " sent" + (r.data.failed ? ", " + r.data.failed + " refused (your server answered " + r.data.last_status + ")" : "") + ".");
        return loadLeads().then(renderLeads);
      }).catch(function (e) { toast(e.message); });
  }

  /* ── searches ────────────────────────────────────────────────── */
  function renderSearches() {
    var u = usage();
    var rows = S.searches.map(function (s) {
      var st = s.stats || {};
      return "<tr><td><div class=\"name\">" + esc(s.keyword || vLabel(s.vertical)) + '</div><div class="small muted">' + esc(s.city) + ", " + esc(s.state) + "</div></td>" +
        '<td><span class="pill ' + esc(s.status) + '">' + esc(s.status) + "</span>" +
        (s.error ? '<div class="small muted" style="margin-top:4px;max-width:320px">' + esc(s.error) + "</div>" : "") + "</td>" +
        "<td>" + esc(s.leads_found) + " of " + esc(s.max_leads) + "</td>" +
        '<td class="small muted">' + (st.ads_seen != null ? esc(st.ads_seen) + " ads seen, " + esc(st.verified || 0) + " checked" + (st.rejected_quality ? ", " + esc(st.rejected_quality) + " failed the quality gate" : "") : "") + "</td>" +
        '<td class="small muted nowrap">' + esc(when(s.created_at)) + "</td>" +
        "<td>" + (s.leads_found ? '<button class="btn link" data-view="' + esc(s.id) + '" type="button">View</button>' : "") + "</td></tr>";
    }).join("");
    shell(
      '<div class="head"><div><h1>Searches</h1></div></div>' + planBanner() +
      '<div class="card"><h2>New search</h2>' +
      '<form id="sf" novalidate><div class="cols">' +
      '<div class="field"><label for="s-v">Vertical</label><select id="s-v">' + VERTICALS.map(function (v) { return opt(v[0], v[1], "roofing"); }).join("") + "</select></div>" +
      '<div class="field"><label for="s-city">City</label><input id="s-city" placeholder="Denver" maxlength="60"></div>' +
      '<div class="field"><label for="s-st">State</label><select id="s-st"><option value="">Choose</option>' + STATES.map(function (x) { return opt(x, x, ""); }).join("") + "</select></div>" +
      '<div class="field"><label for="s-max">Leads wanted</label><input id="s-max" type="number" min="1" max="' + Math.max(1, u.left) + '" value="' + Math.min(25, Math.max(1, u.left)) + '"></div>' +
      "</div>" +
      '<div class="field"><label for="s-kw">Extra keyword <span class="muted">(optional, or required for "something else")</span></label><input id="s-kw" maxlength="60" placeholder="metal roofing"></div>' +
      '<div class="row"><button class="btn pri" type="submit"' + (planActive() ? "" : " disabled") + ">Run search</button>" +
      '<span class="small muted">' + u.left + " of " + u.total + " leads left this period. One search can return just a handful, so try several cities and trades. It usually starts within 30 minutes and keeps running if you close this tab.</span></div>" +
      '<div class="err" id="s-err" role="alert"></div></form></div>' +
      '<div class="tablewrap"><table><thead><tr><th>Search</th><th>Status</th><th>Leads</th><th>Progress</th><th>Started</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6"><div class="empty">Nothing yet. Your searches will show up here.</div></td></tr>') +
      "</tbody></table></div>"
    );
    document.getElementById("sf").onsubmit = function (e) {
      e.preventDefault();
      var err = document.getElementById("s-err"); err.textContent = "";
      var vertical = document.getElementById("s-v").value;
      var keyword = document.getElementById("s-kw").value.trim();
      var city = document.getElementById("s-city").value.trim();
      var state = document.getElementById("s-st").value;
      var max = parseInt(document.getElementById("s-max").value, 10) || 50;
      if (!city) { err.textContent = "Enter a city."; return; }
      if (!state) { err.textContent = "Pick a state."; return; }
      if (vertical === "other" && !keyword) { err.textContent = "Type what you're looking for."; return; }
      var btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      restJson("rpc/create_search", { method: "POST", body: JSON.stringify({
        p_vertical: vertical === "other" ? keyword : vertical, p_keyword: keyword || null,
        p_city: city, p_state: state, p_max: max }) })
        .then(function () {
          fn("search-kick", { method: "POST", body: "{}" }).catch(function () {});
          toast("Search queued.");
          return loadSearches().then(renderSearches).then(startPolling);
        }).catch(function (x) {
          btn.disabled = false;
          err.textContent = errText(x.code, "That search couldn't be started.");
        });
    };
    root.querySelectorAll("[data-view]").forEach(function (b) {
      b.onclick = function () {
        S.filters.search = b.getAttribute("data-view");
        location.hash = "leads";
      };
    });
  }

  function startPolling() {
    clearInterval(S.poll);
    var open = S.searches.some(function (s) { return s.status === "queued" || s.status === "running"; });
    if (!open) return;
    S.poll = setInterval(function () {
      Promise.all([loadSearches(), loadLeads(), loadAccount()]).then(function () {
        if (S.tab === "searches") renderSearches();
        var still = S.searches.some(function (s) { return s.status === "queued" || s.status === "running"; });
        if (!still) clearInterval(S.poll);
      }).catch(function () { /* the next tick retries */ });
    }, 20000);
  }

  /* ── templates ───────────────────────────────────────────────── */
  var VARS = "greeting, business, trade, spend_line, domain, domain_note, finding, more_findings, phone_note, ad_id, ad_link, offer_line, sender_name, company, booking_link";

  function renderTemplates() {
    var cards = S.templates.map(function (t) {
      return '<div class="card"><h2>' + esc(t.label) + "</h2>" +
        '<div class="field"><label for="t-s-' + esc(t.key) + '">Subject</label><input id="t-s-' + esc(t.key) + '" value="' + esc(t.subject) + '"></div>' +
        '<div class="field"><label for="t-b-' + esc(t.key) + '">Body</label><textarea id="t-b-' + esc(t.key) + '" style="min-height:230px">' + esc(t.body) + "</textarea></div>" +
        '<button class="btn" data-save="' + esc(t.key) + '" type="button">Save</button></div>';
    }).join("");
    shell('<div class="head"><div><h1>Email templates</h1>' +
      '<div class="muted small" style="max-width:720px">The engine picks the template that matches what it found on each lead, then fills in the facts. Write the pitch in your own voice. A line whose variable comes out empty is removed.</div></div></div>' +
      '<div class="card small"><strong>Variables:</strong> <span class="mono">' + esc(VARS) + "</span>. Use them like <code>{{business}}</code>. Your name, company, offer and booking link come from <a href=\"#settings\">Settings</a>.</div>" +
      cards);
    root.querySelectorAll("[data-save]").forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-save");
        var patch = { subject: document.getElementById("t-s-" + k).value, body: document.getElementById("t-b-" + k).value, updated_at: new Date().toISOString() };
        restJson("templates?key=eq." + encodeURIComponent(k), { method: "PATCH", body: JSON.stringify(patch) })
          .then(function () {
            var t = S.templates.filter(function (x) { return x.key === k; })[0];
            Object.assign(t, patch); toast("Saved.");
          }).catch(function () { toast("That didn't save. Try again."); });
      };
    });
  }

  /* ── settings ────────────────────────────────────────────────── */
  function val(id) { return document.getElementById(id).value.trim(); }

  function renderSettings() {
    var a = S.account;
    var send = planActive() && (LIMITS[a.plan] || {}).send;
    var apiUrl = URL_ + "/functions/v1/leads-api";
    var c = S.connection;
    shell('<div class="head"><div><h1>Settings</h1></div></div>' +
      '<div class="card"><h2>You and your agency</h2><p class="small muted">These fill in your email templates and reports.</p>' +
      '<div class="cols">' +
      '<div class="field"><label for="p-name">Your name</label><input id="p-name" value="' + esc(a.sender_name) + '"></div>' +
      '<div class="field"><label for="p-co">Company</label><input id="p-co" value="' + esc(a.company) + '"></div>' +
      '<div class="field"><label for="p-site">Website</label><input id="p-site" value="' + esc(a.website) + '"></div>' +
      '<div class="field"><label for="p-book">Booking link</label><input id="p-book" value="' + esc(a.booking_link) + '" placeholder="https://cal.com/you/15min"></div></div>' +
      '<div class="field"><label for="p-offer">Your pitch, in a sentence or two</label><textarea id="p-offer" placeholder="We fix exactly this for local plumbers, usually within a week.">' + esc(a.offer_line) + "</textarea></div>" +
      '<div class="field"><label for="p-addr">Postal address</label><input id="p-addr" value="' + esc(a.postal_address) + '"><div class="hint">Commercial email must include one by law. It goes in the footer of anything sent from this app.</div></div>' +
      '<button class="btn pri" id="p-save" type="button">Save</button></div>' +

      '<div class="card"><h2>Send leads to your CRM</h2><p class="small muted">We POST each lead as JSON to this URL. Zapier and Make both give you a URL that accepts this ("Catch Hook" and "Custom Webhook").</p>' +
      '<div class="field"><label for="w-url">Webhook URL</label><input id="w-url" value="' + esc(a.webhook_url) + '" placeholder="https://hooks.zapier.com/..."></div>' +
      '<div class="cols"><div class="field"><label for="w-hn">Auth header name <span class="muted">(optional)</span></label><input id="w-hn" value="' + esc(a.webhook_header_name) + '" placeholder="Authorization"></div>' +
      '<div class="field"><label for="w-hv">Auth header value <span class="muted">(optional)</span></label><input id="w-hv" type="password" autocomplete="off" value="' + esc(a.webhook_header_value) + '"></div></div>' +
      '<button class="btn" id="w-save" type="button">Save webhook</button></div>' +

      '<div class="card"><h2>API</h2><p class="small muted">Or pull leads into your own systems.</p>' +
      "<pre>curl \"" + esc(apiUrl) + "?limit=100&amp;grade=A\" \\\n  -H \"Authorization: Bearer YOUR_API_KEY\"</pre>" +
      (S.justCreatedKey ? '<div class="banner">Your new key, shown once. Copy it now:<br><code id="newkey">' + esc(S.justCreatedKey) + "</code></div>" :
        (a.api_key_hint ? '<p class="small">Current key ends in <code>' + esc(a.api_key_hint) + "</code>.</p>" : '<p class="small muted">No key yet.</p>')) +
      '<button class="btn" id="k-rot" type="button">' + (a.api_key_hint ? "Replace my key" : "Create a key") + "</button></div>" +

      '<div class="card"><h2>Send from your mailbox</h2>' +
      (send ? (c === undefined ? '<p class="muted small">Checking…</p>' :
        (c ? '<p class="small good">Connected: ' + esc(c.from_email) + " through " + esc(c.host) + '.</p><button class="btn" id="m-del" type="button">Disconnect</button>' :
        '<p class="small muted">Connect a mailbox over SMTP on port 465. Gmail and Google Workspace use <code>smtp.gmail.com</code> with an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">app password</a>, not your normal password. We test the login before saving and store the password encrypted.</p>' +
        '<div class="cols"><div class="field"><label for="m-host">SMTP server</label><input id="m-host" value="smtp.gmail.com"></div>' +
        '<div class="field"><label for="m-user">Username</label><input id="m-user" autocomplete="off"></div>' +
        '<div class="field"><label for="m-pass">App password</label><input id="m-pass" type="password" autocomplete="off"></div>' +
        '<div class="field"><label for="m-from">From address</label><input id="m-from" type="email"></div>' +
        '<div class="field"><label for="m-name">From name</label><input id="m-name" value="' + esc(a.sender_name) + '"></div></div>' +
        '<button class="btn pri" id="m-save" type="button">Test and save</button>')) :
        '<p class="small muted">Sending is part of the Outreach plan. Every plan can draft, copy and export.</p><a class="btn" href="#billing">See plans</a>') +
      "</div>" +

      '<div class="card"><h2>Password</h2><div class="cols"><div class="field"><label for="pw-new">New password</label><input id="pw-new" type="password" autocomplete="new-password" minlength="10"></div></div>' +
      '<button class="btn" id="pw-save" type="button">Change password</button></div>'
    );
    document.getElementById("p-save").onclick = function () {
      saveAccount({ sender_name: val("p-name"), company: val("p-co"), website: val("p-site"),
        booking_link: val("p-book"), offer_line: val("p-offer"), postal_address: val("p-addr") });
    };
    document.getElementById("w-save").onclick = function () {
      var u = val("w-url");
      if (u && !/^https:\/\//i.test(u)) { toast("The webhook URL must start with https://"); return; }
      saveAccount({ webhook_url: u || null, webhook_header_name: val("w-hn") || null, webhook_header_value: val("w-hv") || null });
    };
    document.getElementById("k-rot").onclick = function () {
      if (S.account.api_key_hint && !window.confirm("Replace your key? The old one stops working right away.")) return;
      restJson("rpc/rotate_api_key", { method: "POST", body: "{}" }).then(function (k) {
        S.justCreatedKey = k;
        return loadAccount();
      }).then(renderSettings).catch(function () { toast("That didn't work. Try again."); });
    };
    document.getElementById("pw-save").onclick = function () {
      var p = document.getElementById("pw-new").value;
      if (p.length < 10) { toast("Use at least 10 characters."); return; }
      authed(URL_ + "/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: p }) }).then(function (r) {
        toast(r.ok ? "Password changed." : "That password wasn't accepted. Try a different one.");
        if (r.ok) document.getElementById("pw-new").value = "";
      });
    };
    if (send && c === undefined) {
      fn("email-settings", { method: "GET" }).then(function (r) {
        S.connection = (r.ok && r.data.connection) || null;
        if (S.tab === "settings") renderSettings();
      }).catch(function () { S.connection = null; });
    }
    var ms = document.getElementById("m-save");
    if (ms) ms.onclick = function () {
      ms.disabled = true;
      toast("Testing your login…");
      fn("email-settings", { method: "POST", body: JSON.stringify({ host: val("m-host"), username: val("m-user"),
        password: document.getElementById("m-pass").value, from_email: val("m-from"), from_name: val("m-name") }) })
        .then(function (r) {
          ms.disabled = false;
          if (r.ok) { S.connection = undefined; toast("Connected."); renderSettings(); }
          else toast(errText(r.data.error));
        }).catch(function (e) { ms.disabled = false; toast(e.message); });
    };
    var md = document.getElementById("m-del");
    if (md) md.onclick = function () {
      fn("email-settings", { method: "DELETE" }).then(function () { S.connection = null; renderSettings(); });
    };
  }

  function saveAccount(patch) {
    restJson("accounts?id=eq." + encodeURIComponent(S.account.id), { method: "PATCH", body: JSON.stringify(patch) })
      .then(function () { Object.assign(S.account, patch); toast("Saved."); })
      .catch(function () { toast("That didn't save. Try again."); });
  }

  /* ── billing ─────────────────────────────────────────────────── */
  function renderBilling() {
    var a = S.account, u = usage();
    function plan(key, name, price, items) {
      var cur = a.plan === key && planActive();
      return '<div class="plan' + (cur ? " cur" : "") + '"><h2>' + name + '</h2><div class="price">$' + price + "<small>/month</small></div><ul>" +
        items.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>" +
        (cur ? '<span class="pill done">Your plan</span>' : '<button class="btn pri" data-plan="' + key + '" type="button">' +
          (planActive() ? "Switch to " + name : "Choose " + name) + "</button>") + "</div>";
    }
    var manage = a.plan !== "none" && a.sub_status !== "comp";
    shell('<div class="head"><div><h1>Billing</h1></div></div>' +
      (planActive() ? '<div class="card"><h2>This period</h2><div>' + u.used + " of " + u.total + " leads used</div>" +
        '<div class="meter"><i style="width:' + Math.min(100, Math.round(100 * u.used / Math.max(1, u.total))) + '%"></i></div>' +
        (a.period_end ? '<div class="small muted" style="margin-top:6px">Resets ' + esc(day(a.period_end)) + "</div>" : "") +
        (a.sub_status === "comp" ? '<div class="small muted" style="margin-top:6px">Complimentary account</div>' : "") + "</div>" : "") +
      (a.sub_status === "past_due" ? '<div class="banner">Your last payment failed. Update your card to keep running searches.</div>' : "") +
      '<div class="plans">' +
      plan("starter", "Starter", 27, ["Up to 200 verified leads a month", "Audit and proof on every lead", "Email templates you control", "CSV, Excel, PDF and Word", "Webhook and API"]) +
      plan("outreach", "Outreach", 97, ["Everything in Starter", "Send from your own mailbox", "Up to 50 emails a day", "Automatic unsubscribe handling", "Send log and do-not-email list"]) +
      "</div>" +
      (manage ? '<div style="margin-top:16px"><button class="btn" id="portal" type="button">Manage card or cancel</button></div>' : ""));
    root.querySelectorAll("[data-plan]").forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        fn("billing-checkout", { method: "POST", body: JSON.stringify({ plan: b.getAttribute("data-plan") }) })
          .then(function (r) {
            b.disabled = false;
            if (r.ok && r.data.url) { location.href = r.data.url; return; }
            if (r.ok && r.data.changed) { toast("Plan changed."); setTimeout(function () { loadAccount().then(renderBilling); }, 2500); return; }
            toast(errText(r.data.error));
          }).catch(function (e) { b.disabled = false; toast(e.message); });
      };
    });
    var p = document.getElementById("portal");
    if (p) p.onclick = function () {
      fn("billing-checkout", { method: "POST", body: JSON.stringify({ action: "portal" }) }).then(function (r) {
        if (r.ok && r.data.url) location.href = r.data.url;
        else toast(errText(r.data.error));
      });
    };
  }

  /* ── routing and start ───────────────────────────────────────── */
  function route() {
    if (!S.session) return renderAuth("signin");
    if (!S.account) return;
    var t = location.hash.replace("#", "");
    S.tab = TABS.some(function (x) { return x[0] === t; }) ? t : "leads";
    closeDrawer();
    if (S.tab !== "settings") S.justCreatedKey = null;
    ({ leads: renderLeads, searches: renderSearches, templates: renderTemplates,
       settings: renderSettings, billing: renderBilling })[S.tab]();
    window.scrollTo(0, 0);
  }

  function boot() {
    if (!S.session) {
      return renderAuth(/[?&]new=1/.test(location.search) ? "signup" : "signin");
    }
    root.innerHTML = '<p class="boot">Loading your account…</p>';
    Promise.all([loadAccount(), loadSearches(), loadLeads(), loadTemplates()]).then(function () {
      if (!S.account) { signOut(); return; }
      route();
      startPolling();
    }).catch(function (e) {
      root.innerHTML = '<div class="auth"><div class="card"><h1>We couldn\'t load your account</h1><p>' + esc(e.message) +
        '</p><p class="small muted">If this keeps happening, email ' + esc(SUPPORT) + '.</p><button class="btn" id="retry" type="button">Try again</button></div></div>';
      document.getElementById("retry").onclick = boot;
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && S.open) closeDrawer();
  });
  window.addEventListener("hashchange", route);
  loadSession();
  boot();
})();
