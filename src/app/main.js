// src/app/main.js
import * as THREE from 'three';
import { createRenderer } from '../util/renderer.js';
import { createCameras, switchToCamera, getActiveCameraType } from '../util/cameras.js';
import { toggleHitboxVisibility, findSafeSpawnPosition } from '../util/collision.js';
import {
  createLights,
  setDayNight,          // legacy toggle bleibt nutzbar (mappt auf Zeit)
  updateSun,
  isDaytime,
  showStars,
  // 🔹 NEU: Zeitsteuerung (Orbit)
  setTimeOfDay,
  setTimeAuto,
  setTimeSpeed,
  getHours,
  getDaylightFactor
} from '../util/lights.js';
import { buildCity, updateCity, loadGLB } from '../scene/city/city.js';
import createGUI from '../ui/gui.js';
import {
  initPlacer,
  updatePlacer,
  setPlacerEnabled,
  setPlacerActiveCamera,
  registerPlaceableObject
} from '../ui/placer.js';
import { createWater, WATER_QUALITY } from '../scene/water/water2.js';
import { createMountains } from '../scene/mountains/mountains.js';
import { createWeather } from '../scene/weather/weather.js';
import {createFireSystem} from "../scene/fire/fire.js";
import {initEgoTorch, setEgoTorchActive, updateEgoTorch} from "../scene/fire/torch.js";

const WATER_DAY_COLOR = new THREE.Color(0x2a4f72);
const WATER_NIGHT_COLOR = new THREE.Color(0x05090f);
const WATER_COLOR = new THREE.Color();

let renderer, scene, cameras, clock, lights, gui, stats, overlayEl, waterController, weather;
let placerActive = false;
let fireSystems = [];

init();
animate();

function init() {
  scene = new THREE.Scene();

  const canvas = document.getElementById('app');
  if (!canvas) {
    console.error("FEHLER: <canvas id='app'> fehlt in index.html");
    return;
  }

  ({ renderer, stats, overlayEl } = createRenderer(canvas));

  cameras = createCameras(renderer, canvas, {
    drone: { flySpeed: 32, height: 120, minHeight: 25, maxHeight: 350, turbo: 1.8 }
  });

  const safeDronePos = findSafeSpawnPosition(cameras.drone.camera.position);
  cameras.drone.camera.position.copy(safeDronePos);
  const safeFpPos = findSafeSpawnPosition(cameras.fp.camera.position);
  cameras.fp.camera.position.copy(safeFpPos);

  switchToCamera('drone');

  lights = createLights(scene);

  scene.add(cameras.fp.camera);
    initEgoTorch(cameras.fp.camera, {
        url: '/models/Fackel_Empty.glb',
        emptyName: 'TorchFirePoint',           // wie dein Empty im GLB heißt
        fireTex: '/textures/fire.png',
        intensity: 1000,
        distance: 1000
    });

  // Kleinere Map -> FP wirkt größer
  buildCity(scene, {
    groundSize: 3000,
    water: {
      sunLight: lights.sun,
      reflectionIgnore: lights.starField
    }
  });

  waterController = createWater(scene, {
    size: 10000,
    height: -100,
    textureRepeat: 4,
    color: 0x1b3248,
    reflectivity: 0.9,
    waveScale: 2.6,
    flowDirection: new THREE.Vector2(-0.2, 0.08),
    flowSpeed: 0.004,
    fog: true
  });

  createMountains(scene, {
    size: 20000,
    segments: 256,
    innerRadius: 5200,
    outerRadius: 9800,
    baseHeight: -140,
    maxHeight: 4300
  });

  weather = createWeather(scene, {
    waterController
  });

  gui = createGUI(renderer, cameras, lights, {
    water: {
      getQuality: () => waterController?.getQuality?.() ?? WATER_QUALITY.ULTRA,
      setQuality: (mode) => waterController?.setQuality?.(mode)
    },
    weather: {
      isFogEnabled: () => weather?.isFogEnabled?.() ?? false,
      isRainEnabled: () => weather?.isRainEnabled?.() ?? false,
      setFogEnabled: (on) => weather?.setFogEnabled?.(on),
      setRainEnabled: (on) => weather?.setRainEnabled?.(on)
    }
  });


  initPlacer({
    scene,
    domElement: renderer.domElement,
    defaultEnabled: false
  });

  // 🔹 START-Zeit statt setDayNight(): 13:00 = Tag
  setTimeOfDay(13.0);
  showStars(false); // wird eh automatisch aus setTimeOfDay gesteuert

  clock = new THREE.Clock();
  window.addEventListener('resize', onResize);
  onResize();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') {
      const order = ['orbit','drone','fp'];
      const cur = order.indexOf(getActiveCameraType());
      const next = order[(cur+1) % order.length];
      switchToCamera(next);
    }
    if (e.code === 'KeyN') {
      // 🔹 Legacy-Shortcut bleibt: toggelt Tag/Nacht (intern Zeit ~13h / ~1h)
      const day = !isDaytime();
      setDayNight(day);
      showStars(!day);
    }
    if (e.code === 'KeyG') {
      gui._hidden ? gui.show() : gui.hide();
    }
    if (e.code === 'KeyR') {
      cameras.drone.resetHeight();
    }
    if (e.key === 'h' || e.key === 'H') {
      toggleHitboxVisibility();
    }
    if (e.code === 'KeyP') {
      placerActive = !placerActive;
      setPlacerEnabled(placerActive);
    }

    // 🔹 Komfort: Zeit manuell nudge’n (optional)
    if (e.code === 'ArrowRight') setTimeOfDay(getHours() + 0.25); // +15min
    if (e.code === 'ArrowLeft')  setTimeOfDay(getHours() - 0.25); // -15min
    if (e.code === 'KeyT') {
      // Auto-Zeitraffer toggeln
      // Tipp: Speed anpassbar mit +/- (unten)
      _auto = !_auto;
      setTimeAuto(_auto);
    }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { // +
      _speed = Math.min(3.0, _speed + 0.05);
      setTimeSpeed(_speed);
    }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { // -
      _speed = Math.max(0.05, _speed - 0.05);
      setTimeSpeed(_speed);
    }
  });
}

