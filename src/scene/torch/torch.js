// src/scene/torch/torch.js
import * as THREE from 'three';

const DEFAULT_OFFSET = new THREE.Vector3(0.38, -0.38, -0.75);
const DEFAULT_ROTATION = new THREE.Euler(-0.35, 0.35, 0.08, 'XYZ');

const torchConfig = {
  baseIntensity: 6.0,
  flickerStrength: 0.9,
  lightDistance: 35,
  lightDecay: 1.4,
  lightOffset: new THREE.Vector3(0.01, 0.40, -0.11),
  shadowBias: -0.0005,
  shadowNormalBias: 0.03,
  shadowCameraFar: 60
};

const COLOR_DIM = new THREE.Color(0xff7a1a);
const COLOR_BRIGHT = new THREE.Color(0xfff4c6);
const _colorScratch = new THREE.Color();

let torchRoot = null;
let torchAnchor = null;
let torchLight = null;
let torchGlowLight = null;
let flameLayers = [];
let emberMesh = null;
let headMesh = null;
let targetCamera = null;
let flickerTime = 0;

const torchState = {
  isNight: false,
  egoActive: false
};

// ------------------------------------------------------
// PUBLIC
// ------------------------------------------------------
export function createTorchForCamera(camera, options = {}) {
  if (!camera || !options.scene) return null;

  targetCamera = camera;

  if (torchRoot && torchRoot.parent) {
    torchRoot.parent.remove(torchRoot);
  }

  torchRoot = new THREE.Group();
  torchRoot.name = 'EgoTorchRig';
  torchRoot.visible = false;

  torchAnchor = new THREE.Group();
  torchAnchor.position.set(
    options.offset?.x ?? DEFAULT_OFFSET.x,
    options.offset?.y ?? DEFAULT_OFFSET.y,
    options.offset?.z ?? DEFAULT_OFFSET.z
  );
  torchAnchor.rotation.set(
    options.rotation?.x ?? DEFAULT_ROTATION.x,
    options.rotation?.y ?? DEFAULT_ROTATION.y,
    options.rotation?.z ?? DEFAULT_ROTATION.z
  );
  torchAnchor.userData.basePosition = torchAnchor.position.clone();
  torchRoot.add(torchAnchor);

  options.scene.add(torchRoot);

  buildTorchModel();

  torchConfig.baseIntensity = options.intensity ?? torchConfig.baseIntensity;
  torchConfig.lightDistance = options.lightDistance ?? torchConfig.lightDistance;
  torchConfig.lightDecay = options.lightDecay ?? torchConfig.lightDecay;

  syncWithCamera();
  return torchRoot;
}

