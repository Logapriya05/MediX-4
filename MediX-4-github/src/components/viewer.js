import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Studio viewer used by the Vehicle and Interior pages.
export function createViewer(host, { fov = 35, target = [0, 1, 0], pos = [7, 3.5, 7], ground = true, scale = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pm.dispose();

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05 * scale, 200 * scale);
  camera.position.set(...pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.minDistance = 2 * scale; controls.maxDistance = 18 * scale;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.6;
  controls.enablePan = false;
  let focusAnim = null;
  // user grabs the view: stop auto-rotate and cancel any running focus animation
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    if (focusAnim) { cancelAnimationFrame(focusAnim); focusAnim = null; }
  });

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5 * scale, 9 * scale, 4 * scale); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6 * scale, right: 6 * scale, top: 6 * scale, bottom: -6 * scale, near: 0.5 * scale, far: 30 * scale });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02 * scale;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9dffc8, 0.55); rim.position.set(-6, 3, -5); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xff3b4a, 0.5); rim2.position.set(6, 2, -6); scene.add(rim2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223322, 0.35));

  if (ground) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(9 * scale, 64), new THREE.ShadowMaterial({ opacity: 0.45 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
    const grid = new THREE.PolarGridHelper(7 * scale, 12, 6, 64, 0x1b3b28, 0x13221a);
    grid.position.y = 0.002 * scale; scene.add(grid);
    const ringGeo = new THREE.RingGeometry(3.9 * scale, 3.93 * scale, 128);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.45 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004 * scale; scene.add(ring);
  }

  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);

  let raf = null, active = true, onFrame = null;
  const clock = new THREE.Clock();
  const tick = () => {
    raf = null;
    if (!active) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    onFrame && onFrame(dt, clock.elapsedTime);
    controls.update();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  // smooth camera focus
  const focus = (tgt, camPos, dur = 1.1) => {
    controls.autoRotate = false;
    // flush leftover drag/zoom momentum so it can't fight the animation
    const damp = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damp;
    const t0 = performance.now(), fromT = controls.target.clone(), fromP = camera.position.clone();
    const toT = new THREE.Vector3(...tgt), toP = new THREE.Vector3(...camPos);
    if (focusAnim) cancelAnimationFrame(focusAnim);
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      controls.target.lerpVectors(fromT, toT, e);
      camera.position.lerpVectors(fromP, toP, e);
      if (k < 1) focusAnim = requestAnimationFrame(step);
      else focusAnim = null;
    };
    step();
  };

  return {
    renderer, scene, camera, controls, focus, host,
    setFrame(f) { onFrame = f; },
    setActive(a) { active = a; if (a && !raf) { clock.getDelta(); raf = requestAnimationFrame(tick); } },
    dispose() {
      active = false; if (raf) cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse((o) => { o.geometry && o.geometry.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
