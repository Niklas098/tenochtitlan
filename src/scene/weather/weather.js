// src/scene/weather/weather.js
import * as THREE from 'three';

export function createWeather(scene, { waterController = null } = {}) {
  if (!scene?.isScene) throw new Error('createWeather(scene) expects a THREE.Scene');

  const root = new THREE.Group();
  root.name = 'WeatherController';
  scene.add(root);

  const state = { fog: false, rain: false };
  // Realistischerer Nebel: Kühles Grau-Blau
  const fogColor = new THREE.Color(0xbdcdd6);
  // Dichte nochmals erhöht (0.0025), für sehr starken Nebel direkt vor der Kamera
  const userFog = new THREE.FogExp2(fogColor, 0.0025);
  let previousFog = scene.fog ?? null;

  const rain = createRainSystem();
  root.add(rain.points);
  rain.points.visible = false;

  // Volumetrischer Nebel (Mist) für direkte Sichtbarkeit
  const mist = createMistSystem(fogColor);
  root.add(mist.points);
  mist.points.visible = false;

  function syncWaterFog(enabled) {
    if (!waterController) return;
    const surfaces = [
      ...(waterController.getAnimatedSurfaces?.() ?? []),
      waterController.getPerformanceSurface?.()
    ].filter(Boolean);
    for (const surface of surfaces) {
      if (!surface.material) continue;
      surface.material.fog = enabled;
      surface.material.needsUpdate = true;
    }
  }

  function setFogEnabled(on) {
    const enable = !!on;
    if (enable === state.fog) return;
    state.fog = enable;
    mist.points.visible = enable; // Mist aktivieren

    if (enable) {
      previousFog = scene.fog ?? null;
      scene.fog = userFog;
      scene.background = fogColor; 
    } else if (scene.fog === userFog) {
      scene.fog = previousFog;
      scene.background = null; 
    }
    syncWaterFog(state.fog);
  }

  function setRainEnabled(on) {
    state.rain = !!on;
    rain.points.visible = state.rain;
  }

  function update(deltaSec = 0, camera = null) {
    if (state.rain) rain.update(deltaSec, camera);
    if (state.fog) mist.update(deltaSec, camera);
  }

  return {
    root,
    update,
    setFogEnabled,
    setRainEnabled,
    toggleFog() { setFogEnabled(!state.fog); },
    toggleRain() { setRainEnabled(!state.rain); },
    isFogEnabled() { return state.fog; },
    isRainEnabled() { return state.rain; }
  };
}

function createRainSystem({
  count = 10000, 
  areaSize = 2000,
  height = 1200,
  wind = new THREE.Vector2(-60, -40), 
  fallSpeed = [700, 1000] 
} = {}) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 2 * 3); 
  const velocities = [];

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * areaSize;
    const y = (Math.random() - 0.5) * height;
    const z = (Math.random() - 0.5) * areaSize;
    const speed = THREE.MathUtils.lerp(fallSpeed[0], fallSpeed[1], Math.random());
    
    velocities.push({ x, y, z, speed });
    
    const idx = i * 6;
    positions[idx] = x; positions[idx+1] = y; positions[idx+2] = z;
    positions[idx+3] = x; positions[idx+4] = y; positions[idx+5] = z;
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({
    color: 0xaaccff, 
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });

  const points = new THREE.LineSegments(geo, mat);
  points.frustumCulled = false; 
  points.renderOrder = 2;

  function update(deltaSec, camera) {
    if (!points.visible) return;

    let camX = 0, camY = 0, camZ = 0;
    if (camera?.isCamera) {
        camX = camera.position.x;
        camY = camera.position.y;
        camZ = camera.position.z;
    }

    const posArray = geo.attributes.position.array;
    const halfArea = areaSize / 2;
    const halfHeight = height / 2;

    const streakFactor = 0.04;
    const windStreakX = wind.x * streakFactor;
    const windStreakZ = wind.y * streakFactor;

    for (let i = 0; i < count; i++) {
      const v = velocities[i];
      
      v.x += wind.x * deltaSec;
      v.y -= v.speed * deltaSec;
      v.z += wind.y * deltaSec;

      if (v.y < -halfHeight) v.y += height;
      if (v.x > halfArea) v.x -= areaSize;
      else if (v.x < -halfArea) v.x += areaSize;
      if (v.z > halfArea) v.z -= areaSize;
      else if (v.z < -halfArea) v.z += areaSize;

      const worldX = camX + v.x;
      const worldY = camY + v.y + 200; 
      const worldZ = camZ + v.z;

      const dropLen = v.speed * streakFactor;

      const idx = i * 6;
      
      posArray[idx] = worldX;
      posArray[idx+1] = worldY;
      posArray[idx+2] = worldZ;
      
      posArray[idx+3] = worldX - windStreakX;
      posArray[idx+4] = worldY + dropLen; 
      posArray[idx+5] = worldZ - windStreakZ;
    }

    geo.attributes.position.needsUpdate = true;
  }

  return { points, update };
}

function createMistSystem(color) {
  const count = 150;
  const areaSize = 1200;
  const height = 400;
  
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * areaSize;
    positions[i * 3 + 1] = (Math.random() - 0.5) * height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * areaSize;
    
    velocities.push({
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 5,
      z: (Math.random() - 0.5) * 20,
      relX: positions[i * 3],
      relY: positions[i * 3 + 1],
      relZ: positions[i * 3 + 2]
    });
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  let texture = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    texture = new THREE.CanvasTexture(canvas);
  }

  const mat = new THREE.PointsMaterial({
    color: color,
    map: texture,
    size: 400,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45, // Opazität erhöht für dichtere Nebelschwaden
    depthWrite: false,
    blending: THREE.NormalBlending
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 1;

  function update(deltaSec, camera) {
    if (!points.visible) return;

    let camX = 0, camY = 0, camZ = 0;
    if (camera?.isCamera) {
        camX = camera.position.x;
        camY = camera.position.y;
        camZ = camera.position.z;
    }

    const pos = geo.attributes.position.array;
    const halfArea = areaSize / 2;
    const halfHeight = height / 2;

    for (let i = 0; i < count; i++) {
      const v = velocities[i];
      const idx = i * 3;

      v.relX += v.x * deltaSec;
      v.relY += v.y * deltaSec;
      v.relZ += v.z * deltaSec;

      if (v.relX > halfArea) v.relX -= areaSize;
      if (v.relX < -halfArea) v.relX += areaSize;
      if (v.relY > halfHeight) v.relY -= height;
      if (v.relY < -halfHeight) v.relY += height;
      if (v.relZ > halfArea) v.relZ -= areaSize;
      if (v.relZ < -halfArea) v.relZ += areaSize;

      pos[idx] = camX + v.relX;
      pos[idx+1] = camY + v.relY + 50;
      pos[idx+2] = camZ + v.relZ;
    }
    geo.attributes.position.needsUpdate = true;
  }

  return { points, update };
}
