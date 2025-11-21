// src/scene/water/water.js
// Utility helpers for shaping shoreline geometry around the city plateau.
import * as THREE from 'three';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

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
