/* ForgeLabs AI — behaviour shared by every page.
   Anything only one page needs stays inline on that page. Two copies of the
   same behaviour is how two pages end up different. */
(function(){
  "use strict";

  /* The page's watchdog checks for this. If this file never runs — blocked,
     cached 404, offline — the watchdog drops the .js class and un-hides
     everything rather than leaving the visitor a blank page below the fold. */
  window.__forge = 1;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── nav border on scroll ──────────────────────────────── */
  var nav = document.getElementById("nav");
  if(nav){
    var onScroll = function(){
      if(window.scrollY > 12) nav.classList.add("on");
      else nav.classList.remove("on");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, {passive:true});
  }

  /* ── mobile menu ───────────────────────────────────────────
     Below 900px the stylesheet hides .nav-links. Before this existed there was
     no replacement, so the site had no navigation at all on a phone. */
  var burger = document.querySelector(".burger");
  var menu = document.getElementById("menu");
  if(burger && menu){
    var open = false;

    function setOpen(next){
      open = next;
      document.body.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      menu.setAttribute("aria-hidden", open ? "false" : "true");
      if(open){
        var first = menu.querySelector("a,button");
        if(first) first.focus();
      } else {
        burger.focus();
      }
    }

    burger.addEventListener("click", function(){ setOpen(!open); });

    /* Any destination closes it. Most links here are in-page anchors, and
       leaving the overlay up over the target would strand the visitor. */
    menu.addEventListener("click", function(e){
      if(e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function(e){
      if(!open) return;
      if(e.key === "Escape"){ setOpen(false); return; }
      if(e.key !== "Tab") return;
      /* keep Tab inside the overlay while it covers the page */
      var items = menu.querySelectorAll("a,button");
      if(!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    });

    /* Resizing past the breakpoint hides the overlay in CSS; without this the
       body would stay scroll-locked with nothing visible to close. */
    window.addEventListener("resize", function(){
      if(open && window.innerWidth > 900) setOpen(false);
    }, {passive:true});
  }

  /* ── scroll reveals ───────────────────────────────────────
     Gated on html.js so that without scripting every .rv element is simply
     visible. Hiding by default and revealing with JS means one script error
     blanks the whole page. */
  var rv = document.querySelectorAll(".rv");
  if(rv.length){
    if(reduce || !("IntersectionObserver" in window)){
      rv.forEach(function(el){ el.classList.add("in"); });
    } else {
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if(!en.isIntersecting) return;
          var sibs = Array.prototype.slice.call(en.target.parentNode.children);
          var i = sibs.indexOf(en.target);
          en.target.style.transitionDelay = Math.min(i, 5) * 70 + "ms";
          en.target.classList.add("in");
          io.unobserve(en.target);
        });
      }, {threshold:.12, rootMargin:"0px 0px -8% 0px"});
      rv.forEach(function(el){ io.observe(el); });
    }
  }

  /* The 73-tile wall moved to /assets/motion.js, which scrubs it with scroll
     position instead of firing it once. Two systems driving the same tiles meant
     the one-shot kept overwriting the scrubbed state. */
})();
