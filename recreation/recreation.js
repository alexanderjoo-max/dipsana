import { initMotion, countUp, gsap, ScrollTrigger, reduced, coarse } from '/js/lp-motion.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
initMotion();

/* ═════════ hero: a split-flap activity word, a collage on a sun ═════════ */
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

  gsap.from('.cl', { y: 160, rotate: i => (i % 2 ? 14 : -14), opacity: 0, duration: 1.6, ease: 'expo.out', stagger: 0.12, delay: 0.2 });
  gsap.from('.sun', { scale: 0.4, opacity: 0, duration: 2, ease: 'expo.out' });
  gsap.from('.kicker, .flip-line, .hero-sub, .hero-actions', { y: 30, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, delay: 0.35 });
  gsap.to('.sun', { rotate: 360, duration: 120, ease: 'none', repeat: -1 });
  // the collage drifts with the pointer and slides apart as you scroll away
  const cls = [...document.querySelectorAll('.cl')];
  if (!coarse) document.getElementById('hero').addEventListener('pointermove', e => {
    const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
    cls.forEach(c => { const d = parseFloat(c.dataset.depth); gsap.to(c, { x: nx * 40 * d, y: ny * 30 * d, duration: 1, ease: 'power3.out', overwrite: 'auto' }); });
  });
  cls.forEach((c, i) => gsap.to(c, { yPercent: -30 * parseFloat(c.dataset.depth), rotate: (i % 2 ? 8 : -8), ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } }));
} else {
  inner.querySelectorAll('span').forEach((w, i) => { if (i) w.style.display = 'none'; });
}

/* ═════════ marquee: runs on its own, faster while you scroll ═════════ */
const mq = document.getElementById('mqA');
if (gsap && !reduced) {
  const loop = gsap.to(mq, { xPercent: -50, duration: 26, ease: 'none', repeat: -1 });
  let boost = 0, dir = 1;
  ScrollTrigger.create({ onUpdate: self => { boost = Math.min(4, Math.abs(self.getVelocity()) / 500); dir = self.direction || 1; } });
  gsap.ticker.add(() => { boost *= 0.93; loop.timeScale(dir * (1 + boost)); });
}

