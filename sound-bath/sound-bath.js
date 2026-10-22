import { shader, GLSL } from '/js/lp-gl.js';
import { initMotion, gsap, ScrollTrigger, coarse } from '/js/lp-motion.js';
import { climateMark } from '/js/brand.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
initMotion();
climateMark(document.querySelector('#topbar .mark'), { initial: 'dusk' });
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

/* The hero bowl's plate mode and pitch. Library samples bring their own plate modes (below). */
const MODES = [{ n: 3, m: 4, root: 196.0 }];
const HERO = 0;
let plateMode = MODES[HERO];
const SKIES = {
  hero:    ['#3a1d3a', '#e59a96', '#160c19'],
  dawn:    ['#3a2136', '#eaa58c', '#170e1b'],
  morning: ['#2d2a46', '#f2c6a6', '#141224'],
  noon:    ['#3a3560', '#c9b6ee', '#16132a'],
  dusk:    ['#3d1a2e', '#f08f78', '#160b14'],
  evening: ['#241634', '#b47fb8', '#100a18'],
  night:   ['#0f0c1e', '#4b3e80', '#07060e']
};
let mode = HERO, sky = 'hero';
let kick = 1;       // extra agitation right after a mode change
let level = 0;      // live audio level, 0..1

/* ═════════ sound: a generated singing bowl over a soft drone ═════════ */
const audio = {
  ctx: null, master: null, analyser: null, buf: null, drone: [], timer: null, on: false,

  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);

    // a long, dark room made from decaying noise
    const len = ctx.sampleRate * 4.5;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.55;
    this.dry = ctx.createGain(); this.dry.gain.value = 0.6;
    this.dry.connect(this.master);
    this.wet.connect(verb).connect(this.master);
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);

    // drone: root an octave down, a fifth, and a near-unison for slow beating
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const dg = ctx.createGain(); dg.gain.value = 0.06;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.025;
    lfo.connect(lfoAmt).connect(dg.gain); lfo.start();
    [0.5, 0.75, 0.501].forEach(r => {
      const o = ctx.createOscillator();
      o.ratio = r;
      o.frequency.value = MODES[mode].root * r;
      o.connect(lp); o.start();
      this.drone.push(o);
    });
    lp.connect(dg);
    dg.connect(this.dry); dg.connect(this.wet);
  },

  strike(freq, vel = 1) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // inharmonic partials of a bowl, each a slightly detuned pair so it shimmers
    [[1, 1], [2.76, .42], [5.4, .2], [8.93, .08]].forEach(([ratio, amp]) => {
      const g = ctx.createGain();
      const decay = 9 / Math.sqrt(ratio);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11 * amp * vel, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      [-0.7, 0.7].forEach(dt => {
        const o = ctx.createOscillator();
        o.frequency.value = freq * ratio + dt;
        o.connect(g); o.start(t); o.stop(t + decay + 0.1);
      });
      g.connect(this.dry); g.connect(this.wet);
    });
  },

  retune() {
    if (!this.ctx) return;
    const root = MODES[mode].root, t = this.ctx.currentTime;
    this.drone.forEach(o => o.frequency.setTargetAtTime(root * o.ratio, t, 1.2));
    this.strike(root, 0.9);
  },

  schedule() {
    const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
    const next = () => {
      if (!this.on) return;
      if (!breathOn) this.strike(MODES[mode].root * scale[Math.floor(Math.random() * scale.length)], 0.5 + Math.random() * 0.5);
      this.timer = setTimeout(next, 4200 + Math.random() * 3200);
    };
    this.timer = setTimeout(next, 2600);
  },

  async start() {
    if (!this.ctx) this.init();
    await this.ctx.resume();
    this.on = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.9, t, 0.6);
    this.strike(MODES[mode].root, 1);
    this.schedule();
  },

  stop() {
    this.on = false;
    clearTimeout(this.timer);
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 2500);
  },

  read() {
    if (!this.ctx || !this.on) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.sqrt(s / this.buf.length);
  }
};

const play = document.getElementById('play');
const playLabel = document.getElementById('playLabel');
const hint = document.getElementById('hint');
play.addEventListener('click', () => {
  const on = play.getAttribute('aria-pressed') !== 'true';
  play.setAttribute('aria-pressed', String(on));
  playLabel.textContent = on ? 'Pause the bowl' : 'Listen for a moment';
  if (on) {
    audio.start();
    hint.textContent = 'Keep scrolling · the bowl changes with the time of day';
  } else audio.stop();
});

/* ═════════ silk: the whole page is lit like dusk fabric ═════════ */
const SILK = GLSL.noise + `
uniform vec2 uRes; uniform float uTime; uniform float uLevel;
uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 q = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float t = uTime*.035;
  vec2 p = q*1.3;
  vec2 a = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 b = vec2(fbm(p + 3.*a + vec2(1.7, 9.2) + t*1.4), fbm(p + 3.*a + vec2(8.3, 2.8) - t*1.1));
  float f = fbm(p + 2.6*b);
  float folds = pow(sin(f*11. + b.x*5. + t*4.)*.5 + .5, 4.);

  vec3 col = mix(uC3, uC1, smoothstep(-.1, 1.1, uv.y + (a.x - .5)*.6));
  col = mix(col, uC2, smoothstep(.5, 1., f)*.55);
  col += uC2*folds*(.10 + uLevel*.35);
  col += uC2*exp(-pow((uv.y + .05)*2.6, 2.))*.35;     // low glow on the horizon
  col += (hash(gl_FragCoord.xy + fract(uTime*3.)*61.) - .5)*.03;
  gl_FragColor = vec4(col, 1.);
}`;
const cur = { c1: hex(SKIES.hero[0]), c2: hex(SKIES.hero[1]), c3: hex(SKIES.hero[2]) };
const silk = shader(document.getElementById('silk'), SILK, {
  maxDpr: 0.6,
  uniforms: { uLevel: 0, uC1: cur.c1, uC2: cur.c2, uC3: cur.c3 },
  beforeDraw() {
    const [t1, t2, t3] = SKIES[sky].map(hex);
    const k = reduced ? 1 : 0.025;
    ['c1', 'c2', 'c3'].forEach((key, j) => {
      const tgt = [t1, t2, t3][j];
      cur[key] = cur[key].map((v, i) => lerp(v, tgt[i], k));
    });
    silk.set('uC1', cur.c1); silk.set('uC2', cur.c2); silk.set('uC3', cur.c3);
    silk.set('uLevel', level);
  }
});
if (!silk) document.documentElement.classList.add('no-gl');
else reduced ? silk.still(6) : silk.start();

