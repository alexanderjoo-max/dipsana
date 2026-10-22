import { shader, GLSL } from '/js/lp-gl.js';
import { initMotion, countUp, gsap, ScrollTrigger, reduced } from '/js/lp-motion.js';
import { climateMark, preloadMarks } from '/js/brand.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

initMotion({ smooth: false });
// "every degree." runs from sauna orange to ice blue, one letter at a time
{
  const RAMP = [[255, 138, 61], [226, 86, 28], [201, 183, 168], [142, 196, 212], [230, 247, 255]];
  const chars = [...document.querySelectorAll('.hero-h > span:last-child .sc')];
  chars.forEach((c, i) => {
    const f = (i / Math.max(1, chars.length - 1)) * (RAMP.length - 1);
    const k = Math.min(RAMP.length - 2, Math.floor(f));
    c.style.color = `rgb(${RAMP[k].map((v, j) => Math.round(lerp(v, RAMP[k + 1][j], f - k))).join(',')})`;
  });
}
const setLogo = climateMark(document.querySelector('#topbar .mark'), { initial: 'heat' });
preloadMarks(['fire', 'water', 'ice']);

/* ═════════ hero: the four rooms open up, embers rise on the hot side, frost falls on the cold ═════════ */
if (!reduced && gsap) {
  gsap.from('.hs', { clipPath: 'inset(100% 0 0 0)', duration: 1.6, ease: 'expo.inOut', stagger: 0.12 });
  gsap.fromTo('.hs img', { scale: 1.25 }, { scale: 1.08, duration: 3.2, ease: 'power3.out', stagger: 0.12 });
  gsap.from('.hs figcaption', { y: 30, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12, delay: 0.9 });
  gsap.from('.kicker, .hero-sub, .hero-actions .btn', { y: 24, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, delay: 0.9 });
}

