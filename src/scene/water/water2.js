import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water2.js';
import { getAssetLoadingManager } from '../../util/loadingState.js';

const loader = new THREE.TextureLoader(getAssetLoadingManager());
let cachedNormalMap = null;

export const WATER_QUALITY = Object.freeze({
  ULTRA: 'ultra',
  HIGH: 'high',
  LOW: 'low',
  STATIC: 'static'
});

const VALID_WATER_QUALITIES = new Set(Object.values(WATER_QUALITY));

function configureNormalMap(texture, textureRepeat) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(textureRepeat, textureRepeat);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
}

function getWaterNormalMap(repeat) {
  if (!cachedNormalMap) {
    cachedNormalMap = loader.load('/textures/waternormals.jpg', (texture) => {
      configureNormalMap(texture, repeat);
    });
    configureNormalMap(cachedNormalMap, repeat);
  } else {
    cachedNormalMap.repeat.set(repeat, repeat);
  }
  return cachedNormalMap;
}

function resolveVector2(input, fallback) {
  if (input?.isVector2) return input.clone();
  if (Array.isArray(input)) return new THREE.Vector2(input[0] ?? fallback.x, input[1] ?? fallback.y);
  if (input && typeof input === 'object') {
    const x = input.x ?? input[0] ?? fallback.x;
    const y = input.y ?? input[1] ?? fallback.y;
    return new THREE.Vector2(x, y);
  }
  return fallback.clone();
}

function resolvePosition(input, height) {
  if (input?.isVector3) return input.clone().setY(height);
  if (input && typeof input === 'object') {
    const x = input.x ?? input[0] ?? 0;
    const z = input.z ?? input[1] ?? 0;
    return new THREE.Vector3(x, height, z);
  }
  return new THREE.Vector3(0, height, 0);
}

/**
 * Creates a water controller with multiple quality levels.
 * @param {THREE.Scene} scene
 * @param {Object} options
 */
export function createWater(scene, {
  size = 10000,
  height = -1000,
  position = { x: 0, z: 0 },
  textureRepeat = 4,
  color = 0x162635,
  reflectivity = 0.45,
  waveScale = 3.0,
  flowDirection = new THREE.Vector2(-0.18, 0.08),
  flowSpeed = 0.007,
  fog = undefined
} = {}) {
  if (!scene?.isScene) {
    throw new Error('createWater(scene) expects a valid THREE.Scene instance');
  }

  const geometry = new THREE.PlaneGeometry(size, size);
  const waterNormals = getWaterNormalMap(textureRepeat);
  const resolvedFlow = resolveVector2(flowDirection, new THREE.Vector2(-0.18, 0.08)).normalize();
  const resolvedPosition = resolvePosition(position, height);
  const fogEnabled = fog ?? Boolean(scene.fog);

  const animatedSurfaces = new Map();
  const definitions = [
    { quality: WATER_QUALITY.ULTRA, size: 2048, label: 'Ultra' },
    { quality: WATER_QUALITY.HIGH, size: 1024, label: 'High' },
    { quality: WATER_QUALITY.LOW, size: 512, label: 'Low' }
  ];

  for (const def of definitions) {
    const surface = createAnimatedWaterSurface({
      geometry,
      waterNormals,
      resolvedFlow,
      color,
      reflectivity,
      waveScale,
      flowSpeed,
      fogEnabled,
      position: resolvedPosition,
      textureSize: def.size,
      quality: def.quality,
      label: def.label
    });
    surface.visible = false;
    scene.add(surface);
    animatedSurfaces.set(def.quality, surface);
  }

  const staticSurface = createSimpleWaterPlane(size, resolvedPosition, color, waterNormals);
  staticSurface.visible = false;
  scene.add(staticSurface);

  const controller = makeWaterController({
    animatedSurfaces,
    staticSurface
  });
  controller.setQuality(WATER_QUALITY.HIGH);
  return controller;
}

function createAnimatedWaterSurface({
  geometry,
  waterNormals,
  resolvedFlow,
  color,
  reflectivity,
  waveScale,
  flowSpeed,
  fogEnabled,
  position,
  textureSize,
  quality,
  label
}) {
  const water = new Water(geometry.clone(), {
    color,
    reflectivity,
    textureWidth: textureSize,
    textureHeight: textureSize,
    scale: waveScale,
    flowDirection: resolvedFlow,
    flowSpeed,
    normalMap0: waterNormals,
    normalMap1: waterNormals,
    fog: fogEnabled
  });

  water.material.transparent = false;
  water.material.depthWrite = true;
  water.material.opacity = 1.0;
  water.material.needsUpdate = true;

  if (water.material.uniforms.normalSampler) {
    water.material.uniforms.normalSampler.value = waterNormals;
  } else {
    water.material.uniforms.normalSampler = { value: waterNormals };
  }
  water.material.uniforms.tNormalMap0.value = waterNormals;
  water.material.uniforms.tNormalMap1.value = waterNormals;

  water.rotation.x = -Math.PI / 2;
  water.position.copy(position);
  water.receiveShadow = true;
  water.frustumCulled = false;
  water.name = `HighlandLakeWater-${label}`;
  water.userData.quality = quality;
  return water;
}

function createSimpleWaterPlane(size, position, color, normalMap) {
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.35,
    metalness: 0.08
  });
  if (normalMap) {
    material.normalMap = normalMap;
    material.normalScale = new THREE.Vector2(0.45, 0.45);
  }
  material.transparent = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(position);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'HighlandLakeWater-Static';
  mesh.userData.quality = WATER_QUALITY.STATIC;
  return mesh;
}

function makeWaterController({ animatedSurfaces, staticSurface }) {
  const controller = {
    animatedSurfaces,
    staticSurface,
    mode: null,
    setPerformanceMode(enabled) {
      this.setQuality(enabled ? WATER_QUALITY.STATIC : WATER_QUALITY.ULTRA);
    },
    setQuality(mode) {
      const resolved = VALID_WATER_QUALITIES.has(mode) ? mode : WATER_QUALITY.ULTRA;
      if (resolved === this.mode) return;
      this.mode = resolved;
      animatedSurfaces.forEach((surface, quality) => {
        surface.visible = quality === resolved;
      });
      if (staticSurface) staticSurface.visible = resolved === WATER_QUALITY.STATIC;
    },
    getQuality() {
      return this.mode ?? WATER_QUALITY.ULTRA;
    },
    isPerformanceMode() {
      return this.mode === WATER_QUALITY.STATIC;
    },
    getSurface() {
      if (this.mode === WATER_QUALITY.STATIC) return staticSurface;
      return animatedSurfaces.get(this.mode) ?? animatedSurfaces.get(WATER_QUALITY.ULTRA) ?? null;
    },
    getSurfaceByQuality(mode) {
      if (mode === WATER_QUALITY.STATIC) return staticSurface;
      return animatedSurfaces.get(mode) ?? null;
    },
    getAnimatedSurfaces() {
      return Array.from(animatedSurfaces.values());
    },
    getHighQualitySurface() {
      return animatedSurfaces.get(WATER_QUALITY.ULTRA) ?? null;
    },
    getPerformanceSurface() {
      return staticSurface ?? null;
    }
  };

  animatedSurfaces.forEach((surface) => {
    surface.userData.controller = controller;
  });
  if (staticSurface) staticSurface.userData.controller = controller;

  return controller;
}
