// src/util/soundscape.js
import * as THREE from 'three';
import { SurfaceTypes, getSurfaceType } from './surfaces.js';
import { getAssetLoadingManager } from './loadingState.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const FIRE_RANGE = { near: 4, far: 11 };

/**
 * Creates and manages all ambient/footstep audio tracks.
 * @param {{getIsDaytime?:()=>boolean}} [options]
 */
export function createSoundscape({ getIsDaytime = () => true } = {}) {
  const listener = new THREE.AudioListener();
  const loader = new THREE.AudioLoader(getAssetLoadingManager());

  const resumeAudioContext = () => {
    const ctx = listener.context;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', resumeAudioContext);
    window.addEventListener('keydown', resumeAudioContext);
  }

  const loops = {
    day: createLoop('/data/audio/day.mp3', 0.38, 0.6),
    night: createLoop('/data/audio/night.mp3', 0.42, 0.6),
    sand: createLoop('/data/audio/sandwalk.wav', 0.65, 8.0),
    stone: createLoop('/data/audio/stonewalk.mp3', 0.55, 8.0),
    fireBowl: createLoop('/data/audio/firebowl.mp3', 0.65, 1.6),
    torchFire: createLoop('/data/audio/firebowl.mp3', 0.35, 2.4),
    rain: createLoop('/data/audio/rain.mp3', 0.65, 1.4)
  };
  const loopEntries = Object.values(loops);

  const torchSound = createOneShot('/data/audio/torch.mp3', 0.75);

  const walkTargets = new Set();
  const fireAnchors = new Set();
  const raycaster = new THREE.Raycaster();
  const rayDirection = new THREE.Vector3(0, -1, 0);
  const tmpVec = new THREE.Vector3();

  raycaster.near = 0;
  raycaster.far = 6;

  let activeCamera = null;
  let lastTorchActive = false;

  function createLoop(url, baseVolume = 0.6, fadeSpeed = 1.5) {
    const sound = new THREE.Audio(listener);
    const entry = {
      sound,
      baseVolume,
      fadeSpeed,
      target: 0,
      current: 0,
      ready: false
    };
    loader.load(url, (buffer) => {
      sound.setBuffer(buffer);
      sound.setLoop(true);
      sound.setVolume(0);
      entry.ready = true;
    });
    return entry;
  }

  function createOneShot(url, volume = 0.8) {
    const sound = new THREE.Audio(listener);
    loader.load(url, (buffer) => {
      sound.setBuffer(buffer);
      sound.setLoop(false);
      sound.setVolume(volume);
    });
    return sound;
  }

  function setCamera(camera) {
    if (!camera || activeCamera === camera) return;
    if (listener.parent) {
      listener.parent.remove(listener);
    }
    camera.add(listener);
    activeCamera = camera;
  }

  function setLoopStrength(entry, value) {
    entry.target = clamp01(value);
  }

  function tickLoop(entry, dt) {
    if (!entry.ready) return;
    if (entry.target > 0 && !entry.sound.isPlaying) {
      entry.sound.play();
    }

    const diff = entry.target - entry.current;
    if (Math.abs(diff) > 1e-3) {
      const step = Math.min(Math.abs(diff), entry.fadeSpeed * dt);
      entry.current += Math.sign(diff) * step;
      entry.sound.setVolume(entry.current * entry.baseVolume);
    }

    if (entry.target === 0 && entry.current <= 0.001 && entry.sound.isPlaying) {
      entry.sound.stop();
    }
  }

  function detectSurface(fpCamera) {
    if (!fpCamera || walkTargets.size === 0) return null;
    raycaster.set(fpCamera.position, rayDirection);
    const objects = Array.from(walkTargets);
    const hits = raycaster.intersectObjects(objects, true);
    for (const hit of hits) {
      const surface = getSurfaceType(hit.object);
      if (surface) return surface;
    }
    return null;
  }

  function computeFireVolume(fpCamera) {
    if (!fpCamera || fireAnchors.size === 0) return 0;
    let minDistance = Infinity;
    fireAnchors.forEach((anchor) => {
      anchor.getWorldPosition(tmpVec);
      const dist = tmpVec.distanceTo(fpCamera.position);
      if (dist < minDistance) minDistance = dist;
    });
    if (!isFinite(minDistance)) return 0;
    const near = FIRE_RANGE.near;
    const far = FIRE_RANGE.far;
    if (minDistance <= near) return 1;
    if (minDistance >= far) return 0;
    return 1 - (minDistance - near) / (far - near);
  }

  function playTorchSound() {
    if (!torchSound?.buffer) return;
    torchSound.stop();
    torchSound.play();
  }

  function update(dt, {
    camera = null,
    fpCamera = null,
    activeCameraType = 'drone',
    fpState = null,
    torchActive = false,
    isRaining = false
  } = {}) {
    if (camera) {
      setCamera(camera);
    }

    const isDay = !!getIsDaytime();
    const isNight = !isDay;
    setLoopStrength(loops.day, isDay ? 1 : 0);
    setLoopStrength(loops.night, isDay ? 0 : 1);

    const isFpActive = activeCameraType === 'fp';
    const groundedMove = Boolean(isFpActive && fpState?.isMoving && fpState?.onGround);
    const surface = isFpActive ? (detectSurface(fpCamera) ?? SurfaceTypes.SAND) : null;

    setLoopStrength(
      loops.sand,
      groundedMove && surface !== SurfaceTypes.STONE ? 1 : 0
    );
    setLoopStrength(
      loops.stone,
      groundedMove && surface === SurfaceTypes.STONE ? 1 : 0
    );

    if (torchActive && !lastTorchActive) {
      playTorchSound();
    }
    lastTorchActive = torchActive;

    const fireVolume = isFpActive && isNight ? computeFireVolume(fpCamera) : 0;
    setLoopStrength(loops.fireBowl, fireVolume);
    setLoopStrength(loops.torchFire, torchActive ? 1 : 0);
    setLoopStrength(loops.rain, isRaining ? 1 : 0);

    loopEntries.forEach((entry) => tickLoop(entry, dt));
  }

  function registerWalkSurface(object) {
    if (!object) return;
    walkTargets.add(object);
  }

  function registerFireSource(anchor) {
    if (!anchor) return;
    fireAnchors.add(anchor);
  }

  return {
    listener,
    setCamera,
    update,
    registerWalkSurface,
    registerFireSource
  };
}