/* ═════════ where are we on the page ═════════ */
const plateHs = document.getElementById('plateHs');
let hsW = 0, hsH = 0, hsShow = 0;
const heroSec = document.getElementById('hero');
const libSec = document.getElementById('library');
const SECTION_SKY = { hero: 'hero', wear: 'dawn', works: 'morning', library: 'evening', hz: 'noon', places: 'dusk', why: 'dawn', breath: 'dusk', finish: 'night', waitlist: 'hero' };
const skySections = [...document.querySelectorAll('main > section[id]')];
let zone = 'hero';

function setMode(i) {
  if (i === mode) return;
  mode = i; kick = 1;
  audio.retune();
}

function onScroll() {
  const mid = innerHeight / 2;
  const inRect = el => { const r = el.getBoundingClientRect(); return r.top < mid && r.bottom > mid; };
  // the plate shows in the hero, and faintly behind the vibration library
  zone = inRect(heroSec) ? 'hero' : inRect(libSec) ? 'library' : 'other';
  const at = skySections.find(inRect);
  sky = (at && SECTION_SKY[at.id]) || 'hero';
  if (zone !== 'library' && !libPlaying()) plateMode = MODES[HERO];
  if (reduced) { drawPlate(); silk && silk.redraw(); }
}
addEventListener('scroll', onScroll, { passive: true });

/* ═════════ the plate: sand gathering on the still lines of a vibrating surface ═════════ */
const cv = document.getElementById('plate');
const ctx = cv.getContext('2d');
let W, H, dpr;
const N = innerWidth < 700 ? 3000 : 5200;
const px = new Float32Array(N), py = new Float32Array(N), pv = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
  px[i] = Math.cos(a) * r; py[i] = Math.sin(a) * r;
}
function size() {
  dpr = Math.min(2, devicePixelRatio || 1);
  W = cv.width = innerWidth * dpr;
  H = cv.height = innerHeight * dpr;
}
size();
addEventListener('resize', size);

const PI = Math.PI;
const field = (x, y, n, m) => {
  const u = (x + 1) / 2, v = (y + 1) / 2;
  return Math.cos(n * PI * u) * Math.cos(m * PI * v) - Math.cos(m * PI * u) * Math.cos(n * PI * v);
};

