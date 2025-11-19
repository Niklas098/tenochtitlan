// src/scene/water/water2.js
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water2.js';

const loader = new THREE.TextureLoader();
let cachedNormalMap = null;

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
 * Creates a calm reflective lake surface based on Water2 and adds it to the given scene.
 * @param {THREE.Scene} scene - Active scene that should receive the water plane.
 * @param {Object} options - Optional tuning parameters for the water material.
 */
export function createWater(scene, {
  size = 10000,
  height = -1000,
  position = { x: 0, z: 0 },
  textureRepeat = 4,
  color = 0x162635,
  reflectivity = 0.12,
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

  const water = new Water(geometry, {
    color,
    reflectivity,
    textureWidth: 2048,
    textureHeight: 2048,
    scale: waveScale,
    flowDirection: resolvedFlow,
    flowSpeed,
    normalMap0: waterNormals,
    normalMap1: waterNormals,
    fog: fog ?? Boolean(scene.fog)
  });

  // Provide easy access to the custom normal map just like the legacy material API.
  if (water.material.uniforms.normalSampler) {
    water.material.uniforms.normalSampler.value = waterNormals;
  } else {
    water.material.uniforms.normalSampler = { value: waterNormals };
  }
  water.material.uniforms.tNormalMap0.value = waterNormals;
  water.material.uniforms.tNormalMap1.value = waterNormals;

  water.rotation.x = -Math.PI / 2;
  const resolvedPosition = resolvePosition(position, height);
  water.position.copy(resolvedPosition);
  water.receiveShadow = true;
  water.frustumCulled = false;
  water.name = 'HighlandLakeWater';

  scene.add(water);
  return water;
}
