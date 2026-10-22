// Colour-shifting Dipsana logo.
// climateMark(markEl) turns the <img> logos inside a .mark link into a crossfading stack and
// returns set(colourway). Colourways live in /images/brand/: original, heat, fire, sea, water, ice, dusk.

const SRC = {
  'mark-bar':  (cw, tone) => `/images/brand/h-${cw}-${tone}.svg`,
  'mark-hero': (cw, tone) => `/images/brand/v-${cw}-${tone}.svg`,
  'mark-v':    (cw, tone) => `/images/brand/v-${cw}-${tone}.svg`,
  'mark-h':    (cw, tone) => `/images/brand/h-${cw}-${tone}.svg`
};

export function climateMark(mark, { tone = 'light', initial = 'original' } = {}) {
  if (!mark) return () => {};
  mark.classList.add('mark--shift');
  const groups = [...mark.querySelectorAll('img')].map(base => {
    const kind = Object.keys(SRC).find(k => base.classList.contains(k)) || 'mark-bar';
    base.classList.add('lg', 'on');
    return { base, kind, layers: { [initial]: base } };
  });
  let current = initial;
  return function set(cw) {
    if (!cw || cw === current) return;
    current = cw;
    for (const g of groups) {
      if (!g.layers[cw]) {
        const im = g.base.cloneNode();
        im.src = SRC[g.kind](cw, tone);
        im.classList.remove('on');
        im.classList.add('lg-over');
        im.alt = '';
        im.setAttribute('aria-hidden', 'true');
        g.base.after(im);
        g.layers[cw] = im;
      }
      for (const [k, im] of Object.entries(g.layers)) im.classList.toggle('on', k === cw);
    }
  };
}

// Warm the browser cache so the first crossfade doesn't flash.
export function preloadMarks(cws, kinds = ['h'], tone = 'light') {
  for (const cw of cws) for (const k of kinds) { const i = new Image(); i.src = `/images/brand/${k}-${cw}-${tone}.svg`; }
}
