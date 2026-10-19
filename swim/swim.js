import { shader, GLSL } from '/js/lp-gl.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ═════════ The pool: looking down at lane 4 through moving water ═════════ */
const MAX_RIPPLES = 8;
const POOL = GLSL.noise + `
uniform vec2 uRes; uniform float uTime; uniform float uDpr;
uniform float uTravel; uniform float uLaneX; uniform float uRopeD; uniform float uDim;
uniform vec4 uRip[${MAX_RIPPLES}];

float caustic(vec2 q, float t){
  vec2 p = mod(q*6.2831, 6.2831) - 250.;
  vec2 i = p; float c = 1.; float inten = .005;
  for(int n=0;n<5;n++){
    float tt = t*(1. - 3.5/float(n+1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1./length(vec2(p.x/(sin(i.x + tt)/inten), p.y/(cos(i.y + tt)/inten)));
  }
  c /= 5.; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.), 0., 1.);
}

// lane rope floats: returns (mask, colourIndex, shade)
vec3 rope(vec2 p, float x0){
  float sp = .075;
  float yy = p.y/sp;
  float idx = floor(yy);
  vec2 d = vec2((p.x - x0)/.026, (fract(yy) - .5)*sp/.026);
  float r = length(d*vec2(1., 1.25));
  float m = 1. - smoothstep(.86, 1., r);
  float shade = clamp(1. - dot(d, vec2(.45, -.6))*.45, .4, 1.3);
  return vec3(m, idx, shade);
}

void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float t = uTime;

  // surface: slow swell plus ripples from the cursor
  vec2 swell = vec2(fbm(p*2.6 + vec2(t*.12, t*.05)), fbm(p*2.6 + vec2(4.1, -t*.1))) - .5;
  vec2 rip = vec2(0.); float ringLight = 0.;
  for(int i=0;i<${MAX_RIPPLES};i++){
    vec4 r = uRip[i];
    float age = t - r.z;
    if(r.w <= 0. || age < 0. || age > 3.5) continue;
    vec2 dv = p - r.xy;
    float d = length(dv);
    float front = age*.32;
    float band = exp(-pow((d - front)*14., 2.));
    float w = sin((d - front)*70.)*band*exp(-age*1.1)*r.w;
    rip += (dv/(d + 1e-4))*w;
    ringLight += max(w, 0.);
  }
  vec2 refr = swell*.045 + rip*.018;

  // pool floor, moving as you swim
  vec2 f = p + refr;
  f.y += uTravel;
  vec2 tc = f*11.;
  vec2 g = abs(fract(tc) - .5);
  float grout = smoothstep(.455, .5, max(g.x, g.y));
  vec3 tile = vec3(.78, .93, .95) + (hash(floor(tc)) - .5)*.05;
  vec3 col = mix(tile, vec3(.5, .7, .75), grout);

  // the black lane line, with a T every 25m-ish of travel
  float lane = 1. - smoothstep(.05, .056, abs(f.x - uLaneX));
  float tCross = (1. - smoothstep(.05, .056, abs(fract(f.y*.18) - .5)*5.56)) * (1. - smoothstep(.2, .206, abs(f.x - uLaneX)));
  col = mix(col, vec3(.04, .11, .17), max(lane, tCross)*.95);

  // rope shadows on the floor
  for(int s=0;s<2;s++){
    float x0 = uLaneX + (float(s)*2. - 1.)*uRopeD;
    vec3 sh = rope(p + refr*.3 + vec2(-.035, .05) + vec2(0., uTravel), x0);
    col *= 1. - sh.x*.35;
  }

  // water: depth tint and light
  col *= vec3(.42, .78, .86);
  col = mix(col, vec3(.01, .22, .33), .38);
  float c1 = caustic(f*1.3 + vec2(0., 0.), t*.55);
  float c2 = caustic(f*1.3 + vec2(.004, .003), t*.55);
  col += vec3(.75, 1., 1.)*mix(c1, c2, .5)*.5;
  col += vec3(.8, 1., 1.)*ringLight*.12;

  // lane ropes sit on the surface
  for(int s=0;s<2;s++){
    float x0 = uLaneX + (float(s)*2. - 1.)*uRopeD;
    vec3 rp = rope(p + swell*.008 + vec2(0., uTravel), x0);
    float k = mod(rp.y, 10.);
    vec3 rc = k < 1. ? vec3(1.) : (k < 5. ? vec3(.91, .36, .13) : (k < 6. ? vec3(1.) : vec3(.95, .8, .25)));
    col = mix(col, rc*rp.z, rp.x);
  }

  // surface glints
  float gl = pow(clamp(vnoise(p*40. + swell*18. + t*.6), 0., 1.), 14.);
  col += gl*.7;

  float v = smoothstep(1.3, .3, length((uv - .5)*vec2(uRes.x/uRes.y, 1.)));
  col *= mix(.6, 1., v)*uDim;
  col += (hash(gl_FragCoord.xy + fract(t*5.)*31.) - .5)*.025;
  gl_FragColor = vec4(col, 1.);
}`;

