import { shader, GLSL } from '/js/lp-gl.js';
import { initMotion, gsap, ScrollTrigger } from '/js/lp-motion.js';
import { climateMark, preloadMarks } from '/js/brand.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
initMotion();
const setLogo = climateMark(document.querySelector('#topbar .mark'), { initial: 'water' });
preloadMarks(['sea']);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ═════════ Under the water: the surface overhead, light shafts, the floor below ═════════ */
const UNDER = GLSL.noise + `
uniform vec2 uRes; uniform float uTime; uniform float uDpr;
uniform float uDepth; uniform float uFloor; uniform float uDim;

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

void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float t = uTime;
  float d = uDepth;
  float lit = mix(1., .3, d);

  // the water column: brighter toward the surface, darker the deeper you go
  vec3 col = mix(vec3(.004,.04,.065), vec3(.02,.22,.3), smoothstep(-.2, .85, uv.y)*mix(1., .6, d));
  col = mix(col, vec3(.2,.62,.68), smoothstep(.5, 1.05, uv.y)*lit);

  // the underside of the surface: a bright, moving ceiling that drifts up and away as you sink
  float surfY = mix(.84, 1.35, smoothstep(0., .45, d));
  float wob = (fbm(vec2(p.x*1.8 + t*.07, t*.11)) - .5)*.08;
  float ceil = smoothstep(surfY - .03, surfY + .05, uv.y + wob);
  vec2 sq = vec2(p.x, (uv.y - surfY)*3.)*2.2;
  float net = caustic(sq*.7 + vec2(t*.015, 0.), t*.45);
  col = mix(col, mix(vec3(.5,.84,.86), vec3(.93,1.,.98), net), ceil*.92);

  // light shafts slanting down from the surface
  float sx = p.x + (1. - uv.y)*.28;
  float rays = smoothstep(.5, .8, fbm(vec2(sx*4.2, t*.07)))*.7 + smoothstep(.55, .85, fbm(vec2(sx*9. + 3., t*.1)))*.4;
  col += vec3(.45,.82,.85)*rays*smoothstep(-.15, .95, uv.y)*(1. - ceil)*mix(1., .2, d)*.42;

  // dappled light moving through the water
  col += vec3(.4,.8,.8)*caustic(p*1.1 + vec2(0., t*.02), t*.4)*.07*lit*(1. - ceil);

  // the floor rises into view: rippled sand under moving caustics, fading into the blue
  if(uFloor > 0.){
    float below = mix(-.25, .32, uFloor) - uv.y;
    if(below > 0.){
      float z = .22/(below + .03);
      vec2 fp = vec2(p.x*z, z);
      float sr = sin(fp.y*9. + fbm(fp*1.4)*4. + fp.x*1.5)*.5 + .5;
      vec3 sand = mix(vec3(.36,.42,.36), vec3(.6,.62,.5), sr)*(.75 + .35*fbm(fp*2.));
      sand += vec3(.6,.9,.85)*caustic(fp*.35, t*.5)*.7;
      sand *= vec3(.55,.88,.86)*mix(1., .7, smoothstep(0., .5, below));
      col = mix(col, sand, smoothstep(0., .32, below)*uFloor*.95);
    }
  }

  // specks drifting in the water, catching the light
  vec2 g = (p + vec2(t*.008, t*.02))*26.;
  vec2 gi = floor(g), gf = fract(g) - .5;
  float speck = step(.92, hash(gi))*smoothstep(.09, 0., length(gf - (vec2(hash(gi + 3.1), hash(gi + 7.7)) - .5)*.6));
  col += vec3(.75,.95,.92)*speck*.25*(.4 + uv.y)*lit;

  float v = smoothstep(1.35, .25, length((uv - .5)*vec2(uRes.x/uRes.y, 1.)));
  col *= mix(.55, 1., v)*uDim;
  col += (hash(gl_FragCoord.xy + fract(t*5.)*31.) - .5)*.02;
  gl_FragColor = vec4(col, 1.);
}`;

function water(canvas, { depth = 0, floor = 0, dim = 1, maxDpr = 1, beforeDraw } = {}) {
  const w = shader(canvas, UNDER, { maxDpr, uniforms: { uDepth: depth, uFloor: floor, uDim: dim }, beforeDraw });
  if (w) reduced ? w.still(3) : w.start();
  return w;
}

