/* ForgeLabs AI — motion system.

   Reference points: the Wix Studio "Digital Fatigue" blend-mode piece, the 80s
   Museum template, and The Story of Tiresias. What those three actually share,
   under the art direction, is five techniques:

     1. one scroll position driving everything, not a pile of listeners
     2. big display type revealed a word at a time behind a mask
     3. mix-blend-mode so layers interact instead of stacking
     4. sections that pin while their content advances (scrollytelling)
     5. marquees and letter-splits that make type behave like an object

   All five are implemented here in plain JS. No GSAP, no Lenis, no ScrollTrigger
   — this site ships zero dependencies to GitHub Pages and that is part of what it
   is selling. A library would be the easy way and the wrong advert.

   Rules this file obeys:
   - Nothing here may be the only carrier of meaning. Every effect enhances markup
     that already reads correctly on its own.
   - prefers-reduced-motion gets the finished state immediately, never a blank one.
   - One requestAnimationFrame loop. Scroll handlers only mark the frame dirty. */
(function(){
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine   = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var root   = document.documentElement;

  /* ── the single scroll loop ─────────────────────────────────────────────
     Everything that depends on scroll registers a callback here. One rAF, one
     layout read per frame, no competing listeners. */
  var tasks = [], dirty = true, vh = window.innerHeight, vw = window.innerWidth;

  function onScroll(){ dirty = true; }
  function onResize(){ vh = window.innerHeight; vw = window.innerWidth; dirty = true; }

  function frame(){
    if(dirty){
      dirty = false;
      for(var i = 0; i < tasks.length; i++) tasks[i]();
    }
    requestAnimationFrame(frame);
  }

  function register(fn){ tasks.push(fn); dirty = true; }

  /* progress of an element through the viewport, 0 before it enters, 1 after */
  function through(el){
    var r = el.getBoundingClientRect();
    return clamp((vh - r.top) / (vh + r.height));
  }
  /* progress of a pinned section: 0 when its top hits the top of the viewport,
     1 when its bottom reaches the bottom */
  function pinned(el){
    var r = el.getBoundingClientRect();
    var span = r.height - vh;
    if(span <= 0) return 0;
    return clamp(-r.top / span);
  }
  function clamp(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t){ return a + (b - a) * t; }

  /* ══ 1. grain + the ember light ═══════════════════════════════════════════
     A soft ember follows the pointer in `multiply`, so it darkens the paper and
     tints whatever it crosses rather than sitting on top as a glow. This is the
     one borrowed directly from the blend-mode reference. */
  function atmosphere(){
    var grain = document.createElement("div");
    grain.className = "grain";
    grain.setAttribute("aria-hidden", "true");
    document.body.appendChild(grain);

    if(!fine || reduce) return;

    var light = document.createElement("div");
    light.className = "emberlight";
    light.setAttribute("aria-hidden", "true");
    document.body.appendChild(light);

    var tx = vw * 0.7, ty = vh * 0.3, cx = tx, cy = ty;
    document.addEventListener("pointermove", function(e){
      tx = e.clientX; ty = e.clientY;
    }, {passive:true});

    /* eased follow — a light that snaps to the cursor reads as a bug */
    (function trail(){
      cx = lerp(cx, tx, 0.07);
      cy = lerp(cy, ty, 0.07);
      light.style.transform = "translate3d(" + (cx - 320) + "px," + (cy - 320) + "px,0)";
      requestAnimationFrame(trail);
    })();
  }

  /* ══ 2. cursor ring + magnetic buttons ════════════════════════════════════ */
  function cursor(){
    if(!fine || reduce) return;
    var ring = document.createElement("div");
    ring.className = "ring";
    ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(ring);
    root.classList.add("has-ring");

    var tx = -100, ty = -100, cx = tx, cy = ty;
    document.addEventListener("pointermove", function(e){ tx = e.clientX; ty = e.clientY; }, {passive:true});

    /* the ring grows over anything interactive */
    var hot = "a,button,summary,input,textarea,.panel,.tile-wall";
    document.addEventListener("pointerover", function(e){
      if(e.target.closest && e.target.closest(hot)) ring.classList.add("big");
    });
    document.addEventListener("pointerout", function(e){
      if(e.target.closest && e.target.closest(hot)) ring.classList.remove("big");
    });

    (function trail(){
      cx = lerp(cx, tx, 0.18); cy = lerp(cy, ty, 0.18);
      ring.style.transform = "translate3d(" + cx + "px," + cy + "px,0) translate(-50%,-50%)";
      requestAnimationFrame(trail);
    })();

    /* magnetic pull on the primary calls to action */
    [].forEach.call(document.querySelectorAll(".btn.pri, .magnet"), function(el){
      el.addEventListener("pointermove", function(e){
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = "translate(" + dx * 0.18 + "px," + dy * 0.26 + "px)";
      });
      el.addEventListener("pointerleave", function(){ el.style.transform = ""; });
    });
  }

  /* ══ 3. word-mask reveals ═════════════════════════════════════════════════
     Each word is wrapped in a clipping span and rises into place. The source
     text is never replaced, only re-wrapped, so selection, search and screen
     readers are unaffected — and <em> survives, which the hero depends on. */
  function splitWords(el){
    if(el.dataset.split) return;
    el.dataset.split = "1";
    var out = [];
    (function walk(node, em){
      for(var i = 0; i < node.childNodes.length; i++){
        var n = node.childNodes[i];
        if(n.nodeType === 3){
          var parts = n.textContent.split(/(\s+)/);
          for(var j = 0; j < parts.length; j++){
            if(!parts[j]) continue;
            if(/^\s+$/.test(parts[j])) out.push(" ");
            else out.push({w: parts[j], em: em});
          }
        } else if(n.nodeType === 1){
          walk(n, em || n.tagName === "EM");
        }
      }
    })(el, false);

    var html = "";
    var idx = 0;
    for(var k = 0; k < out.length; k++){
      if(out[k] === " "){ html += " "; continue; }
      html += '<span class="wm"><span class="wi" style="transition-delay:' +
              (idx * 42) + 'ms">' +
              (out[k].em ? '<em>' + out[k].w + '</em>' : out[k].w) +
              '</span></span>';
      idx++;
    }
    el.innerHTML = html;
  }

  function reveals(){
    var targets = document.querySelectorAll("[data-reveal]");
    if(!targets.length) return;
    if(reduce){
      [].forEach.call(targets, function(el){ el.classList.add("shown"); });
      return;
    }
    [].forEach.call(targets, splitWords);

    /* Driven from the scroll loop rather than an IntersectionObserver.
       A heading whose words are masked and never un-masked is an invisible
       heading, so this must not hang on an observer firing: the loop runs once on
       load, which reveals anything already on screen, and sweeps the rest in as
       they are scrolled to. */
    var pending = [].slice.call(targets);
    register(function(){
      if(!pending.length) return;
      for(var i = pending.length - 1; i >= 0; i--){
        var el = pending[i];
        var r = el.getBoundingClientRect();
        if(r.top < vh * 0.94 && r.bottom > 0){
          el.classList.add("shown");
          pending.splice(i, 1);
        }
      }
    });

    /* Last resort: if the loop somehow never reaches them, show everything rather
       than leave the page with holes where its headings should be. */
    setTimeout(function(){
      [].forEach.call(targets, function(el){ el.classList.add("shown"); });
      pending.length = 0;
    }, 4000);
  }

  /* ══ 4. marquee ═══════════════════════════════════════════════════════════
     The track is duplicated so the loop is seamless, and scroll direction flips
     which way it travels — a small thing that makes the page feel reactive. */
  function marquees(){
    [].forEach.call(document.querySelectorAll(".marquee"), function(m){
      var track = m.querySelector(".mq-track");
      if(!track) return;
      var copy = track.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      m.appendChild(copy);
      if(reduce) return;

      var x = 0, last = window.scrollY, dir = 1, speed = 0.6;
      register(function(){
        var now = window.scrollY;
        if(now !== last){ dir = now > last ? 1 : -1; last = now; }
      });
      (function run(){
        x -= speed * dir;
        var w = track.offsetWidth;
        if(w){
          if(x <= -w) x += w;
          if(x > 0) x -= w;
          track.style.transform = copy.style.transform = "translate3d(" + x + "px,0,0)";
        }
        requestAnimationFrame(run);
      })();
    });
  }

  /* ══ 5. the pinned funnel ═════════════════════════════════════════════════
     The centrepiece. A tall section whose stage sticks to the viewport while
     scroll advances a three-stage story: the click dies, the page catches it,
     the call gets answered.

     Pure position:sticky — the page never takes the scrollbar off the visitor,
     which is the part of scrollytelling that people actually hate. */
  function stage(){
    var sec = document.getElementById("journey");
    if(!sec) return;
    var steps  = sec.querySelectorAll(".jstep");
    var frames = sec.querySelectorAll(".jframe");
    var bar    = sec.querySelector(".jbar i");
    var n = steps.length;
    if(!n) return;

    function show(i){
      for(var k = 0; k < n; k++){
        steps[k].classList.toggle("on", k === i);
        if(frames[k]) frames[k].classList.toggle("on", k === i);
      }
      sec.setAttribute("data-stage", i);
    }

    /* Sequential is the shipped state and the markup already produces it, so
       this only has to opt *in* to the pinned variant. Runs from motion.js
       rather than the pre-paint script because that script executes at the top
       of <body>, where #journey does not exist yet. */
    function showAll(){
      for(var k = 0; k < n; k++){
        steps[k].classList.add("on");
        if(frames[k]) frames[k].classList.add("on");
      }
    }
    var wantPin = /[?&]journey=pin/.test(location.search);
    var canPin  = wantPin && !reduce && window.innerWidth > 900 &&
                  window.CSS && CSS.supports && CSS.supports("position", "sticky");
    if(!canPin){ showAll(); return; }
    sec.classList.add("pinned");

    var cur = -1;
    register(function(){
      var p = pinned(sec);
      var i = Math.min(n - 1, Math.floor(p * n * 0.999));
      if(i !== cur){ cur = i; show(i); }
      if(bar) bar.style.transform = "scaleY(" + p + ")";
    });
    show(0);
  }

  /* ══ 6. the tile wall ═════════════════════════════════════════════════════
     73 tiles, scrubbed by scroll instead of fired once. Scrolling back up
     un-marks them, so the visitor can replay the finding by moving the page.

     Correctness rule carried over from the original build: the 43 failing tiles
     carry .f in the HTML, so the true figure is in the markup. .scrub is only a
     temporary hold. If this function never runs, the wall already reads 43. */
  function wall(){
    var host = document.getElementById("scan73");
    if(!host) return;
    var tiles = host.querySelector(".tiles");
    var count = host.querySelector(".cnt");
    if(!tiles) return;
    var fails = [].slice.call(tiles.querySelectorAll("i.f"));
    var total = fails.length;

    if(reduce){
      fails.forEach(function(el){ el.classList.add("lit"); });
      if(count) count.textContent = total;
      return;
    }

    /* left-to-right, so it reads as a scan line rather than a random fizz */
    fails.sort(function(a, b){ return a.offsetLeft - b.offsetLeft; });
    tiles.classList.add("scrub");

    var shown = -1;
    register(function(){
      var r = host.getBoundingClientRect();
      if(r.top > vh || r.bottom < 0) return;
      /* map the element's travel through the lower half of the viewport to 0..1 */
      var p = clamp((vh * 0.85 - r.top) / (vh * 0.55));
      /* Once the wall is fully on screen it must read the true figure and stay
         there. Without this, a tall window or a short page can strand the scrub
         part-way and leave a visitor reading "15 of 73" — a number we never
         measured. The published finding is 43; the effect is never allowed to
         contradict it. */
      if(r.bottom <= vh) p = 1;
      var want = Math.round(total * p);
      if(want === shown) return;
      shown = want;
      for(var i = 0; i < total; i++) fails[i].classList.toggle("lit", i < want);
      if(count) count.textContent = want;
    });
  }

  /* 7. The horizontal ladder was removed — see the note in motion.css. The
     markup keeps its .rail class, which is now simply a vertical grid. */

  /* ══ 8. parallax drift ════════════════════════════════════════════════════ */
  function drift(){
    var els = document.querySelectorAll("[data-drift]");
    if(!els.length || reduce) return;
    register(function(){
      [].forEach.call(els, function(el){
        var amt = parseFloat(el.dataset.drift) || 40;
        el.style.transform = "translate3d(0," + ((through(el) - 0.5) * -amt * 2) + "px,0)";
      });
    });
  }

  /* ══ 9. counters tied to scroll ═══════════════════════════════════════════
     The figures are published research, so the HTML holds the true value and a
     settle timer independent of the frame loop guarantees it lands. Nothing here
     can leave a visitor reading a number we did not measure. */
  function counters(){
    var readout = document.getElementById("readout");
    if(!readout) return;
    var nums = [].slice.call(readout.querySelectorAll(".n"));

    function settle(){
      nums.forEach(function(el){
        el.textContent = el.dataset.to + (el.dataset.suf || "");
      });
    }
    if(reduce || !("IntersectionObserver" in window)){ settle(); return; }

    var io = new IntersectionObserver(function(es){
      if(!es[0].isIntersecting) return;
      io.disconnect();
      var t0 = null, dur = 1400, done = false;
      function finish(){ if(!done){ done = true; settle(); } }
      function tick(ts){
        if(done) return;
        if(t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        var e = 1 - Math.pow(1 - p, 3);
        nums.forEach(function(el){
          var to = parseInt(el.dataset.to, 10);
          el.textContent = (to === 0 ? 0 : Math.round(to * e)) + (el.dataset.suf || "");
        });
        if(p < 1) requestAnimationFrame(tick); else finish();
      }
      requestAnimationFrame(tick);
      setTimeout(finish, dur + 500);     // not tied to frame production
    }, {threshold:.35});
    io.observe(readout);
  }

  /* ══ 10. the self-check ═══════════════════════════════════════════════════
     The interactive beat, modelled on the symptom selector in the blend-mode
     reference. Three questions lifted straight from the report's closing
     section. It gives a real answer and then hands the visitor to the form. */
  function selfcheck(){
    var box = document.getElementById("selfcheck");
    if(!box) return;
    var opts = [].slice.call(box.querySelectorAll(".sc-opt"));
    var out  = box.querySelector(".sc-out");
    var txt  = box.querySelector(".sc-verdict");
    var cta  = box.querySelector(".sc-cta");
    if(!opts.length || !out) return;

    var verdicts = [
      ["Nothing obvious is broken.", "That puts you in the minority. Worth a second pair of eyes anyway."],
      ["One leak.", "One is enough to lose calls your ads already paid for. Usually a short fix."],
      ["Two leaks.", "The pattern we found most: money going out, little catching it on the other end."],
      ["All three.", "This is the exact case the audit was built around."]
    ];

    function update(){
      var hit = opts.filter(function(o){ return o.getAttribute("aria-pressed") === "true"; }).length;
      var v = verdicts[hit];
      box.setAttribute("data-hits", hit);
      out.classList.add("on");
      if(txt) txt.innerHTML = "<b>" + v[0] + "</b> " + v[1];
      if(cta) cta.textContent = hit >= 2 ? "Check my ads — it's free" : "Have us look anyway — free";
    }

    opts.forEach(function(o){
      o.addEventListener("click", function(){
        o.setAttribute("aria-pressed", o.getAttribute("aria-pressed") === "true" ? "false" : "true");
        update();
      });
    });
  }

  /* ── boot ──────────────────────────────────────────────────────────────── */
  window.addEventListener("scroll", onScroll, {passive:true});
  window.addEventListener("resize", onResize, {passive:true});

  atmosphere();
  cursor();
  reveals();
  marquees();
  stage();
  wall();
  drift();
  counters();
  selfcheck();

  requestAnimationFrame(frame);
  window.__motion = 1;
})();
