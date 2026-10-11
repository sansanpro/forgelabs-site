/* ForgeLabs AI — ember black hole.

   A raymarched Schwarzschild black hole in raw WebGL. No Three.js, no React, no
   build step: this site ships zero dependencies to GitHub Pages, and for an
   agency whose pitch is "we build the thing", that is part of the argument.

   The physics the fragment shader actually models, per pixel:

     1. PHOTON GEODESICS. Each ray is integrated with
        acc = -1.5 * h^2 * p / r^5, h being the ray's conserved angular momentum.
        Light genuinely bends, so the far side of the disk is lifted over the top
        and under the bottom. The step size scales with r, so the integrator takes
        fine steps near the photon sphere where the deflection is violent and
        coarse ones out in the flat field — that is what resolves the higher-order
        photon rings instead of smearing them.

     2. ISCO. The disk starts at the innermost stable circular orbit, 3 Rs for
        Schwarzschild, rather than at an arbitrary radius.

     3. SHAKURA-SUNYAEV TEMPERATURE. T(r) ~ (Risco/r)^3/4 * (1 - sqrt(Risco/r))^1/4,
        which peaks a little outside the ISCO and falls away outward — the reason
        a real disk has a bright annulus rather than a hot inner edge.

     4. RELATIVISTIC BEAMING. The gas orbits at a large fraction of c, so the limb
        rotating toward the camera is Doppler boosted. Bolometric intensity goes
        as the fourth power of the Doppler factor, which is why one side of a real
        image is overwhelmingly brighter — not the gentle linear tilt a naive
        implementation produces.

     5. GRAVITATIONAL REDSHIFT. sqrt(1 - Rs/r), folded into the same factor, so
        light climbing out of the well is dimmed and reddened.

     6. OPACITY. Emission accumulates against a transmittance term, so the near
        side of the disk occludes the lensed image behind it. Without this the
        disk is a transparent smear and the depth reads wrong.

   Colour is the one deliberate departure. A real thin disk at these temperatures
   runs blue-white; the ramp here is held in the brand's ember while keeping the
   same luminance structure, so the physics drives the form and the palette drives
   the hue.

   Exposed as window.ForgeBlackHole(canvas); hero.js owns the lifecycle so this
   only runs while it is actually on screen. */
