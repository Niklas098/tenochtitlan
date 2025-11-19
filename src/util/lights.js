import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { setTorchNightMode } from '../scene/torch/torch.js';

let lights = null;
let state = { hours: 13.0, auto: false, speed: 0.25, daylightFactor: 1.0 };
const SUN_DEFAULT_INTENSITY = 2.1;

const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
function kelvinToRGB(k) {
  const T = k / 100; let r, g, b;
  if (T <= 66) { r = 255; g = 99.4708025861 * Math.log(T) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(T - 60, -0.1332047592); g = 288.1221695283 * Math.pow(T - 60, -0.0755148492); }
  if (T >= 66) b = 255; else if (T <= 19) b = 0; else b = 138.5177312231 * Math.log(T - 10) - 305.0447927307;
  return new THREE.Color(clamp01(r / 255), clamp01(g / 255), clamp01(b / 255));
}

const moonTexture = new THREE.TextureLoader().load('/textures/moon.png');
moonTexture.anisotropy = 8;
if ('colorSpace' in moonTexture) moonTexture.colorSpace = THREE.SRGBColorSpace; else moonTexture.encoding = THREE.sRGBEncoding;
moonTexture.wrapS = moonTexture.wrapT = THREE.ClampToEdgeWrapping;
moonTexture.generateMipmaps = true;

function makeStars() {
  const g = new THREE.BufferGeometry(), n = 700, positions = new Float32Array(n * 3), r = 2800;
  for (let i = 0; i < n; i++) {
    const u = Math.random(), v = Math.random(), th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
    positions[i * 3 + 1] = r * Math.cos(ph);
    positions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 2.0, sizeAttenuation: true, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
}

function makeMoonMesh() {
  const geo = new THREE.SphereGeometry(50, 64, 32);
  const mat = new THREE.MeshStandardMaterial({
    map: moonTexture,
    emissiveMap: moonTexture,
    bumpMap: moonTexture,
    bumpScale: 0.12,
    emissive: new THREE.Color(0xf5f7ff),
    emissiveIntensity: 0.35,
    roughness: 0.82,
    metalness: 0,
    toneMapped: false,
    color: new THREE.Color(0xe5e8f2)
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  return mesh;
}

function makeMoonHalo() {
  const size = 512, c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(240,245,255,0.85)'); g.addColorStop(0.3, 'rgba(200,215,255,0.4)'); g.addColorStop(0.7, 'rgba(150,170,220,0.08)'); g.addColorStop(1, 'rgba(120,140,200,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, color: 0xdce5ff });
  const sprite = new THREE.Sprite(mat); sprite.scale.set(650, 650, 1); sprite.renderOrder = 0; return sprite;
}

function extendSkyMaterial(sky) {
  if (!sky?.material || sky.material.userData.__darknessExtended) return;
  const mat = sky.material, frag = mat.fragmentShader, uTok = 'uniform vec3 up;', cTok = 'gl_FragColor = vec4( retColor, 1.0 );';
  if (!frag.includes(uTok) || !frag.includes(cTok)) return;
  mat.fragmentShader = frag.replace(uTok, `${uTok}\nuniform float skyDarkness;`).replace(cTok, 'gl_FragColor = vec4( retColor * skyDarkness, 1.0 );');
  mat.uniforms.skyDarkness = { value: 1.0 }; mat.userData.__darknessExtended = true; mat.needsUpdate = true;
}

const GEO = { latDeg: 19.4, declDeg: 0, R: 2600, moonPhaseOffsetDeg: 0, moonTiltDeltaDeg: -10 };

function computeFromHours(hours) {
  const h = ((hours % 24) + 24) % 24, theta = h / 24 * Math.PI * 2 - Math.PI / 2;
  const lat = THREE.MathUtils.degToRad(GEO.latDeg), decl = THREE.MathUtils.degToRad(GEO.declDeg);
  const maxElevRad = Math.PI / 2 - Math.abs(lat - decl), iSun = Math.max(0, maxElevRad);
  const iMoon = Math.max(0, iSun + THREE.MathUtils.degToRad(GEO.moonTiltDeltaDeg)), R = GEO.R;
  const xS = R * Math.cos(theta), yS = R * Math.sin(theta) * Math.sin(iSun), zS = R * Math.sin(theta) * Math.cos(iSun);
  const thetaM = theta + Math.PI + THREE.MathUtils.degToRad(GEO.moonPhaseOffsetDeg);
  const xM = R * Math.cos(thetaM), yM = R * Math.sin(thetaM) * Math.sin(iMoon), zM = R * Math.sin(thetaM) * Math.cos(iMoon);
  const elevSin = Math.sin(theta) * Math.sin(iSun), elevNorm = clamp01((elevSin + 1) / 2), isDay = elevSin > 0;
  const sunColor = kelvinToRGB(isDay ? lerp(2200, 6500, Math.pow(elevNorm, 0.65)) : 2200), moonColor = new THREE.Color(0xcfe4ff);
  const sunI = isDay ? Math.pow(elevNorm, 1.25) * SUN_DEFAULT_INTENSITY : 0, hemiI = isDay ? lerp(0.12, 0.40, Math.pow(elevNorm, 0.7)) : 0.06;
  const moonHeight = clamp01((yM / R + 1) / 2), nightBlend = clamp01(1.0 - Math.pow(elevNorm, 1.25));
  const moonI = nightBlend > 0 ? nightBlend * lerp(0.1, 0.21, Math.pow(moonHeight, 0.9)) : 0;
  return { sunPos: new THREE.Vector3(xS, yS, zS), moonPos: new THREE.Vector3(xM, yM, zM), sunColor, moonColor, sunI, moonI, hemiI, isDay, moonGlow: moonHeight * nightBlend };
}

export function createLights(scene) {
  const group = new THREE.Group(), hemi = new THREE.HemisphereLight(0xeadfcd, 0x1d2830, 0.38); group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, SUN_DEFAULT_INTENSITY);
  sun.position.set(-2000, 360, -500); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 6000; sun.shadow.camera.left = -2500; sun.shadow.camera.right = 2500; sun.shadow.camera.top = 1800; sun.shadow.camera.bottom = -1800;
  const sunTarget = new THREE.Object3D(); group.add(sunTarget); sun.target = sunTarget; group.add(sun);

  const moon = new THREE.DirectionalLight(0xcfe0ff, 0.0);
  const moonTarget = new THREE.Object3D(); group.add(moonTarget); moon.target = moonTarget;
  const moonMesh = makeMoonMesh(); moonMesh.visible = false; moonMesh.lookAt(0, 0, 0);
  const moonHalo = makeMoonHalo(); moonHalo.visible = false; moon.castShadow = false; group.add(moon, moonMesh, moonHalo);

  const starField = makeStars(); starField.visible = false; scene.add(starField);
  const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky); extendSkyMaterial(sky);

  scene.add(group);
  lights = { group, hemi, sun, sunTarget, moon, moonMesh, moonHalo, moonTarget, starField, sky };
  setTimeOfDay(state.hours);
  return lights;
}