export function updateTorch(delta = 0) {
  if (!torchRoot || !targetCamera) return;

  syncWithCamera();

  const active = torchState.isNight && torchState.egoActive;
  torchRoot.visible = active;

  if (!torchLight) return;

  flickerTime += delta;

  const slow = Math.sin(flickerTime * 2.1) * 0.35;
  const fast = Math.sin(flickerTime * 9.0 + 0.7) * 0.2;
  const noise = (Math.random() - 0.5) * 0.18;
  const flickerFactor = 1 + (slow + fast + noise) * torchConfig.flickerStrength;

  const targetIntensity = active
    ? torchConfig.baseIntensity * THREE.MathUtils.clamp(flickerFactor, 0.6, 1.3)
    : 0;

  torchLight.intensity = THREE.MathUtils.lerp(
    torchLight.intensity,
    targetIntensity,
    1 - Math.exp(-Math.max(delta, 0.0001) * (active ? 8 : 14))
  );

  const intensityNorm = THREE.MathUtils.clamp(
    (torchLight.intensity || 0) / (torchConfig.baseIntensity || 1),
    0,
    1.2
  );

  // leichte Handbewegung
  if (torchAnchor && torchAnchor.userData.basePosition) {
    const base = torchAnchor.userData.basePosition;
    const bobX = Math.sin(flickerTime * 1.1) * 0.008;
    const bobY = Math.sin(flickerTime * 2.0 + 0.6) * 0.01;
    const bobZ = Math.sin(flickerTime * 0.8 + 1.1) * 0.008;
    torchAnchor.position.set(
      base.x + (active ? bobX : 0),
      base.y + (active ? bobY : 0),
      base.z + (active ? bobZ : 0)
    );
  }

  if (active) {
    torchLight.position.set(
      torchConfig.lightOffset.x,
      torchConfig.lightOffset.y + slow * 0.02,
      torchConfig.lightOffset.z
    );
  }

  _colorScratch.copy(COLOR_DIM).lerp(COLOR_BRIGHT, Math.min(1, intensityNorm));
  torchLight.color.copy(_colorScratch);

  if (torchGlowLight) {
    torchGlowLight.color.copy(_colorScratch);
    const glowTarget = active ? intensityNorm * 1.8 : 0;
    torchGlowLight.intensity = THREE.MathUtils.lerp(
      torchGlowLight.intensity || 0,
      glowTarget,
      0.25
    );
  }

  if (flameLayers.length) {
    for (const layer of flameLayers) {
      const stretchT = (Math.sin(flickerTime * layer.stretchSpeed + layer.phase) + 1) * 0.5;
      const squashT = (Math.sin(flickerTime * layer.squashSpeed + layer.phase * 1.3) + 1) * 0.5;
      const tiltT = (Math.sin(flickerTime * layer.wobbleSpeed + layer.phase * 0.7) + 1) * 0.5;

      const stretch = THREE.MathUtils.lerp(layer.stretchRange[0], layer.stretchRange[1], stretchT);
      const squash = THREE.MathUtils.lerp(layer.squashRange[0], layer.squashRange[1], squashT);
      const sx = layer.baseScale.x * squash * (0.9 + intensityNorm * 0.2);
      const sy = layer.baseScale.y * stretch * (0.9 + intensityNorm * 0.25);

      layer.sprite.scale.set(sx, sy, 1);
      layer.sprite.material.opacity = THREE.MathUtils.lerp(layer.opacityRange[0], layer.opacityRange[1], Math.min(1, intensityNorm + 0.1));
      const tilt = THREE.MathUtils.lerp(-layer.tiltRange, layer.tiltRange, tiltT);
      const twist = Math.sin(flickerTime * layer.twistSpeed + layer.phase) * layer.twistAmount;
      layer.sprite.material.rotation = layer.baseRotation + tilt + twist;
    }
  }

  if (emberMesh) {
    const emberPulse = 1 + Math.sin(flickerTime * 5.0) * 0.05;
    emberMesh.scale.setScalar(0.9 * emberPulse + intensityNorm * 0.2);
    emberMesh.material.opacity = 0.45 + intensityNorm * 0.3;
  }

  if (headMesh) {
    headMesh.material.emissiveIntensity = 0.12 + intensityNorm * 0.25;
  }
}

export function setTorchNightMode(isNight) {
  torchState.isNight = !!isNight;
}
export function setTorchEgoActive(isEgoMode) {
  torchState.egoActive = !!isEgoMode;
}

// ------------------------------------------------------
// INTERNALS
// ------------------------------------------------------
function syncWithCamera() {
  targetCamera.updateMatrixWorld?.();
  torchRoot.position.setFromMatrixPosition(targetCamera.matrixWorld);
  torchRoot.quaternion.setFromRotationMatrix(targetCamera.matrixWorld);
  torchRoot.updateMatrixWorld(true);
}