function embers(canvas, rate) {
  if (!canvas || reduced) return;
  const ctx = canvas.getContext('2d');
  let W, H, dpr, on = true;
  const parts = [];
  const size = () => { dpr = Math.min(1.5, devicePixelRatio || 1); W = canvas.width = canvas.clientWidth * dpr; H = canvas.height = canvas.clientHeight * dpr; };
  size(); addEventListener('resize', size);
  new IntersectionObserver(es => { on = es[0].isIntersecting; }).observe(canvas);
  (function frame() {
    requestAnimationFrame(frame);
    if (!on) return;
    ctx.clearRect(0, 0, W, H);
    // embers rise from the sauna and steam half; frost drifts down over the plunge and ice half
    if (Math.random() < rate) parts.push({ cold: false, x: Math.random() * W * 0.55, y: H + 10, vy: -(0.6 + Math.random() * 1.8) * dpr, r: (0.6 + Math.random() * 2) * dpr, life: 0, max: 220 + Math.random() * 260, ph: Math.random() * 6 });
    if (Math.random() < rate * 0.8) parts.push({ cold: true, x: W * (0.5 + Math.random() * 0.5), y: -10, vy: (0.35 + Math.random() * 0.7) * dpr, r: (0.5 + Math.random() * 1.6) * dpr, life: 0, max: 380 + Math.random() * 360, ph: Math.random() * 6 });
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life++; p.ph += p.cold ? 0.02 : 0.035;
      p.x += Math.sin(p.ph) * (p.cold ? 0.45 : 0.7) * dpr; p.y += p.vy;
      const k = p.life / p.max;
      if (k >= 1 || p.y < -20 || p.y > H + 20) { parts.splice(i, 1); continue; }
      const a = Math.sin(Math.PI * k);
      // a faint halo instead of shadowBlur, which is far too slow to run per particle
      ctx.fillStyle = p.cold ? `rgba(150,210,235,${0.14 * a})` : `rgba(255,110,30,${0.18 * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.5, 0, 7); ctx.fill();
      ctx.fillStyle = p.cold ? `rgba(230,247,255,${0.75 * a})` : `rgba(255,${Math.round(110 + 90 * (1 - k))},50,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  })();
}
embers(document.getElementById('embers'), 0.3);

/* ═════════ descent: fire → steam → water → frost ═════════ */
const PALETTES = `
vec3 iron(float t){
  t = clamp(t, 0., 1.);
  vec3 c0=vec3(.02,.012,.01), c1=vec3(.12,.03,.02), c2=vec3(.38,.07,.03), c3=vec3(.86,.32,.11), c4=vec3(1.,.62,.18), c5=vec3(1.,.9,.7);
  if(t<.2) return mix(c0,c1,t/.2);
  if(t<.42) return mix(c1,c2,(t-.2)/.22);
  if(t<.64) return mix(c2,c3,(t-.42)/.22);
  if(t<.84) return mix(c3,c4,(t-.64)/.2);
  return mix(c4,c5,(t-.84)/.16);
}
vec3 arctic(float t){
  t = clamp(t, 0., 1.);
  vec3 c0=vec3(.008,.016,.035), c1=vec3(.03,.13,.27), c2=vec3(.12,.42,.66), c3=vec3(.5,.78,.88), c4=vec3(.92,.98,1.);
  if(t<.3) return mix(c0,c1,t/.3);
  if(t<.6) return mix(c1,c2,(t-.3)/.3);
  if(t<.85) return mix(c2,c3,(t-.6)/.25);
  return mix(c3,c4,(t-.85)/.15);
}`;
const ROOMS = GLSL.noise + PALETTES + `
uniform vec2 uRes; uniform float uTime; uniform float uDpr; uniform float uP;
vec3 heatField(vec2 q, vec2 uv){
  float n = fbm(q*1.4 + vec2(0., -uTime*.4));
  float f = fbm(q*2.6 + vec2(n*1.6, -uTime*.9));
  return iron(f*(1.35 - uv.y*.9)*.95 - .1);
}
vec3 steamField(vec2 q, vec2 uv){
  float n = fbm(q*1.1 + vec2(uTime*.04, -uTime*.07));
  float m = fbm(q*1.9 + n*2.2 + vec2(0., -uTime*.12));
  return mix(vec3(.04,.035,.035), vec3(.42,.39,.37), smoothstep(.35, .95, m))*(.75 + .25*uv.y);
}
vec3 waterField(vec2 q, vec2 uv){
  vec2 p = mod(q*3.2, 6.2831) - 250.;
  vec2 i = p; float c = 1.; float inten = .006;
  for(int n=0;n<5;n++){
    float t = uTime*.3*(1. - 3.5/float(n+1));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1./length(vec2(p.x/(sin(i.x + t)/inten), p.y/(cos(i.y + t)/inten)));
  }
  c /= 5.; c = 1.17 - pow(c, 1.4);
  float v = pow(abs(c), 7.);
  return mix(vec3(.004,.02,.04), vec3(.02,.09,.15), uv.y) + vec3(.2,.6,.75)*clamp(v, 0., 1.)*.45;
}
vec2 cellHash(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))))*43758.5453); }
float cracks(vec2 g){
  vec2 ip = floor(g), fp = fract(g);
  float f1 = 8., f2 = 8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 b = vec2(float(x), float(y));
    float d = length(b + cellHash(ip + b) - fp);
    if(d < f1){ f2 = f1; f1 = d; } else if(d < f2){ f2 = d; }
  }
  return f2 - f1;
}
vec3 iceField(vec2 q, vec2 uv){
  vec2 w = q + (vec2(fbm(q*3.), fbm(q*3. + 7.)) - .5)*.35;
  float big = 1. - smoothstep(0., .025, cracks(w*3.2));
  float fine = 1. - smoothstep(0., .04, cracks(w*9. + 3.));
  float frost = fbm(q*14.);
  return arctic(.08 + big*.45 + fine*.14*frost + frost*.16 + (1. - uv.y)*.05);
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 q = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float w0 = clamp(1. - abs(uP), 0., 1.), w1 = clamp(1. - abs(uP - 1.), 0., 1.);
  float w2 = clamp(1. - abs(uP - 2.), 0., 1.), w3 = clamp(1. - abs(uP - 3.), 0., 1.);
  vec3 col = vec3(0.);
  if(w0 > 0.) col += heatField(q, uv)*w0;
  if(w1 > 0.) col += steamField(q, uv)*w1;
  if(w2 > 0.) col += waterField(q, uv)*w2;
  if(w3 > 0.) col += iceField(q, uv)*w3;
  col *= mix(.35, .8, smoothstep(1.1, .2, length(q*vec2(.9, 1.2))));
  col += (hash(gl_FragCoord.xy + fract(uTime*5.)*77.) - .5)*.03;
  gl_FragColor = vec4(col, 1.);
}`;

const descent = document.getElementById('descent');
const dBg = shader(document.getElementById('dBg'), ROOMS, { uniforms: { uP: 0 }, maxDpr: 0.5 });
const dNum = document.getElementById('dNum');
const dNumWrap = document.getElementById('dNumWrap');
const dMark = document.getElementById('dMark');
const rooms = [...document.querySelectorAll('.d-rooms li')];
const stops = [[0, 110], [0.17, 96], [0.27, 45], [0.42, 41], [0.52, 7], [0.67, 4], [0.77, 2], [1, 0]];
const EMBER = [226, 86, 28], AMBER = [255, 170, 60], ASH = [236, 230, 220], ICE = [142, 196, 212];
function tempRGB(T) {
  let c;
  if (T > 70) c = AMBER.map((v, i) => lerp(EMBER[i], v, (T - 70) / 40));
  else if (T > 40) c = EMBER.map((v, i) => lerp(ASH[i], v, (T - 40) / 30));
  else c = ICE.map((v, i) => lerp(v, ASH[i], T / 40));
  return c.map(Math.round);
}
function tempAt(p) {
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      const [p0, t0] = stops[i - 1], [p1, t1] = stops[i];
      const k = (p - p0) / (p1 - p0);
      return lerp(t0, t1, k * k * (3 - 2 * k));
    }
  }
  return 0;
}
let dp = 0, room = -1, T = 110;
function onDescent() {
  const r = descent.getBoundingClientRect();
  dp = clamp(-r.top / (r.height - innerHeight));
  const inside = r.top <= 0 && r.bottom >= innerHeight;
  T = tempAt(dp);
  const next = Math.min(3, Math.floor(dp * 4));
  if (next !== room) { room = next; rooms.forEach((el, i) => el.classList.toggle('is-on', i === room)); }
  const h = T / 110;
  dNum.textContent = Math.round(T);
  const [cr, cg, cb] = tempRGB(T);
  dNumWrap.style.setProperty('--tc', `rgb(${cr},${cg},${cb})`);
  dNumWrap.style.setProperty('--wg', Math.round(lerp(300, 800, h)));
  dMark.parentElement.style.setProperty('--m', `${(1 - h) * 100}%`);
  // the logo follows the room temperature while you're in here
  setLogo(inside ? (T > 70 ? 'fire' : T > 30 ? 'heat' : T > 4 ? 'water' : 'ice') : 'heat');
  if (dBg) {
    const phase = T > 45 ? lerp(1, 0, smooth(45, 96, T)) : T > 7 ? lerp(2, 1, smooth(7, 41, T)) : lerp(3, 2, smooth(1.2, 4.5, T));
    dBg.set('uP', phase);
    if (reduced) dBg.redraw();
  }
  if (reduced && hs) drawHs(performance.now());
}
addEventListener('scroll', onDescent, { passive: true });
addEventListener('resize', onDescent);
if (dBg) reduced ? dBg.still(3) : dBg.start();