// 🔹 interner Status für Auto-Zeitfluss
let _auto = false;
let _speed = 0.25;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  cameras.orbit.update(dt);
  cameras.drone.update(dt);
  cameras.fp.update(dt);

  // 🔹 lässt optional Auto-Zeit laufen + hält Disks synchron
  updateSun(dt);

  updateCity(dt, t, scene, getActiveCameraType());

  const type = getActiveCameraType();
  const cam = type === 'orbit' ? cameras.orbit.camera
        : type === 'drone' ? cameras.drone.camera
        : cameras.fp.camera;

  setPlacerActiveCamera(cam);
  updatePlacer(dt);
  weather?.update(dt, cam);
  if (waterController) {
    const daylight = getDaylightFactor();
    WATER_COLOR.copy(WATER_NIGHT_COLOR).lerp(WATER_DAY_COLOR, daylight);
    updateWaterMaterials(daylight);
  }

    fireSystems.forEach((fireFX) => {
        fireFX.setEnabled(!isDaytime());
        fireFX.update(dt, t)
    });

    // --- Ego-Fackel ---
    const torchShouldBeOn = (type === 'fp') && !isDaytime();
    setEgoTorchActive(torchShouldBeOn);
    updateEgoTorch(dt, t);

  renderer.render(scene, cam);

  const mem = performance?.memory ? (performance.memory.usedJSHeapSize / (1024*1024)).toFixed(0) : '—';
  overlayEl.textContent =
    `Cam: ${type.toUpperCase()} · ` +
    `${isDaytime() ? 'DAY' : 'NIGHT'} · ` +
    `TIME:${getHours().toFixed(2)}h · ` +    // 🔹 Uhrzeit ins Overlay
    `FPS:${stats.fps} · MS:${stats.ms} · MB:${mem}`;
  stats.update();
}