/* ═════════ Bubbles: a 2D layer over the water ═════════ */
function bubbles(canvas, { rate = 0.05 } = {}) {
  const api = { burst() {}, add() {} };
  if (!canvas || reduced) return api;
  const ctx = canvas.getContext('2d');
  let W, H, dpr, on = true;
  const parts = [];
  const size = () => { dpr = Math.min(1.5, devicePixelRatio || 1); W = canvas.width = canvas.clientWidth * dpr; H = canvas.height = canvas.clientHeight * dpr; };
  size(); addEventListener('resize', size);
  new IntersectionObserver(es => { on = es[0].isIntersecting; }).observe(canvas);
  // x, y in CSS px; r is the radius in CSS px
  api.add = (x, y, r) => {
    if (parts.length > 260) return;
    parts.push({ x: x * dpr, y: y * dpr, r: r * dpr, vy: -(0.3 + r * 0.1) * dpr, ph: Math.random() * 6, wob: 0.4 + Math.random() * 0.8 });
  };
  api.burst = (x, y, n = 8) => { for (let i = 0; i < n; i++) api.add(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 24, 1.2 + Math.random() * Math.random() * 9); };
  (function frame() {
    requestAnimationFrame(frame);
    if (!on) return;
    ctx.clearRect(0, 0, W, H);
    if (Math.random() < rate) api.add(Math.random() * W / dpr, H / dpr + 10, 1 + Math.random() * 3.5);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      // bubbles speed up as they rise, and wobble side to side
      p.vy = Math.max(p.vy - 0.012 * dpr, -(1.2 + p.r / dpr * 0.35) * dpr);
      p.ph += 0.09; p.x += Math.sin(p.ph) * p.wob * dpr * 0.6; p.y += p.vy;
      if (p.y < -p.r - 10) { parts.splice(i, 1); continue; }
      const fade = clamp(p.y / (H * 0.25));
      ctx.globalAlpha = 0.35 + 0.65 * fade;
      ctx.fillStyle = 'rgba(200,245,240,.08)';
      ctx.strokeStyle = 'rgba(225,252,248,.6)';
      ctx.lineWidth = Math.max(1, p.r * 0.12);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.92, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.22, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  })();
  return api;
}

/* ═════════ Hero: looking up from just under the surface ═════════ */
const hero = document.getElementById('hero');
const heroWater = water(document.getElementById('heroWater'), { depth: 0.04, maxDpr: 1.25 });
if (!heroWater) document.documentElement.classList.add('no-gl');
const heroBub = bubbles(document.getElementById('heroBubbles'), { rate: 0.06 });
{
  let last = 0;
  hero.addEventListener('pointermove', e => {
    const now = performance.now();
    if (now - last < 45) return;
    last = now;
    const r = hero.getBoundingClientRect();
    heroBub.add(e.clientX - r.left, e.clientY - r.top, 1.5 + Math.random() * 4);
  });
  hero.addEventListener('pointerdown', e => {
    const r = hero.getBoundingClientRect();
    heroBub.burst(e.clientX - r.left, e.clientY - r.top, 16);
  });
}

/* the headset drifting in the water, letting off the odd bubble */
const floatEl = document.getElementById('float');
const WET = { roughness: 0.3, clearcoat: 0.95, clearcoatRoughness: 0.12, envMapIntensity: 0.7 };
import('/js/lp-headset.js').then(({ headset }) => headset(document.getElementById('heroHs'), {
  color: '#A8D5E2', key: 0xeafcff, rim: 0x7fe3df, fill: 0x9fd6dc, material: WET
})).then(hs => {
  let heroOn = true;
  new IntersectionObserver(es => { heroOn = es[0].isIntersecting; }).observe(hero);
  hs.state.fill = 0.92;
  function frame(now) {
    const s = now / 1000;
    hs.state.az = -75 * Math.PI / 180 + (reduced ? 0 : s * 0.12 + Math.sin(s * 0.3) * 0.25);
    hs.state.el = (10 + (reduced ? 0 : Math.sin(s * 0.45) * 12)) * Math.PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(s * 0.6) * 0.05;
    hs.render();
  }
  if (reduced) { frame(0); return; }
  (function loop(now) { requestAnimationFrame(loop); if (heroOn) frame(now); })(performance.now());
  setInterval(() => {
    if (!heroOn) return;
    const h = hero.getBoundingClientRect(), r = floatEl.getBoundingClientRect();
    heroBub.burst(r.left - h.left + r.width * (0.4 + Math.random() * 0.2), r.top - h.top + r.height * 0.4, 3);
  }, 1900);
}).catch(() => { /* the water still carries the hero */ });

