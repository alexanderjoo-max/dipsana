import { shader, GLSL } from '/js/lp-gl.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const PALETTES = `
vec3 iron(float t){
  t = clamp(t, 0., 1.);
  vec3 c0=vec3(.02,.012,.03), c1=vec3(.16,.04,.29), c2=vec3(.55,.08,.45), c3=vec3(.91,.36,.13), c4=vec3(1.,.70,.10), c5=vec3(1.,.96,.84);
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

/* ═════════ Hero: the homepage climate cycle, plus a heat-vision lens ═════════ */
const LENS = GLSL.noise + PALETTES + `
uniform vec2 uRes; uniform float uTime; uniform float uDpr;
uniform sampler2D uImg; uniform vec2 uImgSize; uniform vec2 uPos;
uniform vec2 uLensPos; uniform float uLens; uniform float uShow;

// object-fit: cover with object-position, matching the <img> underneath
vec2 imgUV(vec2 uv){
  float rs = uRes.x/uRes.y, ri = uImgSize.x/uImgSize.y;
  vec2 s = rs > ri ? vec2(1., ri/rs) : vec2(rs/ri, 1.);
  vec2 o = vec2((1. - s.x)*uPos.x, 1. - s.y - (1. - s.y)*uPos.y);
  return uv*s + o;
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 d = (uv - uLensPos)*uRes;
  float r = length(d);
  float aa = 1.5*uDpr;
  float inL = 1. - smoothstep(uLens - aa, uLens, r);
  float ring = smoothstep(uLens - 2.5*uDpr, uLens - .5*uDpr, r)*(1. - smoothstep(uLens + .5*uDpr, uLens + 2.5*uDpr, r));
  if(inL + ring < .001){ gl_FragColor = vec4(0.); return; }

  vec2 iuv = imgUV(uv);
  float sh = fbm(vec2(uv.x*5., uv.y*12. - uTime*1.4));
  vec2 suv = iuv + vec2((sh - .5)*.006, (sh - .5)*.003);
  float l = 0.;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++){
    vec3 c = texture2D(uImg, suv + vec2(float(x), float(y))*.004).rgb;
    l += dot(c, vec3(.35,.5,.15));
  }
  l /= 9.;
  float heat = smoothstep(.03, .62, l);
  heat = heat*.86 + .14*heat*fbm(iuv*7. + vec2(0., -uTime*.25)) + uv.y*.06;
  vec3 col = iron(heat);
  col *= .92 + .08*sin(gl_FragCoord.y/uDpr*1.6);
  col += (hash(gl_FragCoord.xy + fract(uTime*7.)*91.) - .5)*.04;
  vec4 lens = vec4(col, inL);
  lens = mix(lens, vec4(1., .95, .85, 1.), ring);
  gl_FragColor = vec4(lens.rgb, lens.a*uShow);
}`;

const hero = document.getElementById('hero');
const heroImg = document.getElementById('heroPhoto');
const lensCv = document.getElementById('lens');
const reticle = document.getElementById('reticle');
const spotEl = document.getElementById('spot');
const IMG_POS = [0.5, 0.26];          // keep in step with .r-hero .hero-photo object-position

const lens = shader(lensCv, LENS, {
  textures: { uImg: heroImg },
  uniforms: { uPos: IMG_POS, uLensPos: [0.68, 0.55], uLens: 120, uShow: 0 }
});

// a small copy of the photo to read a believable skin temperature under the crosshair
const probe = document.createElement('canvas');
const pctx = probe.getContext('2d', { willReadFrequently: true });
let probeData = null;
function buildProbe() {
  probe.width = 96; probe.height = Math.round(96 * heroImg.naturalHeight / heroImg.naturalWidth);
  pctx.drawImage(heroImg, 0, 0, probe.width, probe.height);
  probeData = pctx.getImageData(0, 0, probe.width, probe.height).data;
}
if (heroImg.complete && heroImg.naturalWidth) buildProbe(); else heroImg.addEventListener('load', buildProbe, { once: true });
function spotTemp(u, v) {
  if (!probeData) return null;
  const W = hero.clientWidth, H = hero.clientHeight;
  const rs = W / H, ri = heroImg.naturalWidth / heroImg.naturalHeight;
  const sx = rs > ri ? 1 : rs / ri, sy = rs > ri ? ri / rs : 1;
  const iu = u * sx + (1 - sx) * IMG_POS[0];
  const ivTop = (1 - v) * sy + (1 - sy) * IMG_POS[1];   // from the top of the image
  let l = 0, n = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const x = clamp(Math.round(iu * probe.width) + dx, 0, probe.width - 1);
    const y = clamp(Math.round(ivTop * probe.height) + dy, 0, probe.height - 1);
    const i = (y * probe.width + x) * 4;
    l += (probeData[i] * 0.35 + probeData[i + 1] * 0.5 + probeData[i + 2] * 0.15) / 255; n++;
  }
  // skin in a hot room reads high-30s to mid-40s on a thermal camera
  return 26 + (smooth(0.03, 0.62, l / n) * 0.9 + v * 0.06) * 19;
}