let cx = innerWidth > 900 ? 0.68 : 0.5, cy = innerWidth > 900 ? 0.5 : 0.31, R = 300, alpha = 0, rot = 0;
function stepPlate() {
  level += (Math.min(1, Math.max(audio.read(), libRead()) * 6) - level) * 0.2;
  kick *= 0.985;
  rot += 0.0006 + level * 0.002;
  const { n, m } = plateMode;
  const jitter = 0.012 + kick * 0.06 + level * 0.025;
  const e = 0.002;
  for (let i = 0; i < N; i++) {
    const x = px[i], y = py[i];
    const f = field(x, y, n, m);
    const gx = (field(x + e, y, n, m) - f) / e;
    const gy = (field(x, y + e, n, m) - f) / e;
    const a = Math.abs(f);
    let nx = x + (Math.random() - 0.5) * jitter * a - f * gx * 0.0025;
    let ny = y + (Math.random() - 0.5) * jitter * a - f * gy * 0.0025;
    const r2 = nx * nx + ny * ny;
    if (r2 > 1) { const k = 0.985 / Math.sqrt(r2); nx *= k; ny *= k; }
    pv[i] = pv[i] * 0.9 + a * 0.1;
    px[i] = nx; py[i] = ny;
  }
}
function drawPlate() {
  const wide = innerWidth > 900;
  // in the hero it sits right of the headline (the CSS halo uses the same numbers);
  // behind the library it spreads out wide and faint
  const lib = zone === 'library';
  const tx = lib ? 0.5 : wide ? 0.68 : 0.5, ty = lib ? 0.5 : wide ? 0.5 : 0.31;
  const tr = lib ? Math.min(W, H) * 0.62 : wide ? Math.min(W * 0.28, H * 0.42) : Math.min(W * 0.40, H * 0.30);
  const ta = zone === 'hero' ? 0.6 : lib ? 0.22 : 0;
  const k = reduced ? 1 : 0.05;
  cx += (tx - cx) * k; cy += (ty - cy) * k; R += (tr - R) * k; alpha += (ta - alpha) * k;
  placeHeadset();

  ctx.clearRect(0, 0, W, H);
  if (alpha < 0.01) return;
  const ox = cx * W, oy = cy * H;
  const cr = Math.cos(rot), sr = Math.sin(rot);

  const glow = ctx.createRadialGradient(ox, oy, R * 0.1, ox, oy, R * 1.3);
  glow.addColorStop(0, `rgba(244,194,174,${(0.06 + level * 0.14) * alpha})`);
  glow.addColorStop(1, 'rgba(244,194,174,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(ox, oy, R * 1.3, 0, 7); ctx.fill();
  ctx.strokeStyle = `rgba(247,237,233,${0.16 * alpha})`;
  ctx.lineWidth = dpr;
  ctx.beginPath(); ctx.arc(ox, oy, R * 1.02 + level * 8 * dpr, 0, 7); ctx.stroke();

  // settled grains are pearl, moving ones blush rose
  ctx.globalCompositeOperation = 'lighter';
  const s = 1.4 * dpr;
  ctx.fillStyle = `rgba(255,236,228,${0.62 * alpha})`;
  for (let i = 0; i < N; i++) {
    if (pv[i] > 0.35) continue;
    const x = px[i] * cr - py[i] * sr, y = px[i] * sr + py[i] * cr;
    ctx.fillRect(ox + x * R - s / 2, oy + y * R - s / 2, s, s);
  }
  ctx.fillStyle = `rgba(233,150,180,${0.5 * alpha})`;
  for (let i = 0; i < N; i++) {
    if (pv[i] <= 0.35) continue;
    const x = px[i] * cr - py[i] * sr, y = px[i] * sr + py[i] * cr;
    ctx.fillRect(ox + x * R - s / 2, oy + y * R - s / 2, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
}
if (reduced) {
  kick = 0;
  for (let k = 0; k < 500; k++) stepPlate();
  onScroll();
  addEventListener('scroll', () => { for (let k = 0; k < 80; k++) stepPlate(); drawPlate(); }, { passive: true });
} else {
  (function loop() { requestAnimationFrame(loop); stepPlate(); drawPlate(); })();
}
onScroll();

/* ═════════ breath: four in, hold two, six out ═════════ */
const orb = document.getElementById('brOrb');
const word = document.getElementById('brWord');
const count = document.getElementById('brCount');
const PHASES = [['Breathe in', 4, 0.42, 1], ['Hold', 2, 1, 1], ['Breathe out', 6, 1, 0.42], ['Rest', 1, 0.42, 0.42]];
const CYCLE = PHASES.reduce((s, p) => s + p[1], 0);
let breathOn = false, bStart = 0, lastPhase = -1;
new IntersectionObserver(es => {
  const on = es[0].intersectionRatio > 0.5;
  if (on && !breathOn) { bStart = performance.now(); lastPhase = -1; }
  breathOn = on;
}, { threshold: [0, 0.5, 1] }).observe(breath);
function setWord(txt) {
  if (word.textContent === txt) return;
  word.classList.add('swap');
  setTimeout(() => { word.textContent = txt; word.classList.remove('swap'); }, 300);
}
if (!reduced) {
  (function loop(now) {
    requestAnimationFrame(loop);
    if (!breathOn) return;
    let t = ((now - bStart) / 1000) % CYCLE;
    let i = 0;
    while (t > PHASES[i][1]) { t -= PHASES[i][1]; i++; }
    const [label, dur, from, to] = PHASES[i];
    const k = t / dur;
    const e = 0.5 - Math.cos(k * PI) / 2;
    orb.style.setProperty('--s', lerp(from, to, e).toFixed(4));
    if (i !== lastPhase) {
      lastPhase = i;
      setWord(label);
      if (i === 2) audio.strike(MODES[mode].root, 0.7);   // a bowl on every exhale
    }
    count.textContent = i === 3 ? '·' : Math.ceil(dur - t);
  })(0);
} else {
  orb.style.setProperty('--s', '.8');
  word.textContent = 'Breathe in';
  count.textContent = '';
}

/* ═════════ the headset at the centre of the plate ═════════ */
function placeHeadset() {
  const cssR = R / dpr;
  const w = Math.round(cssR * 1.6), h = Math.round(w * 0.78);
  if (Math.abs(w - hsW) > 1 || Math.abs(h - hsH) > 1) {
    hsW = w; hsH = h;
    plateHs.style.setProperty('--hs-w', w + 'px');
    plateHs.style.setProperty('--hs-h', h + 'px');
  }
  plateHs.style.setProperty('--hs-x', (cx * innerWidth - w / 2).toFixed(1) + 'px');
  plateHs.style.setProperty('--hs-y', (cy * innerHeight - h / 2).toFixed(1) + 'px');
  hsShow += ((zone === 'hero' ? clamp(alpha / 0.55) : 0) - hsShow) * 0.22;
  plateHs.style.setProperty('--hs-o', hsShow.toFixed(3));
}
placeHeadset();

const CHALK = { color: '#EDE8E0', key: 0xffe2d6, rim: 0xc9b6ee, fill: 0xf4c2ae, exposure: 1.0,
  material: { roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, iridescence: 0.55, iridescenceIOR: 1.35, sheen: 0.6, sheenColor: 0xe9a2b8, envMapIntensity: 0.6 } };

import('/js/lp-headset.js').then(({ headset }) => headset(document.getElementById('plateHsCanvas'), CHALK))
  .then(hs => {
    plateHs.classList.add('is-live');
    hs.state.fill = 1.0;
    function frame(now) {
      // a slow turn, and a faint shiver when the bowl is sounding
      hs.state.az = -75 * PI / 180 + (reduced ? 0 : now * 0.00012);
      hs.state.el = (18 + (reduced ? 0 : Math.sin(now / 2600) * 6)) * PI / 180;
      hs.state.y = reduced ? 0 : Math.sin(now / 1900) * 0.02 + (Math.random() - 0.5) * level * 0.01;
      hs.state.x = reduced ? 0 : (Math.random() - 0.5) * level * 0.01;
      hs.rig.scale.setScalar(1 + level * 0.06);
      hs.render();
    }
    if (reduced) { frame(0); addEventListener('scroll', () => frame(0), { passive: true }); }
    else (function loop(now) { requestAnimationFrame(loop); if (hsShow > 0.01) frame(now); })(performance.now());
  })
  .catch(() => { /* the poster stays */ });

/* ═════════ four finishes ═════════ */
const FINISHES = [
  { name: 'Chalk',    hex: '#EDE8E0', note: 'Soft off-white. Our pick for the bath.', rough: 0.42, irid: 0.55 },
  { name: 'Glacier',  hex: '#A8D5E2', note: 'Pale ice blue, like early-morning water.', rough: 0.45, irid: 0.4 },
  { name: 'Obsidian', hex: '#35383C', note: 'Matte charcoal. The quiet one.', rough: 0.58, irid: 0.15 },
  { name: 'Ember',    hex: '#E2542C', note: 'Warm and loud. Made for the sauna.', rough: 0.42, irid: 0.25 }
];
const finStage = document.getElementById('finStage');
const finCanvas = document.getElementById('chalk');
const finNameWrap = document.querySelector('.fin-name');
const finName = document.getElementById('finName');
const finNote = document.getElementById('finNote');
const finList = document.getElementById('finSwatches');
let finPaint = () => {}, finActive = 0;
function pickFinish(i) {
  finActive = i;
  [...finList.children].forEach((li, k) => li.firstChild.setAttribute('aria-checked', String(k === i)));
  finStage.style.setProperty('--fin', FINISHES[i].hex);
  finNameWrap.classList.add('out');
  setTimeout(() => { finName.textContent = FINISHES[i].name; finNote.textContent = FINISHES[i].note; finNameWrap.classList.remove('out'); }, 200);
  finPaint(i);
}
FINISHES.forEach((f, i) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'fin-sw'; b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(i === 0)); b.setAttribute('aria-label', f.name);
  b.style.setProperty('--sw', f.hex);
  b.addEventListener('click', () => pickFinish(i));
  b.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const k = (finActive + d + FINISHES.length) % FINISHES.length;
    pickFinish(k); finList.children[k].firstChild.focus();
  });
  li.appendChild(b); finList.appendChild(li);
});
finStage.style.setProperty('--fin', FINISHES[0].hex);