let hs = null, hsVisible = false;
const hsCanvas = document.getElementById('dHs');
new IntersectionObserver(es => { hsVisible = es[0].isIntersecting; }).observe(hsCanvas);
function drawHs(now) {
  if (!hs) return;
  const h = T / 110;
  const wide = innerWidth > 900;
  hs.state.az = -75 * Math.PI / 180 + dp * Math.PI * 1.8 + (reduced ? 0 : Math.sin(now / 2400) * 0.08);
  hs.state.el = (14 + (reduced ? 0 : Math.sin(now / 3100) * 4) + dp * 10) * Math.PI / 180;
  hs.state.fill = wide ? 0.76 : 0.88;
  hs.state.y = wide ? 0.02 : 0.1;
  hs.key.color.setRGB(...tempRGB(T).map(v => v / 255));
  hs.key.intensity = lerp(2, 3.2, h);
  hs.rim.color.set(T > 40 ? 0xff8a3d : 0x9fd8ec);
  hs.rim.intensity = lerp(2.6, 1.8, h);
  hs.mat.clearcoat = lerp(0.9, 0.35, h);
  hs.mat.clearcoatRoughness = lerp(0.12, 0.35, h);
  hs.render();
}
import('/js/lp-headset.js').then(({ headset }) => headset(hsCanvas, { color: '#2a2c2f', maxDpr: 1.75 }))
  .then(h => {
    hs = h;
    if (reduced) { drawHs(0); return; }
    (function loop(now) { requestAnimationFrame(loop); if (hsVisible) drawHs(now); })(performance.now());
  }).catch(() => {});