if (lens) {
  let mx = 0.78, my = 0.56, tx = mx, ty = my, live = false, show = 0;
  hero.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width; ty = 1 - (e.clientY - r.top) / r.height;
    live = true;
  });
  hero.addEventListener('pointerleave', () => { live = false; });

  function place() {
    const W = hero.clientWidth, H = hero.clientHeight;
    const lensCss = Math.min(W, H) * (W < 700 ? 0.15 : 0.13);
    lens.set('uLens', lensCss * Math.min(1.5, devicePixelRatio || 1));
    lens.set('uLensPos', [mx, my]);
    lens.set('uShow', show);
    reticle.style.setProperty('--rx', `${mx * W}px`);
    reticle.style.setProperty('--ry', `${(1 - my) * H}px`);
    reticle.style.setProperty('--lens', `${lensCss}px`);
    reticle.classList.toggle('is-flip', mx > 0.62);
    const t = spotTemp(mx, my);
    if (t != null) spotEl.textContent = t.toFixed(1) + '°C';
  }
  const t0 = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    show = clamp((now - t0 - 1400) / 700);
    if (show > 0.5) reticle.classList.add('is-on');
    if (!live || coarse) {
      // drift over the face when nobody is steering
      const s = now / 1000;
      const wide = innerWidth > 900;
      // on phones, stay on the cheek between the HUD and the headline
      tx = (wide ? 0.78 : 0.76) + Math.sin(s * 0.37) * (wide ? 0.05 : 0.03) + Math.sin(s * 0.11) * 0.02;
      ty = (wide ? 0.56 : 0.71) + Math.sin(s * 0.53 + 1) * (wide ? 0.07 : 0.025);
    }
    mx += (tx - mx) * 0.12; my += (ty - my) * 0.12;
    place();
  }
  lens.ready.then(() => {
    if (reduced) { show = 1; place(); lens.still(1); reticle.classList.add('is-on'); return; }
    lens.start();
    requestAnimationFrame(tick);
  });
}

// the homepage's climate cycle: sauna → steam → plunge → ice
const PHASES = [
  { id: 'heat', temp: 110, name: 'Sauna' },
  { id: 'steam', temp: 45, name: 'Steam' },
  { id: 'plunge', temp: 4, name: 'Plunge' },
  { id: 'ice', temp: 0, name: 'Ice' }
];
const degEl = document.getElementById('climDeg');
const nameEl = document.getElementById('climName');
const cycleEl = document.getElementById('climCycle');
let shown = 110;
function setPhase(i) {
  const p = PHASES[i];
  hero.dataset.phase = p.id;
  nameEl.textContent = p.name;
  cycleEl.querySelectorAll('[data-p]').forEach(s => s.toggleAttribute('aria-current', s.dataset.p === p.id));
  const from = shown, start = performance.now();
  (function count(now) {
    const k = clamp((now - start) / 700);
    shown = Math.round(lerp(from, p.temp, 1 - Math.pow(1 - k, 3)));
    degEl.textContent = shown + '°';
    if (k < 1) requestAnimationFrame(count);
  })(start);
}
if (!reduced) {
  let ph = 0, heroOn = true;
  new IntersectionObserver(es => { heroOn = es[0].isIntersecting; }).observe(hero);
  setInterval(() => { if (heroOn) setPhase(ph = (ph + 1) % PHASES.length); }, 2400);
}