function updateWaterMaterials(daylight) {
  if (!waterController) return;
  const reflectivity = THREE.MathUtils.lerp(0.72, 1.02, daylight);
  const waveScale = THREE.MathUtils.lerp(2.2, 3.6, daylight);

  const animatedSurfaces = waterController.getAnimatedSurfaces
    ? waterController.getAnimatedSurfaces()
    : [waterController.getHighQualitySurface?.()].filter(Boolean);

  animatedSurfaces.forEach((surface) => {
    const uniforms = surface?.material?.uniforms;
    if (!uniforms?.color || !uniforms.reflectivity || !uniforms.config) return;
    uniforms.color.value.copy(WATER_COLOR);
    uniforms.reflectivity.value = reflectivity;
    uniforms.config.value.w = waveScale;
  });

  const staticSurface = waterController.getPerformanceSurface
    ? waterController.getPerformanceSurface()
    : null;
  if (staticSurface?.material) {
    staticSurface.material.color.copy(WATER_COLOR);
    staticSurface.material.roughness = THREE.MathUtils.lerp(0.26, 0.06, daylight);
    staticSurface.material.metalness = THREE.MathUtils.lerp(0.12, 0.35, daylight);
    staticSurface.material.transparent = false;
    staticSurface.material.opacity = 1.0;
  }
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const k of ['orbit','drone','fp']) {
    const cam = cameras[k].camera;
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
  }
}