function buildTorchModel() {
  // Bündel aus Holzlatten
  const woodGroup = new THREE.Group();
  const plankMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b2c15,
    roughness: 0.85,
    metalness: 0.05
  });
  for (let i = 0; i < 5; i++) {
    const plankGeo = new THREE.BoxGeometry(0.08, 0.72, 0.05);
    plankGeo.translate(0, -0.08, 0);
    const plank = new THREE.Mesh(plankGeo, plankMaterial.clone());
    const angle = (i / 5) * Math.PI * 2;
    plank.position.set(Math.sin(angle) * 0.04, -0.05 + Math.random() * 0.02, Math.cos(angle) * 0.035);
    plank.rotation.y = angle * 0.4;
    plank.rotation.z = (Math.random() - 0.5) * 0.12;
    plank.castShadow = false;
    plank.receiveShadow = false;
    woodGroup.add(plank);
  }
  torchAnchor.add(woodGroup);

  // Seil-Ring
  const ropeMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.65,
    metalness: 0.05
  });
  const ropeGeo = new THREE.TorusGeometry(0.09, 0.012, 10, 32);
  ropeGeo.rotateX(Math.PI / 2);
  const lowerRope = new THREE.Mesh(ropeGeo, ropeMaterial);
  lowerRope.position.y = -0.04;
  torchAnchor.add(lowerRope);
  const upperRope = lowerRope.clone();
  upperRope.position.y = 0.04;
  torchAnchor.add(upperRope);

  // Kopf/Kragen
  const headGeo = new THREE.CylinderGeometry(0.06, 0.085, 0.16, 12);
  headGeo.translate(0, 0.16, 0);
  headMesh = new THREE.Mesh(
    headGeo,
    new THREE.MeshStandardMaterial({
      color: 0x261407,
      roughness: 0.55,
      metalness: 0.18,
      emissive: 0x140a05,
      emissiveIntensity: 0.18
    })
  );
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  torchAnchor.add(headMesh);

  // Glut
  const emberGeo = new THREE.SphereGeometry(0.045, 14, 14);
  emberGeo.translate(0, 0.24, 0);
  emberMesh = new THREE.Mesh(
    emberGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffa63a,
      transparent: true,
      opacity: 0.6
    })
  );
  emberMesh.renderOrder = 2;
  torchAnchor.add(emberMesh);

  flameLayers = [
    createCartoonFlameLayer({
      size: 320,
      textureOptions: {
        outerColor: '#ff8c1e',
        innerColor: '#ffe36c',
        outlineColor: '#6c2b00',
        includeInner: true,
        widthScale: 1.0,
        lean: 0.035
      },
      baseScale: new THREE.Vector2(0.78, 1.35),
      offset: new THREE.Vector3(0, 0.28, 0),
      tiltRange: 0.35,
      stretchRange: [0.9, 1.35],
      squashRange: [0.85, 1.15],
      opacityRange: [0.85, 1.05],
      renderOrder: 5,
      wobbleSpeed: 4.2,
      stretchSpeed: 3.1,
      squashSpeed: 4.5,
      twistSpeed: 1.7,
      twistAmount: 0.12
    }),
    createCartoonFlameLayer({
      size: 256,
      textureOptions: {
        outerColor: '#ffe977',
        innerColor: '#fffbd0',
        outlineColor: '#f7c65a',
        includeInner: false,
        widthScale: 0.78,
        lean: 0.02
      },
      baseScale: new THREE.Vector2(0.46, 0.9),
      offset: new THREE.Vector3(0, 0.32, 0.01),
      tiltRange: 0.25,
      stretchRange: [0.95, 1.2],
      squashRange: [0.9, 1.08],
      opacityRange: [0.8, 1.05],
      renderOrder: 6,
      wobbleSpeed: 5.2,
      stretchSpeed: 3.9,
      squashSpeed: 5.1,
      twistSpeed: 2.1,
      twistAmount: 0.07
    })
  ];
  flameLayers.forEach((layer) => torchAnchor.add(layer.sprite));

  // Licht
  torchLight = new THREE.PointLight(0xffc982, 0, torchConfig.lightDistance, torchConfig.lightDecay);
  torchLight.position.copy(torchConfig.lightOffset);
  torchLight.castShadow = true;
  torchLight.shadow.mapSize.set(1024, 1024);
  torchLight.shadow.camera.near = 0.1;
  torchLight.shadow.camera.far = torchConfig.shadowCameraFar;
  torchLight.shadow.bias = torchConfig.shadowBias;
  torchLight.shadow.normalBias = torchConfig.shadowNormalBias ?? 0.03;
  torchAnchor.add(torchLight);

  torchGlowLight = new THREE.PointLight(0xff7a2e, 0, 5, 2.2);
  torchGlowLight.position.set(0, 0.28, -0.04);
  torchAnchor.add(torchGlowLight);
}

// ------------------------------------------------------
// CARTOON-FLAMME
// ------------------------------------------------------
function createCartoonFlameLayer({
  size = 256,
  textureOptions = {},
  baseScale = new THREE.Vector2(0.25, 0.45),
  offset = new THREE.Vector3(),
  tiltRange = 0.25,
  stretchRange = [0.85, 1.15],
  squashRange = [0.85, 1.1],
  opacityRange = [0.8, 1.0],
  renderOrder = 5,
  wobbleSpeed = 4.2,
  stretchSpeed = 3.3,
  squashSpeed = 4.5,
  twistSpeed = 1.6,
  twistAmount = 0.08
} = {}) {
  const texture = makeCartoonFlameTexture({
    size,
    ...textureOptions
  });

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    color: 0xffffff
  });

  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0.0);
  sprite.position.copy(offset);
  sprite.renderOrder = renderOrder;

  return {
    sprite,
    baseScale,
    tiltRange,
    stretchRange,
    squashRange,
    opacityRange,
    wobbleSpeed,
    stretchSpeed,
    squashSpeed,
    twistSpeed,
    twistAmount,
    baseRotation: textureOptions.baseRotation ?? 0,
    phase: Math.random() * Math.PI * 2
  };
}