/* ═════════ pick your day: the photo opens from where you tapped ═════════ */
const DAYS = {
  beach:  { img: 'friends', alt: 'A group of friends running into the sea together', tag: 'Beach · IP68', title: 'Sand stays out.', text: 'IP68 is dust-tight as well as waterproof, and nothing sits in your ear canal. Swim in the shallows with it on, then rinse it in fresh water.', list: 'A summer album, start to finish' },
  hike:   { img: 'hike', alt: 'A woman looking out over a range of green mountains', tag: 'Hike · 32GB offline', title: 'No signal, no problem.', text: '32GB onboard plays offline, so the album keeps going where your phone gives up. Ten hours covers a long day on the hill.', list: 'A long audiobook' },
  ride:   { img: 'ride', alt: 'Two road cyclists riding a winding path at sunset', tag: 'Ride · open-ear', title: 'Hear what’s coming.', text: 'Open ears keep traffic and other riders audible. Check the local rules on headphones before you ride.', list: 'Something with a steady beat' },
  run:    { img: 'run', alt: 'A runner on a grassy ridge above the clouds', tag: 'Run · stays put', title: 'Nothing bouncing in your ears.', text: 'The band sits behind your head, so there are no buds to shake loose, and you still hear footsteps and traffic.', list: 'Tempo playlist, about 165 bpm' },
  paddle: { img: 'paddle', alt: 'A paddleboarder on calm water at sunset', tag: 'Paddle · waterproof', title: 'If it goes in, fine.', text: 'A capsize means a wet headset, not an earbud at the bottom of the lake. IP68 to two metres.', list: 'A sunset playlist' },
  pool:   { img: 'pool', alt: 'A woman in a sun hat sitting on the edge of a bright blue pool', tag: 'Pool · plays underwater', title: 'Lengths or lounging.', text: 'Waterproof to two metres, with music stored on the headset, because Bluetooth doesn’t reach underwater.', list: 'A podcast for the lounger' },
  walk:   { img: 'walk', alt: 'Two people with backpacks walking a tree-lined coastal path', tag: 'Walk · ears open', title: 'Podcast on, world on.', text: 'Hear cars pulling out, cyclists behind you and the friend who’s just caught you up.', list: 'Your favourite podcast' }
};
Object.values(DAYS).forEach(d => { const i = new Image(); i.src = `/images/rec/${d.img}.jpg`; });
const photos = document.getElementById('pickPhotos');
const card = document.getElementById('pickCard');
const tabs = [...document.querySelectorAll('.pick-tabs button')];
let pickBusy = false;
function pickDay(k, ev) {
  const d = DAYS[k];
  if (!d || pickBusy) return;
  tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.k === k)));
  const img = new Image();
  img.src = `/images/rec/${d.img}.jpg`; img.alt = d.alt; img.width = 1600; img.height = 1067;
  const r = photos.getBoundingClientRect();
  const cx = ev && ev.clientX ? clamp((ev.clientX - r.left) / r.width) * 100 : 50;
  const cy = ev && ev.clientY ? clamp((ev.clientY - r.top) / r.height) * 100 : 50;
  const fill = () => {
    document.getElementById('pkTag').textContent = d.tag;
    document.getElementById('pkTitle').textContent = d.title;
    document.getElementById('pkText').textContent = d.text;
    document.getElementById('pkList').textContent = d.list;
  };
  if (!gsap || reduced) { photos.replaceChildren(img); fill(); return; }
  pickBusy = true;
  img.className = 'incoming';
  img.style.setProperty('--cx', cx + '%'); img.style.setProperty('--cy', cy + '%');
  photos.appendChild(img);
  gsap.fromTo(img, { clipPath: `circle(0% at ${cx}% ${cy}%)`, scale: 1.15 }, {
    clipPath: `circle(150% at ${cx}% ${cy}%)`, scale: 1, duration: 1.1, ease: 'expo.inOut',
    onComplete: () => { [...photos.children].forEach(c => { if (c !== img) c.remove(); }); img.className = ''; img.style.clipPath = ''; pickBusy = false; }
  });
  gsap.to(card.children, { y: -14, opacity: 0, duration: 0.3, stagger: 0.03, ease: 'power2.in', onComplete: () => {
    fill();
    gsap.fromTo(card.children, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.05, ease: 'expo.out' });
  } });
}
tabs.forEach(t => t.addEventListener('click', e => pickDay(t.dataset.k, e)));
document.querySelector('.pick-tabs').addEventListener('keydown', e => {
  const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  const n = tabs[(i + d + tabs.length) % tabs.length];
  n.focus(); pickDay(n.dataset.k);
});

/* ═════════ stats bounce in and count up ═════════ */
document.querySelectorAll('.stats [data-count]').forEach(el => countUp(el, { duration: 1.6 }));
if (gsap && !reduced) {
  gsap.from('.stats li', { y: 60, scale: 0.85, opacity: 0, duration: 1.1, ease: 'back.out(2)', stagger: 0.1, scrollTrigger: { trigger: '.stats', start: 'top 80%', once: true } });
  gsap.from('.pick-stage', { y: 80, opacity: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: '.pick-stage', start: 'top 85%', once: true } });
  gsap.from('.mixer', { y: 60, rotate: 2, opacity: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: '.mixer', start: 'top 85%', once: true } });
  gsap.from('.kit-sun', { scale: 0.5, opacity: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.kit', start: 'top 75%', once: true } });
}

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
  if (reduced) { frame(performance.now()); kitPaint = i => { mat.color.set(KIT[i].hex); frame(performance.now()); }; }
  else (function loop(now) { requestAnimationFrame(loop); if (visible || ct < 1) frame(now); })(performance.now());
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