onDescent();

/* ═════════ protocol: scroll sideways through one contrast round ═════════ */
const track = document.getElementById('prTrack');
const rail = document.getElementById('prRail');
const clock = document.getElementById('prClock');
// minutes at the start of each card, ending at 72 (3 rounds of 23 minutes plus the ice finish)
const MARKS = [0, 15, 18, 23, 69, 72];
const fmt = m => `${String(Math.floor(m)).padStart(2, '0')}:${String(Math.floor((m % 1) * 60)).padStart(2, '0')}`;
function setClock(p) {
  const f = p * (MARKS.length - 1);
  const i = Math.min(MARKS.length - 2, Math.floor(f));
  clock.textContent = fmt(lerp(MARKS[i], MARKS[i + 1], f - i));
  rail.style.width = `${p * 100}%`;
}
if (gsap && !reduced) {
  const dist = () => Math.max(0, track.scrollWidth - innerWidth);
  gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: {
      trigger: '#protocol', pin: '.pr-pin', start: 'top top', end: () => `+=${dist() + innerHeight * 0.6}`,
      scrub: 0.6, invalidateOnRefresh: true,
      onUpdate: self => setClock(self.progress)
    }
  });
  gsap.from('.pr-card', { y: 60, opacity: 0, stagger: 0.08, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '#protocol', start: 'top 70%', once: true } });
} else {
  track.style.overflowX = 'auto';
  setClock(1);
}

