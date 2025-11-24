import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createHitboxForGLB } from '../../util/collision.js';
import {
  createShoreHeatSampler,
  sculptGroundWithShoreHeatmap
} from '../water/water.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Adds a thin wireframe helper around a geometry for debugging.
 * @param {THREE.Scene} scene
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [opacity=0.18]
 * @param {number} [color=0x00ffff]
 * @returns {THREE.LineSegments}
 */
function addWireframeHelperForGeometry(scene, geometry, opacity = 0.18, color = 0x00ffff) {
  const wireGeo = new THREE.WireframeGeometry(geometry);
  const wireMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const wire = new THREE.LineSegments(wireGeo, wireMat);
  scene.add(wire);
  return wire;
}

/**
 * Applies small-scale noise to ground geometry for subtle variation.
 * @param {THREE.BufferGeometry} geo
 * @param {number} [amount=0.12]
 * @param {number} [scale=0.0035]
 */
function displaceGroundGeometry(geo, amount = 0.12, scale = 0.0035) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h =
      Math.sin(x * scale) * Math.cos(z * scale) * amount +
      Math.sin((x + z) * scale * 0.71) * amount * 0.35;
    pos.setY(i, pos.getY(i) + h);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Sculpts a natural bowl shape into the terrain using concentric falloffs and noise.
 * @param {THREE.BufferGeometry} geo
 * @param {number} size
 * @param {Object} [options]
 */
