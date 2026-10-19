// The real Dipsana headset (models/headset.glb) in a transparent three.js canvas.
// Pages drive it each frame through the returned controller.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function headset(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 24, 1, 0.01, 100);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(opts.key ?? 0xfff2e4, 2.4); key.position.set(3, 4, 3);
  const rim = new THREE.DirectionalLight(opts.rim ?? 0x8ec4d4, 1.8); rim.position.set(-3, 1.5, -3);
  const fill = new THREE.DirectionalLight(opts.fill ?? 0xbfc9d0, 0.6); fill.position.set(-2, -1.5, 2);
  const amb = new THREE.AmbientLight(0xf0e8dc, 0.3);
  scene.add(key, rim, fill, amb);

  const mat = new THREE.MeshPhysicalMaterial(Object.assign({
    color: new THREE.Color(opts.color ?? '#35383C'),
    roughness: 0.55, metalness: 0.04,
    clearcoat: 0.35, clearcoatRoughness: 0.35,
    envMapIntensity: 0.45
  }, opts.material || {}));

  const rig = new THREE.Group();
  scene.add(rig);

  const geo = await new Promise((res, rej) => {
    new GLTFLoader().load('/models/headset.glb', gltf => {
      let g = null;
      gltf.scene.traverse(o => { if (o.isMesh && !g) g = o.geometry; });
      g ? res(g) : rej(new Error('no mesh'));
    }, undefined, rej);
  });
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const mid = geo.boundingBox.getCenter(new THREE.Vector3());
  geo.translate(-mid.x, -mid.y, -mid.z);
  const k = 1 / Math.max(size.x, size.y, size.z);
  geo.scale(k, k, k);
  geo.computeBoundingSphere();
  const radius = geo.boundingSphere.radius;
  const mesh = new THREE.Mesh(geo, mat);
  rig.add(mesh);

  const state = { az: -75 * Math.PI / 180, el: 14 * Math.PI / 180, fill: 1.15, x: 0, y: 0 };

  function render() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const vF = camera.fov * Math.PI / 180;
    const hF = 2 * Math.atan(Math.tan(vF / 2) * camera.aspect);
    const d = Math.max(radius / Math.sin(vF / 2), radius / Math.sin(hF / 2)) / state.fill;
    camera.position.set(0, d * Math.sin(state.el), d * Math.cos(state.el));
    camera.lookAt(0, 0, 0);
    rig.rotation.y = state.az;
    rig.position.set(state.x, state.y, 0);
    renderer.render(scene, camera);
  }

  return { THREE, renderer, scene, camera, mat, rig, mesh, key, rim, fill, amb, state, render };
}
