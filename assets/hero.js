/* ForgeLabs AI — hero mechanisms.

   Two variants, both built here so they can be compared on the same page:

     data-hero="path"   (default) The click path. An ember dot runs from an ad
                        button to where the click actually lands. The top row is
                        what the audit kept finding — a Messenger sign-in wall.
                        The bottom row is what we build instead. Inline SVG, so
                        the whole diagram is still readable with scripting off;
                        this file only adds the travelling dot.

     data-hero="ember"  Forge and ember. A molten window: heat glow, rising
                        sparks, slow shimmer. Canvas, so it needs scripting —
                        .fig-ember carries a CSS gradient fallback for when it
                        is unavailable.

   Selected by the data-hero attribute on <body>, which the pre-paint script in
   the page sets from ?hero= before first paint. The switcher UI below is
   created only on localhost and can never appear on the live site.

   The old hero was a full-bleed particle field: motion that proved nothing.
   This exists to show the machinery, so it has to depict something real. */
(function(){
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var body = document.body;
  var VARIANTS = {path:1, ember:1, hole:1};
  var variant = VARIANTS[body.getAttribute("data-hero")] ? body.getAttribute("data-hero") : "hole";

  /* ── local-only variant switcher ───────────────────────────────────────
     Hostname-gated: on forgelaboratory.net this block does nothing at all, so
     there is no way for a review control to ship to a visitor. */
  (function switcher(){
    var h = location.hostname;
    var local = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "";
    if(!local) return;
    var box = document.createElement("div");
    box.className = "heroswitch on";
    box.innerHTML =
      '<span>Hero</span>' +
      '<a href="?hero=hole#hero"'  + (variant === "hole"  ? ' class="sel"' : '') + '>Black hole</a>' +
      '<a href="?hero=path#hero"'  + (variant === "path"  ? ' class="sel"' : '') + '>Click path</a>' +
      '<a href="?hero=ember#hero"' + (variant === "ember" ? ' class="sel"' : '') + '>Forge</a>';
    body.appendChild(box);
  })();

  if(variant === "hole")       blackHole();
  else if(variant === "ember") ember();
  else                         clickPath();

  /* ── variant C: the ember black hole ───────────────────────────────────
     Raymarched in raw WebGL by /assets/blackhole.js. If WebGL is missing, the
     shader fails to compile, or the context is lost, nothing is mounted and
     .fig-hole keeps the CSS gradient underneath it — a warm panel, not a hole
     in the page. */
  function blackHole(){
    var cv = document.getElementById("hole");
    if(!cv || !window.ForgeBlackHole) return;

    var bh = window.ForgeBlackHole(cv);
    if(!bh){ cv.style.display = "none"; return; }   // fall through to the gradient

    if(reduce){
      /* One frame, held. The disk is still legible standing still, which is the
         test for whether the motion was doing the work. */
      requestAnimationFrame(function(){ bh.still(); });
      window.addEventListener("resize", function(){ bh.still(); }, {passive:true});
      return;
    }

    var raf = null, running = false;
    function loop(now){
      if(!running) return;
      bh.draw(now);
      raf = requestAnimationFrame(loop);
    }
    function start(){ if(!running){ running = true; raf = requestAnimationFrame(loop); } }
    function stop(){
      running = false;
      if(raf !== null){ cancelAnimationFrame(raf); raf = null; }
    }
    window.addEventListener("resize", function(){ bh.resize(); }, {passive:true});
    pauseWhenUnseen(cv, start, stop, null);
  }

  /* ── variant A: the click path ─────────────────────────────────────────
     Everything meaningful is already in the DOM. This moves a dot along two
     <path>s and flags the endpoint each run. If it never executes, the visitor
     still sees both routes and both outcomes. */
  function clickPath(){
    var fig = document.querySelector(".fig-path");
    if(!fig) return;

    var legs = [
      { path: fig.querySelector("#cp1"), dot: fig.querySelector("#dot1"), end: fig.querySelector("#end1") },
      { path: fig.querySelector("#cp2"), dot: fig.querySelector("#dot2"), end: fig.querySelector("#end2") }
    ];
    /* getPointAtLength is the whole technique; without it, do nothing and leave
       the static diagram alone. */
    if(legs.some(function(l){ return !l.path || !l.dot || !l.end || !l.path.getPointAtLength; })) return;

    function place(leg, t){
      var p = leg.path.getPointAtLength(leg.path.getTotalLength() * t);
      leg.dot.setAttribute("transform", "translate(" + p.x.toFixed(2) + "," + p.y.toFixed(2) + ")");
    }

    /* Resting state: dots parked at their destinations, both outcomes flagged.
       This is also the reduced-motion state — the diagram reads correctly
       standing still, which is the test for whether the motion is decoration. */
    function settle(){
      legs.forEach(function(l){
        place(l, 1);
        l.dot.classList.add("vis");
        l.end.classList.add("on");
      });
    }

    if(reduce){ settle(); return; }

    var TRAVEL = 1500, HOLD = 1500, GAP = 420, LOOP = 1400;
    var raf = null, t0 = null, running = false;

    function reset(){
      legs.forEach(function(l){
        l.dot.classList.remove("vis");
        l.end.classList.remove("on");
        place(l, 0);
      });
    }

    /* One timeline, driven off a single rAF clock rather than chained timeouts:
       a backgrounded tab cannot leave it half-finished in a nonsense state. */
    var SPAN = (TRAVEL + HOLD + GAP) * 2 + LOOP;

    function frame(ts){
      if(!running) return;
      if(t0 === null) t0 = ts;
      var m = (ts - t0) % SPAN;

      for(var i = 0; i < 2; i++){
        var leg = legs[i];
        var start = i * (TRAVEL + HOLD + GAP);
        var local = m - start;
        if(local < 0 || local > TRAVEL + HOLD){
          leg.dot.classList.remove("vis");
          leg.end.classList.remove("on");
          place(leg, 0);
        } else if(local <= TRAVEL){
          var p = local / TRAVEL;
          leg.dot.classList.add("vis");
          leg.end.classList.remove("on");
          place(leg, p < 1 ? 1 - Math.pow(1 - p, 2) : 1);   // easeOutQuad
        } else {
          leg.dot.classList.add("vis");
          place(leg, 1);
          leg.end.classList.add("on");
        }
      }
      raf = requestAnimationFrame(frame);
    }

    function start(){ if(!running){ running = true; t0 = null; raf = requestAnimationFrame(frame); } }
    function stop(){
      running = false;
      if(raf !== null){ cancelAnimationFrame(raf); raf = null; }
    }

    reset();
    pauseWhenUnseen(fig, start, stop, settle);
  }

  /* ── variant B: forge and ember ────────────────────────────────────────
     A dark molten window on a cream page. Canvas only — .fig-ember keeps a CSS
     gradient underneath so a blocked script leaves a warm panel, not a hole. */
  function ember(){
    var cv = document.getElementById("forge");
    if(!cv || !cv.getContext) return;
    var ctx = cv.getContext("2d");
    var W = 0, H = 0, dpr = 1, sparks = [], raf = null, running = false, t = 0;

    function rr(x, y, w, h, r){
      if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function size(){
      var host = cv.parentElement;
      dpr = Math.min(window.devicePixelRatio || 1, 2);   // the main perf lever
      W = host.offsetWidth; H = host.offsetHeight;
      if(!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(Math.max(W / 9, 26), window.innerWidth < 760 ? 46 : 92));
      sparks = [];
      for(var i = 0; i < n; i++) sparks.push(spark(true));
    }

    function spark(seed){
      return {
        x: Math.random() * W,
        y: seed ? Math.random() * H : H + Math.random() * 30,
        vy: -(Math.random() * 0.42 + 0.14),
        vx: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.7 + 0.5,
        life: Math.random() * 0.6 + 0.4,
        ph: Math.random() * 6.28
      };
    }

    function draw(){
      if(!running) return;
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      rr(0, 0, W, H, 6);
      ctx.clip();

      /* struck-metal base, cooling from the bottom up */
      var base = ctx.createLinearGradient(0, 0, 0, H);
      base.addColorStop(0,   "#1A1512");
      base.addColorStop(0.55, "#241A14");
      base.addColorStop(1,   "#3A1C0C");
      ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

      /* the heat itself: two offset glows breathing out of phase, which reads as
         convection rather than as a pulsing light */
      var g1 = ctx.createRadialGradient(W * 0.5, H * 1.02, 0, W * 0.5, H * 1.02, H * (0.82 + Math.sin(t * 0.55) * 0.05));
      g1.addColorStop(0,    "rgba(255,138,24,.80)");
      g1.addColorStop(0.35, "rgba(217,74,10,.34)");
      g1.addColorStop(1,    "rgba(217,74,10,0)");
      ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

      var g2 = ctx.createRadialGradient(W * (0.28 + Math.sin(t * 0.33) * 0.05), H * 0.95, 0, W * 0.3, H * 0.95, H * 0.5);
      g2.addColorStop(0, "rgba(255,196,86,.40)");
      g2.addColorStop(1, "rgba(255,150,30,0)");
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

      /* Shimmer: bands of warmer air drifting up through the heat. Each one is a
         gradient that fades out at both edges — drawn as flat rects they banded
         into visible horizontal stripes rather than reading as convection. */
      for(var b = 0; b < 5; b++){
        var bh = 26 + Math.sin(t * 0.9 + b) * 10;
        var by = H - ((t * 16 + b * H / 5) % (H * 1.15));
        var sg = ctx.createLinearGradient(0, by, 0, by + bh);
        sg.addColorStop(0,   "rgba(255,217,160,0)");
        sg.addColorStop(0.5, "rgba(255,217,160,.055)");
        sg.addColorStop(1,   "rgba(255,217,160,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(0, by, W, bh);
      }

      /* rising sparks */
      for(var i = 0; i < sparks.length; i++){
        var s = sparks[i];
        s.y += s.vy;
        s.x += s.vx + Math.sin(t * 1.5 + s.ph) * 0.17;
        s.vy -= 0.0008;                                  // they accelerate as they rise
        var up = 1 - s.y / H;                            // fade out toward the top
        var a = Math.max(0, Math.min(1, (1 - up * 1.12))) * s.life
              * (0.7 + Math.sin(t * 7 + s.ph) * 0.3);    // flicker
        if(s.y < -12 || s.x < -12 || s.x > W + 12){ sparks[i] = spark(false); continue; }
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = up > 0.55 ? "#FFE3B0" : "#FF9A2E";
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      /* a hairline rim so the panel sits as an object on the page */
      rr(0.5, 0.5, W - 1, H - 1, 6);
      ctx.strokeStyle = "rgba(255,170,90,.26)"; ctx.lineWidth = 1; ctx.stroke();

      raf = requestAnimationFrame(draw);
    }

    /* reduced motion: one frame, then stop. Still a forge, just not a moving one. */
    function once(){
      running = true; draw(); running = false;
      if(raf !== null){ cancelAnimationFrame(raf); raf = null; }
    }

    function start(){ if(!running){ running = true; raf = requestAnimationFrame(draw); } }
    function stop(){
      running = false;
      if(raf !== null){ cancelAnimationFrame(raf); raf = null; }
    }

    size();
    window.addEventListener("resize", function(){
      var was = running;
      stop(); size();
      if(reduce) once(); else if(was) start();
    }, {passive:true});

    if(reduce){ once(); return; }
    pauseWhenUnseen(cv, start, stop, once);
  }

  /* Shared lifecycle: run only while on screen and the tab is visible, so an
     unread hero costs nothing. onIdle is what to leave behind when stopping for
     good — the resting state, never a blank frame. */
  function pauseWhenUnseen(el, start, stop, onIdle){
    var seen = true, shown = true;
    function sync(){
      if(seen && shown) start();
      else { stop(); if(onIdle) onIdle(); }
    }
    document.addEventListener("visibilitychange", function(){
      shown = !document.hidden; sync();
    });
    if("IntersectionObserver" in window){
      new IntersectionObserver(function(es){
        seen = es[0].isIntersecting; sync();
      }, {threshold:0}).observe(el);
    } else {
      start();
    }
    sync();
  }
})();