function makePool(canvas, opts) {
  const ripples = new Float32Array(MAX_RIPPLES * 4);
  let ri = 0;
  const pool = shader(canvas, POOL, {
    maxDpr: opts.maxDpr ?? 1.25,
    uniforms: { uTravel: 0, uLaneX: 0.3, uRopeD: 0.5, uDim: opts.dim ?? 1, uRip: ripples },
    beforeDraw: opts.beforeDraw
  });
  if (!pool) return null;
  pool.addRipple = (x, y, amp = 1) => {
    // canvas CSS px → shader space (centred, y up, height-normalised)
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ripples.set([(x - w / 2) / h, (h / 2 - y) / h, pool.time, amp], ri * 4);
    ri = (ri + 1) % MAX_RIPPLES;
  };
  return pool;
}

const hero = document.getElementById('hero');
let travel = 0, lastScroll = scrollY;

const pool = makePool(document.getElementById('pool'), {
  beforeDraw(now) {
    const wide = innerWidth > 900;
    pool.set('uLaneX', wide ? 0.44 : 0.14);
    pool.set('uRopeD', wide ? 0.36 : 0.3);
    // swimming forward: a slow glide, faster while you scroll
    const ds = scrollY - lastScroll; lastScroll = scrollY;
    travel += 0.0009 + Math.abs(ds) * 0.0006;
    pool.set('uTravel', travel);
  }
});
if (!pool) document.documentElement.classList.add('no-gl');
else {
  if (reduced) pool.still(3);
  else pool.start();

  let lastRip = 0;
  hero.addEventListener('pointermove', e => {
    const now = performance.now();
    if (now - lastRip < 90) return;
    lastRip = now;
    const r = hero.getBoundingClientRect();
    pool.addRipple(e.clientX - r.left, e.clientY - r.top, e.pointerType === 'mouse' ? 0.6 : 1);
  });
  hero.addEventListener('pointerdown', e => {
    const r = hero.getBoundingClientRect();
    pool.addRipple(e.clientX - r.left, e.clientY - r.top, 1.4);
  });
  // the odd drip so it never sits still
  if (!reduced) setInterval(() => {
    pool.addRipple(Math.random() * hero.clientWidth, Math.random() * hero.clientHeight, 0.8);
  }, 2600);
}

/* ═════════ The set: five laps of 25m ═════════ */
const set = document.getElementById('set');
const lapNum = document.getElementById('lapNum');
const swimmer = document.getElementById('swimmer');
const split = document.getElementById('split');
const pcSec = document.getElementById('pcSec');
const pcMin = document.getElementById('pcMin');
const laps = [...document.querySelectorAll('.laps li')];
const ropes = [...document.querySelectorAll('.rope')];
const LAPS = 5, LAP_SECONDS = 24;

