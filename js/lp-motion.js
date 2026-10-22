// Shared motion for the campaign landing pages.
// Needs gsap, ScrollTrigger and Lenis loaded as classic scripts first (they set window globals).
//
//   [data-split="chars"|"words"]   masked reveal when it scrolls in ("load" variants play on page load)
//   [data-scrub]                   words brighten one by one as you scroll through
//   [data-speed="0.3"]             parallax drift relative to its section
//   [data-magnet]                  buttons that lean toward the cursor

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarse = matchMedia('(pointer: coarse)').matches;
export const gsap = window.gsap;
export const ScrollTrigger = window.ScrollTrigger;

export function split(el, mode = 'words') {
  if (el.dataset.splitDone) return el;
  el.dataset.splitDone = '1';
  const walk = node => {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span');
          w.className = 'sw';
          if (mode === 'chars') {
            [...part].forEach(ch => {
              const c = document.createElement('span');
              c.className = 'si sc';
              c.textContent = ch;
              w.appendChild(c);
            });
          } else {
            const i = document.createElement('span');
            i.className = 'si';
            i.textContent = part;
            w.appendChild(i);
          }
          frag.appendChild(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && !child.hasAttribute('data-nosplit') && child.tagName !== 'BR') {
        walk(child);
      }
    });
  };
  walk(el);
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  [...el.querySelectorAll('.sw')].forEach(s => s.setAttribute('aria-hidden', 'true'));
  return el;
}

function revealSplits() {
  document.querySelectorAll('[data-split]').forEach(el => {
    const mode = el.dataset.split.includes('chars') ? 'chars' : 'words';
    split(el, mode);
    const parts = el.querySelectorAll('.si');
    const onLoad = el.dataset.split.includes('load');
    const tween = {
      yPercent: 115, rotate: mode === 'chars' ? 6 : 2, opacity: 0,
      duration: mode === 'chars' ? 1.1 : 1.2, ease: 'expo.out',
      stagger: mode === 'chars' ? 0.028 : 0.06,
      delay: +(el.dataset.delay || 0)
    };
    if (onLoad) gsap.from(parts, tween);
    else gsap.from(parts, { ...tween, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });
}

function scrubWords() {
  document.querySelectorAll('[data-scrub]').forEach(el => {
    split(el, 'words');
    const words = el.querySelectorAll('.si');
    gsap.set(words, { opacity: 0.14 });
    gsap.to(words, {
      opacity: 1, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 45%', scrub: true }
    });
  });
}

function parallax() {
  document.querySelectorAll('[data-speed]').forEach(el => {
    const s = parseFloat(el.dataset.speed) || 0.2;
    gsap.fromTo(el, { yPercent: s * 30 }, {
      yPercent: -s * 30, ease: 'none',
      scrollTrigger: { trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: true }
    });
  });
}

function magnets() {
  if (coarse) return;
  document.querySelectorAll('[data-magnet]').forEach(el => {
    const k = parseFloat(el.dataset.magnet) || 0.35;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * k, y: (e.clientY - r.top - r.height / 2) * k, duration: 0.4, ease: 'power3.out' });
    });
    el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' }));
  });
}

export function initMotion({ smooth = true } = {}) {
  // the logo in the top bar takes you back to the top
  let lenis = null;
  document.querySelectorAll('.topbar .mark').forEach(m => m.addEventListener('click', e => {
    e.preventDefault();
    if (lenis) lenis.scrollTo(0, { duration: 1.4 });
    else scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }));
  if (!gsap || !ScrollTrigger) {
    document.documentElement.classList.add('no-motion');
    return { lenis: null };
  }
  gsap.registerPlugin(ScrollTrigger);
  if (!reduced && smooth && window.Lenis && !coarse) {
    lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      const target = id.length > 1 && document.querySelector(id);
      if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -40, duration: 1.6 }); }
    }));
  }
  if (reduced) {
    document.documentElement.classList.add('reduced');
    document.querySelectorAll('[data-split],[data-scrub]').forEach(el => split(el, 'words'));
  } else {
    revealSplits();
    scrubWords();
    parallax();
    magnets();
  }
  addEventListener('load', () => ScrollTrigger.refresh());
  return { lenis };
}

// Count a number up when it scrolls into view.
export function countUp(el, { duration = 1.6, decimals = 0 } = {}) {
  const end = parseFloat(el.dataset.count);
  if (reduced || !gsap) { el.textContent = end.toFixed(decimals); return; }
  const o = { v: 0 };
  gsap.to(o, {
    v: end, duration, ease: 'power3.out',
    onUpdate: () => { el.textContent = o.v.toFixed(decimals); },
    scrollTrigger: { trigger: el, start: 'top 90%', once: true }
  });
}