function sculptGroundBasin(geo, size, options = {}) {
  if (!geo?.attributes?.position) return;

  const {
    plateauRadius = 0.63,
    dropRadius = 1.1,
    edgeDrop = 140,
    slopeExponent = 1.15,
    noiseAmplitude = 0.5,
    noiseFrequency = 0.002,
    angularNoiseAmplitude = 0.12,
    angularNoiseFrequency = 3.5,
    ridgeNoiseAmplitude = 0.1,
    ridgeNoiseFrequency = 4.5,
    seed = 2.6
  } = options;

  const pos = geo.attributes.position;
  const halfSize = size * 0.5;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const baseY = pos.getY(i);
    const angle = Math.atan2(z, x);
    const radius = Math.sqrt(x * x + z * z);

    const angularNoise =
      Math.sin(angle * angularNoiseFrequency + seed * 0.73) *
        angularNoiseAmplitude * halfSize +
      Math.cos(angle * (angularNoiseFrequency * 0.7) - seed * 1.1) *
        angularNoiseAmplitude * 0.8 * halfSize;

    const plateauLocal = plateauRadius * halfSize + angularNoise * 0.35;
    const dropLocal = dropRadius * halfSize + angularNoise;

    if (radius <= plateauLocal) continue;

    const falloff = clamp01((radius - plateauLocal) / Math.max(1e-5, dropLocal - plateauLocal));
    const smoothFalloff = falloff * falloff * (3 - 2 * falloff);
    const slope = Math.pow(smoothFalloff, slopeExponent);

    const drop = edgeDrop * slope;

    const baseNoiseVal =
      (Math.sin((x + z) * noiseFrequency + seed * 0.5) +
        Math.cos((x - z) * noiseFrequency * 1.37 - seed * 0.82) * 0.5) *
      noiseAmplitude * slope;

    const ridge =
      Math.sin(angle * ridgeNoiseFrequency + seed * 1.3) *
      ridgeNoiseAmplitude *
      (1.0 - smoothFalloff) *
      10.0;

    pos.setY(i, baseY - drop - baseNoiseVal - ridge);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Flattens the center area for the city plateau with a smooth blend region.
 * @param {THREE.BufferGeometry} geo
 * @param {number} size
 * @param {{radius?:number, blend?:number, height?:number}} [options]
 */
function flattenInnerPlateau(geo, size, options = {}) {
  const { radius = 0.58, blend = 0.12, height = 0 } = options;
  const pos = geo.attributes.position;
  const halfSize = size * 0.5;
  const flatRadius = radius * halfSize;
  const blendDist = Math.max(1e-5, blend * halfSize);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);

    if (r <= flatRadius) {
      pos.setY(i, height);
      continue;
    }

    if (r < flatRadius + blendDist) {
      const t = (r - flatRadius) / blendDist;
      const smooth = t * t * (3 - 2 * t);
      const old = pos.getY(i);
      const blended = height + (old - height) * smooth;
      pos.setY(i, blended);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function buildCity(scene, {
  groundSize = 5200,
  groundRepeat = 500,
  water = {}
} = {}) {

  let shorelineSampler = null;
  let waterOptions = null;

  if (water !== false) {
    const waterSize = groundSize * 6;

    const organicDefault = {
      seed: 4.1,
      outerRadius: waterSize * 0.55,
      outerNoise: groundSize * 0.38,
      outerRipple: groundSize * 0.12,
      outerEccentricity: 0.28,
      outerOffsetX: groundSize * 0.12,
      outerOffsetY: -groundSize * 0.05,
      innerRadius: groundSize * 0.32,
      innerNoise: groundSize * 0.25,
      innerBays: groundSize * 0.22,
      shorelinePush: groundSize * 0.34,
      shorelineFrequency: 1.8,
      innerOffsetX: groundSize * 0.11,
      innerOffsetY: -groundSize * 0.03,
      clampOffset: 1.2
    };

    waterOptions = {
      scene,
      size: waterSize,
      height: -120,
      segments: 96,
      sunLight: null,
      lakeRadius: groundSize * 0.42,
      lakeFeather: groundSize * 0.35,
      lakeNoise: groundSize * 0.55,
      lakeInflow: groundSize * 0.26,
      organicSettings: { ...organicDefault }
    };

    shorelineSampler = createShoreHeatSampler({
      centerX: organicDefault.outerOffsetX,
      centerZ: -organicDefault.outerOffsetY,
      radius: waterOptions.lakeRadius,
      feather: waterOptions.lakeFeather,
      noise: waterOptions.lakeNoise,
      inflow: waterOptions.lakeInflow,
      clampRadius: waterOptions.size * 0.5 * organicDefault.clampOffset,
      seed: organicDefault.seed
    });

    waterOptions.shoreSampler = shorelineSampler;
  }

  const seg = 256;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, seg, seg);
  groundGeo.rotateX(-Math.PI / 2);

  displaceGroundGeometry(groundGeo, 0.08, 0.003);
  sculptGroundBasin(groundGeo, groundSize, {
    plateauRadius: 0.7,
    dropRadius: 0.96,
    edgeDrop: 280,
    slopeExponent: 1.28,
    noiseAmplitude: 0.58,
    noiseFrequency: 0.002,
    angularNoiseAmplitude: 0.12,
    angularNoiseFrequency: 4.3,
    ridgeNoiseAmplitude: 0.2,
    ridgeNoiseFrequency: 1.5,
    seed: 2.6
  });

  if (shorelineSampler) {
    sculptGroundWithShoreHeatmap(groundGeo, shorelineSampler, {
      rimHeight: 18,
      rimExponent: 1.0,
      rimRipple: 0.42,
      depth: 38,
      depthExponent: 0.65,
      underwaterShelf: 0.42
    });
  }

  flattenInnerPlateau(groundGeo, groundSize, {
    radius: 0.58,
    blend: 0.12,
    height: 0
  });

  const textureLoader = new THREE.TextureLoader();
  const base = '/textures/ground/sandy_gravel_02_';

  const wrapAndRepeat = (tex, { srgb = false } = {}) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(groundRepeat, groundRepeat);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  };

  const colorMap = wrapAndRepeat(textureLoader.load(`${base}diff_2k.jpg`), { srgb: true });
  const groundMat = new THREE.MeshStandardMaterial({
    map: colorMap,
    roughness: 1.0,
    metalness: 0.0
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
}

const gltfLoader = new GLTFLoader();
const gltfCache = new Map();

const fetchGLTF = (url) => {
  if (!gltfCache.has(url)) {
    gltfCache.set(
      url,
      new Promise((resolve, reject) => {
        gltfLoader.load(url, resolve, undefined, reject);
      })
    );
  }
  return gltfCache.get(url);
};

export function loadGLB(
  scene,
  {
    url = null,
    position = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0 },
    scale = 0.002,
    castShadow = true,
    receiveShadow = true,
    lowerBy = 0.35,
    showWireframe = false,
    hitboxOptions = null,
    onLoaded = null
  } = {}
) {
  fetchGLTF(url)
    .then((gltf) => {
      const model = SkeletonUtils.clone(gltf.scene);

      model.position.set(position.x, position.y, position.z);
      model.rotation.set(rotation.x, rotation.y, rotation.z);
      if (typeof scale === 'number') model.scale.setScalar(scale);
      else model.scale.set(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = castShadow;
          child.receiveShadow = receiveShadow;
        }
      });

      scene.add(model);

      let box = new THREE.Box3().setFromObject(model);
      const dy = -box.min.y;
      if (Math.abs(dy) > 1e-4) model.position.y += dy;
      model.position.y -= lowerBy;

      if (showWireframe) {
        model.traverse((child) => {
          if (child.isMesh && child.geometry) {
            addWireframeHelperForGeometry(scene, child.geometry, 0.2, 0xff8800);
          }
        });
      }

      createHitboxForGLB(scene, model, hitboxOptions || undefined);
      if (onLoaded) onLoaded(model, gltf);
    })
    .catch((err) => {
      console.error(`Failed to load GLB ${url}`, err);
    });
}

export function updateCity() {}