import('/js/lp-headset.js').then(({ headset }) => headset(finCanvas, CHALK)).then(hs => {
  finStage.classList.add('is-live');
  const { THREE, mat } = hs;
  const from = new THREE.Color(), to = new THREE.Color(FINISHES[0].hex);
  let ct = 1, r0 = mat.roughness, r1 = r0, i0 = mat.iridescence, i1 = i0;
  finPaint = i => { from.copy(mat.color); to.set(FINISHES[i].hex); r0 = mat.roughness; r1 = FINISHES[i].rough; i0 = mat.iridescence; i1 = FINISHES[i].irid; ct = 0; };
  hs.state.fill = 1.12;
  let spin = 0, vel = 0, drag = false, lastX = 0, visible = false, t0 = performance.now();
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(finCanvas);
  finCanvas.addEventListener('pointerdown', e => { drag = true; lastX = e.clientX; finCanvas.setPointerCapture(e.pointerId); });
  finCanvas.addEventListener('pointermove', e => { if (drag) { vel += (e.clientX - lastX) * 0.0006; lastX = e.clientX; } });
  finCanvas.addEventListener('pointerup', () => { drag = false; });
  finCanvas.addEventListener('pointercancel', () => { drag = false; });
  function frame(now) {
    const dt = Math.min(64, now - t0); t0 = now;
    spin += (reduced ? 0 : dt * 0.00012) + vel;
    vel *= 0.94;
    if (ct < 1) {
      ct = Math.min(1, ct + dt / 500);
      const e = ct * ct * (3 - 2 * ct);
      mat.color.copy(from).lerp(to, e);
      mat.roughness = lerp(r0, r1, e); mat.iridescence = lerp(i0, i1, e);
    }
    hs.state.az = -75 * PI / 180 + spin;
    hs.state.el = (16 + (reduced ? 0 : Math.sin(now / 2600) * 5)) * PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(now / 1900) * 0.015;
    hs.render();
  }
  if (reduced) { frame(performance.now()); finPaint = i => { mat.color.set(FINISHES[i].hex); frame(performance.now()); }; }
  else (function loop(now) { requestAnimationFrame(loop); if (visible || ct < 1) frame(now); })(performance.now());
}).catch(() => { /* the poster stays */ });

/* ═════════ hertz lab: drag a frequency, hear it, see it ═════════ */
const tones = {
  ctx: null, out: null, oscs: [],
  async play(freqs) {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.ctx.destination);
    }
    await this.ctx.resume();
    this.stop(true);
    const t = this.ctx.currentTime;
    this.oscs = freqs.map(f => {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      o.connect(this.out); o.start();
      return o;
    });
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0.16 / freqs.length, t, 0.08);
  },
  set(freqs) { freqs.forEach((f, i) => this.oscs[i] && this.oscs[i].frequency.setTargetAtTime(f, this.ctx.currentTime, 0.03)); },
  stop(now) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, old = this.oscs;
    this.out.gain.setTargetAtTime(0, t, now ? 0.01 : 0.12);
    old.forEach(o => o.stop(t + (now ? 0.05 : 0.6)));
    this.oscs = [];
  }
};

const F_MIN = 40, F_MAX = 1000, LOG = Math.log(F_MAX / F_MIN);
const toPct = f => Math.log(f / F_MIN) / LOG * 100;
document.querySelectorAll('.hz-bands .band').forEach(b => {
  const a = +b.style.getPropertyValue('--a'), z = +b.style.getPropertyValue('--b');
  b.style.setProperty('--l', toPct(a) + '%');
  b.style.setProperty('--w', (toPct(z) - toPct(a)) + '%');
});
document.querySelectorAll('.hz-axis span').forEach(s => s.style.setProperty('--l', toPct(+s.style.getPropertyValue('--f')) + '%'));

const hzRange = document.getElementById('hzRange');
const hzNum = document.getElementById('hzNum');
const hzWhat = document.getElementById('hzWhat');
const hzCycles = document.getElementById('hzCycles');
const hzWave = document.getElementById('hzWave');
const hzPlay = document.getElementById('hzPlay');
const hzPlayLabel = document.getElementById('hzPlayLabel');
const beatPlay = document.getElementById('beatPlay');
const beatLabel = document.getElementById('beatLabel');
let hz = 196, hzOn = false, beatOn = false;

function describe(f) {
  if (f < 85) return 'Very low. You feel this on the cheekbones as much as you hear it.';
  if (f < 150) return 'The low drone under a sound bath. Deep, slow and physical.';
  if (f < 320) return 'The singing-bowl sweet spot, and close to where skin is most sensitive to vibration.';
  if (f < 700) return 'Brighter bowl tones. Clearer and more awake.';
  return 'Bell-like overtones: the shimmer that rings on top of a bowl.';
}
function setHz() {
  hz = Math.round(F_MIN * Math.exp(hzRange.value / 1000 * LOG));
  hzNum.textContent = hz;
  hzWhat.textContent = describe(hz);
  hzCycles.textContent = `${hz} vibrations every second`;
  hzRange.setAttribute('aria-valuetext', `${hz} hertz`);
  if (hzOn) tones.set([hz]);
}
hzRange.addEventListener('input', setHz);
setHz();

