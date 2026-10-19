import { shader, GLSL } from '/js/lp-gl.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ═════════ Hero: a beach in the middle of the day ═════════ */
const BEACH = GLSL.noise + `
uniform vec2 uRes; uniform float uTime; uniform float uDpr; uniform vec2 uMouse;
uniform float uHorizon; uniform vec2 uSun;

vec3 skyCol(vec2 uv, float aspect){
  vec3 top = vec3(.42, .74, .9), low = vec3(.86, .95, .98);
  vec3 c = mix(low, top, smoothstep(uHorizon, 1.05, uv.y));
  vec2 d = (uv - uSun)*vec2(aspect, 1.);
  float r = length(d);
  c += vec3(1., .93, .7)*exp(-r*5.)*.45;          // glow
  c = mix(c, vec3(1., .98, .9), smoothstep(.052, .045, r));   // disc
  // a few slow, thin clouds
  float cl = fbm(vec2(uv.x*aspect*1.6 + uTime*.01, uv.y*5.));
  c = mix(c, vec3(1.), smoothstep(.62, .82, cl)*.55*smoothstep(uHorizon + .05, uHorizon + .3, uv.y));
  return c;
}

void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  float aspect = uRes.x/uRes.y;
  float t = uTime;
  vec3 col;

  // where the last wave has washed up to
  float wash = .17 + sin(t*.45)*.035 + (fbm(vec2(uv.x*aspect*2.5 + t*.05, t*.1)) - .5)*.05;

  if(uv.y > uHorizon){
    col = skyCol(uv, aspect);
  } else if(uv.y > wash){
    // sea, in perspective: far rows squeeze toward the horizon
    float depth = uHorizon - uv.y;
    float z = .09/depth;
    vec2 p = vec2((uv.x - .5)*aspect*z, z + t*.35);
    vec2 n = vec2(fbm(p*vec2(1.4, 2.6)), fbm(p*vec2(1.4, 2.6) + 7.)) - .5;
    float fres = smoothstep(.0, .25, 1. - depth/(uHorizon - wash));
    vec3 deep = vec3(.06, .42, .62), shallow = vec3(.19, .74, .78);
    float shore = smoothstep(uHorizon - wash, 0., depth - .0);
    col = mix(shallow, deep, smoothstep(.05, .45, depth/(uHorizon - wash)));
    col = mix(col, vec3(.72, .88, .95), fres*.55);          // sky reflected far out
    col += (n.x + n.y)*.08;
    // sun glitter: a sparkling path under the sun
    float path = exp(-pow((uv.x - uSun.x)*aspect*(2.2 + 6.*depth), 2.));
    float glit = pow(clamp(vnoise(p*vec2(18., 30.) + n*6. + t*1.5), 0., 1.), 16.);
    col += vec3(1., .97, .85)*glit*(1.4*path + .25);
    // wave crests rolling in, brighter as they near the shore
    float crest = smoothstep(.8, .98, sin(z*9. - t*1.6 + n.x*3.)*.5 + .5);
    col = mix(col, vec3(.95, .99, 1.), crest*smoothstep(.25, .0, depth)*.55);
    // foam fringe right at the wash line
    float fringe = smoothstep(.035, .0, uv.y - wash) + .5*smoothstep(.6, .9, fbm(vec2(uv.x*aspect*14., uv.y*40. - t)))*smoothstep(.07, .0, uv.y - wash);
    col = mix(col, vec3(1.), clamp(fringe, 0., 1.)*.85);
  } else {
    // sand, darker where the water has just been
    vec3 dry = vec3(.95, .86, .66), wet = vec3(.74, .63, .48);
    float wetness = smoothstep(.07, .0, wash - uv.y);
    col = mix(dry, wet, wetness*.8);
    col += (hash(floor(gl_FragCoord.xy/(2.*uDpr))) - .5)*.05;          // grain of sand
    col *= .96 + .04*fbm(uv*vec2(aspect*8., 20.));
  }
  // horizon haze
  col = mix(col, vec3(.88, .95, .98), exp(-abs(uv.y - uHorizon)*60.)*.6);
  gl_FragColor = vec4(col, 1.);
}`;

