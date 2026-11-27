/* Counts this page view, so launch traffic can be measured (supabase/migrations/20261127120000_site.sql).
   No cookie and nothing stored in the browser: it sends the page, the host of the site that sent
   the visitor and any utm_ tags in the link. The Studio calls flVisit("signup") and
   flVisit("pack") so those can be traced back to where the visitor came from. */
(function () {
  "use strict";

  var URL_ = "https://cuijqoorjgvlyiyizgxi.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1aWpxb29yamd2bHlpeWl6Z3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxNTUwMjMsImV4cCI6MjEwOTczMTAyM30.jwsfTktibmwUHKj3Gn6Ulk-TQJv__xczdQ5VgQvbXx8";
  /* Only the live site counts, and not browser tests (tests/*.mjs run with navigator.webdriver set) */
  var on = location.hostname === "forgelaboratory.net" && !navigator.webdriver;

  function send(event) {
    if (!on) return;
    var q = new URLSearchParams(location.search), ref = null;
    try {
      var r = new URL(document.referrer);
      if (r.hostname !== location.hostname) ref = r.hostname.replace(/^www\./, "");
    } catch (e) { /* no referrer */ }
    try {
      fetch(URL_ + "/rest/v1/rpc/site_visit", {
        method: "POST", keepalive: true,
        headers: { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_path: location.pathname, p_ref: ref, p_event: event || "view",
          p_utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") }
        })
      }).catch(function () {});
    } catch (e) { /* counting never gets in the way of the page */ }
  }

  window.flVisit = send;
  send("view");
})();
