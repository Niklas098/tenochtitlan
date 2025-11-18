// src/scene/water/water.js
// Zentraler Water-Helper: kapselt eine reflektierende Wasserfläche mit
// ruhigen Wellen, die Farb- und Wellenparameter anhand der Tageszeit mischt.
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

let waterMesh = null;
const tmpVec3 = new THREE.Vector3();

const defaultState = {
  dayColor: new THREE.Color(0x0d6178),
  nightColor: new THREE.Color(0x02121e),
  daySunColor: new THREE.Color(0xfff0c7),
  nightSunColor: new THREE.Color(0x1b2638),
  alphaDay: 0.78,
  alphaNight: 0.52,
  distortionDay: 5.0,
  distortionNight: 0.82,
  speedDay: 0.07,
  speedNight: 0.024,
  waveScale: 1000,
  sunStrengthDay: 0.65,
  sunStrengthNight: 0.01,
  factor: 1,
  time: 0,
  sunSource: null,
  explicitSunDir: null,
  visible: true,
  lastCamera: null
};

// wird bei createWaterSurface überschrieben
const waterState = { ...defaultState };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function makeColor(value, fallback) {
  if (value instanceof THREE.Color) return value.clone();
  if (typeof value === 'number' || typeof value === 'string') return new THREE.Color(value);
  return fallback.clone();
}