function setButtons() {
  hzPlay.setAttribute('aria-pressed', String(hzOn));
  hzPlayLabel.textContent = hzOn ? 'Stop the tone' : 'Hear this tone';
  beatPlay.setAttribute('aria-pressed', String(beatOn));
  beatLabel.textContent = beatOn ? 'Stop' : 'Hear 196 Hz + 199 Hz';
}
hzPlay.addEventListener('click', () => {
  hzOn = !hzOn; beatOn = false;
  hzOn ? tones.play([hz]) : tones.stop();
  setButtons();
});
beatPlay.addEventListener('click', () => {
  beatOn = !beatOn; hzOn = false;
  beatOn ? tones.play([196, 199]) : tones.stop();
  setButtons();
});
// stop test tones once they scroll away
const hzSec = document.getElementById('hz');
new IntersectionObserver(es => {
  if (!es[0].isIntersecting && (hzOn || beatOn)) { hzOn = beatOn = false; tones.stop(); setButtons(); }
}).observe(hzSec);

// scopes: the wave you are hearing, and two close tones beating
const beatA = document.getElementById('beatA'), beatB = document.getElementById('beatB'), beatSum = document.getElementById('beatSum');
let hzVisible = false;
new IntersectionObserver(es => { hzVisible = es[0].isIntersecting; }).observe(hzSec);
function drawScopes(now) {
  const t = now / 1000;
  // show the cycles as they'd look over a 25 ms window, so 40 Hz = 1 wave and 1 kHz = 25
  const cycles = hz * 0.025;
  const amp = 70 + (hzOn ? 10 : 0);
  let d = '';
  for (let x = 0; x <= 600; x += 2) {
    const y = 100 + Math.sin((x / 600) * cycles * Math.PI * 2 - t * 3) * amp;
    d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1);
  }
  hzWave.setAttribute('d', d);

  // illustrative: two waves a little apart (20 vs 22 cycles) so the swells are easy to see
  let a = '', b = '', sum = '';
  for (let x = 0; x <= 600; x += 2) {
    const u = x / 600;
    const va = Math.sin(u * 20 * Math.PI * 2 - t * 4);
    const vb = Math.sin(u * 22 * Math.PI * 2 - t * 4.6);
    const ya = 55 + va * 28, yb = 55 + vb * 28, ys = 160 + (va + vb) * 26;
    a += (x ? 'L' : 'M') + x + ' ' + ya.toFixed(1);
    b += (x ? 'L' : 'M') + x + ' ' + yb.toFixed(1);
    sum += (x ? 'L' : 'M') + x + ' ' + ys.toFixed(1);
  }
  beatA.setAttribute('d', a); beatB.setAttribute('d', b); beatSum.setAttribute('d', sum);
}
if (reduced) drawScopes(2000);
else (function loop(now) { requestAnimationFrame(loop); if (hzVisible) drawScopes(now); })(0);
hzRange.addEventListener('input', () => { if (reduced) drawScopes(2000); });

/* ═════════ the vibration library: nine generated sounds ═════════ */
var LIB = null;   // assigned below; the plate asks about it every frame
function libPlaying() { return !!(LIB && LIB.current); }
function libRead() { return LIB ? LIB.read() : 0; }
const LIB_MODES = {
  bowl: { n: 2, m: 5 }, crystal: { n: 3, m: 7 }, gong: { n: 1, m: 4 }, fork: { n: 1, m: 2 }, ocean: { n: 2, m: 3 },
  rain: { n: 3, m: 5 }, om: { n: 3, m: 4 }, heart: { n: 2, m: 4 }, theta: { n: 4, m: 5 }
};
const LIB_NAMES = { bowl: 'Singing bowl', crystal: 'Crystal bowl', gong: 'Gong wash', fork: 'Tuning fork', ocean: 'Ocean drone', rain: 'Rain and pad', om: 'Om drone', heart: 'Slow pulse', theta: 'Theta beat' };

LIB = {
  ctx: null, out: null, wet: null, an: null, buf: null, current: null, voice: null, noise: {},
  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.out = ctx.createGain(); this.out.gain.value = 0.9;
    this.an = ctx.createAnalyser(); this.an.fftSize = 1024; this.buf = new Float32Array(1024);
    const comp = ctx.createDynamicsCompressor();
    this.out.connect(comp).connect(this.an).connect(ctx.destination);
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.45;
    this.wet.connect(verb).connect(this.out);
  },
  noiseBuf(kind) {
    if (this.noise[kind]) return this.noise[kind];
    const ctx = this.ctx, len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === 'drops') d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) : 0;
      else d[i] = w;
    }
    return (this.noise[kind] = b);
  },
  src(kind) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf(kind); s.loop = true; return s; },
  async play(id) {
    if (!this.ctx) this.init();
    await this.ctx.resume();
    this.stop();
    this.current = id;
    const ctx = this.ctx, vg = ctx.createGain(), timers = [], nodes = [];
    vg.gain.value = 0;
    vg.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    vg.connect(this.out); vg.connect(this.wet);
    const v = { vg, timers, nodes };
    VOICES[id](this, v);
    this.voice = v;
  },
  stop() {
    if (!this.voice) { this.current = null; return; }
    const v = this.voice, t = this.ctx.currentTime;
    v.timers.forEach(clearTimeout); v.timers.forEach(clearInterval);
    v.vg.gain.cancelScheduledValues(t);
    v.vg.gain.setTargetAtTime(0, t, 0.35);
    setTimeout(() => { v.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); v.vg.disconnect(); }, 2200);
    this.voice = null; this.current = null;
  },
  read() {
    if (!this.ctx || !this.current) return 0;
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0; for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.sqrt(s / this.buf.length);
  }
};

function tone(L, v, freq, at, vol, decay, type = 'sine', attack = 0.01) {
  const o = L.ctx.createOscillator(), g = L.ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(g).connect(v.vg); o.start(at); o.stop(at + decay + 0.1);
}
function every(v, ms, fn) { fn(); v.timers.push(setInterval(fn, ms)); }

