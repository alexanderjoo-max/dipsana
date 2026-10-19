// Tiny fullscreen-shader runner for the campaign landing pages.
// shader(canvas, fragSource, { textures: { name: imgOrUrl }, uniforms: { name: number|array } })
// The fragment shader always gets: uRes (px), uTime (s), uMouse (0..1, y up), uDpr.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

export function shader(canvas, frag, opts = {}) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: true });
  if (!gl) return null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, 'precision highp float;\n' + frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  const u = name => (name in U ? U[name] : (U[name] = gl.getUniformLocation(prog, name)));
  const values = Object.assign({}, opts.uniforms || {});

  // textures
  let unit = 0;
  const texInfo = {};
  function setTexture(name, img) {
    const info = texInfo[name] || (texInfo[name] = { unit: unit++, tex: gl.createTexture() });
    gl.activeTexture(gl.TEXTURE0 + info.unit);
    gl.bindTexture(gl.TEXTURE_2D, info.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u(name), info.unit);
    values[name + 'Size'] = [img.naturalWidth || img.width, img.naturalHeight || img.height];
  }
  const loads = Object.entries(opts.textures || {}).map(([name, src]) => new Promise(res => {
    const img = typeof src === 'string' ? Object.assign(new Image(), { src }) : src;
    const done = () => { setTexture(name, img); res(); };
    if (img.complete && img.naturalWidth) done();
    else img.addEventListener('load', done, { once: true });
  }));

  const maxDpr = opts.maxDpr || 1.5;
  let dpr = 1;
  function resize() {
    dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const mouse = [0.5, 0.5];
  let visible = true, running = false, t0 = performance.now(), frozenAt = null;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);

  function draw(now) {
    resize();
    const t = (frozenAt ?? now - t0) / 1000;
    gl.uniform2f(u('uRes'), canvas.width, canvas.height);
    gl.uniform1f(u('uTime'), t);
    gl.uniform1f(u('uDpr'), dpr);
    gl.uniform2f(u('uMouse'), mouse[0], mouse[1]);
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === 'number') gl.uniform1f(u(k), v);
      else if (v.length > 4) gl.uniform4fv(u(k), v);      // vec4 arrays, packed
      else if (v.length === 2) gl.uniform2fv(u(k), v);
      else if (v.length === 3) gl.uniform3fv(u(k), v);
      else if (v.length === 4) gl.uniform4fv(u(k), v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (visible) {
      api.time = (now - t0) / 1000;
      opts.beforeDraw && opts.beforeDraw(now);
      draw(now);
    }
  }

  const api = {
    gl, canvas, values, mouse, time: 0,
    ready: Promise.all(loads),
    set(name, v) { values[name] = v; },
    setTexture,
    start() { if (!running) { running = true; requestAnimationFrame(loop); } },
    stop() { running = false; },
    // draw a single still frame (reduced motion)
    still(atSeconds = 2) { frozenAt = atSeconds * 1000; requestAnimationFrame(draw); },
    redraw() { requestAnimationFrame(draw); }
  };
  return api;
}

// Shared GLSL snippets
export const GLSL = {
  noise: `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 r = mat2(.8,-.6,.6,.8);
  for(int i=0;i<5;i++){ v += a*vnoise(p); p = r*p*2.02; a *= .5; }
  return v;
}`,
  // object-fit: cover for a texture into the canvas
  cover: `
vec2 coverUV(vec2 uv, vec2 res, vec2 img){
  float rs = res.x/res.y, ri = img.x/img.y;
  vec2 s = rs > ri ? vec2(1., ri/rs) : vec2(rs/ri, 1.);
  return (uv - .5)*s + .5;
}`
};
