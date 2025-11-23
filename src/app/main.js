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
import {
  createTorchForCamera,
  updateTorch
} from '../scene/torch/torch.js';
import {createFireEmitter, updateFireEmitters} from "../scene/torch/fireEmitters.js";
import { createWater, WATER_QUALITY } from '../scene/water/water2.js';
import { createMountains } from '../scene/mountains/mountains.js';
import { createWeather } from '../scene/weather/weather.js';
import {createFireAndSmokeSystem} from "../scene/torch/fire.js";
import { createHotspotManager } from '../scene/hotspots/hotspotManager.js';
import { getHotspotDefinition } from '../scene/hotspots/hotspotContent.js';

const WATER_DAY_COLOR = new THREE.Color(0x2a4f72);
const WATER_NIGHT_COLOR = new THREE.Color(0x05090f);
const WATER_COLOR = new THREE.Color();

let renderer, scene, cameras, clock, lights, gui, stats, overlayEl, waterController, weather, hotspotManager;
let placerActive = false;
let fireSystems = [];

async function init() {
  scene = new THREE.Scene();
  hotspotManager = createHotspotManager(scene);

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

  await loadPlacementsAndSpawn();

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
    if (e.code === 'KeyE' && getActiveCameraType() === 'fp') {
      if (hotspotManager?.handleInteract()) {
        e.preventDefault();
        return;
      }
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
  hotspotManager?.update(dt, cam);
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

const PLACEMENT_SOURCES = ['/api/placements', '/data/placements.json'];

async function loadPlacementsAndSpawn() {
  const placements = await loadPlacementsData();
  Object.entries(placements).forEach(([name, data]) => {
    if (!data || !data.url) return;
    const position = toVec3(data.position, { x: 0, y: 0, z: 0 });
    const rotation = toVec3(data.rotation, { x: 0, y: 0, z: 0 });
    const scale = toScale(data.scale ?? 1);
    const { hitboxOptions, emptyName, intensity = 1000, distance = 1000 } = data;

    loadGLB(scene, {
      url: data.url,
      position,
      rotation,
      scale,
      hitboxOptions,
      onLoaded: (model) => {
        registerPlaceableObject(model, name);

        const hotspotConfig = data.hotspot ?? getHotspotDefinition(name);
        if (hotspotManager && hotspotConfig) {
          const hs = hotspotConfig;
          hotspotManager.addHotspot({
            id: name,
            anchor: model,
            radius: hs.radius ?? 8,
            height: hs.iconHeight ?? hs.height ?? 4,
            glowStrength: hs.glowStrength ?? 1,
            title: hs.title ?? name,
            description: hs.description ?? '',
            promptText: hs.prompt ?? 'Drücke E für Info'
          });
        }

        if (!emptyName) return;

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

        const fireFX = createFireAndSmokeSystem(
          fireMarker,
          'textures/fire.png',
          'textures/smoke.png',
          intensity,
          distance
        );
        fireSystems.push(fireFX);
      }
    });
  });
}

async function loadPlacementsData() {
  for (const url of PLACEMENT_SOURCES) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      if (json && typeof json === 'object') return json;
    } catch (err) {
      console.warn('Placements laden fehlgeschlagen von', url, err);
    }
  }
  console.warn('Keine Placements geladen, verwende leeres Layout.');
  return {};
}

function toVec3(input, fallback) {
  if (Array.isArray(input) && input.length === 3) {
    return { x: Number(input[0]) || 0, y: Number(input[1]) || 0, z: Number(input[2]) || 0 };
  }
  if (input && typeof input === 'object' && 'x' in input && 'y' in input && 'z' in input) {
    return { x: Number(input.x) || 0, y: Number(input.y) || 0, z: Number(input.z) || 0 };
  }
  return fallback;
}

function toScale(value) {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && value.length === 3) {
    return { x: Number(value[0]) || 1, y: Number(value[1]) || 1, z: Number(value[2]) || 1 };
  }
  if (value && typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value) {
    return { x: Number(value.x) || 1, y: Number(value.y) || 1, z: Number(value.z) || 1 };
  }
  return 1;
}

init().then(() => animate());