/* ═════════ Studio: the headset in every colourway ═════════ */
const COLORWAYS = [
  { name: 'Obsidian', hex: '#35383C', rough: .58, cc: .34 },
  { name: 'Glacier',  hex: '#A8D5E2', rough: .50, cc: .42 },
  { name: 'Ember',    hex: '#E2542C', rough: .42, cc: .55 },
  { name: 'Chalk',    hex: '#EDE8E0', rough: .62, cc: .28 }
];
const viewer = document.getElementById('viewer');
const slot = document.getElementById('slot');
const cwName = document.getElementById('cwName');
const swatchList = document.getElementById('swatches');
let paint = () => {};
let active = 0;
function select(i) {
  active = i;
  [...swatchList.children].forEach((li, k) => li.firstChild.setAttribute('aria-checked', String(k === i)));
  cwName.classList.add('out');
  setTimeout(() => { cwName.textContent = COLORWAYS[i].name; cwName.classList.remove('out'); }, 180);
  slot.setAttribute('aria-label', `The Dipsana headset in ${COLORWAYS[i].name}, slowly rotating. Drag to turn it.`);
  paint(i);
}
COLORWAYS.forEach((cw, i) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'swatch'; b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(i === 0));
  b.setAttribute('aria-label', cw.name);
  b.style.setProperty('--sw', cw.hex);
  b.addEventListener('click', () => select(i));
  b.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const k = (active + d + COLORWAYS.length) % COLORWAYS.length;
    select(k); swatchList.children[k].firstChild.focus();
  });
  li.appendChild(b); swatchList.appendChild(li);
});

import('/js/lp-headset.js').then(({ headset }) => headset(document.getElementById('kit'), { color: COLORWAYS[0].hex }))
  .then(kit => {
    viewer.classList.add('is-live');
    const { THREE, mat } = kit;
    const from = new THREE.Color(), to = new THREE.Color(COLORWAYS[0].hex);
    let ct = 1, r0 = mat.roughness, r1 = r0, c0 = mat.clearcoat, c1 = c0;
    paint = i => {
      from.copy(mat.color); to.set(COLORWAYS[i].hex);
      r0 = mat.roughness; r1 = COLORWAYS[i].rough; c0 = mat.clearcoat; c1 = COLORWAYS[i].cc;
      ct = 0;
    };
    let spin = 0, vel = 0, drag = false, lastX = 0, visible = false, t0 = performance.now();
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(viewer);
    slot.addEventListener('pointerdown', e => { drag = true; lastX = e.clientX; slot.setPointerCapture?.(e.pointerId); });
    slot.addEventListener('pointermove', e => { if (drag) { vel += (e.clientX - lastX) * 0.0005; lastX = e.clientX; } });
    slot.addEventListener('pointerup', () => { drag = false; });
    slot.addEventListener('pointercancel', () => { drag = false; });
    function frame(now) {
      const dt = Math.min(64, now - t0); t0 = now;
      spin += (reduced ? 0 : dt * 0.00016) + vel;
      vel *= Math.pow(0.0025, dt / 1000);
      if (ct < 1) {
        ct = Math.min(1, ct + dt / 460);
        const e = ct * ct * (3 - 2 * ct);
        mat.color.copy(from).lerp(to, e);
        mat.roughness = lerp(r0, r1, e); mat.clearcoat = lerp(c0, c1, e);
      }
      kit.state.az = -75 * Math.PI / 180 + spin;
      kit.state.fill = 1.2;
      kit.render();
    }
    if (reduced) { frame(performance.now()); paint = i => { mat.color.set(COLORWAYS[i].hex); frame(performance.now()); }; }
    else (function loop(now) { requestAnimationFrame(loop); if (visible || ct < 1) frame(now); })(performance.now());
  })
  .catch(() => { /* the poster stays */ });