// pace clock ticks
const ticks = document.getElementById('pcTicks');
for (let i = 0; i < 60; i++) {
  const a = (i / 60) * Math.PI * 2;
  const maj = i % 5 === 0;
  const r1 = maj ? 46 : 50, r2 = 54;
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', 60 + Math.sin(a) * r1); l.setAttribute('y1', 60 - Math.cos(a) * r1);
  l.setAttribute('x2', 60 + Math.sin(a) * r2); l.setAttribute('y2', 60 - Math.cos(a) * r2);
  if (maj) l.classList.add('maj');
  ticks.appendChild(l);
}

let lap = -1;
function onSetScroll() {
  const r = set.getBoundingClientRect();
  const p = clamp(-r.top / (r.height - innerHeight));
  const pos = p * LAPS;                       // 0..5 laps
  const i = Math.min(LAPS - 1, Math.floor(pos));
  const within = pos - i;
  const e = within < 0.5 ? 2 * within * within : 1 - Math.pow(-2 * within + 2, 2) / 2;
  const goingRight = i % 2 === 0;
  const x = goingRight ? lerp(4, 96, e) : lerp(96, 4, e);
  swimmer.style.setProperty('--sx', x + '%');
  swimmer.style.setProperty('--dir', goingRight ? 1 : -1);
  ropes.forEach((el, k) => el.style.setProperty('--rp', `${(k ? -1 : 1) * p * 300}px`));

  if (i !== lap) {
    lap = i;
    lapNum.textContent = i + 1;
    laps.forEach((el, k) => el.classList.toggle('is-on', k === i));
  }
  const secs = pos * LAP_SECONDS;
  const m = Math.floor(secs / 60), s = secs % 60;
  split.textContent = `${m}:${s.toFixed(1).padStart(4, '0')}`;
  pcSec.style.transform = `rotate(${(secs / 60) * 360}deg)`;
  pcMin.style.transform = `rotate(${(secs / 3600) * 360}deg)`;
}
addEventListener('scroll', onSetScroll, { passive: true });
addEventListener('resize', onSetScroll);
onSetScroll();

/* ═════════ counters ═════════ */
const cio = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const end = +e.target.dataset.count;
    if (reduced) { e.target.textContent = end; return; }
    const start = performance.now();
    (function step(now) {
      const k = clamp((now - start) / 1800);
      e.target.textContent = Math.round(end * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(step);
    })(start);
  });
}, { threshold: 0.5 });
document.querySelectorAll('[data-count]').forEach(c => cio.observe(c));

/* ═════════ waitlist: the same water, calmer ═════════ */
const waitCv = document.getElementById('poolWait');
const wpool = makePool(waitCv, {
  maxDpr: 0.9, dim: 0.75,
  beforeDraw(now) {
    wpool.set('uLaneX', 0);
    wpool.set('uRopeD', innerWidth > 900 ? 0.62 : 0.4);
    wpool.set('uTravel', wpool.time * 0.03);
  }
});
if (wpool) {
  reduced ? wpool.still(5) : wpool.start();
  let last = 0;
  waitCv.parentElement.addEventListener('pointermove', e => {
    const now = performance.now();
    if (now - last < 120) return;
    last = now;
    const r = waitCv.getBoundingClientRect();
    wpool.addRipple(e.clientX - r.left, e.clientY - r.top, 0.5);
  });
}