const hero = document.getElementById('hero');
const beach = shader(document.getElementById('beach'), BEACH, {
  maxDpr: 1.25,
  uniforms: { uHorizon: 0.5, uSun: [0.8, 0.82] },
  beforeDraw() {
    const wide = innerWidth > 900;
    beach.set('uHorizon', wide ? 0.42 : 0.4);
    beach.set('uSun', wide ? [0.62, 0.86] : [0.78, 0.86]);
  }
});
if (beach) reduced ? beach.still(4) : beach.start();

/* the headset, floating in the sky */
const SUNNY = { key: 0xfff1d6, rim: 0x9fd6ee, fill: 0xffe2c4, exposure: 1.12 };
const heroHs = document.getElementById('heroHs');
import('/js/lp-headset.js').then(({ headset }) => headset(document.getElementById('heroHsCanvas'), {
  ...SUNNY, color: '#E2542C', material: { roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 }
})).then(hs => {
  heroHs.classList.add('is-live');
  let on = true;
  new IntersectionObserver(es => { on = es[0].isIntersecting; }).observe(hero);
  hs.state.fill = 1.0;
  function frame(now) {
    const s = now / 1000;
    hs.state.az = -75 * Math.PI / 180 + (reduced ? 0 : Math.sin(s * 0.35) * 0.6 + s * 0.08);
    hs.state.el = (16 + (reduced ? 0 : Math.sin(s * 0.6) * 6)) * Math.PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(s * 0.9) * 0.03;
    hs.render();
  }
  if (reduced) frame(0);
  else (function loop(now) { requestAnimationFrame(loop); if (on) frame(now); })(performance.now());
}).catch(() => {});

/* ═════════ Where it goes: vertical scroll drives a horizontal row of cards ═════════ */
const trail = document.getElementById('trail');
const cards = document.getElementById('cards');
const trailBar = document.getElementById('trailBar');
let travel = 0;
function sizeTrail() {
  travel = Math.max(0, cards.scrollWidth - innerWidth);
  trail.style.setProperty('--trail-h', `${travel + innerHeight * 1.15}px`);
  onTrail();
}
function onTrail() {
  const r = trail.getBoundingClientRect();
  const span = Math.max(1, r.height - innerHeight);
  const p = clamp(-r.top / span);
  cards.style.setProperty('--tx', `${-p * travel}px`);
  trailBar.style.width = `${p * 100}%`;
}
addEventListener('scroll', onTrail, { passive: true });
addEventListener('resize', sizeTrail);
sizeTrail();
document.fonts && document.fonts.ready.then(sizeTrail);

