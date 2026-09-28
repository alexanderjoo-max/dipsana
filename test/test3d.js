import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('three');
const film = document.getElementById('film');
const hero = document.getElementById('hero');
const chaps = [...document.querySelectorAll('.chap')];
const tc = document.getElementById('tc'), lens = document.getElementById('lens');
const aura = document.getElementById('filmAura'), breathTxt = document.getElementById('breathTxt');
const AURAS = [['#ffb996','#ffc9d6'],['#9fdbe6','#cdb8ff'],['#cdb8ff','#ffc9d6'],['#ffe7a3','#9fdbe6']];
const filmBar = document.getElementById('filmBar'), cwName = document.getElementById('cwName');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => innerWidth < 760;

const COLORWAYS = [
  { name: 'Obsidian', hex: '#35383C', rough: .5, cc: .5 },
  { name: 'Ember', hex: '#E2542C', rough: .38, cc: .7 },
  { name: 'Glacier', hex: '#A8D5E2', rough: .42, cc: .6 },
  { name: 'Chalk', hex: '#EDE8E0', rough: .55, cc: .4 }
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ss = t => t * t * (3 - 2 * t);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch { throw new Error('no webgl'); }
renderer.setClearAlpha(0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile() ? 1.5 : 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 100);
camera.position.set(0, 0, 4);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

// Studio: a hot key, a cold rim, a white top spot
const hotKey = new THREE.SpotLight(0xffa585, 60, 20, .5, .6, 1.4); hotKey.position.set(-3.2, 1.2, 2.6);
const coldRim = new THREE.SpotLight(0x9fd8ff, 60, 20, .5, .6, 1.4); coldRim.position.set(3.2, 1.6, -2.2);
const top = new THREE.DirectionalLight(0xfff4ea, 1.1); top.position.set(0, 4, 2);
const under = new THREE.PointLight(0xffffff, 0, 6); under.position.set(0, -1.5, 1.5);
scene.add(hotKey, coldRim, top, under, new THREE.AmbientLight(0xfff0f4, .5));

const mat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(COLORWAYS[0].hex), roughness: .5, metalness: .05,
  clearcoat: .5, clearcoatRoughness: .25, envMapIntensity: .55
});

const rig = new THREE.Group(); // position
const spinner = new THREE.Group(); // rotation
rig.add(spinner); scene.add(rig);

// light halo rings around the product
const ringMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false });
const ringHot = new THREE.Mesh(new THREE.TorusGeometry(.78, .0035, 8, 200), ringMat(0xff7a2a));
const ringCold = new THREE.Mesh(new THREE.TorusGeometry(.9, .0025, 8, 200), ringMat(0x7fd3ff));


let ready = false;
new GLTFLoader().load('/models/headset.glb', g => {
  let geo = null;
  g.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
  if (!geo) return;
  geo.computeVertexNormals(); geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3()), mid = geo.boundingBox.getCenter(new THREE.Vector3());
  geo.translate(-mid.x, -mid.y, -mid.z);
  const k = 1 / Math.max(size.x, size.y, size.z); geo.scale(k, k, k);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = -75 * Math.PI / 180;
  spinner.add(mesh);
  ready = true;
  document.body.classList.add('has3d');
  canvas.classList.add('show');
}, undefined, () => {});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
resize(); addEventListener('resize', resize);

const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; }, { passive: true });

// Film keyframes: rotY, rotX, zoom (1 = hero size), x (-1..1 of half-view), y, heat, lensMM
const K = [
  { ry: .5, rx: .12, z: 1.25, x: .38, y: 0, heat: 1, mm: 35 },
  { ry: 2.6, rx: -.35, z: 1.35, x: .36, y: .02, heat: 0, mm: 50 },
  { ry: 4.3, rx: .45, z: 1.85, x: .34, y: -.05, heat: .5, mm: 85 },
  { ry: 6.9, rx: .15, z: 1.3, x: .36, y: 0, heat: .6, mm: 35 }
];
const colFrom = new THREE.Color(), colTo = new THREE.Color();
let curCW = 0;
function setColorway(i) {
  if (i === curCW) return;
  curCW = i; const cw = COLORWAYS[i];
  colFrom.copy(mat.color); colTo.set(cw.hex); colT = 0;
  mat.roughness = cw.rough; mat.clearcoat = cw.cc;
  if (cwName) cwName.textContent = cw.name;
}
let colT = 1;

