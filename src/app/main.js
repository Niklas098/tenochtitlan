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
  getHours
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
import {
  createTorchForCamera,
  updateTorch
} from '../scene/torch/torch.js';
import {createFireEmitter, updateFireEmitters} from "../scene/torch/fireEmitters.js";

let renderer, scene, cameras, clock, lights, gui, stats, overlayEl;
let placerActive = false;

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

  // Kleinere Map -> FP wirkt größer
  buildCity(scene, { groundSize: 2400 });

  gui = createGUI(renderer, cameras, lights);

  createTorchForCamera(cameras.fp.camera, {
    scene,
    offset: { x: 0.38, y: -0.42, z: -0.78 },
    rotation: { x: -0.33, y: 0.34, z: 0.06 },
    intensity: 3.8
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
  updateTorch(dt);

  updateFireEmitters(dt, !isDaytime());

  renderer.render(scene, cam);

  const mem = performance?.memory ? (performance.memory.usedJSHeapSize / (1024*1024)).toFixed(0) : '—';
  overlayEl.textContent =
    `Cam: ${type.toUpperCase()} · ` +
    `${isDaytime() ? 'DAY' : 'NIGHT'} · ` +
    `TIME:${getHours().toFixed(2)}h · ` +    // 🔹 Uhrzeit ins Overlay
    `FPS:${stats.fps} · MS:${stats.ms} · MB:${mem}`;
  stats.update();
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const k of ['orbit','drone','fp']) {
    const cam = cameras[k].camera;
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
  }
}

loadGLB(scene, {
    url: '/models/Feuersockel.glb',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: Math.PI * 0.25, z: 0 },
    scale: 1,
    hitboxOptions: { marginXZ: 0.3, marginY: 0.15, minDimension: 0.05 },
    onLoaded: (model) => {
        registerPlaceableObject(model, 'Feuersockel-01');

        let fireMarker = null;
        model.traverse((child) => {
            if (child.name === 'FirePointStandingTorch') {
                fireMarker = child;
            }
        });

        if (!fireMarker) {
            console.warn('Kein Fire-Empty im Sockel gefunden!');
            return;
        }

        // Feuer-Emitter am Empty erstellen
        createFireEmitter({
            parent: fireMarker,
            offset: { x: 0, y: 0, z: 0 }, // bei Bedarf minimal nachjustieren
            intensity: 500,
            radius: 500
        });
    }
});

loadGLB(scene,{
   url: '/models/Feuersockel.glb',
   position: { x: 0, y: 0, z: 0 },
   rotation: { x: 0, y: Math.PI * 0.25, z: 0 },
   scale: 1,
   hitboxOptions: { marginXZ: 0.3, marginY: 0.15, minDimension: 0.05 },
   onLoaded: (model) => {
       registerPlaceableObject(model, 'Feuersockel-02');

       let fireMarker = null;
       model.traverse((child) => {
           if (child.name === 'FirePointStandingTorch') {
               fireMarker = child;
           }
       });

       if (!fireMarker) {
           console.warn('Kein Fire-Empty im Sockel gefunden!');
           return;
       }

       // Feuer-Emitter am Empty erstellen
       createFireEmitter({
           parent: fireMarker,
           offset: { x: 0, y: 0, z: 0 }, // bei Bedarf minimal nachjustieren
           intensity: 500,
           radius: 500
       });
   }
});

loadGLB(scene, {
    url: '/models/TempelmitFeuer.glb',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: Math.PI * 0.25, z: 0 },
    scale: 1.7,
    hitboxOptions: { marginXZ: 0.3, marginY: 0.15, minDimension: 0.05 },
    onLoaded: (model) => {
        registerPlaceableObject(model, 'TempelLinus');

        let fireMarker = null;
        model.traverse((child) => {
            if (child.name === 'Leer') {
                fireMarker = child;
            }
        });

        if (!fireMarker) {
            console.warn('Kein Fire-Empty im Sockel gefunden!');
            return;
        }

        // Feuer-Emitter am Empty erstellen
        createFireEmitter({
            parent: fireMarker,
            offset: { x: 0, y: 0, z: 0 }, // bei Bedarf minimal nachjustieren
            intensity: 1000,
            radius: 1000
        });
    }
});

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
    url: '/models/walllong.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
    scale: 1
  },
  {
    name: 'walllong-08',
    url: '/models/walllong.glb',
    position: { x: 12, y: 0, z: -7.2 },
    rotation: { x: 0, y: -0.25, z: 0 },
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