/* ═════════ The kit: pick a colour ═════════ */
const KIT = [
  { name: 'Ember',    hex: '#E2542C', note: 'Bright enough to find in a beach bag.' },
  { name: 'Glacier',  hex: '#A8D5E2', note: 'Sea-glass blue, cool on a hot day.' },
  { name: 'Chalk',    hex: '#EDE8E0', note: 'Soft off-white, made for summer.' },
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
  ...SUNNY, color: KIT[0].hex, material: { roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 }
})).then(hs => {
  kitStage.classList.add('is-live');
  const { THREE, mat } = hs;
  const from = new THREE.Color(), to = new THREE.Color(KIT[0].hex);
  let ct = 1;
  kitPaint = i => { from.copy(mat.color); to.set(KIT[i].hex); ct = 0; };
  hs.state.fill = 0.95;
  let spin = 0, vel = 0, drag = false, lastX = 0, visible = false, t0 = performance.now();
  // draw straight away when it scrolls in, rather than waiting on the loop
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) frame(performance.now()); }).observe(kitCanvas);
  kitCanvas.addEventListener('pointerdown', e => { drag = true; lastX = e.clientX; kitCanvas.setPointerCapture(e.pointerId); });
  kitCanvas.addEventListener('pointermove', e => { if (drag) { vel += (e.clientX - lastX) * 0.0006; lastX = e.clientX; } });
  kitCanvas.addEventListener('pointerup', () => { drag = false; });
  kitCanvas.addEventListener('pointercancel', () => { drag = false; });
  function frame(now) {
    const dt = Math.min(64, now - t0); t0 = now;
    spin += (reduced ? 0 : dt * 0.00014) + vel;
    vel *= 0.94;
    if (ct < 1) { ct = Math.min(1, ct + dt / 500); mat.color.copy(from).lerp(to, ct * ct * (3 - 2 * ct)); }
    hs.state.az = -75 * Math.PI / 180 + spin;
    hs.state.el = (18 + (reduced ? 0 : Math.sin(now / 2200) * 6)) * Math.PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(now / 1700) * 0.02;
    hs.render();
  }
  if (reduced) { frame(performance.now()); kitPaint = i => { mat.color.set(KIT[i].hex); frame(performance.now()); }; }
  else (function loop(now) { requestAnimationFrame(loop); if (visible || ct < 1) frame(now); })(performance.now());
}).catch(() => {});

/* ═════════ Hear the world: the same beach through earbuds vs open ears ═════════ */
const field = document.getElementById('field');
const bubbles = document.getElementById('bubbles');
const fieldTag = document.getElementById('fieldTag');
const hearPlay = document.getElementById('hearPlay');
const hearPlayLabel = document.getElementById('hearPlayLabel');
const hearStatus = document.getElementById('hearStatus');
const seg = document.querySelector('.seg');
const segBtns = [...seg.querySelectorAll('button')];
let mode = 'open';
seg.dataset.mode = mode;

const STATUS = {
  open: 'Open ears: the waves and the bike bell come through clearly, with the music on top.',
  buds: 'Earbuds: the music is sealed in and the world goes muffled. Easy to miss the bike behind you.'
};

const beachAudio = {
  ctx: null, on: false, timers: [],
  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // music: soft pad chords and a plucked arpeggio
    this.music = ctx.createGain(); this.music.gain.value = 0.85;
    const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 2600;
    this.music.connect(mlp).connect(this.master);

    // the world: surf and a bike bell, through a filter that earbuds close down
    this.world = ctx.createGain(); this.world.gain.value = 1;
    this.seal = ctx.createBiquadFilter(); this.seal.type = 'lowpass'; this.seal.frequency.value = 16000;
    this.world.connect(this.seal).connect(this.master);

    const len = ctx.sampleRate * 3;
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; d[i] = last * 3.2; }   // brownish noise
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
    [0, 0.16].forEach(dt => {
      [[2350, 0.09], [3120, 0.05], [4710, 0.02]].forEach(([f, v]) => this.note(f, t + dt, 0.7, v, 'sine', this.world));
    });
    spawn('Bike bell', 'bell');
  },
  schedule() {
    // a slow, sunny progression: C maj7, A min7, F maj7, G6
    const chords = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 329.6]];
    const beat = 0.6;
    let step = 0, next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.on) return;
      while (next < this.ctx.currentTime + 0.3) {
        const chord = chords[Math.floor(step / 8) % chords.length];
        if (step % 8 === 0) chord.forEach(f => this.note(f / 2, next, beat * 8, 0.035, 'sine'));
        const arp = [0, 1, 2, 3, 2, 1, 3, 2][step % 8];
        this.note(chord[arp] * 2, next, beat * 1.4, 0.05, 'triangle');
        next += beat / 2; step++;
      }
      this.timers[0] = setTimeout(tick, 100);
    };
    tick();
    const ring = () => { if (!this.on) return; this.bell(); this.timers[1] = setTimeout(ring, 5200 + Math.random() * 2600); };
    this.timers[1] = setTimeout(ring, 1800);
  },
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // a sealed ear tip muffles the outside and quietens it; the music sits louder inside
    this.seal.frequency.setTargetAtTime(mode === 'buds' ? 380 : 16000, t, 0.12);
    this.world.gain.setTargetAtTime(mode === 'buds' ? 0.22 : 1, t, 0.12);
    this.music.gain.setTargetAtTime(mode === 'buds' ? 1 : 0.85, t, 0.12);
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
  field.dataset.mode = m;
  segBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
  fieldTag.textContent = m === 'open' ? 'Ears open' : 'Ears sealed';
  hearStatus.textContent = STATUS[m];
  beachAudio.apply();
}
segBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
seg.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setMode(mode === 'open' ? 'buds' : 'open'); seg.querySelector('[aria-checked="true"]').focus(); }
});