/* ═════════ Descent: fire → steam → water → frost ═════════ */
const ROOMS = GLSL.noise + PALETTES + `
uniform vec2 uRes; uniform float uTime; uniform float uDpr; uniform float uP;

vec3 heatField(vec2 q, vec2 uv){
  float n = fbm(q*1.4 + vec2(0., -uTime*.45));
  float f = fbm(q*2.6 + vec2(n*1.6, -uTime*1.1));
  float h = f*(1.35 - uv.y*.9);
  return iron(h*.95 - .08)*.95;
}
vec3 steamField(vec2 q, vec2 uv){
  float n = fbm(q*1.1 + vec2(uTime*.04, -uTime*.07));
  float m = fbm(q*1.9 + n*2.2 + vec2(0., -uTime*.12));
  vec3 lo = vec3(.07,.06,.065), hi = vec3(.62,.58,.55);
  return mix(lo, hi, smoothstep(.35, .95, m))*(.75 + .25*uv.y);
}
vec3 waterField(vec2 q, vec2 uv){
  vec2 p = mod(q*3.2, 6.2831) - 250.;
  vec2 i = p; float c = 1.; float inten = .006;
  for(int n=0;n<5;n++){
    float t = uTime*.35*(1. - 3.5/float(n+1));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1./length(vec2(p.x/(sin(i.x + t)/inten), p.y/(cos(i.y + t)/inten)));
  }
  c /= 5.; c = 1.17 - pow(c, 1.4);
  float v = pow(abs(c), 7.);
  vec3 deep = mix(vec3(.004,.03,.06), vec3(.02,.12,.2), uv.y);
  return deep + vec3(.25,.7,.85)*clamp(v, 0., 1.)*.55;
}
vec2 cellHash(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))))*43758.5453); }
float cracks(vec2 g){
  vec2 ip = floor(g), fp = fract(g);
  float f1 = 8., f2 = 8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 b = vec2(float(x), float(y));
    vec2 o = cellHash(ip + b);
    float d = length(b + o - fp);
    if(d < f1){ f2 = f1; f1 = d; } else if(d < f2){ f2 = d; }
  }
  return f2 - f1;
}
vec3 iceField(vec2 q, vec2 uv){
  // warp the cells so they read as fractured ice, not a grid
  vec2 w = q + (vec2(fbm(q*3.), fbm(q*3. + 7.)) - .5)*.35;
  float big = 1. - smoothstep(0., .025, cracks(w*3.2));
  float fine = 1. - smoothstep(0., .04, cracks(w*9. + 3.));
  float frost = fbm(q*14.);
  float glint = pow(fbm(q*6. + uTime*.05), 6.)*3.;
  float t = .1 + big*.5 + fine*.16*frost + frost*.18 + glint*.2 + (1. - uv.y)*.06;
  return arctic(t);
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 q = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float w0 = clamp(1. - abs(uP - 0.), 0., 1.);
  float w1 = clamp(1. - abs(uP - 1.), 0., 1.);
  float w2 = clamp(1. - abs(uP - 2.), 0., 1.);
  float w3 = clamp(1. - abs(uP - 3.), 0., 1.);
  vec3 col = vec3(0.);
  if(w0 > 0.) col += heatField(q, uv)*w0;
  if(w1 > 0.) col += steamField(q, uv)*w1;
  if(w2 > 0.) col += waterField(q, uv)*w2;
  if(w3 > 0.) col += iceField(q, uv)*w3;
  // keep the middle calm so the headset and numeral read
  float v = smoothstep(1.1, .2, length(q*vec2(.9, 1.2)));
  col *= mix(.45, .85, v);
  col += (hash(gl_FragCoord.xy + fract(uTime*5.)*77.) - .5)*.035;
  gl_FragColor = vec4(col, 1.);
}`;

const descent = document.getElementById('descent');
const dBg = shader(document.getElementById('dBg'), ROOMS, { uniforms: { uP: 0 }, maxDpr: 1 });
const dNum = document.getElementById('dNum');
const dNumWrap = document.getElementById('dNumWrap');
const dMark = document.getElementById('dMark');
const rooms = [...document.querySelectorAll('.d-rooms li')];
const tabs = [...document.querySelectorAll('.d-tabs li')];
const stops = [[0, 110], [0.17, 96], [0.27, 45], [0.42, 41], [0.52, 7], [0.67, 4], [0.77, 2], [1, 0]];