/* ═════════ the headset, hovering over the lane ═════════ */
const hover = document.getElementById('hover');
const WET = { roughness: 0.3, clearcoat: 0.95, clearcoatRoughness: 0.12, envMapIntensity: 0.7 };
import('/js/lp-headset.js').then(({ headset }) => headset(document.getElementById('heroHs'), {
  color: '#A8D5E2', key: 0xeafcff, rim: 0x6fe0e3, fill: 0xbfe9f0, material: WET
})).then(hs => {
  let heroOn = true;
  new IntersectionObserver(es => { heroOn = es[0].isIntersecting; }).observe(hero);
  hs.state.fill = 1.0;
  function frame(now) {
    const s = now / 1000;
    hs.state.az = -75 * Math.PI / 180 + (reduced ? 0 : s * 0.25);
    hs.state.el = (52 + (reduced ? 0 : Math.sin(s * 0.7) * 6)) * Math.PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(s * 1.1) * 0.03;
    hover.style.setProperty('--sh', (1 - hs.state.y * 3).toFixed(3));
    hs.render();
  }
  if (reduced) { frame(0); return; }
  (function loop(now) { requestAnimationFrame(loop); if (heroOn) frame(now); })(performance.now());
  // its vibration rings the water below it
  if (pool) setInterval(() => {
    if (!heroOn) return;
    const h = hero.getBoundingClientRect(), r = hover.getBoundingClientRect();
    pool.addRipple(r.left - h.left + r.width * 0.52, r.top - h.top + r.height * 0.62, 0.55);
  }, 1500);
}).catch(() => { /* the pool still carries the hero */ });

/* ═════════ the kit: turn it underwater, pick a colourway ═════════ */
const kitStage = document.getElementById('kitStage');
const kitCanvas = document.getElementById('kitHs');
const kitWaterCv = document.getElementById('kitWater');
const kpool = makePool(kitWaterCv, {
  maxDpr: 1, dim: 0.85,
  beforeDraw() {
    kpool.set('uLaneX', -0.05);
    kpool.set('uRopeD', 0.62);
    kpool.set('uTravel', kpool.time * 0.025);
  }
});
if (kpool) reduced ? kpool.still(4) : kpool.start();

const KIT = [
  { name: 'Glacier',  hex: '#A8D5E2', note: 'Pale ice blue. Easy to spot on the pool deck.' },
  { name: 'Obsidian', hex: '#35383C', note: 'Matte charcoal. Goes with every cap.' },
  { name: 'Ember',    hex: '#E2542C', note: 'Lane-rope orange. Hard to lose.' },
  { name: 'Chalk',    hex: '#EDE8E0', note: 'Soft off-white, for the sauna after.' }
];
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
  color: KIT[0].hex, key: 0xeafcff, rim: 0x6fe0e3, fill: 0xbfe9f0, material: WET
})).then(hs => {
  kitStage.classList.add('is-live');
  const { THREE, mat } = hs;
  const from = new THREE.Color(), to = new THREE.Color(KIT[0].hex);
  let ct = 1;
  kitPaint = i => { from.copy(mat.color); to.set(KIT[i].hex); ct = 0; };
  hs.state.fill = 0.88;
  let spin = 0, vel = 0, drag = false, lastX = 0, visible = false, t0 = performance.now();
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(kitCanvas);
  kitCanvas.addEventListener('pointerdown', e => { drag = true; lastX = e.clientX; kitCanvas.setPointerCapture(e.pointerId); });
  kitCanvas.addEventListener('pointermove', e => { if (drag) { vel += (e.clientX - lastX) * 0.0006; lastX = e.clientX; } });
  kitCanvas.addEventListener('pointerup', () => { drag = false; });
  kitCanvas.addEventListener('pointercancel', () => { drag = false; });
  function frame(now) {
    const dt = Math.min(64, now - t0); t0 = now;
    spin += (reduced ? 0 : dt * 0.00014) + vel;
    vel *= 0.94;
    if (ct < 1) {
      ct = Math.min(1, ct + dt / 500);
      mat.color.copy(from).lerp(to, ct * ct * (3 - 2 * ct));
    }
    hs.state.az = -75 * Math.PI / 180 + spin;
    hs.state.el = (24 + (reduced ? 0 : Math.sin(now / 2200) * 6)) * Math.PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(now / 1700) * 0.02;
    hs.render();
  }
  if (reduced) { frame(performance.now()); kitPaint = i => { mat.color.set(KIT[i].hex); frame(performance.now()); }; }
  else (function loop(now) { requestAnimationFrame(loop); if (visible || ct < 1) frame(now); })(performance.now());
}).catch(() => { /* the poster stays */ });