const VOICES = {
  bowl(L, v) {
    const notes = [196, 196 * 1.5, 196 * 2, 196];
    let k = 0;
    every(v, 5600, () => {
      const f = notes[k++ % notes.length], t = L.ctx.currentTime + 0.05;
      [[1, 1], [2.76, 0.42], [5.4, 0.2], [8.93, 0.08]].forEach(([r, a]) =>
        [-0.7, 0.7].forEach(dt => tone(L, v, f * r + dt, t, 0.07 * a, 9 / Math.sqrt(r))));
    });
  },
  crystal(L, v) {
    const g = L.ctx.createGain(); g.gain.value = 0; g.connect(v.vg);
    const t = L.ctx.currentTime;
    g.gain.linearRampToValueAtTime(0.11, t + 2.5);
    const lfo = L.ctx.createOscillator(), la = L.ctx.createGain();
    lfo.frequency.value = 0.15; la.gain.value = 0.035; lfo.connect(la).connect(g.gain); lfo.start(); v.nodes.push(lfo);
    [[523.25, 1], [524.9, 0.8], [1046.5, 0.18], [1569.8, 0.05]].forEach(([f, a]) => {
      const o = L.ctx.createOscillator(), og = L.ctx.createGain();
      o.frequency.value = f; og.gain.value = a; o.connect(og).connect(g); o.start(); v.nodes.push(o);
    });
  },
  gong(L, v) {
    const bank = [[62, 0.5], [97, 0.45], [141, 0.4], [189, 0.35], [262, 0.3], [347, 0.22], [455, 0.16], [610, 0.1]];
    const swellGain = L.ctx.createGain(); swellGain.gain.value = 0; swellGain.connect(v.vg);
    const src = L.src('white'); src.start(); v.nodes.push(src);
    bank.forEach(([f, a]) => {
      const bp = L.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 38;
      const g = L.ctx.createGain(); g.gain.value = a * 1.6;
      src.connect(bp).connect(g).connect(swellGain);
    });
    every(v, 13000, () => {
      const t = L.ctx.currentTime;
      swellGain.gain.cancelScheduledValues(t);
      swellGain.gain.setValueAtTime(Math.max(0.02, swellGain.gain.value), t);
      swellGain.gain.linearRampToValueAtTime(0.55, t + 3.2);
      swellGain.gain.exponentialRampToValueAtTime(0.03, t + 12.5);
      tone(L, v, 55, t, 0.06, 11, 'sine', 2.5);
    });
  },
  fork(L, v) {
    every(v, 6500, () => {
      const t = L.ctx.currentTime + 0.05;
      tone(L, v, 128, t, 0.2, 7);
      tone(L, v, 256, t, 0.025, 1.6);
      tone(L, v, 128 * 6.27, t, 0.01, 0.3);
    });
  },
  ocean(L, v) {
    const src = L.src('brown'); src.start(); v.nodes.push(src);
    const lp = L.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 760;
    const g = L.ctx.createGain(); g.gain.value = 0.2;
    const lfo = L.ctx.createOscillator(), la = L.ctx.createGain();
    lfo.frequency.value = 0.1; la.gain.value = 0.17; lfo.connect(la).connect(g.gain); lfo.start(); v.nodes.push(lfo);
    src.connect(lp).connect(g).connect(v.vg);
    const foam = L.src('white'); foam.start(); v.nodes.push(foam);
    const hp = L.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const fg = L.ctx.createGain(); fg.gain.value = 0.012; la.connect(fg.gain);
    foam.connect(hp).connect(fg).connect(v.vg);
  },
  rain(L, v) {
    const hiss = L.src('white'); hiss.start(); v.nodes.push(hiss);
    const hp = L.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const hg = L.ctx.createGain(); hg.gain.value = 0.035;
    hiss.connect(hp).connect(hg).connect(v.vg);
    const drops = L.src('drops'); drops.start(); v.nodes.push(drops);
    const bp = L.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
    const dg = L.ctx.createGain(); dg.gain.value = 0.35;
    drops.connect(bp).connect(dg).connect(v.vg);
    const lp = L.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(v.vg);
    [130.8, 164.8, 196, 246.9].forEach(f => {
      const o = L.ctx.createOscillator(), og = L.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f; og.gain.value = 0.018; o.connect(og).connect(lp); o.start(); v.nodes.push(o);
    });
  },
  om(L, v) {
    const g = L.ctx.createGain(); g.gain.value = 0.06; g.connect(v.vg);
    const lfo = L.ctx.createOscillator(), la = L.ctx.createGain();
    lfo.frequency.value = 0.07; la.gain.value = 0.04; lfo.connect(la).connect(g.gain); lfo.start(); v.nodes.push(lfo);
    const vib = L.ctx.createOscillator(), va = L.ctx.createGain();
    vib.frequency.value = 4.6; va.gain.value = 0.5; vib.connect(va); vib.start(); v.nodes.push(vib);
    const mix = L.ctx.createGain(); mix.gain.value = 1;
    [136.1, 136.6].forEach(f => {
      const o = L.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; va.connect(o.frequency);
      o.connect(mix); o.start(); v.nodes.push(o);
    });
    [[400, 5, 1], [800, 8, 0.5], [2600, 12, 0.12]].forEach(([f, q, a]) => {
      const bp = L.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const fg = L.ctx.createGain(); fg.gain.value = a;
      mix.connect(bp).connect(fg).connect(g);
    });
  },
  heart(L, v) {
    const lp = L.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.connect(v.vg);
    const thump = (t, f, a, d) => {
      const o = L.ctx.createOscillator(), g = L.ctx.createGain();
      o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(lp); o.start(t); o.stop(t + d + 0.05);
    };
    every(v, 1000, () => { const t = L.ctx.currentTime + 0.05; thump(t, 56, 0.55, 0.16); thump(t + 0.28, 48, 0.32, 0.13); });
  },
  theta(L, v) {
    [[200, -1], [206, 1]].forEach(([f, pan]) => {
      const o = L.ctx.createOscillator(), g = L.ctx.createGain(), p = L.ctx.createStereoPanner();
      o.frequency.value = f; g.gain.value = 0.075; p.pan.value = pan;
      o.connect(g).connect(p).connect(v.vg); o.start(); v.nodes.push(o);
    });
    const bed = L.src('brown'); bed.start(); v.nodes.push(bed);
    const bg = L.ctx.createGain(); bg.gain.value = 0.03; bed.connect(bg).connect(v.vg);
  }
};

