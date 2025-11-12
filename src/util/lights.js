// src/util/lights.js
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

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
// ── Stellschrauben (oben in lights.js einmal definieren) ─────────────
const GEO = {
  latDeg: 19.4,          // Tenochtitlan / CDMX ~19.4°N
  declDeg: 0,            // Sonnen-Deklinationswinkel: 0=Äquinoktium, +23.44° (Junisolst.), -23.44° (Dezsolst.)
  R: 2600,               // Himmelsradius
  moonPhaseOffsetDeg: 20,// Mond ~ gegenüber + kleiner Versatz
  moonTiltDeltaDeg: -10  // Mondbahn ~ etwas flacher als Sonne
};
// ─────────────────────────────────────────────────────────────────────

function computeFromHours(hours){
  const h = ((hours % 24) + 24) % 24;

  // Stundenwinkel: 06:00 → 0, 12:00 → +π/2, 18:00 → π
  const theta = (h / 24) * Math.PI * 2 - Math.PI / 2;

  // Geografie & Jahreszeit:
  const lat  = THREE.MathUtils.degToRad(GEO.latDeg);
  const decl = THREE.MathUtils.degToRad(GEO.declDeg);

  // Maximale Mittagshöhe (Elevation am lokalen Mittag):
  // maxElev = 90° - |Breite - Deklination|
  const maxElevRad = (Math.PI / 2) - Math.abs(lat - decl);

  // Bahnneigung als „Inklination“ (wie weit die Tagesbahn über die Ebene kippt)
  const iSun  = Math.max(0, maxElevRad); // sicherstellen ≥0
  const iMoon = Math.max(0, iSun + THREE.MathUtils.degToRad(GEO.moonTiltDeltaDeg));

  const R = GEO.R;

  // Sonnenposition (Sphärische Abbildung auf geneigte Kreisbahn)
  const xS = R * Math.cos(theta);
  const yS = R * Math.sin(theta) * Math.sin(iSun);
  const zS = R * Math.sin(theta) * Math.cos(iSun);

  // Mondposition (~ gegenüber, leicht versetzt)
  const thetaM = theta + Math.PI + THREE.MathUtils.degToRad(GEO.moonPhaseOffsetDeg);
  const xM = R * Math.cos(thetaM);
  const yM = R * Math.sin(thetaM) * Math.sin(iMoon);
  const zM = R * Math.sin(thetaM) * Math.cos(iMoon);

  // Elevation der Sonne als Sinus (für Farbe/Intensität)
  const elevSin = Math.sin(theta) * Math.sin(iSun);  // ≈ sin(Elevation)
  const elevNorm = clamp01((elevSin + 1) / 2);       // 0..1
  const isDay = elevSin > 0;

  // Farbtemperatur (warm bei flacher Sonne, kühler mittags)
  const sunK = isDay ? lerp(2200, 6500, Math.pow(elevNorm, 0.65)) : 2200;
  const sunColor = kelvinToRGB(sunK);
  const moonColor = new THREE.Color(0xbfd8ff);

  // Intensitäten
  const sunI  = isDay ? Math.pow(elevNorm, 1.25) * 2.1 : 0.0;
  const hemiI = isDay ? lerp(0.12, 0.40, Math.pow(elevNorm, 0.7)) : 0.06;
  const moonI = !isDay ? lerp(0.0, 0.6, clamp01(-elevSin)) : 0.0;

  return {
    sunPos: new THREE.Vector3(xS, yS, zS),
    moonPos: new THREE.Vector3(xM, yM, zM),
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

  // Himmel (Skybox)
  const sky = new Sky();
  sky.scale.setScalar(10000);     // groß genug, um alles zu umhüllen
  scene.add(sky)



  scene.add(group);
  lights = { group, hemi, sun, sunTarget, moon, moonDisk, moonTarget, starField, sky };

  // initiale Uhrzeit anwenden
  setTimeOfDay(state.hours);
  return lights;
}

// Uhrzeit setzen (0..24)
export function setTimeOfDay(hours){
  if (!lights) return;
  state.hours = hours;

  const { sun, sunTarget, moon, moonDisk, moonTarget, hemi, starField, sky } = lights;

  // --- deine bestehende Zeit->Licht-Berechnung nutzen ---
  const p = computeFromHours(hours);

  // === Sonne ===
  sun.position.copy(p.sunPos);
  sun.color.copy(p.sunColor);
  sun.intensity = p.sunI;
  sunTarget.position.set(0, 0, 0);
  sun.target.updateMatrixWorld?.();

  // === Mond ===
  moon.position.copy(p.moonPos);
  moon.color.set(p.moonColor);
  moon.intensity = p.moonI;
  moonTarget.position.set(0, 0, 0);
  moon.target.updateMatrixWorld?.();

  if (moonDisk){
    moonDisk.position.copy(p.moonPos);
    moonDisk.visible = p.moonI > 0.001;
  }

  // === Hemi & Sterne (Grundlogik) ===
  hemi.intensity = p.isDay ? p.hemiI : 0.02; // nachts extra dunkel

  if (starField){
    // sanftes Sterne-Fade basierend auf Nacht-Intensität (s.u.)
    // Default-Opacity deiner Stars war 0.8
    const mat = starField.material;
    // nightT wird weiter unten berechnet; fallback, falls sky fehlt:
    let nightT = p.isDay ? 0 : 1;
    // setzen wir weiter unten genauer, wenn Sky aktiv ist
    mat.opacity = 0.8 * nightT;
    starField.visible = mat.opacity > 0.02;
  }

  // === Sky: Richtung + echte Nacht abdunkeln ===
  if (sky) {
    // 1) Richtung auf Sonnenlicht normalisieren
    const sunDir = sun.position.clone().normalize();
    sky.material.uniforms.sunPosition.value.copy(sunDir);

    // 2) Nacht-Intensität aus Uhrzeit/Elevation ableiten (weich zwischen -6° und -12°)
    //    – ohne Abhängigkeit von externen Helpern (lokales smoothstep)
    const sstep = (e0, e1, x) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };

    const h = ((hours % 24) + 24) % 24;
    const phi = (h / 24) * Math.PI * 2 - Math.PI / 2; // 06h=Horizon, 12h=Zenith
    const elevRad = Math.asin(Math.sin(phi));          // -π/2..π/2
    const elevDeg = elevRad * 180 / Math.PI;

    // nightT: 0 bei -6° (Ende bürgerl. Dämmerung), 1 bei -12° (astron. Nacht)
    const nightT = 1.0 - sstep(-12, -6, elevDeg);

    // 3) Sky-Uniforms für die Nacht herunterfahren
    const u = sky.material.uniforms;
    u.rayleigh.value       = lerp(1.5, 0.0, nightT);    // Blauanteil ausblenden
    u.mieCoefficient.value = lerp(0.0035, 0.0, nightT); // Dunst/Halo aus
    u.turbidity.value      = lerp(2.0, 1.0, nightT);    // weniger Dunst = dunkler

    // 4) Sterne-Opacity sauber mit nightT setzen (überschreibt groben Wert oben)
    if (starField){
      const m = starField.material;
      m.opacity = 0.8 * nightT;
      starField.visible = m.opacity > 0.02;
    }
  }
}


export function updateSun(deltaSec=0){
  if (!lights) return;
  if (state.auto && deltaSec>0){
    setTimeOfDay(state.hours + state.speed*deltaSec);
  }
  // Disks an Licht-Position koppeln (falls extern bewegt)
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
