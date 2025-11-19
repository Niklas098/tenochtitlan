// src/scene/water/water.js
import * as THREE from 'three';

const WAVE_COUNT = 8;
const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 + 1e-5));
  return t * t * (3.0 - 2.0 * t);
};
const fract = (v) => v - Math.floor(v);
const hash = (v) => fract(Math.sin(v) * 43758.5453);

const WATER_VERTEX_SHADER = /* glsl */`
#define WAVE_COUNT ${WAVE_COUNT}
precision highp float;

uniform float uTime;
uniform float uFoamTightness;
uniform float uDetailAmplitude;
uniform float uDetailFrequency;
uniform float uDetailSpeed;
uniform float uDetail2Amplitude;
uniform float uDetail2Frequency;
uniform float uDetail2Speed;
uniform float uDetailMix;
uniform float uFarDetailFade;
uniform float uFlowStrength;
uniform float uFlowSpeed;
uniform float uChoppiness;
uniform float uSwellAmplitude;
uniform float uSwellLength;
uniform float uSwellSpeed;
uniform float uRippleStrength;
uniform vec2 uShoreCenter;
uniform float uShoreRadius;
uniform float uShoreHeightBoost;
uniform float uWaveAmplitude[WAVE_COUNT];
uniform float uWaveLength[WAVE_COUNT];
uniform float uWaveSpeed[WAVE_COUNT];
uniform vec2 uWaveDirection[WAVE_COUNT];

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;
varying float vDistance;

vec3 displace(vec3 pos, out float foam)
{
  foam = 0.0;
  vec3 displaced = pos;
  float shoreDist = length(pos.xz - uShoreCenter);
  float shoreDamp = clamp(shoreDist / max(uShoreRadius, 0.001), 0.0, 1.0);
  float shoreBlend = mix(0.35, 1.0, shoreDamp);
  float choppy = mix(0.3, 1.0, shoreDamp) * uChoppiness;
  float crestPower = mix(1.0, 1.8, clamp(choppy, 0.0, 1.0));
  for (int i = 0; i < WAVE_COUNT; i++) {
    vec2 dir = normalize(uWaveDirection[i]);
    float freq = 6.2831853 / max(uWaveLength[i], 0.001);
    float phase = freq * dot(dir, pos.xz) + uWaveSpeed[i] * uTime;
    float amp = uWaveAmplitude[i] * shoreBlend;
    float s = sin(phase);
    float c = cos(phase);
    float crest = sign(s) * pow(abs(s), crestPower);
    float horizontalAmp = amp * c * (1.0 + choppy * 0.2);
    displaced.x += dir.x * horizontalAmp;
    displaced.z += dir.y * horizontalAmp;
    displaced.y += amp * mix(s, crest, clamp(choppy, 0.0, 1.0));
    foam = max(foam, pow(max(0.0, 1.0 - abs(crest)), uFoamTightness) * abs(amp));
  }

  float swellFreq = 6.2831853 / max(uSwellLength, 0.001);
  float swellPhase = swellFreq * dot(pos.xz, vec2(0.42, -0.18)) + uSwellSpeed * uTime;
  float swell = sin(swellPhase) * uSwellAmplitude * shoreBlend;
  displaced.y += swell;
  foam = max(foam, max(0.0, swell) * 0.2);

  float shoal = clamp(1.0 - shoreDist / max(uShoreRadius, 0.001), 0.0, 1.0);
  displaced.y += shoal * uShoreHeightBoost;
  foam = max(foam, shoal);

  float detailPhase = dot(pos.xz, vec2(0.58, -0.81)) * uDetailFrequency + uDetailSpeed * uTime;
  float detailPhase2 = dot(pos.xz, vec2(-0.33, 0.92)) * uDetail2Frequency + uDetail2Speed * uTime;
  float detailBlend = clamp((uFarDetailFade - shoreDist) / max(uFarDetailFade, 0.001), 0.0, 1.0);
  displaced.y += sin(detailPhase) * uDetailAmplitude * detailBlend;
  displaced.y += cos(detailPhase2) * uDetail2Amplitude * mix(1.0, detailBlend, uDetailMix);
  float rippleBlend = mix(detailBlend, 1.0, 0.25);
  float ripplePhaseA = dot(pos.xz, vec2(0.82, 0.54)) * (uDetailFrequency * 3.4) + uDetailSpeed * 1.8 * uTime;
  float ripplePhaseB = dot(pos.xz, vec2(-0.64, 0.76)) * (uDetail2Frequency * 2.1) - uDetail2Speed * 1.2 * uTime;
  float ripples = (sin(ripplePhaseA) + cos(ripplePhaseB)) * 0.5;
  displaced.y += ripples * uRippleStrength * rippleBlend;
  foam = max(foam, max(detailBlend * 0.45, rippleBlend * uRippleStrength * 0.2));

  vec2 swirl = vec2(
    sin(dot(pos.xz, vec2(0.24, -0.97)) * uFlowStrength + uFlowSpeed * uTime),
    cos(dot(pos.xz, vec2(-0.61, 0.32)) * uFlowStrength * 1.4 + uFlowSpeed * 0.8 * uTime)
  );
  displaced.xz += swirl * detailBlend;
  return displaced;
}

void main() {
  float foam;
  vec3 displaced = displace(position, foam);
  vec3 displacedX = displace(position + vec3(0.5, 0.0, 0.0), foam);
  vec3 displacedZ = displace(position + vec3(0.0, 0.0, 0.5), foam);
  vec3 normal = normalize(cross(displacedZ - displaced, displacedX - displaced));

  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vFoam = foam;
  vDistance = length(displaced.xz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const WATER_FRAGMENT_SHADER = /* glsl */`
