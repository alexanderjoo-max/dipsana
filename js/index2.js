(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const canHover = window.matchMedia('(hover: hover)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const PHASES = [
    { id: 'heat', temp: 110, name: 'Sauna' },
    { id: 'steam', temp: 45, name: 'Steam' },
    { id: 'plunge', temp: 4, name: 'Plunge' },
    { id: 'ice', temp: 0, name: 'Ice' }
  ];
  const ROOM_TEMP = { heat: 92, steam: 42, plunge: 6, ice: 2, contrast: 50 };
  const HOLD = 2000;

  const hero = document.querySelector('.hero');
  const degEl = document.getElementById('climDeg');
  const nameEl = document.getElementById('climName');
  const cycleEl = document.getElementById('climCycle');
  const railFill = document.getElementById('railFill');
  const railLive = document.getElementById('railLive');
  const rooms = [...document.querySelectorAll('.room')];
  const ticks = {};

  let heroPhase = 0;
  let heroPause = reduced;
  let heroVisible = true;
  let climateOn = true;
  let mix = { heat: 1, steam: 0, plunge: 0, ice: 0, contrast: 0 };
  let shownTemp = 110;
  let targetTemp = 110;
  let dominant = 'heat';

  function setHeroPhase(i, snap) {
    heroPhase = i;
    const p = PHASES[i];
    if (!hero) return;
    hero.dataset.phase = p.id;
    if (nameEl) nameEl.textContent = p.name;
    if (cycleEl) {
      cycleEl.querySelectorAll('[data-p]').forEach(s => {
        if (s.dataset.p === p.id) s.setAttribute('aria-current', 'true');
        else s.removeAttribute('aria-current');
      });
    }
    if (snap) {
      shownTemp = p.temp;
      targetTemp = p.temp;
      if (degEl) degEl.textContent = p.temp + '°';
    } else {
      targetTemp = p.temp;
    }
  }

  if (hero) {
    setHeroPhase(0, true);
    if (!reduced) {
      const vis = new IntersectionObserver(entries => {
        heroVisible = entries.some(e => e.isIntersecting && e.intersectionRatio > 0.2);
      }, { threshold: [0, 0.2, 0.5] });
      vis.observe(hero);

      if (canHover) {
        hero.addEventListener('pointerenter', () => { heroPause = true; });
        hero.addEventListener('pointerleave', () => { heroPause = false; });
      }

      let lastSwitch = performance.now();
      function cycle(now) {
        if (!heroPause && heroVisible && now - lastSwitch >= HOLD) {
          lastSwitch = now;
          setHeroPhase((heroPhase + 1) % PHASES.length);
        }
        requestAnimationFrame(cycle);
      }
      requestAnimationFrame(cycle);
    }
  }

  /* ── climate mix from scroll ── */
  function updateMix() {
    const vh = window.innerHeight;
    const next = { heat: 0, steam: 0, plunge: 0, ice: 0, contrast: 0 };
    let total = 0;

    const hr = hero ? hero.getBoundingClientRect() : null;
    const hvis = hr
      ? clamp((Math.min(hr.bottom, vh) - Math.max(hr.top, 0)) / vh, 0, 1)
      : 0;

    if (hvis > 0.42) {
      next[PHASES[heroPhase].id] = 1;
      total = 1;
      climateOn = true;
    } else {
      for (const room of rooms) {
        const r = room.getBoundingClientRect();
        const vis = clamp((Math.min(r.bottom, vh) - Math.max(r.top, 0)) / vh, 0, 1);
        if (vis > 0) {
          next[room.dataset.climate] += vis;
          total += vis;
        }
      }
    }

    if (total < 0.08) {
      mix = { heat: 0, steam: 0, plunge: 0, ice: 0, contrast: 0 };
      climateOn = false;
      targetTemp = 0;
      document.body.removeAttribute('data-climate');
      rooms.forEach(r => r.classList.remove('is-on'));
      const rail = document.querySelector('.rail');
      if (rail) rail.classList.remove('is-hero');
      return;
    }

    climateOn = hvis > 0.42;
    for (const k of Object.keys(next)) next[k] /= total;
    mix = next;

    let top = 'heat';
    let topV = -1;
    for (const k of Object.keys(mix)) {
      if (mix[k] > topV) { topV = mix[k]; top = k; }
    }
    dominant = top;
    document.body.dataset.climate = top;
    rooms.forEach(r => r.classList.toggle('is-on', r.dataset.climate === top && hvis < 0.42));
    const rail = document.querySelector('.rail');
    if (rail) rail.classList.toggle('is-hero', hvis > 0.42);

    if (hvis <= 0.42) {
      targetTemp =
        mix.heat * ROOM_TEMP.heat +
        mix.steam * ROOM_TEMP.steam +
        mix.plunge * ROOM_TEMP.plunge +
        mix.ice * ROOM_TEMP.ice +
        mix.contrast * ROOM_TEMP.contrast;
    } else {
      targetTemp = PHASES[heroPhase].temp;
    }
  }

  function syncRail() {
    const t = clamp(shownTemp, 0, 110);
    if (railLive) railLive.textContent = Math.round(t) + '°';
    if (railFill) railFill.style.height = ((110 - t) / 110 * 100) + '%';
  }

  function pulseTicks(now) {
    if (ticks.heat) {
      const w = 0.5 + 0.5 * Math.sin(now / 2400);
      ticks.heat.textContent = Math.round(lerp(80, 100, w)) + '°C';
    }
    if (ticks.steam) {
      const w = 0.5 + 0.5 * Math.sin(now / 2800);
      ticks.steam.textContent = Math.round(lerp(40, 45, w)) + '°C';
    }
    if (ticks.plunge) {
      const w = 0.5 + 0.5 * Math.sin(now / 1800);
      ticks.plunge.textContent = Math.round(lerp(3, 10, w)) + '°C';
    }
    if (ticks.ice) {
      const w = 0.5 + 0.5 * Math.sin(now / 2200);
      ticks.ice.textContent = Math.round(lerp(0, 5, w)) + '°C';
    }
  }

  /* ── particles ── */
  const canvas = document.getElementById('wx');
  const ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;
  const mobile = window.matchMedia('(max-width:900px)').matches;
  const MAX = reduced ? 0 : (mobile ? 42 : 88);
  const particles = [];
  let dpr = 1;
  let wxW = 0;
  let wxH = 0;
  let lastMix = 0;

  function resizeWx() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
    wxW = window.innerWidth;
    wxH = window.innerHeight;
    canvas.width = Math.floor(wxW * dpr);
    canvas.height = Math.floor(wxH * dpr);
    canvas.style.width = wxW + 'px';
    canvas.style.height = wxH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeWx();
  window.addEventListener('resize', resizeWx, { passive: true });

  function pickKind() {
    const r = Math.random();
    let acc = 0;
    const table = [
      [mix.heat, Math.random() < 0.7 ? 'ember' : 'smoke'],
      [mix.plunge, 'bubble'],
      [mix.ice, 'spark'],
      [mix.contrast, Math.random() < 0.5 ? 'ember' : 'spark']
    ];
    const sum = table.reduce((s, x) => s + x[0], 0);
    if (sum < 0.04) return null;
    for (const [w, kind] of table) {
      acc += w / sum;
      if (r <= acc) return kind;
    }
    return table[0][1];
  }

  function spawn() {
    if (!climateOn || particles.length >= MAX) return;
    const kind = pickKind();
    if (!kind) return;
    const x = Math.random() * wxW;
    if (kind === 'ember') {
      particles.push({
        kind, x, y: wxH + 6,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -(0.55 + Math.random() * 1.35),
        r: 0.8 + Math.random() * 2.1,
        life: 1,
        decay: 0.0035 + Math.random() * 0.005,
        cr: Math.random() > 0.45 ? 232 : 255,
        cg: Math.random() > 0.45 ? 106 : 176,
        cb: Math.random() > 0.45 ? 42 : 80
      });
    } else if (kind === 'smoke') {
      particles.push({
        kind, x: x * 0.8 + wxW * 0.1, y: wxH + 20,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -(0.22 + Math.random() * 0.45),
        r: 10 + Math.random() * 18,
        life: 1,
        decay: 0.0018 + Math.random() * 0.0024
      });
    } else if (kind === 'bubble') {
      particles.push({
        kind, x, y: wxH + 8,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -(0.4 + Math.random() * 1.1),
        r: 2 + Math.random() * 7,
        life: 1,
        decay: 0.0022 + Math.random() * 0.0035
      });
    } else {
      const edge = Math.random();
      let sx, sy;
      if (edge < 0.25) { sx = Math.random() * wxW; sy = Math.random() * wxH * 0.18; }
      else if (edge < 0.5) { sx = Math.random() * wxW; sy = wxH * (0.82 + Math.random() * 0.18); }
      else if (edge < 0.75) { sx = Math.random() * wxW * 0.16; sy = Math.random() * wxH; }
      else { sx = wxW * (0.84 + Math.random() * 0.16); sy = Math.random() * wxH; }
      particles.push({
        kind: 'spark', x: sx, y: sy,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        r: 0.6 + Math.random() * 1.4,
        life: 1,
        decay: 0.004 + Math.random() * 0.008,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function drawParticle(p) {
    if (p.kind === 'ember') {
      ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${p.life * 0.85})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(42,18,10,${p.life * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.4, p.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'bubble') {
      ctx.strokeStyle = `rgba(180,220,240,${p.life * 0.55})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${p.life * 0.28})`;
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.32, Math.max(0.6, p.r * 0.18), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const a = (0.4 + 0.6 * Math.abs(Math.sin(p.phase))) * p.life;
      ctx.strokeStyle = `rgba(220,240,255,${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - p.r * 2.4, p.y);
      ctx.lineTo(p.x + p.r * 2.4, p.y);
      ctx.moveTo(p.x, p.y - p.r * 2.4);
      ctx.lineTo(p.x, p.y + p.r * 2.4);
      ctx.stroke();
    }
  }

  let last = performance.now();
  let hidden = document.hidden;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  function frame(now) {
    const dt = Math.min(now - last, 48);
    last = now;

    if (now - lastMix > 80) {
      updateMix();
      lastMix = now;
    }

    shownTemp = lerp(shownTemp, targetTemp, Math.min(1, dt / 220));
    if (heroVisible && degEl) degEl.textContent = Math.round(shownTemp) + '°';
    syncRail();
    if (!reduced) pulseTicks(now);

    if (ctx && !reduced && !hidden && climateOn) {
      ctx.clearRect(0, 0, wxW, wxH);
      const spawnBudget = mobile ? 1 : 2;
      for (let i = 0; i < spawnBudget; i++) spawn();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        p.life -= p.decay * dt;
        if (p.kind === 'spark') p.phase += dt * 0.006;
        if (p.life <= 0 || p.y < -60) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }
        drawParticle(p);
      }
    } else if (ctx && !climateOn) {
      if (particles.length) {
        particles.length = 0;
        ctx.clearRect(0, 0, wxW, wxH);
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── lazy Three.js viewer ── */
  const viewer = document.getElementById('viewer');
  const kit = document.getElementById('kit');
  const swatchList = document.getElementById('swatches');
  if (viewer && kit && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      bootViewer();
    }, { rootMargin: '240px 0px' });
    io.observe(viewer);
  }

  const COLORWAYS = [
    { name: 'Obsidian', hex: '#35383C', note: 'Matte charcoal, the hero.', rough: .58, cc: .34 },
    { name: 'Glacier',  hex: '#A8D5E2', note: 'Pale ice blue.',            rough: .50, cc: .42 },
    { name: 'Ember',    hex: '#E2542C', note: 'The loud one.',             rough: .42, cc: .55 },
    { name: 'Chalk',    hex: '#EDE8E0', note: 'Off-white.',                rough: .62, cc: .28 }
  ];

  const cwName = document.getElementById('cwName');
  const cwHex = document.getElementById('cwHex');
  const cwNote = document.getElementById('cwNote');
  const fades = [cwName, cwHex, cwNote].filter(Boolean);
  let paintColor = null;
  let activeIndex = 0;

  function lumOf(rgb) { return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255; }
  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    let rgb = [n >> 16 & 255, n >> 8 & 255, n >> 0 & 255];
    while (lumOf(rgb) < 0.55) rgb = rgb.map(v => v + (255 - v) * 0.22);
    return rgb;
  }
  function setInk(rgb) {
    document.documentElement.style.setProperty(
      '--active-ink',
      `rgb(${Math.round(rgb[0])} ${Math.round(rgb[1])} ${Math.round(rgb[2])})`
    );
  }

  function applyReadout(i, silent) {
    const cw = COLORWAYS[i];
    document.documentElement.style.setProperty('--active', cw.hex);
    setInk(inkFor(cw.hex));
    if (swatchList) {
      [...swatchList.children].forEach((li, k) => {
        li.firstElementChild.setAttribute('aria-checked', String(k === i));
        li.firstElementChild.tabIndex = k === i ? 0 : -1;
      });
    }
    const write = () => {
      if (cwName) cwName.textContent = cw.name;
      if (cwHex) cwHex.textContent = cw.hex;
      if (cwNote) cwNote.textContent = cw.note;
    };
    if (silent || reduced) {
      write();
      return;
    }
    fades.forEach(el => el.classList.add('out'));
    setTimeout(() => {
      write();
      fades.forEach(el => el.classList.remove('out'));
    }, 180);
  }

  function selectColorway(i, silent) {
    activeIndex = i;
    applyReadout(i, silent);
    if (paintColor) paintColor(i, silent);
  }

  if (swatchList) {
    COLORWAYS.forEach((cw, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'swatch';
      b.type = 'button';
      b.style.setProperty('--sw', cw.hex);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === 0));
      b.setAttribute('aria-label', `${cw.name}, ${cw.hex}`);
      b.tabIndex = i === 0 ? 0 : -1;
      b.addEventListener('click', () => selectColorway(i));
      b.addEventListener('keydown', ev => {
        const d = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1
                : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        ev.preventDefault();
        const k = (activeIndex + d + COLORWAYS.length) % COLORWAYS.length;
        selectColorway(k);
        swatchList.children[k].firstElementChild.focus();
      });
      li.appendChild(b);
      swatchList.appendChild(li);
    });
    applyReadout(0, true);
  }

  async function bootViewer() {
    const slot = document.querySelector('.stage-slot');
    if (!slot || !kit) return;
    try {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

      const renderer = new THREE.WebGLRenderer({
        canvas: kit, antialias: true, alpha: true, powerPreference: 'high-performance'
      });
      renderer.setClearAlpha(0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
      const envRT = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;

      const key = new THREE.DirectionalLight(0xFFF2E4, 2.4); key.position.set(3, 4, 3);
      const rim = new THREE.DirectionalLight(0x8EC4D4, 1.5); rim.position.set(-3, 1.5, -3);
      const fill = new THREE.DirectionalLight(0xBFC9D0, 0.55); fill.position.set(-2, -1.5, 2);
      scene.add(key, rim, fill, new THREE.AmbientLight(0xF0E8DC, 0.3));

      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(COLORWAYS[0].hex),
        roughness: COLORWAYS[0].rough, metalness: 0.04,
        clearcoat: COLORWAYS[0].cc, clearcoatRoughness: 0.35,
        envMapIntensity: 0.42
      });

      const rig = new THREE.Group();
      scene.add(rig);
      let modelRadius = 0.5;
      let ready = false;
      let inView = true;

      const BASE_AZ = -75 * Math.PI / 180;
      const CAM_EL = 14 * Math.PI / 180;

      new GLTFLoader().load('/models/headset.glb', gltf => {
        let geo = null;
        gltf.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
        if (!geo) return;
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        const size = geo.boundingBox.getSize(new THREE.Vector3());
        const mid = geo.boundingBox.getCenter(new THREE.Vector3());
        geo.translate(-mid.x, -mid.y, -mid.z);
        const k = 1 / Math.max(size.x, size.y, size.z);
        geo.scale(k, k, k);
        geo.computeBoundingSphere();
        modelRadius = geo.boundingSphere.radius;
        rig.add(new THREE.Mesh(geo, bodyMat));
        ready = true;
      }, undefined, () => {});

      function fitDistance(aspect, fillAmt) {
        const vFov = camera.fov * Math.PI / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        return Math.max(modelRadius / Math.sin(vFov / 2), modelRadius / Math.sin(hFov / 2)) / fillAmt;
      }

      let spin = 0, spinVel = 0;
      let dragging = false, dragLast = 0, tiltX = 0, tiltXTarget = 0;
      let ptrLive = false, ptrY = 0;
      let colT = 1;
      const colFrom = new THREE.Color(COLORWAYS[0].hex);
      const colTo = new THREE.Color(COLORWAYS[0].hex);
      let roughFrom = COLORWAYS[0].rough, roughTo = COLORWAYS[0].rough;
      let ccFrom = COLORWAYS[0].cc, ccTo = COLORWAYS[0].cc;

      paintColor = (i, silent) => {
        const cw = COLORWAYS[i];
        colFrom.copy(bodyMat.color);
        colTo.set(cw.hex);
        roughFrom = bodyMat.roughness; roughTo = cw.rough;
        ccFrom = bodyMat.clearcoat; ccTo = cw.cc;
        colT = silent ? 1 : 0;
        if (silent) {
          bodyMat.color.copy(colTo);
          bodyMat.roughness = roughTo;
          bodyMat.clearcoat = ccTo;
        }
        slot.setAttribute('aria-label',
          `The Dipsana headset in ${cw.name}: ${cw.note.toLowerCase()} Slowly rotating.`);
      };

      if (!coarse) {
        window.addEventListener('pointermove', ev => {
          ptrLive = true; ptrY = ev.clientY;
          if (dragging) {
            spinVel += (ev.clientX - dragLast) * 0.00042;
            dragLast = ev.clientX;
          }
        }, { passive: true });
        document.addEventListener('pointerleave', () => { ptrLive = false; }, { passive: true });
      }
      slot.addEventListener('pointerdown', ev => {
        dragging = true; dragLast = ev.clientX;
        slot.setPointerCapture?.(ev.pointerId);
      });
      slot.addEventListener('pointerup', () => { dragging = false; });
      slot.addEventListener('pointercancel', () => { dragging = false; });

      const vis = new IntersectionObserver(entries => {
        inView = entries.some(e => e.isIntersecting);
      }, { threshold: 0.05 });
      vis.observe(viewer);

      let handed = false;
      let t0 = performance.now();
      function draw(now) {
        const dt = Math.min(now - t0, 64);
        t0 = now;
        const rect = slot.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.4 : 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        if (!reduced) {
          spin += dt * 0.00016 + spinVel;
          spinVel *= Math.pow(0.0025, dt / 1000);
          if (ptrLive && !coarse) {
            tiltXTarget = clamp((ptrY - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1) * 0.16;
          } else tiltXTarget = 0;
          tiltX = lerp(tiltX, tiltXTarget, 1 - Math.pow(0.004, dt / 1000));
        }
        rig.rotation.y = BASE_AZ + spin;

        if (colT < 1) {
          colT = Math.min(1, colT + dt / 460);
          const e = colT * colT * (3 - 2 * colT);
          bodyMat.color.copy(colFrom).lerp(colTo, e);
          bodyMat.roughness = lerp(roughFrom, roughTo, e);
          bodyMat.clearcoat = lerp(ccFrom, ccTo, e);
        }

        if (ready && inView) {
          const d = fitDistance(camera.aspect, 1.2);
          const el = CAM_EL + tiltX;
          camera.position.set(0, d * Math.sin(el), d * Math.cos(el));
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
          if (!handed) {
            handed = true;
            viewer.classList.add('is-live');
          }
        }
        requestAnimationFrame(draw);
      }
      requestAnimationFrame(draw);
    } catch {
      /* poster stays */
    }
  }
})();
