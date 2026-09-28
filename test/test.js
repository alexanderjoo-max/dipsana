(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, nx: .5, ny: .5, sx: .5, sy: .5 };
  let heat = 1; // 1 = hot, 0 = ice — drives particles, glows
  let fxMode = 'hero';

  /* ---------- split text ---------- */
  $$('[data-split]').forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, wi) => {
      const line = document.createElement('span');
      line.className = 'split-line';
      [...w].forEach((c, ci) => {
        const s = document.createElement('span');
        s.className = 'ch'; s.textContent = c;
        s.style.transitionDelay = (wi * 0.08 + ci * 0.035).toFixed(3) + 's';
        line.appendChild(s);
      });
      el.appendChild(line);
      if (wi < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  });
  function paintGradientChars() {
    $$('.mega .w').forEach(w => {
      const r = w.getBoundingClientRect();
      $$('.ch', w).forEach(c => {
        const cr = c.getBoundingClientRect();
        c.style.setProperty('--bw', r.width + 'px');
        c.style.setProperty('--bx', -(cr.left - r.left) + 'px');
      });
    });
  }
  document.fonts && document.fonts.ready.then(paintGradientChars);
  addEventListener('resize', paintGradientChars);

  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .25 });
  $$('[data-split]').forEach(el => io.observe(el));

  /* ---------- loader ---------- */
  const loadNum = $('#loadNum'), loadBar = $('#loadBar'), loader = $('#loader');
  const t0 = performance.now(), dur = reduce ? 200 : 1700;
  (function tick(t) {
    const p = clamp((t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    loadNum.textContent = Math.round(110 * (1 - e));
    loadBar.style.width = (e * 100) + '%';
    loader.style.setProperty('--lp', (e * 100) + '%');
    if (p < 1) requestAnimationFrame(tick);
    else setTimeout(() => {
      loader.classList.add('done');
      document.body.classList.remove('is-loading');
      document.body.classList.add('ready');
      paintGradientChars();
      burst(innerWidth * .3, innerHeight * .6, 'hot', 70);
      burst(innerWidth * .7, innerHeight * .6, 'cold', 70);
      setTimeout(() => loader.remove(), 1400);
    }, 250);
  })(t0);

  /* ---------- cursor + magnetic ---------- */
  const cur = $('#cursor');
  let cx = mouse.x, cy = mouse.y;
  addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.nx = e.clientX / innerWidth; mouse.ny = e.clientY / innerHeight;
  }, { passive: true });
  if (fine) {
    $$('a,button,.split-stage').forEach(el => {
      el.addEventListener('pointerenter', () => cur.classList.add('big'));
      el.addEventListener('pointerleave', () => cur.classList.remove('big'));
    });
    $$('[data-mag]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * .3}px,${dy * .4}px)`;
      });
      el.addEventListener('pointerleave', () => el.style.transform = '');
    });
  }

  /* ---------- WebGL hero shader: lava meets glacier ---------- */
  const gl = (() => { const c = $('#gl'); return c.getContext('webgl', { antialias: false, premultipliedAlpha: false }); })();
  let glDraw = () => {};
  if (gl) {
    const vs = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
    const fs = `precision highp float;
uniform vec2 r;uniform float t;uniform vec2 m;uniform float s;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<6;i++){v+=a*n(p);p=R*p*2.02;a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/r;vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
 float T=t*.06;
 vec2 q=vec2(fbm(p*1.6+T),fbm(p*1.6-T+4.3));
 vec2 w=vec2(fbm(p*2.+q*2.5+vec2(1.7,9.2)+T*1.3),fbm(p*2.+q*2.5+vec2(8.3,2.8)-T));
 float f=fbm(p*1.8+w*2.2);
 // boundary follows mouse, wobbling
 float edge=m.x+ (fbm(vec2(uv.y*3.,T*3.))-.5)*.35 + (w.x-.5)*.25 - s*.9;
 float side=smoothstep(edge-.06,edge+.06,uv.x); // 0 hot,1 cold
 // hot palette
 vec3 hot=mix(vec3(.05,.01,.0),vec3(.75,.12,.02),smoothstep(.2,.6,f));
 hot=mix(hot,vec3(1.,.55,.12),smoothstep(.55,.8,f));
 hot=mix(hot,vec3(1.,.93,.7),smoothstep(.78,.95,f)*.9);
 // cold palette: cracked ice
 float cr=abs(sin((w.x+w.y)*18.));cr=pow(1.-cr,18.);
 vec3 cold=mix(vec3(.0,.02,.05),vec3(.04,.25,.42),smoothstep(.2,.65,f));
 cold=mix(cold,vec3(.55,.85,1.),smoothstep(.6,.85,f));
 cold+=cr*vec3(.7,.9,1.)*.35;
 vec3 col=mix(hot,cold,side);
 // steam seam
 float seam=exp(-pow((uv.x-edge)*9.,2.));
 col+=seam*vec3(1.)*.35*fbm(p*6.+vec2(0.,-t*.4));
 // mouse glow
 float md=length(uv-m);col+=.12*exp(-md*6.)*mix(vec3(1.,.5,.2),vec3(.5,.8,1.),side);
 col*=smoothstep(1.35,.2,length(p))*.9+.1;
 col=pow(col,vec3(.95));
 gl_FragColor=vec4(col*.85,1.);
}`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = k => gl.getUniformLocation(pr, k);
    const ur = U('r'), ut = U('t'), um = U('m'), us = U('s');
    const scale = innerWidth < 700 ? .5 : .65;
    const size = () => { const c = gl.canvas; c.width = c.clientWidth * scale; c.height = c.clientHeight * scale; gl.viewport(0, 0, c.width, c.height); };
    size(); addEventListener('resize', size);
    glDraw = (t, scrollP) => {
      gl.uniform2f(ur, gl.canvas.width, gl.canvas.height);
      gl.uniform1f(ut, t / 1000);
      gl.uniform2f(um, mouse.sx, 1 - mouse.sy);
      gl.uniform1f(us, scrollP);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
  }

  /* ---------- particles ---------- */
  const fx = $('#fx'), ctx = fx.getContext('2d');
  let W, H, DPR = Math.min(devicePixelRatio || 1, 2);
  const sizeFx = () => { W = innerWidth; H = innerHeight; fx.width = W * DPR; fx.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); };
  sizeFx(); addEventListener('resize', sizeFx);
  const P = [];
  const MAX = innerWidth < 700 ? 110 : 220;
  function spawn(kind, x, y, vx, vy) {
    const p = { kind, x, y, vx: vx || 0, vy: vy || 0, life: 0, max: 200 + Math.random() * 300, r: 1, a: 1, seed: Math.random() * 100 };
    if (kind === 'ember') { p.r = 1 + Math.random() * 2.4; p.vy = vy ?? -(0.6 + Math.random() * 1.6); p.vx = vx ?? (Math.random() - .5) * .6; }
    if (kind === 'steam') { p.r = 40 + Math.random() * 90; p.vy = -(0.3 + Math.random() * .6); p.vx = (Math.random() - .5) * .4; p.max = 400; }
    if (kind === 'bubble') { p.r = 2 + Math.random() * 7; p.vy = -(0.8 + Math.random() * 1.8); }
    if (kind === 'snow') { p.r = 1 + Math.random() * 3; p.vy = vy ?? (0.4 + Math.random() * 1.1); p.vx = vx ?? (Math.random() - .5) * .5; }
    if (kind === 'shard') { p.r = 3 + Math.random() * 6; p.rot = Math.random() * 6; p.vr = (Math.random() - .5) * .2; p.max = 120; }
    P.push(p); return p;
  }
  function burst(x, y, type, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7;
      const p = spawn(type === 'hot' ? 'ember' : 'shard', x, y, Math.cos(a) * sp, Math.sin(a) * sp);
      p.max = 90 + Math.random() * 80; p.burst = true;
    }
  }
  window.__burst = burst;
  function ambient() {
    if (reduce || P.length > MAX) return;
    const r = Math.random();
    if (fxMode === 'hero') {
      if (r < .5) spawn('ember', Math.random() * W * mouse.sx, H + 10);
      else spawn('snow', W * mouse.sx + Math.random() * W * (1 - mouse.sx), -10);
      return;
    }
    if (fxMode === 'off') return;
    // temperature-driven
    if (heat > .72) spawn('ember', Math.random() * W, H + 10);
    else if (heat > .4) { if (r < .15) spawn('steam', Math.random() * W, H + 80); else if (r < .5) spawn('ember', Math.random() * W, H + 10); }
    else if (heat > .12) spawn('bubble', Math.random() * W, H + 10);
    else spawn('snow', Math.random() * W, -10);
  }
  function drawParticles() {
    ctx.clearRect(0, 0, W, H);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life++;
      // mouse repel
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 14000 && p.kind !== 'steam') { const f = (14000 - d2) / 14000 * .9; p.vx += dx / Math.sqrt(d2 + 1) * f; p.vy += dy / Math.sqrt(d2 + 1) * f; }
      if (p.burst) { p.vx *= .95; p.vy *= .95; if (p.kind === 'ember') p.vy -= .03; else p.vy += .08; }
      else {
        p.vx *= .98;
        if (p.kind === 'ember') { p.vx += Math.sin(p.life * .05 + p.seed) * .03; p.vy = Math.max(p.vy - .002, -3); }
        if (p.kind === 'snow') { p.vx += Math.sin(p.life * .03 + p.seed) * .02; p.vy = Math.min(p.vy + .003, 1.6); }
        if (p.kind === 'bubble') p.vx = Math.sin(p.life * .08 + p.seed) * .6;
      }
      p.x += p.vx; p.y += p.vy;
      const fade = Math.min(1, p.life / 20) * (1 - p.life / p.max);
      if (fade <= 0 || p.y < -150 || p.y > H + 150) { P.splice(i, 1); continue; }
      if (p.kind === 'ember') {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, `rgba(255,220,150,${fade})`); g.addColorStop(.3, `rgba(255,110,30,${fade * .7})`); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - p.r * 5, p.y - p.r * 5, p.r * 10, p.r * 10);
      } else if (p.kind === 'steam') {
        ctx.globalCompositeOperation = 'screen';
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(255,245,235,${fade * .08})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); p.r += .15;
      } else if (p.kind === 'bubble') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(190,235,255,${fade * .7})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${fade * .6})`; ctx.beginPath(); ctx.arc(p.x - p.r * .35, p.y - p.r * .35, p.r * .25, 0, 7); ctx.fill();
      } else if (p.kind === 'snow') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(220,245,255,${fade * .85})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.globalCompositeOperation = 'lighter';
        p.rot += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(170,225,255,${fade * .9})`; ctx.beginPath();
        ctx.moveTo(0, -p.r * 1.6); ctx.lineTo(p.r * .5, 0); ctx.lineTo(0, p.r * 1.6); ctx.lineTo(-p.r * .5, 0); ctx.fill(); ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // cursor trail sparks
  let lastTrail = 0;
  addEventListener('pointermove', e => {
    if (reduce || !fine) return;
    const now = performance.now(); if (now - lastTrail < 30) return; lastTrail = now;
    const p = spawn(heat > .5 ? 'ember' : 'snow', e.clientX, e.clientY, (Math.random() - .5) * 1.5, heat > .5 ? -1 : 1);
    p.max = 60;
  }, { passive: true });

  /* ---------- scroll-driven ---------- */
  const rooms = $('#rooms'), bgImgs = $$('.rooms-bg img'), cards = $$('.rc'), dots = $$('.room-dots li');
  const bigDeg = $('#bigDeg'), fill = $('#thermoFill'), bulb = $('#thermoBulb'), tint = $('#roomsTint'), frost = $('#roomsFrost');
  const temps = [100, 44, 6, 1, 55]; // per room
  const heats = [1, .6, .25, 0, .5];
  let room = -1;
  const hot = [255, 106, 31], cold = [127, 211, 255];
  const mix = t => hot.map((h, i) => Math.round(lerp(cold[i], h, t))).join(',');

  const hzTrack = $('#hzTrack'), hz = $('#why');
  const prog = $('#prog'), bar = $('.bar'), heroDot = $('#heroDot'), heroProd = $('#heroProduct');
  let scrollHeroP = 0;

  function onScroll() {
    const y = scrollY, vh = innerHeight;
    prog.style.transform = `scaleX(${y / (document.documentElement.scrollHeight - vh)})`;
    bar.classList.toggle('scrolled', y > 40);
    scrollHeroP = clamp(y / vh);

    // rooms
    const rr = rooms.getBoundingClientRect();
    const total = rr.height - vh;
    const p = clamp(-rr.top / total);
    const inRooms = rr.top < vh * .5 && rr.bottom > vh * .5;
    if (inRooms) {
      const f = p * (temps.length - 1);
      const i = Math.min(temps.length - 1, Math.round(f));
      const a = Math.floor(f), bI = Math.min(a + 1, temps.length - 1), t = f - a;
      const temp = lerp(temps[a], temps[bI], t);
      heat = lerp(heats[a], heats[bI], t);
      if (room === 4) heat = .5 + .5 * Math.sin(performance.now() / 600); // contrast oscillates
      bigDeg.innerHTML = Math.round(temp) + '<sup>°</sup>';
      const c = mix(heat);
      fill.style.height = (temp / 110 * 100) + '%';
      fill.style.background = `rgb(${c})`; fill.style.color = `rgb(${c})`;
      bulb.style.background = `rgb(${c})`; bulb.style.boxShadow = `0 0 30px rgb(${c})`;
      tint.style.background = `rgba(${c},.55)`;
      frost.style.opacity = clamp((.3 - heat) / .3) * (i === 3 ? 1 : .5);
      if (i !== room) {
        room = i;
        bgImgs.forEach((im, k) => im.classList.toggle('on', k === i));
        cards.forEach((c2, k) => c2.classList.toggle('on', k === i));
        dots.forEach((d, k) => d.classList.toggle('on', k === i));
        burst(innerWidth * .3, innerHeight * .5, heats[i] >= .5 ? 'hot' : 'cold', 40);
      }
      fxMode = 'rooms';
    } else if (y < vh * .9) { fxMode = 'hero'; heat = 1 - mouse.sx; }
    else fxMode = rr.bottom < vh * .5 ? 'rooms' : 'hero';
    document.documentElement.style.setProperty('--temp', heat.toFixed(3));

    // horizontal track
    const hr = hz.getBoundingClientRect();
    const hp = clamp(-hr.top / (hr.height - vh));
    const maxX = hzTrack.scrollWidth - innerWidth;
    hzTrack.style.transform = `translate3d(${-hp * maxX}px,0,0)`;
    $$('.hc', hzTrack).forEach((c2, k) => { c2.style.transform = `rotate(${(hp * 4 - k * .8) * 1.2}deg) translateY(${Math.sin(hp * 6 + k) * 16}px)`; });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- split slider ---------- */
  const stage = $('#splitStage'), coldSide = $('#splitCold'), handle = $('#splitHandle'), read = $('#splitRead');
  let dragging = false;
  function setSplit(clientX) {
    const r = stage.getBoundingClientRect();
    const p = clamp((clientX - r.left) / r.width, .02, .98);
    coldSide.style.clipPath = `inset(0 0 0 ${p * 100}%)`;
    handle.style.left = (p * 100) + '%';
    read.textContent = Math.round(p * 110) + '°C';
    read.style.color = `rgb(${mix(p)})`;
  }
  stage.addEventListener('pointerdown', e => { dragging = true; stage.setPointerCapture(e.pointerId); setSplit(e.clientX); });
  stage.addEventListener('pointermove', e => { if (dragging || fine) setSplit(e.clientX); });
  stage.addEventListener('pointerup', () => dragging = false);
  // intro sweep
  new IntersectionObserver((es, o) => es.forEach(e => {
    if (!e.isIntersecting) return; o.disconnect();
    const r = stage.getBoundingClientRect(); const st = performance.now();
    (function sw(t) { const k = clamp((t - st) / 1800); setSplit(r.left + r.width * (.5 + Math.sin(k * Math.PI * 2) * .35 * (1 - k))); if (k < 1) requestAnimationFrame(sw); })(st);
  }), { threshold: .5 }).observe(stage);

  /* ---------- tilt + hotspots ---------- */
  const tilt = $('#tilt'), spot = $('#spotRead');
  tilt.addEventListener('pointermove', e => {
    const r = tilt.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    tilt.style.transform = `rotateY(${(x - .5) * 18}deg) rotateX(${(.5 - y) * 14}deg)`;
    tilt.style.setProperty('--gx', x * 100 + '%'); tilt.style.setProperty('--gy', y * 100 + '%');
  });
  tilt.addEventListener('pointerleave', () => tilt.style.transform = '');
  let typer;
  $$('.hot-spot').forEach(b => {
    const show = () => {
      $$('.hot-spot').forEach(x => x.classList.toggle('on', x === b));
      const txt = b.dataset.t; let i = 0; clearInterval(typer);
      const glyph = '!<>-_\\/[]{}—=+*^?#°';
      typer = setInterval(() => {
        spot.textContent = txt.slice(0, i) + [...Array(Math.min(6, txt.length - i))].map(() => glyph[Math.random() * glyph.length | 0]).join('');
        i += 2; if (i > txt.length) { spot.textContent = txt; clearInterval(typer); }
      }, 18);
    };
    b.addEventListener('pointerenter', show); b.addEventListener('click', show); b.addEventListener('focus', show);
  });

  /* ---------- counters ---------- */
  const countIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; countIO.unobserve(e.target);
    const el = e.target, to = +el.dataset.count, st = performance.now();
    (function c(t) { const k = clamp((t - st) / 1600); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 4))); if (k < 1) requestAnimationFrame(c); })(st);
  }), { threshold: .6 });
  $$('[data-count]').forEach(el => countIO.observe(el));

  /* ---------- waitlist ---------- */
  const form = $('#wl'), msg = $('#wlMsg'), email = $('#email');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { msg.className = 'wl-msg mono err'; msg.textContent = 'That email looks off.'; return; }
    msg.className = 'wl-msg mono'; msg.textContent = 'Sending…';
    const body = new FormData(); body.append('email_address', v);
    try { await fetch('https://app.kit.com/forms/9811187/subscriptions', { method: 'POST', body, mode: 'no-cors' }); } catch {}
    msg.textContent = 'You’re on the list. Go and sit down somewhere hot.';
    email.value = '';
    const r = form.getBoundingClientRect();
    burst(r.left + r.width * .3, r.top, 'hot', 90); burst(r.left + r.width * .7, r.top, 'cold', 90);
  });

  /* ---------- main loop ---------- */
  function frame(t) {
    mouse.sx = lerp(mouse.sx, fine ? mouse.nx : .5 + Math.sin(t / 3000) * .2, .06);
    mouse.sy = lerp(mouse.sy, fine ? mouse.ny : .5, .06);
    cx = lerp(cx, mouse.x, .2); cy = lerp(cy, mouse.y, .2);
    if (fine) cur.style.transform = `translate(${cx}px,${cy}px)`;
    if (scrollHeroP < 1) {
      glDraw(t, scrollHeroP);
      const dx = (mouse.sx - .5), dy = (mouse.sy - .5);
      heroProd.style.transform = `translate3d(${dx * -40}px,${dy * -30 + scrollHeroP * -120}px,0) rotateY(${dx * 30}deg) rotateX(${-dy * 20}deg) scale(${1 - scrollHeroP * .2})`;
      heroDot.style.left = (mouse.sx * 100) + '%';
      if (fxMode === 'hero') { heat = 1 - mouse.sx; document.documentElement.style.setProperty('--temp', heat.toFixed(3)); }
    }
    if (room === 4 && fxMode === 'rooms') onScroll();
    for (let i = 0; i < 3; i++) ambient();
    drawParticles();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