function setPlaying(on) {
  hearPlay.setAttribute('aria-pressed', String(on));
  hearPlayLabel.textContent = on ? 'Pause' : 'Play the beach';
  field.classList.toggle('is-playing', on);
}
hearPlay.addEventListener('click', () => {
  const on = hearPlay.getAttribute('aria-pressed') !== 'true';
  setPlaying(on);
  on ? beachAudio.start() : beachAudio.stop();
});
const hearSec = document.getElementById('hear');
let hearVisible = false;
new IntersectionObserver(es => {
  hearVisible = es[0].isIntersecting;
  if (!hearVisible && beachAudio.on) { beachAudio.stop(); setPlaying(false); }
}).observe(hearSec);

// bubbles of outside sound drifting in toward the listener
const LABELS = [['Waves', 'waves'], ['Your name', 'voice'], ['Gulls', 'gull'], ['Car pulling out', 'car'], ['Waves', 'waves'], ['“Lunch!”', 'voice']];
const live = [];
function spawn(text, kind) {
  if (live.length > 9) return;
  const el = document.createElement('span');
  el.className = `bub bub--${kind}`;
  el.textContent = text;
  bubbles.appendChild(el);
  const a = Math.random() * Math.PI * 2;
  live.push({ el, a, r: 0.62, v: 0.0022 + Math.random() * 0.0012, state: 'in', life: 1, wob: Math.random() * 6 });
}
let lastSpawn = 0, li = 0;
function stepBubbles(now) {
  const W = field.clientWidth, H = field.clientHeight, cx = W / 2, cy = H / 2, R = Math.min(W, H);
  if (now - lastSpawn > (beachAudio.on ? 1100 : 1600)) {
    lastSpawn = now;
    const [t, k] = LABELS[li++ % LABELS.length];
    spawn(t, k);
  }
  const shell = mode === 'buds' ? 0.21 : 0.075;
  for (let i = live.length - 1; i >= 0; i--) {
    const b = live[i];
    b.wob += 0.03;
    if (b.state === 'in') {
      b.r -= b.v;
      if (b.r <= shell) b.state = mode === 'buds' ? 'bounce' : 'heard';
    } else if (b.state === 'bounce') {
      b.r += b.v * 0.6; b.life -= 0.02;
    } else {
      b.life -= 0.035;
    }
    const s = b.state === 'heard' ? 1 + (1 - b.life) * 0.6 : b.state === 'bounce' ? 0.85 : 1;
    const x = cx + Math.cos(b.a + Math.sin(b.wob) * 0.05) * b.r * R;
    const y = cy + Math.sin(b.a + Math.sin(b.wob) * 0.05) * b.r * R;
    b.el.style.setProperty('--x', x.toFixed(1) + 'px');
    b.el.style.setProperty('--y', y.toFixed(1) + 'px');
    b.el.style.setProperty('--s', s.toFixed(3));
    b.el.style.setProperty('--o', clamp(b.life * (b.state === 'bounce' ? 0.7 : 1)).toFixed(3));
    if (b.life <= 0) { b.el.remove(); live.splice(i, 1); }
  }
}
if (!reduced) (function loop(now) { requestAnimationFrame(loop); if (hearVisible) stepBubbles(now); })(0);