/* the cards, the try buttons, and a "now playing" pill that follows you down the page */
const samples = [...document.querySelectorAll('.sample')];
const tries = [...document.querySelectorAll('.try')];
const pill = document.createElement('div');
pill.className = 'now';
pill.innerHTML = '<span class="now-bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="now-t">Now playing <b></b></span><button type="button">Stop</button>';
pill.setAttribute('role', 'status');
document.body.appendChild(pill);
pill.querySelector('button').addEventListener('click', () => libToggle(LIB.current));

function syncLibUi() {
  const cur = LIB.current;
  samples.forEach(c => {
    const on = c.dataset.id === cur;
    c.classList.toggle('is-on', on);
    const b = c.querySelector('.smp-play');
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('.lbl').textContent = on ? 'Stop' : 'Play';
  });
  tries.forEach(t => t.classList.toggle('is-on', t.dataset.try === cur));
  pill.classList.toggle('on', !!cur);
  if (cur) pill.querySelector('b').textContent = LIB_NAMES[cur];
}
function libToggle(id) {
  if (!id) return;
  if (LIB.current === id) { LIB.stop(); plateMode = MODES[HERO]; }
  else {
    // one sound at a time: quiet the hero bowl if it's on
    if (play.getAttribute('aria-pressed') === 'true') play.click();
    LIB.play(id);
    plateMode = LIB_MODES[id]; kick = 1;
  }
  syncLibUi();
}
samples.forEach(c => c.querySelector('.smp-play').addEventListener('click', () => libToggle(c.dataset.id)));
tries.forEach(t => t.addEventListener('click', () => libToggle(t.dataset.try)));
play.addEventListener('click', () => { if (play.getAttribute('aria-pressed') === 'true' && LIB.current) { LIB.stop(); syncLibUi(); } });