export function setTimeOfDay(hours) {
  state.hours = hours;
  const p = computeFromHours(hours);
  state.daylightFactor = clamp01(p.sunI / SUN_DEFAULT_INTENSITY);
  if (!lights) return;
  const { sun, sunTarget, moon, moonMesh, moonHalo, moonTarget, hemi, starField, sky } = lights;
  setTorchNightMode(!p.isDay);

  sun.position.copy(p.sunPos); sun.color.copy(p.sunColor); sun.intensity = p.sunI; sunTarget.position.set(0, 0, 0); sun.target.updateMatrixWorld?.();

  moon.position.copy(p.moonPos); moon.color.set(p.moonColor); moon.intensity = p.moonI; moon.visible = moon.intensity > 0; moonTarget.position.set(0, 0, 0); moon.target.updateMatrixWorld?.();

  if (moonMesh) { moonMesh.position.copy(p.moonPos); moonMesh.visible = p.moonI > 0.005; if (moonMesh.material?.emissiveIntensity !== undefined) moonMesh.material.emissiveIntensity = lerp(1, 1, clamp01(p.moonGlow)); moonMesh.lookAt(0, 0, 0); }
  if (moonHalo) { moonHalo.position.copy(p.moonPos); moonHalo.visible = p.moonI > 0.001; const h = clamp01(p.moonGlow); moonHalo.material.opacity = lerp(0.18, 0.2, h); }

  hemi.intensity = p.isDay ? p.hemiI : 0.02;

  if (starField) { const mat = starField.material; let nightT = p.isDay ? 0 : 1; mat.opacity = 0.8 * nightT; starField.visible = mat.opacity > 0.02; }

  if (sky) {
    sky.material.uniforms.sunPosition.value.copy(sun.position.clone().normalize());
    const sstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
    const h = ((hours % 24) + 24) % 24, phi = h / 24 * Math.PI * 2 - Math.PI / 2, elevDeg = Math.asin(Math.sin(phi)) * 180 / Math.PI;
    const nightT = 1 - sstep(-12, -6, elevDeg), u = sky.material.uniforms;
    u.rayleigh.value = lerp(1.5, -2, nightT); u.mieCoefficient.value = lerp(0.0035, -2, nightT); u.turbidity.value = lerp(2.0, -20.0, nightT);
    if (u.skyDarkness) u.skyDarkness.value = lerp(0.6, 0.2, nightT);
    if (starField) { const m = starField.material; m.opacity = 0.8 * nightT; starField.visible = m.opacity > 0.02; }
  }
}

export function updateSun(deltaSec = 0) { if (!lights) return; if (state.auto && deltaSec > 0) setTimeOfDay(state.hours + state.speed * deltaSec); lights.moonMesh?.position.copy(lights.moon.position); lights.moonHalo?.position.copy(lights.moon.position); }
export const isDaytime = () => computeFromHours(state.hours).isDay;
export const getHours = () => state.hours;
export const getDaylightFactor = () => state.daylightFactor ?? 0;
export const setTimeAuto = on => { state.auto = !!on; };
export const setTimeSpeed = v => { state.speed = v; };
export function setDayNight(day) { setTimeOfDay(day ? 13.0 : 1.0); }
export function attachTorchTo() {}
export function showStars(on) { if (lights?.starField) lights.starField.visible = !!on; }
