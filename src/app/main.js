import * as THREE from 'three';
import { createRenderer } from '../util/renderer.js';
import { createCameras, switchToCamera, getActiveCameraType } from '../util/cameras.js';
import { toggleHitboxVisibility, findSafeSpawnPosition } from '../util/collision.js';
import {
  createLights,
  setDayNight,
  updateSun,
  isDaytime,
  showStars,
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
import { createHotspotManager } from '../scene/hotspots/hotspotManager.js';
import { getHotspotDefinition } from '../scene/hotspots/hotspotContent.js';
import {createFireSystem} from "../scene/fire/fire.js";
import {initEgoTorch, setEgoTorchActive, updateEgoTorch} from "../scene/fire/torch.js";
import { createSoundscape } from '../util/soundscape.js';
import { SurfaceTypes, markSurface } from '../util/surfaces.js';
import { markInitialLoadComplete } from '../util/loadingState.js';

const WATER_DAY_COLOR = new THREE.Color(0x2a4f72);
const WATER_NIGHT_COLOR = new THREE.Color(0x05090f);
const WATER_COLOR = new THREE.Color();

let renderer, scene, cameras, clock, lights, gui, stats, overlayEl, waterController, weather, hotspotManager, soundscape;
let placerActive = false;
let guiHiddenBeforePlacer = false;
let fireSystems = [];
/** Tracks whether the user toggled the FP torch on. */
let torchUserEnabled = false;
const INITIAL_FP_SPAWN = new THREE.Vector3(21.695271384698064, 0, 48.024155025144296);

/**
 * Bootstraps the scene, assets, controls, and UI.
 */
async function init() {
  scene = new THREE.Scene();
  hotspotManager = createHotspotManager(scene);

  const canvas = document.getElementById('app');
  if (!canvas) {
    console.error("ERROR: <canvas id='app'> missing in index.html");
    return;
  }

  ({ renderer, stats, overlayEl } = createRenderer(canvas));

  cameras = createCameras(renderer, canvas, {
    drone: { flySpeed: 32, height: 120, minHeight: 25, maxHeight: 350, turbo: 1.8 }
  });

  const droneCam = cameras.drone.camera;
  droneCam.position.set(INITIAL_FP_SPAWN.x, droneCam.position.y, INITIAL_FP_SPAWN.z);
  const safeDronePos = findSafeSpawnPosition(droneCam.position);
  droneCam.position.copy(safeDronePos);
  cameras.fp.camera.position.copy(INITIAL_FP_SPAWN);

  soundscape = createSoundscape({
    getIsDaytime: () => isDaytime()
  });

  activateCamera('fp');

  lights = createLights(scene);

  scene.add(cameras.fp.camera);
    initEgoTorch(cameras.fp.camera, {
        url: '/models/fackelEmpty.glb',
        emptyName: 'TorchFirePoint',
        fireTex: '/textures/fire.png',
        intensity: 1000,
        distance: 1000
    });

  const { ground: groundMesh } = (buildCity(scene, {
    groundSize: 1750,
    water: {
      sunLight: lights.sun,
      reflectionIgnore: lights.starField
    }
  }) || {});
  if (groundMesh) {
    soundscape?.registerWalkSurface(groundMesh);
  }

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

  initPlacer({
    scene,
    domElement: renderer.domElement,
    defaultEnabled: false,
    onEnabledChange: handlePlacerModeChange
  });

  await loadPlacementsAndSpawn();

  setTimeOfDay(13.0);
  showStars(true, { manual: true });

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

  clock = new THREE.Clock();
  window.addEventListener('resize', onResize);
  onResize();

  gui?.setActiveCamera?.(getActiveCameraType());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') {
      const order = ['orbit','drone','fp'];
      const cur = order.indexOf(getActiveCameraType());
      const next = order[(cur+1) % order.length];
      activateCamera(next);
    }
    if (e.code === 'KeyE' && getActiveCameraType() === 'fp') {
      if (hotspotManager?.handleInteract()) {
        e.preventDefault();
        return;
      }
    }
    if (e.code === 'KeyN') {
      const day = !isDaytime();
      setDayNight(day);
    }
    if (e.code === 'KeyG') {
      if (placerActive) return;
      gui._hidden ? gui.show() : gui.hide();
    }
    if (e.code === 'KeyR') {
      cameras.drone.resetHeight();
    }
    if (e.key === 'h' || e.key === 'H') {
      toggleHitboxVisibility();
    }
    if (e.code === 'KeyP') {
      setPlacerEnabled(!placerActive);
    }
    if (e.code === 'KeyF' && getActiveCameraType() === 'fp') {
      torchUserEnabled = !torchUserEnabled;
      const torchShouldBeOn = !isDaytime() && torchUserEnabled;
      setEgoTorchActive(torchShouldBeOn);
      e.preventDefault();
    }

    if (e.code === 'ArrowRight') setTimeOfDay(getHours() + 0.25);
    if (e.code === 'ArrowLeft')  setTimeOfDay(getHours() - 0.25);
    if (e.code === 'KeyT') {
      _auto = !_auto;
      setTimeAuto(_auto);
      gui?.setAutoMode?.(_auto);
    }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      _speed = Math.min(3.0, _speed + 0.05);
      setTimeSpeed(_speed);
    }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
      _speed = Math.max(0.05, _speed - 0.05);
      setTimeSpeed(_speed);
    }
  });
}

/** Auto time-lapse toggle. */
let _auto = false;
let _speed = 0.25;

/**
 * Switches cameras and mirrors the state to the GUI.
 * @param {'orbit'|'drone'|'fp'} type
 */