/* each card draws its own picture of the sound */
const CL = { a: '244,194,174', r: '233,162,184', l: '201,182,238', p: '255,240,232' };
const DRAW = {
  bowl(g, w, h, t, a) {
    for (let k = 0; k < 7; k++) {
      const ph = (t * 0.22 + k / 7) % 1;
      g.strokeStyle = `rgba(${CL.a},${(1 - ph) * (0.22 + a * 0.6)})`;
      g.lineWidth = 1.4 * dpr;
      g.beginPath(); g.arc(w / 2, h / 2, ph * w * 0.55, 0, 7); g.stroke();
    }
  },
  crystal(g, w, h, t, a) {
    const n = 24;
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2 + t * 0.05;
      const len = h * (0.16 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7))) * (0.7 + a);
      g.strokeStyle = `rgba(${i % 2 ? CL.l : CL.p},${0.25 + a * 0.5})`;
      g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.moveTo(w / 2 + Math.cos(ang) * h * 0.08, h / 2 + Math.sin(ang) * h * 0.08);
      g.lineTo(w / 2 + Math.cos(ang) * (h * 0.08 + len), h / 2 + Math.sin(ang) * (h * 0.08 + len)); g.stroke();
    }
  },
  gong(g, w, h, t, a) {
    const R = h * (0.3 + 0.03 * Math.sin(t * 0.7)) * (1 + a * 0.25);
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, R * 1.4);
    grd.addColorStop(0, `rgba(${CL.a},${0.25 + a * 0.4})`); grd.addColorStop(1, `rgba(${CL.r},0)`);
    g.fillStyle = grd; g.beginPath(); g.arc(w / 2, h / 2, R * 1.4, 0, 7); g.fill();
    for (let ring = 0; ring < 3; ring++) {
      g.strokeStyle = `rgba(${CL.p},${0.18 + a * 0.3 - ring * 0.05})`; g.lineWidth = 1.2 * dpr;
      g.beginPath();
      for (let k = 0; k <= 120; k++) {
        const ang = k / 120 * Math.PI * 2;
        const r = R * (0.6 + ring * 0.25) + Math.sin(ang * (5 + ring * 2) + t * (0.8 + ring * 0.3)) * h * 0.02 * (1 + a * 3);
        const x = w / 2 + Math.cos(ang) * r, y = h / 2 + Math.sin(ang) * r;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
  },
  fork(g, w, h, t, a) {
    const env = Math.exp(-((t % 6.5) / 2.2));
    g.strokeStyle = `rgba(${CL.a},${0.35 + a * 0.5})`; g.lineWidth = 1.6 * dpr;
    g.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const y = h / 2 + Math.sin(x / w * Math.PI * 2 * 12 - t * 10) * h * 0.3 * (0.25 + env * (0.4 + a)) * Math.sin(x / w * Math.PI);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  },
  ocean(g, w, h, t, a) {
    const swell = 0.5 + 0.5 * Math.sin(t * 0.63);
    [[CL.l, 0.18, 0], [CL.r, 0.22, 1.5], [CL.a, 0.3, 3]].forEach(([c, al, off], i) => {
      g.fillStyle = `rgba(${c},${al + a * 0.2})`;
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) g.lineTo(x, h * (0.45 + i * 0.12) + Math.sin(x * 0.012 / dpr + t * (0.6 + i * 0.2) + off) * h * 0.07 * (0.6 + swell));
      g.lineTo(w, h); g.fill();
    });
  },
  rain(g, w, h, t, a) {
    g.strokeStyle = `rgba(${CL.l},${0.35 + a * 0.4})`; g.lineWidth = 1.1 * dpr;
    g.beginPath();
    for (let i = 0; i < 46; i++) {
      const x = (i * 53.7 * dpr) % w, sp = (0.5 + (i % 5) * 0.12) * h;
      const y = ((t * sp + i * 37 * dpr) % (h + 20 * dpr)) - 10 * dpr;
      g.moveTo(x, y); g.lineTo(x - 3 * dpr, y + 12 * dpr);
    }
    g.stroke();
    g.fillStyle = `rgba(${CL.a},${0.12 + a * 0.2})`;
    g.fillRect(0, h * 0.86, w, h * 0.14);
  },
  om(g, w, h, t, a) {
    const base = h * 0.26 * (1 + 0.12 * Math.sin(t * 0.44));
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, base * 1.6);
    grd.addColorStop(0, `rgba(${CL.a},${0.35 + a * 0.4})`); grd.addColorStop(1, `rgba(${CL.l},0)`);
    g.fillStyle = grd;
    g.beginPath();
    for (let k = 0; k <= 160; k++) {
      const ang = k / 160 * Math.PI * 2;
      const r = base * (1 + 0.08 * Math.sin(ang * 3 + t) + 0.05 * Math.sin(ang * 5 - t * 1.3) * (1 + a * 4));
      const x = w / 2 + Math.cos(ang) * r * 1.4, y = h / 2 + Math.sin(ang) * r;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.fill();
  },
  heart(g, w, h, t, a) {
    g.strokeStyle = `rgba(${CL.r},${0.4 + a * 0.5})`; g.lineWidth = 1.6 * dpr;
    g.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const ph = (x / w * 2.5 - t) % 1, p = ph < 0 ? ph + 1 : ph;
      const bump = Math.exp(-Math.pow((p - 0.2) * 40, 2)) - 0.5 * Math.exp(-Math.pow((p - 0.27) * 34, 2)) + 0.4 * Math.exp(-Math.pow((p - 0.48) * 30, 2));
      const y = h / 2 - bump * h * 0.3 * (0.6 + a);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  },
  theta(g, w, h, t, a) {
    [[CL.a, 20, 0, 0.32], [CL.l, 22, 0.6, 0.32]].forEach(([c, cyc, off, yy]) => {
      g.strokeStyle = `rgba(${c},${0.35 + a * 0.3})`; g.lineWidth = 1.2 * dpr; g.beginPath();
      for (let x = 0; x <= w; x += 2) { const y = h * yy + Math.sin(x / w * Math.PI * 2 * cyc - t * (3 + off)) * h * 0.1; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    });
    g.strokeStyle = `rgba(${CL.p},${0.45 + a * 0.4})`; g.lineWidth = 1.8 * dpr; g.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const u = x / w, y = h * 0.68 + (Math.sin(u * Math.PI * 2 * 20 - t * 3) + Math.sin(u * Math.PI * 2 * 22 - t * 3.6)) * h * 0.1;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
};
const cards = samples.map(c => ({ el: c, id: c.dataset.id, cv: c.querySelector('canvas'), g: c.querySelector('canvas').getContext('2d'), vis: false, lvl: 0 }));
function sizeCards() { cards.forEach(c => { c.cv.width = c.cv.clientWidth * dpr; c.cv.height = c.cv.clientHeight * dpr; }); }
sizeCards(); addEventListener('resize', sizeCards);
const cio = new IntersectionObserver(es => es.forEach(e => { const c = cards.find(k => k.el === e.target); if (c) c.vis = e.isIntersecting; }));
cards.forEach(c => cio.observe(c.el));
function drawCards(now) {
  const t = now / 1000, lv = Math.min(1, libRead() * 7);
  for (const c of cards) {
    if (!c.vis) continue;
    c.lvl += ((c.id === LIB.current ? 0.35 + lv : 0.08) - c.lvl) * 0.12;
    c.g.clearRect(0, 0, c.cv.width, c.cv.height);
    DRAW[c.id](c.g, c.cv.width, c.cv.height, t, c.lvl);
  }
}
if (reduced) drawCards(4000);
else (function loop(now) { requestAnimationFrame(loop); drawCards(now); })(0);

/* ═════════ motion: the flower draws itself, the deck deals, sections arrive ═════════ */
if (gsap && !reduced) {
  gsap.fromTo('.flower circle', { '--dash': 380 }, { '--dash': 0, duration: 2.6, ease: 'power2.inOut', stagger: 0.06, delay: 0.6 });
  gsap.from('.sample', { y: 70, opacity: 0, rotate: 1.5, stagger: 0.07, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.lib-grid', start: 'top 82%', once: true } });
  gsap.from('.lib-head > *', { y: 30, opacity: 0, stagger: 0.1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.lib-head', start: 'top 85%', once: true } });

  const deck = [...document.querySelectorAll('.pcard')];
  deck.forEach((c, i) => gsap.set(c, { zIndex: i + 1 }));
  gsap.set(deck.slice(1), { yPercent: 120, rotate: i => (i % 2 ? -5 : 5), opacity: 1 });
  const tl = gsap.timeline({
    scrollTrigger: { trigger: '#places', pin: '.pl-pin', start: 'top top', end: () => `+=${(deck.length - 1) * innerHeight * 0.75}`, scrub: 0.7, invalidateOnRefresh: true }
  });
  // each card's line art draws itself as it lands on the deck
  const artOf = c => [...c.querySelectorAll('.la path:not(.steam):not(.smoke):not(.ripple), .la circle:not(.bub):not(.star), .la ellipse')];
  deck.forEach(c => artOf(c).forEach(el => { const len = el.getTotalLength ? Math.ceil(el.getTotalLength()) : 400; gsap.set(el, { strokeDasharray: len, strokeDashoffset: len }); }));
  tl.to(artOf(deck[0]), { strokeDashoffset: 0, duration: 0.8, ease: 'power2.out' }, 0);
  deck.forEach((c, i) => {
    if (!i) return;
    tl.to(c, { yPercent: 0, rotate: (i % 2 ? -1.2 : 1.2), duration: 1, ease: 'power2.out' }, i - 1)
      .to(deck[i - 1], { scale: 0.93, yPercent: -4, filter: 'brightness(.55)', duration: 1, ease: 'power2.out' }, i - 1)
      .to(artOf(c), { strokeDashoffset: 0, duration: 0.9, ease: 'power2.out' }, i - 0.6);
  });
  gsap.from('.why-list li', { y: 40, opacity: 0, stagger: 0.1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.why-list', start: 'top 85%', once: true } });
  ScrollTrigger.refresh();
} else {
  document.documentElement.classList.add('deck-static');
}