/* ═════════ The descent: surface to two metres ═════════ */
const depth = document.getElementById('depth');
const dpNum = document.getElementById('dpNum');
const dpBar = document.getElementById('dpBar');
const stops = [...document.querySelectorAll('.dp-stops li')];
const seaSec = document.getElementById('sea');
let dp = 0, stop = -1;
const depthWater = water(document.getElementById('depthWater'), {
  beforeDraw() {
    depthWater.set('uDepth', dp);
    depthWater.set('uFloor', smooth(0.6, 1, dp));
  }
});
const depthBub = bubbles(document.getElementById('depthBubbles'), { rate: 0.08 });
function onDepth() {
  const r = depth.getBoundingClientRect();
  dp = clamp(-r.top / (r.height - innerHeight));
  const metres = 2 * dp;
  dpNum.textContent = metres.toFixed(1);
  dpBar.parentElement.style.setProperty('--g', `${dp * 100}%`);
  // captions change at 0.3m, 1m and 1.8m
  const next = dp < 0.15 ? 0 : dp < 0.5 ? 1 : dp < 0.9 ? 2 : 3;
  if (next !== stop) {
    if (next > stop && stop >= 0) depthBub.burst(innerWidth * 0.3, innerHeight * 0.75, 10);
    stop = next;
    stops.forEach((el, i) => el.classList.toggle('is-on', i === stop));
  }
  // the logo turns from water blue to sea teal as you go deeper
  const inDepth = r.top <= 0 && r.bottom >= innerHeight;
  const s = seaSec.getBoundingClientRect();
  const inSea = s.top < innerHeight / 2 && s.bottom > innerHeight / 2;
  setLogo((inDepth && dp > 0.5) || inSea ? 'sea' : 'water');
  if (reduced && depthWater) { depthWater.set('uDepth', dp); depthWater.set('uFloor', smooth(0.6, 1, dp)); depthWater.redraw(); }
}
addEventListener('scroll', onDepth, { passive: true });
addEventListener('resize', onDepth);
onDepth();

/* ═════════ Ways under: surface light follows the cursor along each row ═════════ */
document.querySelectorAll('.way-list li').forEach(li => li.addEventListener('pointermove', e => {
  const r = li.getBoundingClientRect();
  li.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
}));

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
water(document.getElementById('waitWater'), { depth: 0.12, dim: 0.8, maxDpr: 0.9 });

/* ═════════ the kit: turn it under water, pick a colourway ═════════ */
const kitStage = document.getElementById('kitStage');
const kitCanvas = document.getElementById('kitHs');
water(document.getElementById('kitWater'), { depth: 0.3, floor: 0.35, dim: 0.9 });

const KIT = [
  { name: 'Glacier',  hex: '#A8D5E2', note: 'Pale ice blue. Easy to spot on the bottom.' },
  { name: 'Obsidian', hex: '#35383C', note: 'Matte charcoal. Goes with any wetsuit.' },
  { name: 'Ember',    hex: '#E2542C', note: 'Bright orange. Hard to lose in the sand.' },
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
  color: KIT[0].hex, key: 0xeafcff, rim: 0x7fe3df, fill: 0x9fd6dc, material: WET
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
    spin += (reduced ? 0 : dt * 0.00012) + vel;
    vel *= 0.94;
    if (ct < 1) {
      ct = Math.min(1, ct + dt / 500);
      mat.color.copy(from).lerp(to, ct * ct * (3 - 2 * ct));
    }
    hs.state.az = -75 * Math.PI / 180 + spin;
    hs.state.el = (14 + (reduced ? 0 : Math.sin(now / 2600) * 8)) * Math.PI / 180;
    hs.state.y = reduced ? 0 : Math.sin(now / 1900) * 0.03;
    hs.render();
  }
  if (reduced) { frame(performance.now()); kitPaint = i => { mat.color.set(KIT[i].hex); frame(performance.now()); }; }
  else (function loop(now) { requestAnimationFrame(loop); if (visible || ct < 1) frame(now); })(performance.now());
}).catch(() => { /* the poster stays */ });

/* ═════════ rows and photos surface as they scroll in ═════════ */
if (gsap && !reduced) {
  gsap.from('.way-list li', { y: 40, opacity: 0, filter: 'blur(8px)', stagger: 0.09, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.way-list', start: 'top 82%', once: true } });
  // sea photos bob on a gentle swell
  gsap.utils.toArray('.fl').forEach((f, i) => {
    gsap.from(f, { y: 120, opacity: 0, rotate: i % 2 ? 4 : -4, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: f, start: 'top 92%', once: true } });
    gsap.to(f.querySelector('img'), { y: i % 2 ? 10 : -10, rotate: i % 2 ? 1.2 : -1.2, scale: 1.06, duration: 3 + i * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  });
  ['.ways-head', '.sea-head'].forEach(h => gsap.from(h + ' > *', { y: 30, opacity: 0, stagger: 0.08, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 85%', once: true } }));
  ScrollTrigger.refresh();
}