// Platzierbare Modelle kompakt im Array (leichter Offset für den Placer)
const placerSpacing = 12;
const placements = [
  {
    name: 'pyramide-01',
    url: '/models/pyramide.glb',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: Math.PI * 0.2, z: 0 },
    scale: 50
  },
  {
    name: 'tempelgr-01',
    url: '/models/Tempelgr.glb',
    position: { x: placerSpacing, y: 0, z: 2 },
    rotation: { x: 0, y: Math.PI * 0.3, z: 0 },
    scale: 60
  },
  {
    name: 'tempelgr-02',
    url: '/models/Tempelgr.glb',
    position: { x: -placerSpacing - 2, y: 0, z: placerSpacing * 0.7 },
    rotation: { x: 0, y: -Math.PI * 0.25, z: 0 },
    scale: 60
  },
  {
    name: 'tempelkl-01',
    url: '/models/Tempelkl.glb',
    position: { x: 4, y: 0, z: placerSpacing + 2 },
    rotation: { x: 0, y: 0.1, z: 0 },
    scale: 3
  },
  {
    name: 'tempelkl-02',
    url: '/models/Tempelkl.glb',
    position: { x: placerSpacing + 4, y: 0, z: placerSpacing + 4 },
    rotation: { x: 0, y: -0.18, z: 0 },
    scale: 3
  },
  {
    name: 'tempelkl-03',
    url: '/models/Tempelkl.glb',
    position: { x: -placerSpacing + 2, y: 0, z: placerSpacing * 1.3 },
    rotation: { x: 0, y: 0.22, z: 0 },
    scale: 3
  },
  {
    name: 'tempelkl-04',
    url: '/models/Tempelkl.glb',
    position: { x: placerSpacing * 1.6, y: 0, z: placerSpacing * 1.5 },
    rotation: { x: 0, y: -0.12, z: 0 },
    scale: 3
  },
  {
    name: 'kirche-01',
    url: '/models/Kirche.glb',
    position: { x: -4, y: 0, z: placerSpacing * 2 },
    rotation: { x: 0, y: Math.PI * 0.12, z: 0 },
    scale: 10
  },
  {
    name: 'tempelgrex-01',
    url: '/models/Tempelgrex.glb',
    position: { x: -4, y: 0, z: placerSpacing * 2 },
    rotation: { x: 0, y: Math.PI * 0.12, z: 0 },
    scale: 10
  },
  {
    name: 'tempelgrex-02',
    url: '/models/Tempelgrex.glb',
    position: { x: -4, y: 0, z: placerSpacing * 2 },
    rotation: { x: 0, y: Math.PI * 0.12, z: 0 },
    scale: 10
  },
  {
    name: 'tempelgrex-03',
    url: '/models/Tempelgrex.glb',
    position: { x: -4, y: 0, z: placerSpacing * 2 },
    rotation: { x: 0, y: Math.PI * 0.12, z: 0 },
    scale: 10
  },
  {
    name: 'tempelgrex-04',
    url: '/models/Tempelgrex.glb',
    position: { x: -4, y: 0, z: placerSpacing * 2 },
    rotation: { x: 0, y: Math.PI * 0.12, z: 0 },
    scale: 10
  },
  {
    name: 'walllong-01',
    url: '/models/walllong.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
   {
    name: 'walllong-02',
    url: '/models/walllong.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
  {
    name: 'walllong-03',
    url: '/models/walllong.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
  {
    name: 'walllong-04',
    url: '/models/walllong.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
  {
    name: 'walllong-05',
    url: '/models/walllong.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
  {
    name: 'walllong-06',
    url: '/models/walllong.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
  {
    name: 'walllong-07',
    url: '/models/walllongentrance.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
  {
    name: 'walllong-08',
    url: '/models/walllongentrance.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
  {
    name: 'cypress-01',
    url: '/models/cypress.glb',
    position: { x: -43.299045433618986, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-02',
    url: '/models/cypress.glb',
    position: { x: -23.299045433618986, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-03',
    url: '/models/cypress.glb',
    position: { x: -3.299045433618986, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-04',
    url: '/models/cypress.glb',
    position: { x: 16.700954566381014, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-05',
    url: '/models/cypress.glb',
    position: { x: 36.700954566381014, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-06',
    url: '/models/cypress.glb',
    position: { x: 56.700954566381014, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-07',
    url: '/models/cypress.glb',
    position: { x: 76.70095456638101, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-08',
    url: '/models/cypress.glb',
    position: { x: 96.70095456638101, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-09',
    url: '/models/cypress.glb',
    position: { x: 116.70095456638101, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'cypress-10',
    url: '/models/cypress.glb',
    position: { x: 136.700954566381, y: 0, z: 12.72533647339433 },
    rotation: { x: 0, y: 0.3, z: 0 },
    scale: 0.7
  },
  {
    name: 'supercar-01',
    url: '/models/supercar.glb',
    position: { x: 50, y: 0, z: -30 },
    rotation: { x: 0, y: Math.PI / 2, z: 0 },
    scale: 1
  },
  {
    name: 'bodenplatte-01',
    url: '/models/Bodenplatte.glb',
    position: { x: -placerSpacing, y: 0, z: -placerSpacing },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1
  }
];

placements.forEach(({ url, name, position, rotation, scale, hitboxOptions }) => {
  loadGLB(scene, {
    url,
    position,
    rotation,
    scale,
    hitboxOptions,
    onLoaded: (model) => registerPlaceableObject(model, name)
  });
});

const placementsWithLights = [
    {
        name: 'firesockel-01',
        url: '/models/Feuerschale_Empty.glb',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: Math.PI * 0.2, z: 0 },
        scale: 0.6,
        emptyName: 'BowlFirePoint',
        intensity: 1000,
        distance: 1000
    },
    {
        name: 'firesockel-02',
        url: '/models/Feuerschale_Empty.glb',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: Math.PI * 0.2, z: 0 },
        scale: 0.6,
        emptyName: 'BowlFirePoint',
        intensity: 1000,
        distance: 1000
    },
    {
        name: 'firesockel-03',
        url: '/models/Feuerschale_Empty.glb',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: Math.PI * 0.2, z: 0 },
        scale: 0.6,
        emptyName: 'BowlFirePoint',
        intensity: 1000,
        distance: 1000
    }
]

    placementsWithLights.forEach(({ url, name, position, rotation, scale, hitboxOptions, emptyName, intensity, distance}) => {
        loadGLB(scene, {
            url,
            position,
            rotation,
            scale,
            hitboxOptions,
            onLoaded: (model) => {
                registerPlaceableObject(model, name);

                let fireMarker = null;
                model.traverse((child) => {
                    if (child.name === emptyName) {
                        fireMarker = child;
                    }
                });

                if (!fireMarker) {
                    console.warn('Kein Fire-Empty im Sockel gefunden!');
                    return;
                }

                // Feuer-Emitter am Empty erstellen
                const fireFX = createFireSystem(
                    fireMarker,
                    "textures/fire.png",
                    intensity,
                    distance
                )
                fireSystems.push(fireFX)
            }
    });
});
