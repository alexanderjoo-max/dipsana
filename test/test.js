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
      burst(innerWidth * .5, innerHeight * .55, 'hot', 60);
      
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
 float edge=m.x+(fbm(vec2(uv.y*2.,T*2.))-.5)*.4+(w.x-.5)*.3-s*.9;
 float side=smoothstep(edge-.25,edge+.25,uv.x);
 vec3 cream=vec3(.984,.957,.925);
 vec3 warm=mix(vec3(1.,.73,.59),vec3(1.,.79,.84),smoothstep(.3,.7,w.y));
 warm=mix(warm,vec3(1.,.9,.64),smoothstep(.6,.85,f)*.6);
 vec3 cool=mix(vec3(.62,.86,.9),vec3(.8,.72,1.),smoothstep(.3,.7,w.x));
 vec3 col=mix(warm,cool,side);
 col=mix(cream,col,smoothstep(.25,.75,f)*.85+.1);
 float md=length(uv-m);col=mix(col,vec3(1.),.35*exp(-md*5.));
 col=mix(col,cream,smoothstep(.55,1.,uv.y)*.25);
 gl_FragColor=vec4(col,1.);
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
  const PASTEL = ['255,185,150', '255,201,214', '205,184,255', '255,231,163', '240,122,85'];
  const MAX = innerWidth < 700 ? 110 : 220;
  function spawn(kind, x, y, vx, vy) {
    const p = { kind, x, y, vx: vx || 0, vy: vy || 0, life: 0, max: 200 + Math.random() * 300, r: 1, a: 1, seed: Math.random() * 100 };
    if (kind === 'ember') { p.r = 1 + Math.random() * 2.4; p.vy = vy ?? -(0.6 + Math.random() * 1.6); p.vx = vx ?? (Math.random() - .5) * .6; }
    if (kind === 'steam') { p.r = 40 + Math.random() * 90; p.vy = -(0.3 + Math.random() * .6); p.vx = (Math.random() - .5) * .4; p.max = 400; }
    if (kind === 'bubble') { p.r = 4 + Math.random() * 16; p.max = 600; p.vy = -(0.4 + Math.random() * 1); }
    if (kind === 'snow') { p.r = 1 + Math.random() * 3; p.vy = vy ?? (0.4 + Math.random() * 1.1); p.vx = vx ?? (Math.random() - .5) * .5; }
    if (kind === 'shard') { p.r = 3 + Math.random() * 6; p.rot = Math.random() * 6; p.vr = (Math.random() - .5) * .2; p.max = 120; }
    P.push(p); return p;
  }
  function burst(x, y, type, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7;
      const p = spawn(i % 3 ? 'ember' : 'bubble', x, y, Math.cos(a) * sp, Math.sin(a) * sp);
      p.max = 90 + Math.random() * 80; p.burst = true;
    }
  }
  window.__burst = burst;
  function ambient() {
    if (reduce || P.length > MAX) return;
    const r = Math.random();
    if (fxMode === 'hero') {
      if (r < .12) spawn('bubble', Math.random() * W, H + 20);
      return;
    }
    if (fxMode === 'off' || fxMode === 'film') return;
    if (r > .5) return;
    // temperature-driven
    if (heat > .72) spawn('ember', Math.random() * W, H + 10);
    else if (heat > .4) { if (r < .15) spawn('steam', Math.random() * W, H + 80); else if (r < .5) spawn('ember', Math.random() * W, H + 10); }
    else if (heat > .12) spawn('bubble', Math.random() * W, H + 10);
  }
  function drawParticles() {
    ctx.clearRect(0, 0, W, H);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life += fxMode === 'film' ? 6 : 1;
      // mouse repel
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (fine && d2 < 14000 && p.kind !== 'steam') { const f = (14000 - d2) / 14000 * .9; p.vx += dx / Math.sqrt(d2 + 1) * f; p.vy += dy / Math.sqrt(d2 + 1) * f; }
      if (p.burst) { p.vx *= .95; p.vy *= .95; p.vy -= .03; }
      else {
        p.vx *= .98;
        if (p.kind === 'ember') { p.vx += Math.sin(p.life * .05 + p.seed) * .03; p.vy = Math.max(p.vy - .002, -3); }
        if (p.kind === 'snow') { p.vx += Math.sin(p.life * .03 + p.seed) * .02; p.vy = Math.min(p.vy + .003, 1.6); }
        if (p.kind === 'bubble' && !p.burst) p.vx = Math.sin(p.life * .03 + p.seed) * .5;
      }
      p.x += p.vx; p.y += p.vy;
      const fade = Math.min(1, p.life / 20) * (1 - p.life / p.max);
      if (fade <= 0 || p.y < -150 || p.y > H + 150) { P.splice(i, 1); continue; }
      if (p.kind === 'ember') {
        ctx.globalCompositeOperation = 'source-over';
        const hue = PASTEL[p.seed * 10 % PASTEL.length | 0];
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, `rgba(${hue},${fade * .75})`); g.addColorStop(1, `rgba(${hue},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 7); ctx.fill();
      } else if (p.kind === 'steam') {
        ctx.globalCompositeOperation = 'screen';
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(255,245,235,${fade * .08})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); p.r += .15;
      } else if (p.kind === 'bubble') {
        ctx.globalCompositeOperation = 'source-over';
        const ig = ctx.createLinearGradient(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
        ig.addColorStop(0, `rgba(255,185,150,${fade * .8})`); ig.addColorStop(.5, `rgba(205,184,255,${fade * .8})`); ig.addColorStop(1, `rgba(159,219,230,${fade * .8})`);
        ctx.fillStyle = `rgba(255,255,255,${fade * .18})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
        ctx.strokeStyle = ig; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${fade * .9})`; ctx.beginPath(); ctx.ellipse(p.x - p.r * .38, p.y - p.r * .4, p.r * .22, p.r * .12, -.7, 0, 7); ctx.fill();
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
  /* ---------- scroll-driven ---------- */
  const rooms = $('#rooms'), bgImgs = $$('.rooms-bg img'), cards = $$('.rc'), dots = $$('.room-dots li');
  const bigDeg = $('#bigDeg'), fill = $('#thermoFill'), bulb = $('#thermoBulb'), tint = $('#roomsTint'), frost = $('#roomsFrost');
  const temps = [100, 44, 6, 1, 55]; // per room
  const heats = [1, .6, .25, 0, .5];
  let room = -1;
  const hot = [240, 122, 85], cold = [61, 159, 184];
  const mix = t => hot.map((h, i) => Math.round(lerp(cold[i], h, t))).join(',');

  const film = $('#film');
  const prog = $('#prog'), bar = $('.bar'), heroDot = $('#heroDot'), heroProd = $('#heroProduct');
  let scrollHeroP = 0;

  function onScroll() {
    const y = scrollY, vh = innerHeight;
    prog.style.transform = `scaleX(${y / (document.documentElement.scrollHeight - vh)})`;
    bar.classList.toggle('scrolled', y > 40);
    scrollHeroP = clamp(y / vh);

    const fr = film.getBoundingClientRect();
    const inFilm = fr.top < vh * .5 && fr.bottom > vh * .5;
    document.body.classList.toggle('cine', inFilm || (rooms.getBoundingClientRect().top < 0 && rooms.getBoundingClientRect().bottom > vh));
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
    else if (inFilm) fxMode = 'film';
    else fxMode = 'hero';
    document.documentElement.style.setProperty('--temp', heat.toFixed(3));

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
    burst(r.left + r.width * .3, r.top, 'hot', 70); burst(r.left + r.width * .7, r.top, 'hot', 70);
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
