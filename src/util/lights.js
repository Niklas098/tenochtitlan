// src/util/lights.js
import * as THREE from 'three';

let lights = null;
let state = { hours: 13.0, auto: false, speed: 0.25 }; // speed: Stunden pro Sekunde

// ---------- Utils ----------
const clamp01 = (x)=> Math.max(0, Math.min(1, x));
const lerp = (a,b,t)=> a + (b-a)*t;

// grobe Kelvin->RGB Approx (2000K–10000K)
function kelvinToRGB(k){
  const T = k / 100;
  let r,g,b;
  if (T <= 66){ r = 255; g = 99.4708025861*Math.log(T) - 161.1195681661; }
  else { r = 329.698727446*Math.pow(T-60, -0.1332047592); g = 288.1221695283*Math.pow(T-60, -0.0755148492); }
  if (T >= 66){ b = 255; }
  else if (T <= 19){ b = 0; }
  else { b = 138.5177312231*Math.log(T-10) - 305.0447927307; }
  return new THREE.Color(clamp01(r/255), clamp01(g/255), clamp01(b/255));
}

function makeSunDisk() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(size/2,size/2,0, size/2,size/2,size/2);
  grd.addColorStop(0.00, 'rgba(255,245,200,1.0)');
  grd.addColorStop(0.35, 'rgba(255,228,140,0.65)');
  grd.addColorStop(0.70, 'rgba(255,210,110,0.25)');
  grd.addColorStop(1.00, 'rgba(255,200, 80,0.0)');
  ctx.fillStyle = grd; ctx.fillRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped:false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(260,260,1);
  sprite.renderOrder = 1;
  return sprite;
}

function makeMoonDisk() {
  const size = 192;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(size/2,size/2,0, size/2,size/2,size/2);
  grd.addColorStop(0.00, 'rgba(210,225,255,0.95)');
  grd.addColorStop(0.55, 'rgba(180,205,255,0.45)');
  grd.addColorStop(1.00, 'rgba(170,195,245,0.00)');
  ctx.fillStyle = grd; ctx.fillRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped:false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(200,200,1);
  sprite.renderOrder = 1;
  return sprite;
}

function makeStars() {
  const g = new THREE.BufferGeometry();
  const n = 700;
  const positions = new Float32Array(n*3);
  for (let i=0;i<n;i++){
    const u = Math.random(), v = Math.random();
    const th = 2*Math.PI*u, ph = Math.acos(2*v - 1);
    const r = 2800;
    positions[i*3+0] = r*Math.sin(ph)*Math.cos(th);
    positions[i*3+1] = r*Math.cos(ph);
    positions[i*3+2] = r*Math.sin(ph)*Math.sin(th);
  }
  g.setAttribute('position', new THREE.BufferAttribute(positions,3));
  const m = new THREE.PointsMaterial({ size:2.0, sizeAttenuation:true, color:0xffffff, transparent:true, opacity:0.8, depthWrite:false });
  const pts = new THREE.Points(g,m);
  pts.frustumCulled = false;
  return pts;
}

// ---------- Orbit & Lighting from time ----------
function computeFromHours(hours){
  const h = ((hours%24)+24)%24;
  // 06:00 -> vorn am Horizont; 12:00 -> hoch; 18:00 -> hinten am Horizont
  const phi = (h/24)*Math.PI*2 - Math.PI/2;
  const R = 2600;         // Himmelsradius
  const tilt = 0.45;      // Bahnneigung (0..1)
  const x = R*Math.cos(phi);
  const z = R*Math.sin(phi);
  const y = R*Math.sin(phi)*tilt;

  const elevNorm = clamp01((y/(R*tilt) + 1)/2); // -1..1 -> 0..1
  const isDay = y > 0;

  // Farbtemperatur Sonne: warm morgens/abends, kühler mittags
  const sunK = isDay ? lerp(2200, 6500, Math.pow(elevNorm, 0.65)) : 2200;
  const sunColor = kelvinToRGB(sunK);
  const moonColor = new THREE.Color(0xbfd8ff);

  // Intensitäten
  const sunI  = isDay ? Math.pow(elevNorm, 1.25) * 2.1 : 0.0;
  const hemiI = isDay ? lerp(0.12, 0.40, Math.pow(elevNorm, 0.7)) : 0.06;
  const moonI = !isDay ? lerp(0.0, 0.6, clamp01((-y)/(R*tilt))) : 0.0;

  return {
    sunPos: new THREE.Vector3(x,y,z),
    moonPos: new THREE.Vector3(-x, -y*0.8, -z), // gegenüberliegend, leicht tiefer
    sunColor, moonColor, sunI, moonI, hemiI, isDay
  };
}

