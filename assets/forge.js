/* ForgeLabs AI — behaviour shared by every page.
   Page-specific effects (the hero particle field, the animated counters, the
   lead form) stay inline on the page that owns them. Only what both pages need
   lives here, for the same reason the CSS was extracted: so they can't drift.

   The `.js` class itself is set by a tiny inline script at the top of <body>,
   not here — it has to land before first paint or reveal-hidden elements flash
   visible before this file has even been fetched. */
(function () {
  "use strict";

  /* Tells the inline bootstrap's watchdog that this file arrived and ran. If
     this never gets set, the page un-hides itself rather than staying blank. */
  window.__forge = 1;

  var reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* nav border appears once the page has moved off the top */
  var nav = document.getElementById("nav");
  if (nav) {
    addEventListener("scroll", function () {
      nav.classList.toggle("on", scrollY > 12);
    }, { passive: true });
  }

  /* scroll reveals */
  var rv = document.querySelectorAll(".rv");
  if (reduce || !("IntersectionObserver" in window)) {
    rv.forEach(function (el) { el.classList.add("in"); });
  } else {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    rv.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 4, 3) * 70 + "ms";
      ro.observe(el);
    });
  }
})();