function createLakeShapeGeometry(size, segments, options = {}) {
  const {
    seed = 1.6,
    outerRadius = size * 0.5,
    outerNoise = size * 0.1,
    outerRipple = size * 0.03,
    outerEccentricity = 0.15,
    outerOffsetX = 0,
    outerOffsetY = 0,
    innerRadius = size * 0.34,
    innerNoise = size * 0.07,
    innerBays = size * 0.05,
    shorelinePush = size * 0.05,
    shorelineFrequency = 1.35,
    innerOffsetX = 0,
    innerOffsetY = 0,
    clampOffset = 0
  } = options;

  const outerSteps = Math.max(64, segments * 2);
  const innerSteps = Math.max(48, Math.floor(outerSteps * 0.85));
  const shape = new THREE.Shape();

  for (let i = 0; i <= outerSteps; i++) {
    const angle = (i / outerSteps) * Math.PI * 2;
    const noise1 = Math.sin(angle * 1.7 + seed * 0.33);
    const noise2 = Math.cos(angle * 2.9 - seed * 0.54);
    const noise3 = Math.sin(angle * 5.1 + seed * 0.8);
    const eccentric = 1 + Math.sin(angle * 0.45 + seed * 0.21) * outerEccentricity;
    const radius = Math.max(
      innerRadius + size * 0.04,
      outerRadius + noise1 * outerNoise + noise2 * outerNoise * 0.6 + noise3 * outerRipple
    );
    const offsetX = Math.cos(angle * 0.2 - seed) * outerNoise * 0.12 + outerOffsetX;
    const offsetY = Math.sin(angle * 0.18 + seed) * outerNoise * 0.1 + outerOffsetY;
    let x = Math.cos(angle) * radius * (1 + eccentric * 0.08) + offsetX;
    let y = Math.sin(angle) * radius * (1 - eccentric * 0.06) + offsetY;
    if (clampOffset > 0) {
      const clampRadius = outerRadius * clampOffset;
      x = Math.max(-clampRadius, Math.min(clampRadius, x));
      y = Math.max(-clampRadius, Math.min(clampRadius, y));
    }
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const hole = new THREE.Path();
  for (let i = 0; i <= innerSteps; i++) {
    const angle = (i / innerSteps) * Math.PI * 2;
    const swirl = Math.sin(angle * 2.6 - seed * 0.6) * innerNoise +
      Math.cos(angle * 4.1 + seed * 0.4) * innerNoise * 0.45;
    const bay = Math.max(0, Math.sin(angle * 1.2 + seed * 0.25)) * innerBays;
    const push = Math.max(0, Math.cos(angle * shorelineFrequency - seed * 0.33)) * shorelinePush;
    let radius = Math.max(size * 0.08, innerRadius + swirl - bay - push);
    const offsetX = innerOffsetX + Math.cos(angle * 0.35 + seed) * shorelinePush * 0.12;
    const offsetY = innerOffsetY + Math.sin(angle * 0.42 - seed * 0.6) * shorelinePush * 0.1;
    let x = Math.cos(angle) * radius + offsetX;
    let y = Math.sin(angle) * radius + offsetY;
    if (clampOffset > 0) {
      const clampRadius = outerRadius * clampOffset;
      x = Math.max(-clampRadius, Math.min(clampRadius, x));
      y = Math.max(-clampRadius, Math.min(clampRadius, y));
    }
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ShapeGeometry(shape, Math.max(segments, 32));
  geometry.computeVertexNormals();
  return geometry;
}

function createProceduralWaterNormals(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);

  const amplitude = 1.35;
  const getHeight = (x, y) => {
    const nx = x / size;
    const ny = y / size;
    const wave1 = Math.sin((nx + ny * 0.3) * Math.PI * 6.0);
    const wave2 = Math.cos((ny + nx * 0.25) * Math.PI * 8.0);
    const wave3 = Math.sin((nx * 2.0 - ny) * Math.PI * 3.6);
    const wave4 = Math.cos((ny * 4.5 + nx * 1.2) * Math.PI * 2.2);
    return (wave1 * 0.4 + wave2 * 0.28 + wave3 * 0.2 + wave4 * 0.12) * amplitude;
  };

  const sample = (x, y) => {
    const ix = (x + size) % size;
    const iy = (y + size) % size;
    return getHeight(ix, iy);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = sample(x - 1, y);
      const hR = sample(x + 1, y);
      const hD = sample(x, y - 1);
      const hU = sample(x, y + 1);
      const dx = (hR - hL) * 0.5;
      const dy = (hU - hD) * 0.5;
      const normal = new THREE.Vector3(-dx, 1.0, -dy).normalize();
      const idx = (y * size + x) * 4;
      img.data[idx + 0] = (normal.x * 0.5 + 0.5) * 255;
      img.data[idx + 1] = (normal.y * 0.5 + 0.5) * 255;
      img.data[idx + 2] = (normal.z * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function disposeWaterMesh() {
  if (!waterMesh) return;
  waterMesh.parent?.remove(waterMesh);
  waterMesh.geometry?.dispose?.();
  waterMesh.material?.dispose?.();
  waterMesh = null;
}

function applyTimeOfDay() {
  if (!waterMesh) return;
  const uniforms = waterMesh.material.uniforms;
  const t = THREE.MathUtils.clamp(waterState.factor, 0, 1);

  const waterColor = waterState.nightColor.clone().lerp(waterState.dayColor, t);
  uniforms.waterColor.value.copy(waterColor);

  const sunColor = waterState.nightSunColor.clone().lerp(waterState.daySunColor, t);
  const sunStrength = THREE.MathUtils.lerp(
    waterState.sunStrengthNight,
    waterState.sunStrengthDay,
    t
  );
  uniforms.sunColor.value.copy(sunColor).multiplyScalar(sunStrength);

  const alpha = THREE.MathUtils.lerp(waterState.alphaNight, waterState.alphaDay, t);
  uniforms.alpha.value = alpha;

  uniforms.distortionScale.value = THREE.MathUtils.lerp(
    waterState.distortionNight,
    waterState.distortionDay,
    t
  );

  waterState.waveSpeed = THREE.MathUtils.lerp(waterState.speedNight, waterState.speedDay, t);
}

export function createWaterSurface(options = {}) {
  const {
    scene,
    size = 4800,
    height = 0.05,
    segments = 8,
    textureSize = 512,
    sunLight = null,
    sunDirection = null,
    waterNormals = null,
    fog = undefined,
    dayColor = waterState.dayColor,
    nightColor = waterState.nightColor,
    sunColorDay = waterState.daySunColor,
    sunColorNight = waterState.nightSunColor,
    sunStrengthDay = waterState.sunStrengthDay,
    sunStrengthNight = waterState.sunStrengthNight,
    alphaDay = waterState.alphaDay,
    alphaNight = waterState.alphaNight,
    distortionScaleDay = waterState.distortionDay,
    distortionScaleNight = waterState.distortionNight,
    speedDay = waterState.speedDay,
    speedNight = waterState.speedNight,
    waveScale = waterState.waveScale,
    visible = true,
    initialFactor = waterState.factor,
    organicShape = true,
    organicSettings = null,
    reflectionIgnore = null,
    lakeRadius = size * 0.5,
    lakeFeather = size * 0.18,
    lakeNoise = size * 0.14,
    lakeInflow = size * 0.08
  } = options;

  disposeWaterMesh();

  waterState.dayColor = makeColor(dayColor, defaultState.dayColor);
  waterState.nightColor = makeColor(nightColor, defaultState.nightColor);
  waterState.daySunColor = makeColor(sunColorDay, defaultState.daySunColor);
  waterState.nightSunColor = makeColor(sunColorNight, defaultState.nightSunColor);
  waterState.sunStrengthDay = sunStrengthDay;
  waterState.sunStrengthNight = sunStrengthNight;
  waterState.alphaDay = alphaDay;
  waterState.alphaNight = alphaNight;
  waterState.distortionDay = distortionScaleDay;
  waterState.distortionNight = distortionScaleNight;
  waterState.speedDay = speedDay;
  waterState.speedNight = speedNight;
  waterState.waveScale = waveScale;
  waterState.factor = THREE.MathUtils.clamp(initialFactor, 0, 1);
  waterState.sunSource = sunLight || null;
  waterState.explicitSunDir = sunDirection ? sunDirection.clone().normalize() : null;
  waterState.visible = visible;
  waterState.time = 0;

  const organicEnabled = organicShape !== false && (organicSettings?.enabled ?? true);
  let geometry;
  if (organicEnabled) {
    const shapeOptions = {
      seed: organicSettings?.seed ?? 1.87,
      outerRadius: organicSettings?.outerRadius ?? size * 0.5,
      outerNoise: organicSettings?.outerNoise ?? (lakeNoise ?? size * 0.14),
      outerRipple: organicSettings?.outerRipple ?? size * 0.03,
      outerEccentricity: organicSettings?.outerEccentricity ?? 0.18,
      outerOffsetX: organicSettings?.outerOffsetX ?? 0,
      outerOffsetY: organicSettings?.outerOffsetY ?? 0,
      innerRadius: organicSettings?.innerRadius ?? (lakeRadius ?? size * 0.34),
      innerNoise: organicSettings?.innerNoise ?? (lakeFeather ?? size * 0.08),
      innerBays: organicSettings?.innerBays ?? (lakeInflow ?? size * 0.04),
      shorelinePush: organicSettings?.shorelinePush ?? size * 0.05,
      shorelineFrequency: organicSettings?.shorelineFrequency ?? 1.35,
      innerOffsetX: organicSettings?.innerOffsetX ?? size * 0.03,
      innerOffsetY: organicSettings?.innerOffsetY ?? -size * 0.015,
      clampOffset: organicSettings?.clampOffset ?? 0
    };
    geometry = createLakeShapeGeometry(size, segments, shapeOptions);
  } else {
    geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  }

  const normalsTexture = waterNormals || createProceduralWaterNormals(textureSize);
  const sunDir = waterState.explicitSunDir
    ? waterState.explicitSunDir
    : waterState.sunSource
      ? waterState.sunSource.position.clone().normalize()
      : new THREE.Vector3(0.3, 0.9, -0.1).normalize();

  waterMesh = new Water(geometry, {
    textureWidth: textureSize,
    textureHeight: textureSize,
    clipBias: 0.003,
    waterNormals: normalsTexture,
    sunDirection: sunDir,
    sunColor: waterState.daySunColor.clone(),
    waterColor: waterState.dayColor.clone(),
    distortionScale: waterState.distortionDay,
    fog: fog ?? Boolean(scene?.fog)
  });

  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = height;
  waterMesh.material.uniforms.size.value = waveScale;
  waterMesh.receiveShadow = true;
  waterMesh.visible = visible;

  if (scene) {
    scene.add(waterMesh);
  }

  const ignoreTargets = reflectionIgnore
    ? (Array.isArray(reflectionIgnore) ? reflectionIgnore : [reflectionIgnore]).filter(Boolean)
    : [];
  if (ignoreTargets.length && typeof waterMesh.onBeforeRender === 'function') {
    const originalOnBeforeRender = waterMesh.onBeforeRender;
    waterMesh.onBeforeRender = function wrappedOnBeforeRender(renderer, sceneArg, cameraArg) {
      const prevStates = ignoreTargets.map((obj) => obj.visible);
      for (const obj of ignoreTargets) obj.visible = false;
      originalOnBeforeRender.call(this, renderer, sceneArg, cameraArg);
      for (let i = 0; i < ignoreTargets.length; i++) {
        if (ignoreTargets[i]) ignoreTargets[i].visible = prevStates[i];
      }
    };
  }

  applyTimeOfDay();
  return waterMesh;
}

export function updateWater(delta = 0, camera = null) {
  if (!waterMesh) return;

  if (camera) {
    waterState.lastCamera = camera;
  }
  if (waterState.lastCamera) {
    waterMesh.material.uniforms.eye.value.copy(waterState.lastCamera.position);
  }

  if (waterState.sunSource) {
    tmpVec3.copy(waterState.sunSource.position).normalize();
    waterMesh.material.uniforms.sunDirection.value.copy(tmpVec3);
  } else if (waterState.explicitSunDir) {
    waterMesh.material.uniforms.sunDirection.value.copy(waterState.explicitSunDir);
  }

  waterState.time += delta * (waterState.waveSpeed ?? defaultState.speedDay);
  waterMesh.material.uniforms.time.value = waterState.time;
}

export function setWaterTimeOfDayFactor(factor) {
  waterState.factor = THREE.MathUtils.clamp(factor, 0, 1);
  applyTimeOfDay();
}

export function setWaterVisible(visible) {
  waterState.visible = Boolean(visible);
  if (waterMesh) {
    waterMesh.visible = waterState.visible;
  }
}
