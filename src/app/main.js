// src/app/main.js
import * as THREE from 'three';
import { createRenderer } from '../util/renderer.js';
import { createCameras, switchToCamera, getActiveCameraType } from '../util/cameras.js';
import {
  createLights,
  setDayNight,          // legacy toggle bleibt nutzbar (mappt auf Zeit)
  updateSun,
  isDaytime,
  attachTorchTo,        // no-op, kann bleiben
  showStars,
  // 🔹 NEU: Zeitsteuerung (Orbit)
  setTimeOfDay,
  setTimeAuto,
  setTimeSpeed,
  getHours
} from '../util/lights.js';
import { buildCity, updateCity, loadGLB } from '../scene/city/city.js';
import createGUI from '../ui/gui.js';

let renderer, scene, cameras, clock, lights, gui, stats, overlayEl;

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xC9D5E6);

  const canvas = document.getElementById('app');
  if (!canvas) {
    console.error("FEHLER: <canvas id='app'> fehlt in index.html");
    return;
  }

  ({ renderer, stats, overlayEl } = createRenderer(canvas));

  cameras = createCameras(renderer, canvas, {
    drone: { flySpeed: 32, height: 120, minHeight: 25, maxHeight: 350, turbo: 1.8 }
  });
  switchToCamera('drone');

  lights = createLights(scene);

  // Kleinere Map -> FP wirkt größer
  buildCity(scene, { groundSize: 2400 });

  // 🔹 Fackel war entfernt – call ist jetzt No-Op, darf drin bleiben
  attachTorchTo(cameras.fp.camera);

  gui = createGUI(renderer, cameras, lights);

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
      scene.background = day ? new THREE.Color(0xC9D5E6) : new THREE.Color(0x05070A);
      showStars(!day);
    }
    if (e.code === 'KeyG') {
      gui._hidden ? gui.show() : gui.hide();
    }
    if (e.code === 'KeyR') {
      cameras.drone.resetHeight();
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

  scene.background = isDaytime() ? new THREE.Color(0xC9D5E6) : new THREE.Color(0x05070A);

  const type = getActiveCameraType();
  const cam = type === 'orbit' ? cameras.orbit.camera
        : type === 'drone' ? cameras.drone.camera
        : cameras.fp.camera;

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

// Beispiel: Pyramide auf die Plaza stellen
loadGLB(scene, {
  url: '/models/pyramide.glb',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: Math.PI * 0.25, z: 0 },
  scale: 0.04,
});
