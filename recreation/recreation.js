import { initMotion, countUp, gsap, ScrollTrigger, reduced } from '/js/lp-motion.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
initMotion();

/* ═════════ hero: a split-flap activity word ═════════ */
const flip = document.getElementById('flip');
const words = [...flip.children];
const inner = document.createElement('span');
inner.className = 'flip-inner';
words.forEach(w => inner.appendChild(w));
flip.appendChild(inner);
if (gsap && !reduced) {
  const widths = () => words.map(w => w.scrollWidth);
  let ws = widths();
  gsap.set(flip, { width: ws[0] });
  const tl = gsap.timeline({ repeat: -1, delay: 1.6 });
  for (let i = 1; i < words.length; i++) {
    tl.to(inner, { yPercent: -(100 / words.length) * i, duration: 0.7, ease: 'expo.inOut' }, '+=1.5')
      .to(flip, { width: () => ws[i], duration: 0.7, ease: 'expo.inOut' }, '<');
  }
  tl.set(inner, { yPercent: 0 });
  addEventListener('resize', () => { ws = widths(); });
  document.fonts && document.fonts.ready.then(() => { ws = widths(); gsap.set(flip, { width: ws[0] }); });

  gsap.from('.box--hero', { y: 50, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.1 });
  gsap.from('.box--hero .kicker, .flip-line, .hero-sub, .hero-actions, .facts', { y: 24, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.07, delay: 0.4 });
  gsap.fromTo('#hero .scene-bg img', { scale: 1.15 }, { scale: 1, duration: 2.6, ease: 'power3.out' });
} else {
  inner.querySelectorAll('span').forEach((w, i) => { if (i) w.style.display = 'none'; });
}