const state = { ry: 0, rx: 0, z: 1, x: .3, y: 0, heat: 1, mm: 35 };
let spinAcc = 0, lastChap = -1, last = performance.now();

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const vh = innerHeight, y = scrollY;
  const fr = film.getBoundingClientRect();
  const fp = clamp(-fr.top / (fr.height - vh));
  const heroP = clamp(y / vh);
  const inHero = y < vh * 1.4 && fr.top > 0;
  const inFilm = fr.top <= vh * .2 && fr.bottom > vh * .6;
  const visible = ready && (inHero || inFilm || (fr.top > 0 && fr.top < vh));
  canvas.classList.toggle('show', visible);

  mouse.sx = lerp(mouse.sx, mouse.x, .05); mouse.sy = lerp(mouse.sy, mouse.y, .05);
  spinAcc += dt * (reduce ? 0 : .35);

  let tgt;
  if (fr.top > 0) {
    // hero → approach the film: product to the right, slowly spinning, light follows mouse
    const approach = clamp(1 - fr.top / vh);
    const heroHeat = clamp(.5 - mouse.sx * 1.4);
    tgt = {
      ry: spinAcc + mouse.sx * .8, rx: .15 + mouse.sy * .4, z: mobile() ? .9 : 1.05 - heroP * .1,
      x: mobile() ? 0 : lerp(.5, K[0].x, approach), y: mobile() ? .28 : lerp(.02, 0, approach) + heroP * .05,
      heat: lerp(heroHeat, K[0].heat, approach), mm: 35
    };
    tgt.ry = lerp(tgt.ry, K[0].ry + spinAcc * .2, approach * 0);
  } else {
    const f = fp * (K.length - 1) * 1.0;
    const a = Math.min(K.length - 2, Math.floor(f)), t = ss(clamp(f - a));
    const A = K[a], B = K[a + 1];
    tgt = {};
    for (const k in A) tgt[k] = lerp(A[k], B[k], t);
    tgt.ry += mouse.sx * .5 + Math.sin(now / 2000) * .08; tgt.rx += mouse.sy * .3;
    if (mobile()) { tgt.x = 0; tgt.y = .2; }
    const chap = Math.min(3, Math.floor(fp * 4));
    if (chap !== lastChap) { lastChap = chap; chaps.forEach((c, i) => c.classList.toggle('on', i === chap));
      aura.style.background = `radial-gradient(circle at 50% 50%, ${AURAS[chap][0]}, ${AURAS[chap][1]} 45%, transparent 70%)`; }
    breathTxt.textContent = Math.sin(now / 8000 * Math.PI * 2 - Math.PI / 2) > 0 ? 'breathe out' : 'breathe in';
    if (chap === 3) setColorway(Math.min(3, Math.floor(((fp - .75) / .25) * 4)));
    else setColorway(0);
    // HUD
    const secs = fp * 48; const fps = Math.floor((secs % 1) * 24);
    const pad = n => String(n).padStart(2, '0');
    tc.textContent = `00:00:${pad(Math.floor(secs))}:${pad(fps)}`;
    lens.textContent = `${Math.round(tgt.mm)}mm · f/${(1.4 + (tgt.z - 1) * .8).toFixed(1)}`;
    filmBar.style.transform = `scaleX(${fp})`;
  }
  if (fr.top > 0 && lastChap !== -1) { lastChap = -1; chaps.forEach(c => c.classList.remove('on')); }

  const e = 1 - Math.pow(.001, dt); // frame-rate independent easing
  for (const k in state) state[k] = lerp(state[k], tgt[k], e * 1.2);

  if (visible) {
    spinner.rotation.set(state.rx, state.ry, Math.sin(now / 3000) * .04);
    const dist = (camera.aspect < 1 ? 6.4 : 4.3) / state.z;
    camera.position.set(0, 0, dist);
    const halfW = Math.tan(camera.fov * Math.PI / 360) * dist * camera.aspect;
    const halfH = Math.tan(camera.fov * Math.PI / 360) * dist;
    rig.position.set(state.x * halfW, state.y * halfH * 2 + Math.sin(now / 1400) * .015, 0);
    camera.lookAt(0, 0, 0);
    hotKey.intensity = 3 + 26 * state.heat;
    coldRim.intensity = 3 + 26 * (1 - state.heat);
    under.intensity = (1 - state.heat) * 2;
    ringHot.material.opacity = .15 + .6 * state.heat; ringCold.material.opacity = .15 + .6 * (1 - state.heat);
    ringHot.rotation.set(1.2 + Math.sin(now / 2400) * .2, now / 3000, 0);
    ringCold.rotation.set(1.4 + Math.cos(now / 2800) * .2, -now / 3600, .3);
    if (colT < 1) { colT = Math.min(1, colT + dt * 1.6); mat.color.copy(colFrom).lerp(colTo, ss(colT)); }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