const EMBER = [232, 106, 42], AMBER = [255, 170, 40], PAPER = [243, 237, 228], ICE = [142, 196, 212];
function tempRGB(T) {
  let c;
  if (T > 70) c = AMBER.map((v, i) => lerp(EMBER[i], v, (T - 70) / 40));
  else if (T > 40) c = EMBER.map((v, i) => lerp(PAPER[i], v, (T - 40) / 30));
  else c = ICE.map((v, i) => lerp(v, PAPER[i], T / 40));
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
function onScroll() {
  const r = descent.getBoundingClientRect();
  dp = clamp(-r.top / (r.height - innerHeight));
  T = tempAt(dp);
  const next = Math.min(3, Math.floor(dp * 4));
  if (next !== room) {
    room = next;
    rooms.forEach((el, i) => el.classList.toggle('is-on', i === room));
    tabs.forEach((el, i) => el.classList.toggle('is-on', i === room));
  }
  const h = T / 110;
  dNum.textContent = Math.round(T);
  const [cr, cg, cb] = tempRGB(T);
  dNumWrap.style.setProperty('--tc', `rgb(${cr},${cg},${cb})`);
  dNumWrap.style.setProperty('--wg', Math.round(lerp(200, 800, h)));
  dNumWrap.style.setProperty('--wd', Math.round(lerp(75, 100, h)));
  dMark.parentElement.style.setProperty('--m', `${(1 - h) * 100}%`);
  if (dBg) {
    // map the temperature curve onto the four environments so they change with the numbers
    const phase = T > 45 ? lerp(1, 0, smooth(45, 96, T)) : T > 7 ? lerp(2, 1, smooth(7, 41, T)) : lerp(3, 2, smooth(1.2, 4.5, T));
    dBg.set('uP', phase);
    if (reduced) dBg.redraw();
  }
  if (reduced && hs) drawHs(performance.now());
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);

if (dBg) reduced ? dBg.still(3) : dBg.start();

// the real headset, turning through the rooms
let hs = null;
const hsCanvas = document.getElementById('dHs');
let hsVisible = false;
new IntersectionObserver(es => { hsVisible = es[0].isIntersecting; }).observe(hsCanvas);
function drawHs(now) {
  if (!hs) return;
  const h = T / 110;
  const wide = innerWidth > 900;
  hs.state.az = -75 * Math.PI / 180 + dp * Math.PI * 1.7 + (reduced ? 0 : Math.sin(now / 2400) * 0.08);
  hs.state.el = (14 + Math.sin(now / 3100) * 4 * (reduced ? 0 : 1) + dp * 10) * Math.PI / 180;
  hs.state.fill = wide ? 0.78 : 0.9;
  hs.state.y = wide ? 0.02 : 0.1;
  const { THREE } = hs;
  hs.key.color.copy(new THREE.Color().setRGB(...tempRGB(T).map(v => v / 255)));
  hs.key.intensity = lerp(2.2, 3.4, h);
  hs.rim.color.set(T > 40 ? 0xffb35c : 0x9fd8ec);
  hs.rim.intensity = lerp(2.6, 1.8, h);
  hs.mat.clearcoat = lerp(0.9, 0.35, h);     // wet sheen once it is in the water
  hs.mat.clearcoatRoughness = lerp(0.12, 0.35, h);
  hs.render();
}
import('/js/lp-headset.js').then(({ headset }) => headset(hsCanvas, { color: '#35383C', maxDpr: 1.75 }))
  .then(h => {
    hs = h;
    if (reduced) { drawHs(0); return; }
    (function loop(now) { requestAnimationFrame(loop); if (hsVisible) drawHs(now); })(performance.now());
  })
  .catch(() => { /* the backdrop and numbers still carry the section */ });
onScroll();

/* ═════════ Contrast split ═════════ */
const split = document.getElementById('ctSplit');
if (split) {
  let x = 50, target = 50, dragging = false;
  const set = v => { target = clamp(v, 3, 97); split.setAttribute('aria-valuenow', Math.round(target)); };
  const fromEvent = e => { const r = split.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
  split.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || dragging) fromEvent(e); });
  split.addEventListener('pointerdown', e => { dragging = true; fromEvent(e); });
  addEventListener('pointerup', () => { dragging = false; });
  split.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { set(target - 5); e.preventDefault(); }
    if (e.key === 'ArrowRight') { set(target + 5); e.preventDefault(); }
  });
  (function ease() {
    x += (target - x) * (reduced ? 1 : 0.12);
    split.style.setProperty('--x', x.toFixed(2) + '%');
    requestAnimationFrame(ease);
  })();
}