/* ═════════ the journey: photos drift, boxes land, a trail follows you down ═════════ */
const journeyEl = document.querySelector('.journey');
const scenes = [...document.querySelectorAll('.scene')];
const boxes = [...document.querySelectorAll('[data-stop]')];
if (gsap && !reduced) {
  scenes.forEach(sc => {
    const img = sc.querySelector('.scene-bg img');
    gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: sc, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  boxes.forEach(b => {
    if (b.classList.contains('box--hero')) return;
    const left = b.classList.contains('box--left');
    gsap.from(b, { y: 110, x: left ? -40 : 40, rotate: left ? -3 : 3, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: b, start: 'top 90%', once: true } });
  });
}

// the dotted trail: anchors on the side of each box that faces the middle
const svg = document.getElementById('route');
const line = document.getElementById('routeLine');
const shadow = document.getElementById('routeShadow');
const reveal = document.getElementById('routeReveal');
let samples = [], total = 0;
function offsetIn(el) {
  let x = 0, y = 0, n = el;
  while (n && n !== journeyEl) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y };
}
function buildRoute() {
  const W = journeyEl.clientWidth, H = journeyEl.offsetHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  const narrow = innerWidth <= 900;
  const pts = boxes.map((b, i) => {
    const o = offsetIn(b), w = b.offsetWidth, h = b.offsetHeight;
    if (narrow) return { x: i % 2 ? W - 18 : 18, y: o.y + h / 2 };
    if (b.classList.contains('box--hero')) return { x: o.x + w * 0.62, y: o.y + h + 10 };
    const left = b.classList.contains('box--left');
    return { x: left ? o.x + w + 14 : o.x - 14, y: o.y + h / 2 };
  });
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dy = (b.y - a.y) * 0.55;
    d += ` C${a.x.toFixed(1)},${(a.y + dy).toFixed(1)} ${b.x.toFixed(1)},${(b.y - dy).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  [line, shadow, reveal].forEach(p => p.setAttribute('d', d));
  total = reveal.getTotalLength();
  samples = [];
  for (let l = 0; l <= total; l += 12) samples.push([l, reveal.getPointAtLength(l).y]);
  reveal.style.strokeDasharray = `${total} ${total}`;
  drawRoute();
}
function drawRoute() {
  if (!samples.length) return;
  if (reduced) { reveal.style.strokeDashoffset = 0; return; }
  // the trail's tip sits a little below the middle of the screen
  const target = scrollY + innerHeight * 0.62 - (journeyEl.getBoundingClientRect().top + scrollY);
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid][1] < target) lo = mid + 1; else hi = mid; }
  const len = samples[lo][0];
  reveal.style.strokeDashoffset = Math.max(0, total - len);
}

// the clock in the top bar keeps time with the day
const clockTime = document.getElementById('clockTime');
const clockWhat = document.getElementById('clockWhat');
function tick() {
  const mid = innerHeight / 2;
  const sc = scenes.find(s => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
  if (sc && clockTime.textContent !== sc.dataset.time) { clockTime.textContent = sc.dataset.time; clockWhat.textContent = sc.dataset.what; }
}
addEventListener('scroll', () => { drawRoute(); tick(); }, { passive: true });
addEventListener('resize', buildRoute);
addEventListener('load', () => { buildRoute(); if (ScrollTrigger) ScrollTrigger.refresh(); });
document.fonts && document.fonts.ready.then(buildRoute);
buildRoute(); tick();

document.querySelectorAll('.stats [data-count]').forEach(el => countUp(el, { duration: 1.6 }));

/* ═════════ the headset, in four colours ═════════ */
const KIT = [
  { name: 'Ember',    hex: '#E2542C', note: 'Easy to spot in a beach bag.' },
  { name: 'Glacier',  hex: '#A8D5E2', note: 'Sea-glass blue, cool on a hot day.' },
  { name: 'Chalk',    hex: '#EDE8E0', note: 'Soft off-white for summer.' },
  { name: 'Obsidian', hex: '#35383C', note: 'Matte charcoal. Goes with everything.' }
];
const kitStage = document.getElementById('kitStage');
const kitCanvas = document.getElementById('kitCanvas');
const kitName = document.getElementById('kitName');
const kitNote = document.getElementById('kitNote');
const kitList = document.getElementById('kitSw');
let kitPaint = () => {}, kitActive = 0;
function pickKit(i) {
  kitActive = i;
  [...kitList.children].forEach((li, k) => li.firstChild.setAttribute('aria-checked', String(k === i)));
  kitName.parentElement.classList.add('out');
  setTimeout(() => { kitName.textContent = KIT[i].name; kitNote.textContent = KIT[i].note; kitName.parentElement.classList.remove('out'); }, 200);
  kitPaint(i);
}
KIT.forEach((c, i) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(i === 0)); b.setAttribute('aria-label', c.name);
  b.style.setProperty('--sw', c.hex);
  b.addEventListener('click', () => pickKit(i));
  b.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const k = (kitActive + d + KIT.length) % KIT.length;
    pickKit(k); kitList.children[k].firstChild.focus();
  });
  li.appendChild(b); kitList.appendChild(li);
});
import('/js/lp-headset.js').then(({ headset }) => headset(kitCanvas, {
  color: KIT[0].hex, key: 0xfff1d6, rim: 0xffd27a, fill: 0xbfe9f0, exposure: 1.12,
  material: { roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 }
})).then(hs => {
  kitStage.classList.add('is-live');
  const { THREE, mat } = hs;
  const from = new THREE.Color(), to = new THREE.Color(KIT[0].hex);
  let ct = 1;
  kitPaint = i => { from.copy(mat.color); to.set(KIT[i].hex); ct = 0; };
  hs.state.fill = 0.92;
  let spin = 0, vel = 0, drag = false, lastX = 0, visible = false, t0 = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - t0); t0 = now;
    spin += (reduced ? 0 : dt * 0.00015) + vel; vel *= 0.94;
    if (ct < 1) { ct = Math.min(1, ct + dt / 500); mat.color.copy(from).lerp(to, ct * ct * (3 - 2 * ct)); }
    hs.state.az = -75 * Math.PI / 180 + spin;
    hs.state.el = (16 + (reduced ? 0 : Math.sin(now / 2200) * 6)) * Math.PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(now / 1700) * 0.02;
    hs.render();
  }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) frame(performance.now()); }).observe(kitCanvas);
  kitCanvas.addEventListener('pointerdown', e => { drag = true; lastX = e.clientX; kitCanvas.setPointerCapture(e.pointerId); });
  kitCanvas.addEventListener('pointermove', e => { if (drag) { vel += (e.clientX - lastX) * 0.0006; lastX = e.clientX; } });
  kitCanvas.addEventListener('pointerup', () => { drag = false; });
  kitCanvas.addEventListener('pointercancel', () => { drag = false; });
  // don't rely only on the observer: a cheap on-screen check keeps it drawing everywhere
  const onScreen = () => { const r = kitCanvas.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
  if (reduced) { frame(performance.now()); kitPaint = i => { mat.color.set(KIT[i].hex); frame(performance.now()); }; }
  else (function loop(now) { requestAnimationFrame(loop); if (visible || ct < 1 || onScreen()) frame(now); })(performance.now());
}).catch(() => {});

/* ═════════ Hear the difference: the same beach through earbuds vs open ears ═════════ */
const mixer = document.getElementById('mixer');
const seg = mixer.querySelector('.seg');
const segBtns = [...seg.querySelectorAll('button')];
const hearPlay = document.getElementById('hearPlay');
const hearPlayLabel = document.getElementById('hearPlayLabel');
const hearStatus = document.getElementById('hearStatus');
const mxMusic = document.getElementById('mxMusic');
const mxWorld = document.getElementById('mxWorld');
const mxMusicVal = document.getElementById('mxMusicVal');
const mxWorldVal = document.getElementById('mxWorldVal');
let mode = 'open';

const STATUS = {
  open: 'Open ears: the surf and the bike bell come through clearly, with the music on top.',
  buds: 'Earbuds: the music is sealed in and the world goes dull and quiet. Easy to miss the bike behind you.'
};

const beach = {
  ctx: null, on: false, timers: [],
  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // music: warm pad chords and a soft plucked line
    this.music = ctx.createGain(); this.music.gain.value = 0.85;
    const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 2600;
    this.musicMeter = ctx.createAnalyser(); this.musicMeter.fftSize = 512;
    this.music.connect(mlp).connect(this.musicMeter).connect(this.master);

    // the world: surf and a bike bell, through a filter that a sealed ear tip closes down
    this.world = ctx.createGain(); this.world.gain.value = 1;
    this.seal = ctx.createBiquadFilter(); this.seal.type = 'lowpass'; this.seal.frequency.value = 16000;
    this.worldMeter = ctx.createAnalyser(); this.worldMeter.fftSize = 512;
    this.world.connect(this.seal).connect(this.worldMeter).connect(this.master);
    this.buf = new Float32Array(512);

    const len = ctx.sampleRate * 3;
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const surfLp = ctx.createBiquadFilter(); surfLp.type = 'lowpass'; surfLp.frequency.value = 1400;
    const surf = ctx.createGain(); surf.gain.value = 0.35;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.28;
    lfo.connect(lfoAmt).connect(surf.gain);
    src.connect(surfLp).connect(surf).connect(this.world);
    src.start(); lfo.start();
  },
  note(freq, at, dur, vol, type = 'triangle', dest = this.music) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest); o.start(at); o.stop(at + dur + 0.05);
  },
  bell() {
    const t = this.ctx.currentTime + 0.02;
    [0, 0.16].forEach(dt => [[2350, 0.09], [3120, 0.05], [4710, 0.02]].forEach(([f, v]) => this.note(f, t + dt, 0.7, v, 'sine', this.world)));
  },
  schedule() {
    const chords = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 329.6]];
    const beat = 0.6;
    let step = 0, next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.on) return;
      while (next < this.ctx.currentTime + 0.3) {
        const chord = chords[Math.floor(step / 8) % chords.length];
        if (step % 8 === 0) chord.forEach(f => this.note(f / 2, next, beat * 8, 0.035, 'sine'));
        this.note(chord[[0, 1, 2, 3, 2, 1, 3, 2][step % 8]] * 2, next, beat * 1.4, 0.045, 'triangle');
        next += beat / 2; step++;
      }
      this.timers[0] = setTimeout(tick, 100);
    };
    tick();
    const ring = () => { if (!this.on) return; this.bell(); this.timers[1] = setTimeout(ring, 4600 + Math.random() * 2400); };
    this.timers[1] = setTimeout(ring, 1600);
  },
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // a sealed ear tip muffles the outside and quietens it; the music sits louder inside
    this.seal.frequency.setTargetAtTime(mode === 'buds' ? 380 : 16000, t, 0.12);
    this.world.gain.setTargetAtTime(mode === 'buds' ? 0.22 : 1, t, 0.12);
    this.music.gain.setTargetAtTime(mode === 'buds' ? 1 : 0.85, t, 0.12);
  },
  level(an) {
    an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.sqrt(s / this.buf.length);
  },
  async start() {
    if (!this.ctx) this.init();
    await this.ctx.resume();
    this.on = true;
    this.apply();
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.4);
    this.schedule();
  },
  stop() {
    this.on = false;
    this.timers.forEach(clearTimeout);
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 1500);
  }
};

function setMode(m) {
  mode = m;
  seg.dataset.mode = m;
  mixer.dataset.mode = m;
  segBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
  hearStatus.textContent = STATUS[m];
  beach.apply();
}
segBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
seg.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    setMode(mode === 'open' ? 'buds' : 'open');
    seg.querySelector('[aria-checked="true"]').focus();
  }
});
function setPlaying(on) {
  hearPlay.setAttribute('aria-pressed', String(on));
  hearPlayLabel.textContent = on ? 'Pause' : 'Play the beach';
  if (!on) {
    mxMusic.style.width = mxWorld.style.width = '0%';
    mxMusicVal.textContent = mxWorldVal.textContent = '—';
  }
}
hearPlay.addEventListener('click', () => {
  const on = hearPlay.getAttribute('aria-pressed') !== 'true';
  setPlaying(on);
  on ? beach.start() : beach.stop();
});
const hear = document.getElementById('hear');
new IntersectionObserver(es => {
  if (!es[0].isIntersecting && beach.on) { beach.stop(); setPlaying(false); }
}).observe(hear);

// live meters from the two analysers, shown in rough decibels
let mL = 0, wL = 0;
const toPct = rms => clamp((20 * Math.log10(rms + 1e-5) + 60) / 54) * 100;   // −60 dB … −6 dB
const toDb = rms => rms < 1e-4 ? '−∞ dB' : `${Math.round(20 * Math.log10(rms))} dB`;
(function meter() {
  requestAnimationFrame(meter);
  if (!beach.on || !beach.ctx) return;
  const m = beach.level(beach.musicMeter), w = beach.level(beach.worldMeter);
  mL += (m - mL) * 0.25; wL += (w - wL) * 0.25;
  mxMusic.style.width = toPct(mL).toFixed(1) + '%';
  mxWorld.style.width = toPct(wL).toFixed(1) + '%';
  mxMusicVal.textContent = toDb(mL);
  mxWorldVal.textContent = toDb(wL);
})();