/* ═════════ spec plate: a heat flush across steel, numbers counting up ═════════ */
document.querySelectorAll('.plate [data-count]').forEach(el => countUp(el, { duration: 1.8 }));
if (gsap && !reduced) {
  gsap.from('.plate', { y: 60, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.plate', start: 'top 85%', once: true } });
  gsap.fromTo('.plate', { '--sweep': '-110%' }, { '--sweep': '120%', duration: 2.2, ease: 'power2.inOut', scrollTrigger: { trigger: '.plate', start: 'top 70%', once: true } });
  gsap.from('.plate-grid > div', { opacity: 0, y: 20, stagger: 0.07, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: '.plate', start: 'top 70%', once: true } });
}

/* ═════════ chart: the bars run out, earbuds hit the wall ═════════ */
if (gsap && !reduced) {
  const tl = gsap.timeline({ scrollTrigger: { trigger: '#chart', start: 'top 75%', once: true } });
  tl.fromTo('.ch-row--buds .ch-bar i', { '--grow': 0 }, { '--grow': 1, duration: 1.2, ease: 'power2.out' })
    .fromTo('.ch-stop', { '--x': 0 }, { '--x': 1, duration: 0.5, ease: 'back.out(3)' })
    .fromTo('.ch-row--us .ch-bar i', { '--grow': 0 }, { '--grow': 1, duration: 2, ease: 'power2.inOut' }, '-=0.2');
} else {
  document.querySelectorAll('.ch-bar i').forEach(i => i.style.setProperty('--grow', 1));
  document.querySelector('.ch-stop').style.setProperty('--x', 1);
}

/* ═════════ studio: the headset under a spotlight ═════════ */
const KIT = [
  { name: 'Obsidian', hex: '#35383C', note: 'Matte charcoal. The default.', rough: 0.58, cc: 0.34 },
  { name: 'Ember',    hex: '#E2542C', note: 'The loud one.', rough: 0.42, cc: 0.55 },
  { name: 'Glacier',  hex: '#A8D5E2', note: 'Pale ice blue.', rough: 0.5, cc: 0.42 },
  { name: 'Chalk',    hex: '#EDE8E0', note: 'Off-white.', rough: 0.62, cc: 0.28 }
];
const stage = document.getElementById('stStage');
const kitCanvas = document.getElementById('kit');
const cwName = document.getElementById('cwName');
const cwNote = document.getElementById('cwNote');
const list = document.getElementById('swatches');
let paint = () => {}, active = 0;
function pick(i) {
  active = i;
  [...list.children].forEach((li, k) => li.firstChild.setAttribute('aria-checked', String(k === i)));
  cwName.parentElement.classList.add('out');
  setTimeout(() => { cwName.textContent = KIT[i].name; cwNote.textContent = KIT[i].note; cwName.parentElement.classList.remove('out'); }, 200);
  paint(i);
}
KIT.forEach((c, i) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(i === 0)); b.setAttribute('aria-label', c.name);
  b.style.setProperty('--sw', c.hex);
  b.addEventListener('click', () => pick(i));
  b.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const k = (active + d + KIT.length) % KIT.length; pick(k); list.children[k].firstChild.focus();
  });
  li.appendChild(b); list.appendChild(li);
});
import('/js/lp-headset.js').then(({ headset }) => headset(kitCanvas, { color: KIT[0].hex, key: 0xffe4c8, rim: 0xff8a3d, fill: 0x6b7280, exposure: 1.05 }))
  .then(k => {
    stage.classList.add('is-live');
    const { THREE, mat } = k;
    const from = new THREE.Color(), to = new THREE.Color(KIT[0].hex);
    let ct = 1, r0 = mat.roughness, r1 = r0, c0 = mat.clearcoat, c1 = c0;
    paint = i => { from.copy(mat.color); to.set(KIT[i].hex); r0 = mat.roughness; r1 = KIT[i].rough; c0 = mat.clearcoat; c1 = KIT[i].cc; ct = 0; };
    let spin = 0, vel = 0, drag = false, lastX = 0, visible = false, t0 = performance.now();
    function frame(now) {
      const dt = Math.min(64, now - t0); t0 = now;
      spin += (reduced ? 0 : dt * 0.00014) + vel; vel *= 0.94;
      if (ct < 1) { ct = Math.min(1, ct + dt / 460); const e = ct * ct * (3 - 2 * ct); mat.color.copy(from).lerp(to, e); mat.roughness = lerp(r0, r1, e); mat.clearcoat = lerp(c0, c1, e); }
      k.state.az = -75 * Math.PI / 180 + spin;
      k.state.el = (14 + (reduced ? 0 : Math.sin(now / 2600) * 4)) * Math.PI / 180;
      k.state.fill = 0.95;
      k.render();
    }
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) frame(performance.now()); }).observe(kitCanvas);
    kitCanvas.addEventListener('pointerdown', e => { drag = true; lastX = e.clientX; kitCanvas.setPointerCapture(e.pointerId); });
    kitCanvas.addEventListener('pointermove', e => { if (drag) { vel += (e.clientX - lastX) * 0.0005; lastX = e.clientX; } });
    kitCanvas.addEventListener('pointerup', () => { drag = false; });
    kitCanvas.addEventListener('pointercancel', () => { drag = false; });
    if (reduced) { frame(performance.now()); paint = i => { mat.color.set(KIT[i].hex); frame(performance.now()); }; }
    else (function loop(now) { requestAnimationFrame(loop); if (visible || ct < 1) frame(now); })(performance.now());
  }).catch(() => {});
if (gsap && !reduced) {
  gsap.from('.st-stage', { scale: 0.85, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.studio', start: 'top 75%', once: true } });
}

if (gsap) ScrollTrigger.refresh();