precision highp float;

uniform vec3 waterColor;
uniform vec3 shallowColor;
uniform vec3 absorptionColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform vec3 moonColor;
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float sunSpecScale;
uniform float moonSpecScale;
uniform float sunLowGlareBoost;
uniform float fresnelStrength;
uniform float fresnelPower;
uniform float specularIntensity;
uniform float reflectionBoost;
uniform float alpha;
uniform float foamIntensity;
uniform float foamBrightness;
uniform float distanceTintStrength;
uniform float nearDistance;
uniform float farDistance;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;
varying float vDistance;

vec3 applyFoam(vec3 baseColor) {
  float foamMask = pow(clamp(vFoam * foamIntensity, 0.0, 1.0), 1.1);
  float foamFade = clamp((farDistance - vDistance) / farDistance, 0.0, 1.0);
  foamMask *= foamFade;
  return mix(baseColor, vec3(1.0), foamMask * foamBrightness);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);

  float depthMix = clamp((nearDistance - vDistance) / nearDistance, 0.0, 1.0);
  vec3 tint = mix(waterColor, shallowColor, depthMix);
  vec3 absorption = mix(vec3(1.0), absorptionColor, clamp(vDistance / farDistance, 0.0, 1.0));
  vec3 base = tint * absorption;

  vec3 sunDir = normalize(sunDirection);
  vec3 moonDir = normalize(moonDirection);
  float sunDiffuse = max(dot(N, sunDir), 0.0);
  float moonDiffuse = max(dot(N, moonDir), 0.0);
  float sunLow = clamp(1.0 - clamp(sunDir.y * 0.5 + 0.5, 0.0, 1.0), 0.0, 1.0);
  float sunGlare = 1.0 + sunLow * sunLowGlareBoost;
  float sunSpec = pow(max(dot(reflect(-sunDir, N), V), 0.0), 520.0) * sunSpecScale * sunGlare;
  float moonSpec = pow(max(dot(reflect(-moonDir, N), V), 0.0), 180.0) * moonSpecScale;

  vec3 lighting = base;
  lighting += sunColor * (sunDiffuse * 0.75 + sunSpec * specularIntensity);
  lighting += moonColor * (moonDiffuse * 0.4 + moonSpec * specularIntensity * 0.85);

  float fresnel = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), fresnelPower) * fresnelStrength;
  vec3 envReflection = mix(horizonColor, vec3(1.0), clamp(sunDiffuse * 0.5 + moonDiffuse * 0.35, 0.0, 1.0));
  envReflection += sunColor * sunSpec * specularIntensity * 0.6;
  envReflection += moonColor * moonSpec * specularIntensity * 0.4;
  float waterClarity = clamp(1.0 - vDistance / farDistance, 0.15, 1.0);
  envReflection = mix(envReflection, horizonColor, 1.0 - waterClarity);
  envReflection *= mix(0.5, 1.0, clamp(fresnel * 1.8, 0.0, 1.0));
  float reflectionMix = clamp(fresnel * reflectionBoost + sunLow * 0.35, 0.0, 1.0);
  vec3 color = mix(lighting, envReflection, reflectionMix);

  // sunset glare along horizon when sun is low
  vec2 viewXZ = normalize(V.xz + 1e-5);
  vec2 sunXZ = normalize(sunDir.xz + 1e-5);
  float alignment = pow(max(dot(viewXZ, sunXZ), 0.0), 18.0);
  float horizonBand = pow(clamp(1.0 - abs(N.y), 0.0, 1.0), 3.0);
  float sunsetGlare = sunLow * horizonBand * alignment;
  color += sunColor * sunsetGlare * 2.2;

  color = applyFoam(color);
  color = mix(color, horizonColor, distanceTintStrength * clamp(vDistance / farDistance, 0.0, 1.0));
  color = clamp(color * 1.12, 0.0, 1.0);

  gl_FragColor = vec4(color, alpha);
}`;

let waterMesh = null;
let uniforms = null;

const defaultState = {
  size: 23000,
  height: -22,
  segments: 640,
  factor: 1,
  time: 0,
  waves: [
    { amplitude: 4.5, length: 900.0, speed: 0.07, direction: new THREE.Vector2(1.0, 0.15) },
    { amplitude: 3.0, length: 560.0, speed: 0.13, direction: new THREE.Vector2(0.65, 1.0) },
    { amplitude: 2.1, length: 400.0, speed: 0.18, direction: new THREE.Vector2(-0.92, 0.72) },
    { amplitude: 1.4, length: 260.0, speed: 0.26, direction: new THREE.Vector2(0.08, -1.0) },
    { amplitude: 1.1, length: 200.0, speed: 0.34, direction: new THREE.Vector2(-0.48, -0.97) },
    { amplitude: 0.85, length: 150.0, speed: 0.45, direction: new THREE.Vector2(0.95, -0.06) },
    { amplitude: 0.56, length: 110.0, speed: 0.58, direction: new THREE.Vector2(-0.99, -0.2) },
    { amplitude: 0.32, length: 60.0, speed: 0.8, direction: new THREE.Vector2(0.52, -0.78) }
  ],
  shoreCenter: new THREE.Vector2(0, 0),
  shoreRadius: 4200,
  shoreHeightBoost: 1.2,
  detailAmplitude: 1.2,
  detailFrequency: 0.08,
  detailSpeed: 1.85,
  detail2Amplitude: 0.65,
  detail2Frequency: 0.21,
  detail2Speed: 2.6,
  detailMix: 0.6,
  farDetailFade: 5200,
  choppiness: 0.85,
  swellAmplitude: 3.4,
  swellLength: 2600,
  swellSpeed: 0.05,
  rippleStrength: 0.25,
  foamIntensity: 4.2,
  foamBrightness: 0.88,
  nearDistance: 2000,
  farDistance: 9500,
  distanceTintStrength: 0.6,
  dayColor: new THREE.Color(0x0a4f78),
  nightColor: new THREE.Color(0x020812),
  shallowColorDay: new THREE.Color(0x33bfe7),
  shallowColorNight: new THREE.Color(0x10263d),
  absorptionColorDay: new THREE.Color(0x00070c),
  absorptionColorNight: new THREE.Color(0x000102),
  horizonColorDay: new THREE.Color(0x95cff3),
  horizonColorNight: new THREE.Color(0x041023),
  sunColorDay: new THREE.Color(0xfffae5),
  sunColorNight: new THREE.Color(0xa88aff),
  moonColor: new THREE.Color(0xdfefff),
  moonDirection: new THREE.Vector3(-0.22, 0.96, 0.3).normalize(),
  sunStrengthDay: 2.1,
  sunStrengthNight: 0.18,
  moonStrengthDay: 0.35,
  moonStrengthNight: 1.2,
  fresnelStrengthDay: 3.0,
  fresnelStrengthNight: 1.1,
  fresnelPowerDay: 5.0,
  fresnelPowerNight: 3.0,
  specularIntensityDay: 2.9,
  specularIntensityNight: 1.8,
  reflectionBoost: 3.0,
  alphaDay: 1.0,
  alphaNight: 0.97,
  sunLowGlareBoost: 4.5,
  flowStrength: 0.9,
  flowSpeed: 0.8,
  sunSource: null,
  explicitSunDir: null,
  visible: true,
  lastCamera: null
};

const state = { ...defaultState };

function disposeWater() {
  if (!waterMesh) return;
  waterMesh.parent?.remove(waterMesh);
  waterMesh.geometry?.dispose?.();
  waterMesh.material?.dispose?.();
  waterMesh = null;
  uniforms = null;
}

function buildUniforms(cfg) {
  const amp = cfg.waves.map((w) => w.amplitude);
  const len = cfg.waves.map((w) => w.length);
  const speed = cfg.waves.map((w) => w.speed);
  const dir = cfg.waves.map((w) => w.direction.clone().normalize());

  return {
    uTime: { value: 0 },
    uFoamTightness: { value: 2.6 },
    uDetailAmplitude: { value: cfg.detailAmplitude },
    uDetailFrequency: { value: cfg.detailFrequency },
    uDetailSpeed: { value: cfg.detailSpeed },
    uDetail2Amplitude: { value: cfg.detail2Amplitude },
    uDetail2Frequency: { value: cfg.detail2Frequency },
    uDetail2Speed: { value: cfg.detail2Speed },
    uDetailMix: { value: cfg.detailMix },
    uFarDetailFade: { value: cfg.farDetailFade },
    uChoppiness: { value: cfg.choppiness },
    uSwellAmplitude: { value: cfg.swellAmplitude },
    uSwellLength: { value: cfg.swellLength },
    uSwellSpeed: { value: cfg.swellSpeed },
    uRippleStrength: { value: cfg.rippleStrength },
    uFlowStrength: { value: cfg.flowStrength },
    uFlowSpeed: { value: cfg.flowSpeed },
    uShoreCenter: { value: cfg.shoreCenter.clone() },
    uShoreRadius: { value: cfg.shoreRadius },
    uShoreHeightBoost: { value: cfg.shoreHeightBoost },
    uWaveAmplitude: { value: amp },
    uWaveLength: { value: len },
    uWaveSpeed: { value: speed },
    uWaveDirection: { value: dir },
    waterColor: { value: cfg.nightColor.clone() },
    shallowColor: { value: cfg.shallowColorNight.clone() },
    absorptionColor: { value: cfg.absorptionColorNight.clone() },
    horizonColor: { value: cfg.horizonColorNight.clone() },
    sunColor: { value: cfg.sunColorNight.clone() },
    moonColor: { value: cfg.moonColor.clone() },
    sunDirection: { value: new THREE.Vector3(0.3, 0.9, -0.3).normalize() },
    moonDirection: { value: cfg.moonDirection.clone() },
    sunSpecScale: { value: cfg.sunStrengthNight },
    moonSpecScale: { value: cfg.moonStrengthNight },
    sunLowGlareBoost: { value: cfg.sunLowGlareBoost },
    fresnelStrength: { value: cfg.fresnelStrengthNight },
    fresnelPower: { value: cfg.fresnelPowerNight },
    specularIntensity: { value: cfg.specularIntensityNight },
    reflectionBoost: { value: cfg.reflectionBoost },
    foamIntensity: { value: cfg.foamIntensity },
    foamBrightness: { value: cfg.foamBrightness },
    distanceTintStrength: { value: cfg.distanceTintStrength },
    nearDistance: { value: cfg.nearDistance },
    farDistance: { value: cfg.farDistance },
    alpha: { value: cfg.alphaNight }
  };
}

export function createWaterSurface(options = {}) {
  disposeWater();
  const cfg = { ...defaultState, ...options };
  cfg.waves = (options.waves ?? defaultState.waves).map((w) => ({
    amplitude: w.amplitude,
    length: w.length,
    speed: w.speed,
    direction: w.direction.clone()
  }));
  Object.assign(state, cfg);
  state.sunSource = options.sunLight ?? cfg.sunSource ?? null;
  state.explicitSunDir = options.sunDirection
    ? options.sunDirection.clone()
    : cfg.explicitSunDir
      ? cfg.explicitSunDir.clone()
      : null;
  state.factor = THREE.MathUtils.clamp(cfg.initialFactor ?? state.factor, 0, 1);
  state.time = 0;

  const geometry = new THREE.PlaneGeometry(state.size, state.size, state.segments, state.segments);
  geometry.rotateX(-Math.PI / 2);
  uniforms = buildUniforms(state);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false
  });
  waterMesh = new THREE.Mesh(geometry, material);
  waterMesh.position.y = state.height;
  waterMesh.receiveShadow = true;
  waterMesh.visible = state.visible;
  if (cfg.scene) cfg.scene.add(waterMesh);
  applyTimeOfDay();
  return waterMesh;
}

export function updateWater(delta = 0, camera = null) {
  if (!waterMesh || !uniforms) return;
  state.time += delta;
  uniforms.uTime.value = state.time;
  if (camera) state.lastCamera = camera;
  if (state.sunSource) {
    uniforms.sunDirection.value.copy(state.sunSource.position).normalize();
  } else if (state.explicitSunDir) {
    uniforms.sunDirection.value.copy(state.explicitSunDir);
  }
  uniforms.moonDirection.value.copy(state.moonDirection).normalize();
}

function applyTimeOfDay() {
  if (!uniforms) return;
  const t = THREE.MathUtils.clamp(state.factor, 0, 1);
  uniforms.waterColor.value.copy(state.nightColor.clone().lerp(state.dayColor, t));
  uniforms.shallowColor.value.copy(state.shallowColorNight.clone().lerp(state.shallowColorDay, t));
  uniforms.absorptionColor.value.copy(state.absorptionColorNight.clone().lerp(state.absorptionColorDay, t));
  uniforms.horizonColor.value.copy(state.horizonColorNight.clone().lerp(state.horizonColorDay, t));
  const sunStrength = THREE.MathUtils.lerp(state.sunStrengthNight, state.sunStrengthDay, t);
  uniforms.sunColor.value.copy(state.sunColorNight.clone().lerp(state.sunColorDay, t).multiplyScalar(sunStrength));
  uniforms.sunSpecScale.value = sunStrength;
  const moonStrength = THREE.MathUtils.lerp(state.moonStrengthDay, state.moonStrengthNight, t);
  uniforms.moonColor.value.copy(state.moonColor.clone().multiplyScalar(moonStrength));
  uniforms.moonSpecScale.value = moonStrength;
  uniforms.fresnelStrength.value = THREE.MathUtils.lerp(state.fresnelStrengthNight, state.fresnelStrengthDay, t);
  uniforms.fresnelPower.value = THREE.MathUtils.lerp(state.fresnelPowerNight, state.fresnelPowerDay, t);
  uniforms.specularIntensity.value = THREE.MathUtils.lerp(state.specularIntensityNight, state.specularIntensityDay, t);
  uniforms.alpha.value = THREE.MathUtils.lerp(state.alphaNight, state.alphaDay, t);
}

export function setWaterTimeOfDayFactor(factor) {
  state.factor = THREE.MathUtils.clamp(factor, 0, 1);
  applyTimeOfDay();
}

export function setWaterVisible(visible) {
  state.visible = Boolean(visible);
  if (waterMesh) waterMesh.visible = state.visible;
}

export function createShoreHeatSampler({
  centerX = 0,
  centerZ = 0,
  radius = 1600,
  feather = 520,
  noise = 420,
  inflow = 260,
  clampRadius = Infinity,
  seed = 1.37,
  organic = null
} = {}) {
  const dirNoiseFreq = 3.1 / Math.max(radius, 1);
  const radialFreq = 0.002 / Math.max(radius, 1);
  const seedA = seed * 37.19;
  const seedB = seed * 51.73;
  const organicDefaults = organic
    ? {
        shorelinePush: radius * 0.18,
        shorelineFrequency: 1.4,
        bayFrequency: 3.2,
        outerNoise: radius * 0.05,
        outerRipple: radius * 0.03,
        outerEccentricity: 0.0,
        innerNoise: radius * 0.04,
        innerBays: radius * 0.06,
        innerRadius: radius * 0.65,
        innerOffsetX: 0,
        innerOffsetY: 0
      }
    : null;
  const organicSettings = organic
    ? { ...organicDefaults, ...organic }
    : null;

  const sample = (x, z) => {
    const vx = x - centerX;
    const vz = z - centerZ;
    const rawDist = Math.sqrt(vx * vx + vz * vz);
    const angle = Math.atan2(vz, vx);
    const dirNoise =
      Math.sin(angle * dirNoiseFreq * 12.0 + seedA) * noise * 0.6 +
      Math.cos(angle * dirNoiseFreq * 8.0 - seedB) * noise * 0.4;
    const radialWarp =
      Math.sin(rawDist * radialFreq * 11.0 + seedA * 0.5) * inflow * 0.5 +
      Math.cos(rawDist * radialFreq * 5.0 - seedB * 0.65) * inflow * 0.5;
    let dist = rawDist + dirNoise + radialWarp;
    dist = Math.min(dist, clampRadius);
    let targetRadius = radius;

    if (organicSettings) {
      const freq = organicSettings.shorelineFrequency ?? 1.0;
      const push = organicSettings.shorelinePush ?? 0;
      const outerNoise = organicSettings.outerNoise ?? 0;
      const outerRipple = organicSettings.outerRipple ?? 0;
      const ecc = organicSettings.outerEccentricity ?? 0;
      const bays = organicSettings.innerBays ?? 0;
      const innerNoise = organicSettings.innerNoise ?? 0;
      const innerRadius = Math.max(1e-5, organicSettings.innerRadius ?? radius * 0.6);
      const bayFreq = organicSettings.bayFrequency ?? freq * 2.8 + 2.0;
      const innerCenterX = centerX + (organicSettings.innerOffsetX ?? 0);
      const innerCenterZ = centerZ + (organicSettings.innerOffsetY ?? 0);

      const eccWave = 1 + Math.cos(angle * 2.0 + seedA * 0.13) * ecc;
      targetRadius *= eccWave;
      targetRadius += Math.sin(angle * (freq + 0.35) + seedB * 0.31) * push;
      targetRadius += Math.cos(angle * (freq * 1.8 + 2.1) - seedA * 0.27) * outerRipple;
      targetRadius += Math.sin(angle * (freq * 3.4 + 4.8) + seedB * 0.71) * outerNoise;

      const ivx = x - innerCenterX;
      const ivz = z - innerCenterZ;
      const innerDist = Math.sqrt(ivx * ivx + ivz * ivz);
      const innerAngle = Math.atan2(ivz, ivx);
      const bayWave =
        Math.sin(innerAngle * bayFreq + seedB * 0.59) +
        Math.cos(innerAngle * (bayFreq * 0.7 + 1.8) - seedA * 0.38);
      const bayMask = clamp01(innerDist / innerRadius);
      targetRadius -= bayWave * bays * bayMask;
      targetRadius += innerNoise * bayMask * Math.sin(innerAngle * (bayFreq * 1.35 + 0.4) + seedA * 0.82);
      const minRadius = radius * 0.22;
      const maxRadius = radius * 2.6;
      targetRadius = Math.max(minRadius, Math.min(targetRadius, maxRadius));
    }

    const shoreline = clamp01((targetRadius + feather - dist) / feather);
    const water = clamp01((targetRadius - dist + feather * 0.5) / (feather * 0.5 + 1e-5));
    const outside = clamp01((dist - targetRadius) / (feather + 1e-5));
    return {
      dist,
      rawDist,
      targetRadius,
      shoreline,
      water,
      outside,
      angle
    };
  };

  return {
    sample,
    center: new THREE.Vector2(centerX, centerZ),
    radius,
    feather
  };
}

export function sculptGroundWithShoreHeatmap(
  geometry,
  shoreSampler,
  {
    rimHeight = 8.0,
    rimExponent = 1.2,
    rimRipple = 0.35,
    depth = 26.0,
    depthExponent = 0.85,
    underwaterShelf = 0.28
  } = {}
) {
  if (!geometry?.attributes?.position || !shoreSampler?.sample) return;
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const sample = shoreSampler.sample(x, z);
    const rimMask = Math.pow(sample.shoreline, rimExponent);
    const ripple = Math.sin(sample.angle * 6.0 + sample.dist * 0.0015) * rimRipple * rimMask;
    const depthMask = Math.pow(sample.water, depthExponent);
    const shelf = Math.sin(clamp01(sample.water) * Math.PI * 0.5) * underwaterShelf * rimHeight;

    let y = pos.getY(i);
    y += rimHeight * rimMask + ripple;
    y -= depth * depthMask;
    y += shelf * depthMask;
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}