function activateCamera(type) {
  switchToCamera(type);
  gui?.setActiveCamera?.(type);
  const cam = type === 'orbit'
    ? cameras.orbit.camera
    : type === 'drone'
      ? cameras.drone.camera
      : cameras.fp.camera;
  soundscape?.setCamera(cam);
}

/**
 * Formats decimal hours to HH.MM display.
 * @param {number} hours
 * @returns {string}
 */
function formatHoursClock(hours) {
  let h = Math.floor(hours);
  let minutes = Math.round((hours - h) * 60);
  if (minutes === 60) {
    minutes = 0;
    h = (h + 1) % 24;
  }
  return `${String(h).padStart(2, '0')}.${String(minutes).padStart(2, '0')}`;
}

/**
 * Handles UI visibility when the placer is toggled.
 * @param {boolean} enabled
 */
function handlePlacerModeChange(enabled) {
  placerActive = enabled;
  if (enabled) {
    guiHiddenBeforePlacer = gui?._hidden ?? false;
    gui?.hide();
  } else {
    if (!guiHiddenBeforePlacer) {
      gui?.show();
    }
    guiHiddenBeforePlacer = false;
  }
}

/** Main render loop. */
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  cameras.orbit.update(dt);
  cameras.drone.update(dt);
  cameras.fp.update(dt);

  updateSun(dt);

  updateCity(dt, t, scene, getActiveCameraType());

  const type = getActiveCameraType();
  const cam = type === 'orbit' ? cameras.orbit.camera
        : type === 'drone' ? cameras.drone.camera
        : cameras.fp.camera;

  setPlacerActiveCamera(cam);
  updatePlacer(dt);
  hotspotManager?.update(dt, cam);
  weather?.update(dt, cam);
  if (waterController) {
    const daylight = getDaylightFactor();
    WATER_COLOR.copy(WATER_NIGHT_COLOR).lerp(WATER_DAY_COLOR, daylight);
    updateWaterMaterials(daylight);
  }

  fireSystems.forEach((fireFX) => {
    fireFX.setEnabled(!isDaytime());
    fireFX.update(dt, t);
  });

  const torchShouldBeOn = (type === 'fp') && !isDaytime() && torchUserEnabled;
  setEgoTorchActive(torchShouldBeOn);
  updateEgoTorch(dt, t);

  soundscape?.update(dt, {
    camera: cam,
    fpCamera: cameras.fp.camera,
    activeCameraType: type,
    fpState: cameras.fp.state,
    torchActive: torchShouldBeOn,
    isRaining: weather?.isRainEnabled?.() ?? false
  });

  renderer.render(scene, cam);

  const mem = performance?.memory ? (performance.memory.usedJSHeapSize / (1024*1024)).toFixed(0) : '—';
  overlayEl.textContent =
    `Cam: ${type.toUpperCase()} · ` +
    `${isDaytime() ? 'DAY' : 'NIGHT'} · ` +
    `TIME:${formatHoursClock(getHours())}h · ` +
    `FPS:${stats.fps} · MS:${stats.ms} · MB:${mem}`;
  stats.update();
}

/**
 * Syncs water material uniforms to the current daylight factor.
 * @param {number} daylight
 */
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

/** Resizes renderer and cameras on viewport changes. */
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const k of ['orbit','drone','fp']) {
    const cam = cameras[k].camera;
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
  }
}

const PLACEMENT_SOURCES = ['/api/placements', '/data/placements.json'];

/**
 * Loads placement definitions and instantiates GLBs, hotspots, and fire FX.
 */
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

        if (typeof data.url === 'string' && data.url.includes('bodenplatte')) {
          markSurface(model, SurfaceTypes.STONE);
          soundscape?.registerWalkSurface(model);
        }

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
            promptText: hs.prompt ?? 'Press E for info'
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
          console.warn('No fire anchor empty found in model.');
          return;
        }

        const fireFX = createFireSystem(
          fireMarker,
          'textures/fire.png',
          intensity,
          distance
        );
        soundscape?.registerFireSource(fireMarker);
        fireSystems.push(fireFX);
      }
    });
  });
}

/**
 * Attempts to load placement JSON from known endpoints with no-cache semantics.
 * @returns {Promise<Record<string, any>>}
 */
async function loadPlacementsData() {
  for (const url of PLACEMENT_SOURCES) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      if (json && typeof json === 'object') return json;
    } catch (err) {
      console.warn('Failed to load placements from', url, err);
    }
  }
  console.warn('No placements loaded, using empty layout.');
  return {};
}

/**
 * Normalizes vector-like input to an object with numeric x/y/z.
 * @param {Array<number>|{x:number,y:number,z:number}} input
 * @param {{x:number,y:number,z:number}} fallback
 * @returns {{x:number,y:number,z:number}}
 */
function toVec3(input, fallback) {
  if (Array.isArray(input) && input.length === 3) {
    return { x: Number(input[0]) || 0, y: Number(input[1]) || 0, z: Number(input[2]) || 0 };
  }
  if (input && typeof input === 'object' && 'x' in input && 'y' in input && 'z' in input) {
    return { x: Number(input.x) || 0, y: Number(input.y) || 0, z: Number(input.z) || 0 };
  }
  return fallback;
}

/**
 * Normalizes scale input to either a scalar or an xyz object.
 * @param {number|Array<number>|{x:number,y:number,z:number}} value
 * @returns {number|{x:number,y:number,z:number}}
 */
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

init()
  .then(() => {
    markInitialLoadComplete();
    animate();
  })
  .catch((err) => {
    console.error('Failed to initialize app', err);
    markInitialLoadComplete();
  });