function makeCartoonFlameTexture({
  size = 256,
  outerColor = '#ff8a23',
  innerColor = '#ffe86b',
  outlineColor = '#6c2b00',
  includeInner = true,
  widthScale = 1.0,
  lean = 0.03
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);

  const midX = size / 2;
  const baseY = size * 0.92;
  const topY = size * 0.5;

  const wBaseOuter = size * 0.25 * widthScale;
  const wMidOuter = size * 0.16 * widthScale;
  const wTopOuter = size * 0.05 * widthScale;

  ctx.beginPath();
  ctx.moveTo(midX, baseY);
  ctx.bezierCurveTo(
    midX - wBaseOuter, baseY - size * 0.16,
    midX - wMidOuter - size * lean, baseY - size * 0.30,
    midX - wTopOuter, (topY + baseY) * 0.6
  );
  ctx.bezierCurveTo(
    midX - wMidOuter * 0.35, topY + size * 0.03,
    midX - wTopOuter * 0.35, topY - size * 0.02,
    midX - size * lean * 0.25, topY
  );
  ctx.bezierCurveTo(
    midX + wTopOuter * 0.35, topY - size * 0.02,
    midX + wMidOuter * 0.35, topY + size * 0.03,
    midX + wTopOuter + size * lean * 0.4, (topY + baseY) * 0.6
  );
  ctx.bezierCurveTo(
    midX + wMidOuter + size * lean * 0.2, baseY - size * 0.30,
    midX + wBaseOuter + size * lean * 0.1, baseY - size * 0.16,
    midX, baseY
  );
  ctx.closePath();

  const outerGradient = ctx.createLinearGradient(midX, baseY, midX, topY);
  outerGradient.addColorStop(0.0, '#ff6a16');
  outerGradient.addColorStop(0.45, outerColor);
  outerGradient.addColorStop(0.85, '#ffd27a');
  ctx.fillStyle = outerGradient;
  ctx.fill();

  if (outlineColor) {
    ctx.lineWidth = size * 0.03;
    ctx.strokeStyle = outlineColor;
    ctx.stroke();
  }

  if (includeInner) {
    const wBaseInner = size * 0.14 * widthScale;
    const wMidInner = size * 0.09 * widthScale;
    const wTopInner = size * 0.025 * widthScale;
    const baseInnerY = size * 0.89;
    const topInnerY = size * 0.6;

    ctx.beginPath();
    ctx.moveTo(midX, baseInnerY);
    ctx.bezierCurveTo(
      midX - wBaseInner, baseInnerY - size * 0.11,
      midX - wMidInner - size * lean * 0.2, baseInnerY - size * 0.2,
      midX - wTopInner, (topInnerY + baseInnerY) * 0.58
    );
    ctx.bezierCurveTo(
      midX - wMidInner * 0.3, topInnerY + size * 0.01,
      midX - wTopInner * 0.3, topInnerY,
      midX - size * lean * 0.05, topInnerY
    );
    ctx.bezierCurveTo(
      midX + wTopInner * 0.3, topInnerY,
      midX + wMidInner * 0.3, topInnerY + size * 0.01,
      midX + wTopInner + size * lean * 0.25, (topInnerY + baseInnerY) * 0.58
    );
    ctx.bezierCurveTo(
      midX + wMidInner + size * lean * 0.15, baseInnerY - size * 0.2,
      midX + wBaseInner + size * lean * 0.1, baseInnerY - size * 0.11,
      midX, baseInnerY
    );
    ctx.closePath();

    const innerGradient = ctx.createLinearGradient(midX, baseInnerY, midX, topInnerY);
    innerGradient.addColorStop(0, innerColor);
    innerGradient.addColorStop(0.7, '#fff1b9');
    innerGradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = innerGradient;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  return tex;
}