// ---------- Public API ----------
export function createLights(scene){
  const group = new THREE.Group();

  const hemi = new THREE.HemisphereLight(0xeadfcd, 0x1d2830, 0.38);
  group.add(hemi);

  // Sonne (Directional) + Disk
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(-2000, 360, -500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 6000;
  sun.shadow.camera.left = -2500;
  sun.shadow.camera.right = 2500;
  sun.shadow.camera.top = 1800;
  sun.shadow.camera.bottom = -1800;
  const sunTarget = new THREE.Object3D();
  group.add(sunTarget); sun.target = sunTarget;

  const sunDisk = makeSunDisk(); group.add(sunDisk);
  group.add(sun);

  // Mond (Spot) + Disk
  const moon = new THREE.SpotLight(0xbfd8ff, 0.0, 0, Math.PI/5, 0.35, 1.0);
  const moonTarget = new THREE.Object3D();
  group.add(moonTarget); moon.target = moonTarget;
  const moonDisk = makeMoonDisk(); moonDisk.visible = false;
  group.add(moon, moonDisk);

  // Sterne
  const starField = makeStars(); starField.visible = false;
  scene.add(starField);

  scene.add(group);
  lights = { group, hemi, sun, sunDisk, sunTarget, moon, moonDisk, moonTarget, starField };

  // initiale Uhrzeit anwenden
  setTimeOfDay(state.hours);
  return lights;
}

// Uhrzeit setzen (0..24)
export function setTimeOfDay(hours){
  if (!lights) return;
  state.hours = hours;

  const { sun, sunDisk, sunTarget, moon, moonDisk, moonTarget, hemi, starField } = lights;
  const p = computeFromHours(hours);

  // Sonne
  sun.position.copy(p.sunPos);
  sun.color.copy(p.sunColor);
  sun.intensity = p.sunI;
  sunTarget.position.set(0,0,0);
  sun.target.updateMatrixWorld?.();
  sunDisk.position.copy(p.sunPos);
  sunDisk.visible = p.sunI > 0.001;

  // Mond
  moon.position.copy(p.moonPos);
  moon.color.set(p.moonColor);
  moon.intensity = p.moonI;
  moonTarget.position.set(0,0,0);
  moon.target.updateMatrixWorld?.();
  moonDisk.position.copy(p.moonPos);
  moonDisk.visible = p.moonI > 0.001;

  // Hemi & Sterne
  hemi.intensity = p.hemiI;
  if (starField) starField.visible = !p.isDay;
}

export function updateSun(deltaSec=0){
  if (!lights) return;
  if (state.auto && deltaSec>0){
    setTimeOfDay(state.hours + state.speed*deltaSec);
  }
  // Disks an Licht-Position koppeln (falls extern bewegt)
  lights.sunDisk.position.copy(lights.sun.position);
  lights.moonDisk.position.copy(lights.moon.position);
}

export const isDaytime = ()=> {
  const p = computeFromHours(state.hours);
  return p.isDay;
};
export const getHours = ()=> state.hours;
export const setTimeAuto = (on)=> { state.auto = !!on; };
export const setTimeSpeed = (hoursPerSecond)=> { state.speed = hoursPerSecond; };

// Legacy-API (keine Fackel mehr, nur Tag/Nacht togglen über Uhrzeit)
export function setDayNight(day){
  setTimeOfDay(day ? 13.0 : 1.0); // Tag ~13h, Nacht ~1h
}

// Kein Torch mehr – leere Funktion, falls irgendwo importiert:
export function attachTorchTo(){ /* no-op */ }

// Sterne manuell toggeln (optional)
export function showStars(on){
  if (lights?.starField) lights.starField.visible = !!on;
}
