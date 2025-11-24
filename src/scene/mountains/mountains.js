import * as THREE from 'three';

/** Lightweight Perlin-style noise used when no external library is present. */
const simpleNoise = (function() {
  const p = new Uint8Array(512);
  const permutation = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  for (let i = 0; i < 256; i++) p[256 + i] = p[i] = permutation[i];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(t, a, b) { return a + t * (b - a); }
  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  return function(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
        lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))
      ),
      lerp(
        v,
        lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  };
})();

const DEFAULTS = {
  innerRadius: 4200,
  outerRadius: 10200,
  thetaSegments: 640,
  phiSegments: 160,
  maxHeight: 4200,
  noiseScale: 0.00028,
  biomeNoiseScale: 0.00045,
  edgeFadeLength: 1800,
  baseOffset: -200,
  snowLine: 0.6,
  snowFeather: 0.18,
  snowNoise: 0.14,
  seed: Math.random() * 100
};

const PALETTE = {
  shore: new THREE.Color(0x2c2723),
  grassWarm: new THREE.Color(0x4f6b3a),
  grassDry: new THREE.Color(0x7d7448),
  rockWarm: new THREE.Color(0x5d544f),
  rockCool: new THREE.Color(0x6c747b),
  peakSnow: new THREE.Color(0xf6f8fb)
};

/**
 * Creates a low-poly mountain ring that surrounds the island and lake.
 * @param {THREE.Scene} scene
 * @param {Object} [options]
 */
export function createMountains(scene, options = {}) {
  if (!scene?.isScene) {
    throw new Error('createMountains(scene) expects a valid THREE.Scene instance');
  }

  const config = { ...DEFAULTS, ...options };

  const geometry = new THREE.RingGeometry(
    config.innerRadius,
    config.outerRadius,
    config.thetaSegments,
    config.phiSegments
  );
  geometry.rotateX(-Math.PI / 2);

  const uvAttribute = geometry.attributes.uv;
  for (let i = 0; i < uvAttribute.count; i++) {
    const u = uvAttribute.getX(i);
    const v = uvAttribute.getY(i);
    uvAttribute.setXY(i, u * 80, v * 20);
  }

  const posAttribute = geometry.attributes.position;
  const vertexCount = posAttribute.count;
  const colors = new Float32Array(vertexCount * 3);
  const color = new THREE.Color();

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttribute.getX(i);
    const z = posAttribute.getZ(i);

    const hSample = sampleHeight(x, z, config);
    const height = hSample.height;
    const normalizedHeight = hSample.normalized;
    const biomeNoise = hSample.biomeNoise;
    const slope = hSample.mask > 0.0001 ? sampleSlope(x, z, config, height) : 0;

    posAttribute.setY(i, height + config.baseOffset);

    const snowNoise = simpleNoise((x + config.seed) * 0.0016, 800, (z - config.seed) * 0.0016);
    const snowMix = THREE.MathUtils.smoothstep(
      normalizedHeight + slope * 0.22 + snowNoise * config.snowNoise,
      config.snowLine,
      config.snowLine + config.snowFeather
    );

    const alpineMix = THREE.MathUtils.clamp((normalizedHeight - 0.18) * 1.45 + biomeNoise * 0.3, 0, 1);
    const rockMix = THREE.MathUtils.clamp((normalizedHeight - 0.48) * 1.8 + slope * 0.75, 0, 1);

    color.copy(PALETTE.grassWarm).lerp(PALETTE.grassDry, alpineMix * 0.6 + biomeNoise * 0.2);

    const rock = PALETTE.rockWarm.clone().lerp(PALETTE.rockCool, 0.35 + biomeNoise * 0.25 + slope * 0.2);
    color.lerp(rock, rockMix);
    color.lerp(PALETTE.peakSnow, snowMix);

    const tint = (biomeNoise * 0.5 + 0.5) * 0.06 - 0.03;
    color.offsetHSL(0, 0, tint);

    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  posAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const texture = createDetailTexture();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: texture,
    roughness: 0.88,
    metalness: 0.06,
    side: THREE.DoubleSide,
    flatShading: false,
    fog: true
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TenochtitlanMountains';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, config.baseOffset),
    config.outerRadius + config.maxHeight
  );

  scene.add(mesh);
  return mesh;
}

function sampleHeight(x, z, config) {
  const dist = Math.sqrt(x * x + z * z);
  const innerRamp = THREE.MathUtils.smoothstep(dist, config.innerRadius, config.innerRadius + config.edgeFadeLength);
  const outerRamp = 1 - THREE.MathUtils.smoothstep(dist, config.outerRadius - config.edgeFadeLength, config.outerRadius);
  const mask = Math.max(0, innerRamp * outerRamp);
  if (mask <= 0) {
    return { height: 0, normalized: 0, biomeNoise: 0, mask: 0 };
  }

  const nx = x * config.noiseScale + config.seed;
  const nz = z * config.noiseScale + config.seed;

  const macro = simpleNoise(nx * 0.35, 50, nz * 0.35) * 0.2;
  const base = simpleNoise(nx, 0, nz);
  const ridges = Math.abs(simpleNoise(nx * 1.9, 100, nz * 1.9));
  const detail = simpleNoise(nx * 4.5, 200, nz * 4.5);
  const micro = simpleNoise(nx * 10.5, 300, nz * 10.5);

  const combined = base * 0.52 + ridges * 0.38 + detail * 0.08 + micro * 0.02 + macro;
  const rawHeight = Math.max(0, combined + 0.16);
  const height = Math.pow(rawHeight, 2.2) * config.maxHeight * mask;

  const biomeNoise = simpleNoise(
    (x + config.seed * 123.4) * config.biomeNoiseScale,
    500,
    (z - config.seed * 456.7) * config.biomeNoiseScale
  );

  const normalized = THREE.MathUtils.clamp(height / config.maxHeight, 0, 1);
  return { height, normalized, biomeNoise, mask };
}

function sampleSlope(x, z, config, baseHeight) {
  const d = 14;
  const hx = sampleHeight(x + d, z, config).height;
  const hz = sampleHeight(x, z + d, config).height;
  const dx = hx - baseHeight;
  const dz = hz - baseHeight;
  const gradient = Math.sqrt(dx * dx + dz * dz) / d;
  return THREE.MathUtils.clamp(gradient * 0.35, 0, 1);
}

function createDetailTexture() {
  if (typeof document === 'undefined') return null;
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#7a746b';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % size;
    const y = Math.floor((i / 4) / size);

    const grain = (Math.random() - 0.5) * 36;
    const strata = Math.sin(x * 0.024 + y * 0.032) * 22 + Math.cos(y * 0.018) * 14;
    const blotch = Math.sin(x * 0.012) * Math.cos(y * 0.011) * 28;

    const val = 128 + grain + strata * 0.35 + blotch * 0.25;
    data[i] = val + 6;
    data[i + 1] = val - 2;
    data[i + 2] = val - 8;
    data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