(function(){
  "use strict";

  var VERT = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec2  uRes;",
    "uniform float uTime;",
    "uniform vec2  uMouse;",
    "uniform float uFade;",
    "uniform vec2  uOff;",

    "#define STEPS 170",
    "#define RS    0.46",
    "#define RISCO (3.0 * RS)",      /* innermost stable circular orbit */
    "#define ROUT  (12.5 * RS)",      /* outer edge of the modelled disk */

    "float hash21(vec2 p){",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",
    "float vnoise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash21(i);",
    "  float b = hash21(i + vec2(1.0, 0.0));",
    "  float c = hash21(i + vec2(0.0, 1.0));",
    "  float d = hash21(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0, a = 0.5;",
    "  for(int i = 0; i < 5; i++){",
    "    v += a * vnoise(p);",
    "    p = p * 2.02 + 17.3;",
    "    a *= 0.5;",
    "  }",
    "  return v;",
    "}",

    /* Ember-biased blackbody ramp. Luminance structure of a real thermal
       spectrum; hue held in the brand. */
    "vec3 bb(float t){",
    "  t = clamp(t, 0.0, 1.0);",
    "  vec3 c = mix(vec3(0.16, 0.020, 0.004), vec3(0.72, 0.15, 0.018), smoothstep(0.00, 0.28, t));",
    "  c = mix(c, vec3(1.00, 0.40, 0.085), smoothstep(0.24, 0.54, t));",
    "  c = mix(c, vec3(1.00, 0.68, 0.290), smoothstep(0.50, 0.78, t));",
    "  c = mix(c, vec3(1.00, 0.91, 0.740), smoothstep(0.78, 1.00, t));",
    "  return c;",
    "}",

    "mat3 rotX(float a){ float s = sin(a), c = cos(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }",
    "mat3 rotY(float a){ float s = sin(a), c = cos(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }",

    "void main(){",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - uOff;",

    "  float tilt = 0.20 + uMouse.y * 0.17 + sin(uTime * 0.09) * 0.028;",
    "  float yaw  = uMouse.x * 0.34 + uTime * 0.018;",
    "  mat3 cam = rotY(yaw) * rotX(tilt);",

    "  vec3 ro = cam * vec3(0.0, 0.0, -11.5);",
    "  vec3 rd = normalize(cam * vec3(uv, 1.25));",

    "  vec3 hv = cross(ro, rd);",
    "  float h2 = dot(hv, hv);",

    "  vec3 p = ro, v = rd;",
    "  vec3 col = vec3(0.0);",
    "  float trans = 1.0;",            /* light still getting through */
    "  float captured = 0.0;",

    "  for(int i = 0; i < STEPS; i++){",
    "    float r2 = dot(p, p);",
    "    float r  = sqrt(r2);",
    "    if(r < RS * 1.02){ captured = 1.0; break; }",
    "    if(r > 30.0 && dot(v, p) > 0.0) break;",
    "    if(trans < 0.012) break;",

    /* fine steps near the photon sphere, coarse ones far out */
    "    float dt = clamp(0.055 * r, 0.022, 0.34);",

    "    vec3 prev = p;",
    "    vec3 acc = -1.5 * h2 * p / pow(r2, 2.5);",
    "    v += acc * dt;",
    "    p += v * dt;",

    "    if(prev.y * p.y < 0.0){",
    "      float f = prev.y / (prev.y - p.y);",
    "      vec3 q = mix(prev, p, f);",
    "      float rad = length(q.xz);",
    "      if(rad > RISCO && rad < ROUT){",

    /* Shakura-Sunyaev thin-disk temperature, normalised so its peak is ~1 */
    "        float u  = RISCO / rad;",
    "        float Tr = pow(u, 0.75) * pow(max(1.0 - sqrt(u), 0.0), 0.25) / 0.488;",

    /* Keplerian orbital speed, then the relativistic Doppler factor */
    "        float beta = min(sqrt(0.5 * RS / rad), 0.80);",
    "        float gam  = 1.0 / sqrt(1.0 - beta * beta);",
    "        vec3  orb  = normalize(vec3(-q.z, 0.0, q.x));",
    "        float ca   = dot(orb, normalize(-v));",
    "        float dop  = 1.0 / (gam * (1.0 - beta * ca));",
    /* and the climb out of the well */
    "        float grav = sqrt(max(1.0 - RS / rad, 0.02));",
    "        float g    = dop * grav;",

    /* turbulent gas, sheared at the local Keplerian rate */
    "        float ang  = atan(q.z, q.x);",
    "        float spin = uTime * 1.05 / pow(rad, 1.5);",
    "        float n1 = fbm(vec2(ang * 2.1 + spin * 3.0, rad * 1.8));",
    "        float n2 = fbm(vec2(ang * 4.4 - spin * 4.4, rad * 3.2 + 11.0));",
    "        float dens = 0.42 + 0.78 * (n1 * 0.62 + n2 * 0.46);",
    "        dens *= smoothstep(RISCO, RISCO * 1.30, rad);",
    "        dens *= smoothstep(ROUT, ROUT * 0.60, rad);",

    /* bolometric beaming goes as the fourth power of the shift */
    "        float g2 = g * g;",
    "        float emit = Tr * dens * g2 * g2;",
    "        vec3  c    = bb(clamp(Tr * g * 0.78, 0.0, 1.0));",

    /* accumulate against transmittance so the near side occludes the far */
    "        float alpha = clamp(dens * 0.92, 0.0, 1.0);",
    "        col   += trans * c * emit * 1.15;",
    "        trans *= (1.0 - alpha);",
    "      }",
    "    }",
    "  }",

    /* faint ember haze and a few hot points behind, lensed with the ray */
    "  if(captured < 0.5 && trans > 0.01){",
    "    vec3 d = normalize(v);",
    "    float n = fbm(d.xy * 2.3 + d.z * 1.2 + 4.0);",
    "    col += trans * bb(n * 0.32) * n * 0.085;",
    "    float st = pow(hash21(floor(d.xy * 170.0)), 108.0);",
    "    col += trans * vec3(1.0, 0.88, 0.72) * st * 0.55;",
    "  }",

    "  col = col / (col + vec3(0.85));",
    "  col = pow(col, vec3(0.90));",
    "  gl_FragColor = vec4(col * uFade, 1.0);",
    "}"
  ].join("\n");

  function compile(gl, type, src){
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
      /* Surface the reason rather than failing to a black rectangle — the caller
         falls back to the CSS gradient when this returns null. */
      if(window.console) console.warn("[blackhole] shader:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  window.ForgeBlackHole = function(canvas){
    var gl = canvas.getContext("webgl", {alpha:false, antialias:false, depth:false, powerPreference:"high-performance"})
          || canvas.getContext("experimental-webgl", {alpha:false, antialias:false, depth:false});
    if(!gl) return null;

    var prog = null, buf = null, uRes, uTime, uMouse, uFade, uOff, ok = false;

    /* A lost context destroys every program, buffer and uniform location it
       owned. Restoring therefore means rebuilding all of it — keeping the old
       handles and simply clearing a flag produces
       "location is not from the associated program" on the next frame. */
    function build(){
      ok = false;
      var vs = compile(gl, gl.VERTEX_SHADER, VERT);
      var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      if(!vs || !fs) return false;

      prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
        if(window.console) console.warn("[blackhole] link:", gl.getProgramInfoLog(prog));
        return false;
      }
      gl.useProgram(prog);

      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      uRes   = gl.getUniformLocation(prog, "uRes");
      uTime  = gl.getUniformLocation(prog, "uTime");
      uMouse = gl.getUniformLocation(prog, "uMouse");
      uFade  = gl.getUniformLocation(prog, "uFade");
      uOff   = gl.getUniformLocation(prog, "uOff");

      ok = true;
      return true;
    }

    if(!build()) return null;

    var mx = 0, my = 0, tx = 0, ty = 0;
    var fade = 0, t0 = performance.now();
    /* Raymarching every pixel is the cost here, and full-bleed is several times
       the area of a panel. Start at one device pixel per CSS pixel and let the
       frame-time watchdog drop further rather than shipping a hero that stutters
       on integrated graphics. */
    var full  = canvas.dataset && canvas.dataset.full === "1";
    var scale = Math.min(window.devicePixelRatio || 1, full ? 1.0 : 1.5);
    var floorScale = full ? 0.58 : 0.72;
    var slow = 0, last = t0;

    /* preventDefault is what makes the context eligible to be restored at all */
    canvas.addEventListener("webglcontextlost", function(e){
      e.preventDefault();
      ok = false;
    }, false);
    canvas.addEventListener("webglcontextrestored", function(){
      build();
    }, false);

    function onMove(e){
      var r = canvas.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    }
    window.addEventListener("pointermove", onMove, {passive:true});

    function resize(){
      var w = canvas.clientWidth || canvas.offsetWidth;
      var h = canvas.clientHeight || canvas.offsetHeight;
      if(!w || !h) return;
      var W = Math.max(1, Math.round(w * scale));
      var H = Math.max(1, Math.round(h * scale));
      if(canvas.width !== W || canvas.height !== H){
        canvas.width = W; canvas.height = H;
      }
      gl.viewport(0, 0, W, H);
    }

    /* Where the hole sits. On a wide hero it moves right so the headline has
       clean ground; on a portrait viewport it centres and lifts slightly,
       because there is no room beside the copy. */
    function offset(){
      var a = canvas.width / Math.max(1, canvas.height);
      return a > 1.25 ? [0.30 * a, 0.0] : [0.0, -0.04];
    }

    function draw(now){
      if(!ok || gl.isContextLost()) return;
      resize();
      var dtms = now - last; last = now;
      if(dtms > 34){ slow++; } else { slow = Math.max(0, slow - 1); }
      if(slow > 24 && scale > floorScale){ scale = floorScale; slow = 0; }

      mx += (tx - mx) * 0.055;
      my += (ty - my) * 0.055;
      /* Time-based, not frame-counted: a frame-counted ramp leaves the hero dim
         wherever the loop is throttled. */
      fade = Math.min(1, (now - t0) / 700);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uFade, fade);
      var o = offset();
      gl.uniform2f(uOff, o[0], o[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return {
      draw: draw,
      resize: resize,
      /* one frame at full fade, for prefers-reduced-motion */
      still: function(){
        if(!ok || gl.isContextLost()) return;
        fade = 1;
        resize();
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, 7.5);
        gl.uniform2f(uMouse, 0, 0);
        gl.uniform1f(uFade, 1);
        var o2 = offset();
        gl.uniform2f(uOff, o2[0], o2[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose: function(){
        window.removeEventListener("pointermove", onMove);
        ok = false;
        if(gl.isContextLost()) return;
        if(prog) gl.deleteProgram(prog);
        if(buf)  gl.deleteBuffer(buf);
      }
    };
  };
})();
