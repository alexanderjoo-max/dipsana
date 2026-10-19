import { shader, GLSL } from '/js/lp-gl.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

/* Each moment of the day gets its own plate mode, bowl and sky. The hero uses the last slot. */
const MODES = [
  { n: 2, m: 5, root: 196.0 },   // meditate · G3
  { n: 1, m: 4, root: 220.0 },   // drive · A3
  { n: 3, m: 7, root: 293.7 },   // reset · D4, brighter
  { n: 2, m: 3, root: 174.6 },   // soak · F3
  { n: 3, m: 5, root: 164.8 },   // unwind · E3
  { n: 1, m: 2, root: 130.8 },   // sleep · C3, lowest
  { n: 3, m: 4, root: 196.0 }    // hero
];
const HERO = MODES.length - 1;
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
const moments = [...document.querySelectorAll('.moment')];
const day = document.getElementById('day');
const breath = document.getElementById('breath');
const feel = document.querySelector('.feel');
const dayClock = document.getElementById('dayClock');
const dcArc = document.getElementById('dcArc');
const dcTime = document.getElementById('dcTime');
let zone = 'hero';
const TIMES = moments.map(m => {
  const [h, mm] = m.querySelector('time').textContent.split(':').map(Number);
  return h * 60 + mm;
});

function setMode(i) {
  if (i === mode) return;
  mode = i; kick = 1;
  audio.retune();
}

function onScroll() {
  const mid = innerHeight / 2;
  const inRect = el => { const r = el.getBoundingClientRect(); return r.top < mid && r.bottom > mid; };
  const dr = day.getBoundingClientRect();
  zone = inRect(breath) ? 'breath' : inRect(day) ? 'day' : inRect(feel) ? 'feel' : dr.bottom <= mid ? 'after' : 'hero';
  dayClock.classList.toggle('is-on', zone === 'day');

  if (zone === 'hero' || zone === 'feel' || zone === 'breath') {
    setMode(HERO);
    sky = zone === 'breath' ? 'dusk' : 'hero';
    moments.forEach(m => m.classList.remove('is-on'));
  } else {
    let active = zone === 'after' ? moments.length - 1 : 0;
    if (zone === 'day') moments.forEach((m, i) => { if (inRect(m)) active = i; });
    moments.forEach((m, i) => m.classList.toggle('is-on', i === active && zone === 'day'));
    sky = moments[active].dataset.sky;
    setMode(+moments[active].dataset.mode);

    // the day clock runs continuously between the moments
    // centred on a moment the clock reads that moment's time
    const f = clamp(clamp((mid - dr.top) / dr.height) * moments.length - 0.5, 0, moments.length - 1);
    const i = Math.min(moments.length - 1, Math.floor(f));
    const nextT = TIMES[Math.min(TIMES.length - 1, i + 1)];
    const mins = i === moments.length - 1 ? TIMES[i] : lerp(TIMES[i], nextT, f - i);
    const hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
    dcTime.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    dcArc.style.setProperty('--o', 289 * (1 - (mins - TIMES[0]) / (TIMES[TIMES.length - 1] - TIMES[0])));
  }
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

let cx = 0.5, cy = 0.52, R = 300, alpha = 0, rot = 0;
function stepPlate() {
  level += (Math.min(1, audio.read() * 6) - level) * 0.2;
  kick *= 0.985;
  rot += 0.0006 + level * 0.002;
  const { n, m } = MODES[mode];
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
  let tx = 0.5, ty = 0.52, tr = Math.min(W, H) * 0.42, ta = 0.42;
  if (zone === 'day' && wide) { tx = 0.68; ty = 0.5; tr = Math.min(W * 0.28, H * 0.42); ta = 1; }
  else if (zone === 'day') { tx = 0.5; ty = 0.34; tr = Math.min(W, H) * 0.44; ta = 0.7; }
  else if (zone === 'feel') { ta = 0.12; }
  else if (zone === 'breath') { ta = 0; }
  else if (zone === 'after') { ta = 0; }
  const k = reduced ? 1 : 0.05;
  cx += (tx - cx) * k; cy += (ty - cy) * k; R += (tr - R) * k; alpha += (ta - alpha) * k;

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

/* ═════════ feel: a slow waveform under the words ═════════ */
const wavePaths = [...document.querySelectorAll('#wave path')];
let waveOn = false;
new IntersectionObserver(es => { waveOn = es[0].isIntersecting; }).observe(feel);
function drawWave(now) {
  const t = now / 1000;
  wavePaths.forEach((p, j) => {
    let d = '';
    const amp = 34 + j * 9 + level * 60;
    for (let x = 0; x <= 1200; x += 12) {
      const env = Math.sin((x / 1200) * PI);
      const y = 100 + Math.sin(x * 0.012 + t * (0.6 + j * 0.13) + j * 1.3) * amp * env * Math.sin(t * 0.3 + j);
      d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1);
    }
    p.setAttribute('d', d);
  });
}
if (reduced) drawWave(4000);
else (function loop(now) { requestAnimationFrame(loop); if (waveOn) drawWave(now); })(0);

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

/* ═════════ the object: the real headset in Chalk ═════════ */
const chalk = document.getElementById('chalk');
const media = chalk.parentElement;
import('/js/lp-headset.js').then(({ headset }) => headset(chalk, {
  color: '#EDE8E0', key: 0xffe2d6, rim: 0xc9b6ee, fill: 0xf4c2ae, exposure: 1.0,
  material: { roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, iridescence: 0.55, iridescenceIOR: 1.35, sheen: 0.6, sheenColor: 0xe9a2b8, envMapIntensity: 0.6 }
})).then(hs => {
  media.classList.add('is-live');
  hs.state.fill = 0.86;
  let spin = 0, vel = 0, drag = false, lastX = 0, visible = false;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(chalk);
  chalk.addEventListener('pointerdown', e => { drag = true; lastX = e.clientX; chalk.setPointerCapture(e.pointerId); });
  chalk.addEventListener('pointermove', e => { if (drag) { vel += (e.clientX - lastX) * 0.0006; lastX = e.clientX; } });
  chalk.addEventListener('pointerup', () => { drag = false; });
  let t0 = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - t0); t0 = now;
    spin += (reduced ? 0 : dt * 0.00012) + vel;
    vel *= 0.94;
    hs.state.az = -75 * PI / 180 + spin;
    hs.state.el = (16 + Math.sin(now / 2600) * (reduced ? 0 : 5)) * PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(now / 1900) * 0.015;
    hs.render();
  }
  if (reduced) frame(performance.now());
  else (function loop(now) { requestAnimationFrame(loop); if (visible) frame(now); })(performance.now());
}).catch(() => { /* the poster stays */ });
