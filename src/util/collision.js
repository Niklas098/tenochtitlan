// src/util/collision.js
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';

/**
 * Collection of all generated collision hitboxes for loaded GLB assets.
 * Each entry stores the debug mesh plus the source mesh and bounding info for queries.
 * @type {Array<{
 *   mesh: THREE.Mesh,
 *   obb: OBB,
 *   source: THREE.Object3D|null,
 *   localCenter: THREE.Vector3|null,
 *   localSize: THREE.Vector3|null,
 *   config: ReturnType<typeof normalizeHitboxOptions>,
 *   baseSize: THREE.Vector3|null
 * }>}
 */
export const collisionBoxes = [];

const DEFAULT_HITBOX_OPTIONS = {
  marginXZ: 0.6,
  marginY: 0.3,
  minDimension: 0.15
};

const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xff3333,
  transparent: true,
  opacity: 0.15,
  wireframe: true,
  depthWrite: false,
});

// Precomputed deterministic offsets used to probe around a preferred spawn.
const SAFE_OFFSETS = (() => {
  const offsets = [{ x: 0, y: 0, z: 0 }];
  const horizontalStep = 3;
  const maxRadius = 60;
  const verticalLayers = [0, 1.5, -1.5, 3]; // allow slight elevation tweaks

  for (const y of verticalLayers) {
    for (let radius = horizontalStep; radius <= maxRadius; radius += horizontalStep) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        offsets.push({
          x: Math.cos(angle) * radius,
          y,
          z: Math.sin(angle) * radius
        });
      }
    }
  }
  return offsets;
})();

const _tmpVec = new THREE.Vector3();
const _centerLocal = new THREE.Vector3();
const _centerWorld = new THREE.Vector3();
const _sizeLocal = new THREE.Vector3();
const _sizeWorld = new THREE.Vector3();
const _halfSize = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _scaleAbs = new THREE.Vector3();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _rotationMatrix = new THREE.Matrix4();
const _obbRotation = new THREE.Matrix3();
const _worldBox = new THREE.Box3();
const _uuidScratch = new Set();

/**
 * Builds invisible hitboxes for every mesh contained in the loaded GLB.
 * Each mesh becomes its own OBB so rotated or irregular structures keep tight volumes.
 *
 * @param {THREE.Scene} scene - Scene that receives the generated hitbox meshes.
 * @param {THREE.Object3D} gltfScene - Root object of the loaded GLB.
 * @param {{marginXZ?:number, marginY?:number, minDimension?:number}} [options]
 */
export function createHitboxForGLB(scene, gltfScene, options = {}) {
  if (!scene || !gltfScene) return;
  const config = normalizeHitboxOptions(options);

  gltfScene.updateWorldMatrix(true, true);
  let created = 0;

  gltfScene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    created += addHitboxForMesh(scene, child, config) ? 1 : 0;
  });

  // Fallback: if the GLB had no meshes (rare), wrap the root once so collisions still work.
  if (created === 0) {
    const entry = buildFallbackHitbox(scene, gltfScene, config);
    if (entry) {
      collisionBoxes.push(entry);
    }
  }
}

/**
 * Toggles visibility for all generated hitboxes (useful for debugging the volumes).
 */
export function toggleHitboxVisibility() {
  collisionBoxes.forEach(({ mesh }) => {
    mesh.visible = !mesh.visible;
  });
}

/**
 * Checks if the provided world position lies inside any registered hitbox.
 *
 * @param {THREE.Vector3|{x:number,y:number,z:number}} position - World-space point.
 * @returns {boolean} True when the point intersects a hitbox.
 */
export function isInsideAnyHitbox(position) {
  if (!position) return false;
  const point = toVector3(position, _tmpVec);
  return collisionBoxes.some(({ obb }) => obb?.containsPoint(point));
}

/**
 * Finds the first collision-free location close to the preferred position.
 * The probing uses deterministic radial offsets to keep the behaviour predictable.
 *
 * @param {THREE.Vector3|{x:number,y:number,z:number}} preferredPos - Desired world position.
 * @returns {THREE.Vector3} Safe position (or the preferred one when already free).
 */
export function findSafeSpawnPosition(preferredPos) {
  const desired = toVector3(preferredPos, new THREE.Vector3());
  if (!isInsideAnyHitbox(desired)) {
    return desired;
  }

  for (const offset of SAFE_OFFSETS) {
    const candidate = desired.clone().add(offset);
    if (!isInsideAnyHitbox(candidate)) {
      return candidate;
    }
  }

  // Fallback: expand search vertically if everything else failed.
  for (let dy = 5; dy <= 50; dy += 5) {
    const up = desired.clone().add(new THREE.Vector3(0, dy, 0));
    if (!isInsideAnyHitbox(up)) return up;
    const down = desired.clone().add(new THREE.Vector3(0, -dy, 0));
    if (!isInsideAnyHitbox(down)) return down;
  }

  // If nothing was found, return the original position (better than returning undefined).
  return desired;
}

/**
 * Recomputes hitbox world transforms for all entries that belong to the provided object.
 * Call this after moving/rotating a GLB that already spawned hitboxes.
 *
 * @param {THREE.Object3D} root - Root object that potentially moved.
 */
export function updateHitboxesForObject(root) {
  if (!root) return;
  root.updateMatrixWorld(true);
  _uuidScratch.clear();
  root.traverse((child) => _uuidScratch.add(child.uuid));
  for (const entry of collisionBoxes) {
    if (!entry?.source || !entry.localCenter) continue;
    if (_uuidScratch.has(entry.source.uuid)) {
      refreshHitboxEntry(entry);
    }
  }
  _uuidScratch.clear();
}

/**
 * Creates an oriented hitbox for a specific mesh.
 * @param {THREE.Scene} scene
 * @param {THREE.Mesh} mesh
 * @returns {boolean} True when a hitbox was produced.
 */
function addHitboxForMesh(scene, mesh, config) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return false;

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const bbox = geometry.boundingBox;
  if (!bbox) return false;

  bbox.getSize(_sizeLocal);
  if (_sizeLocal.lengthSq() === 0) return false;

  const localSize = _sizeLocal.clone();
  bbox.getCenter(_centerLocal);
  const localCenter = _centerLocal.clone();

  mesh.updateWorldMatrix(true, false);
  mesh.matrixWorld.decompose(_position, _quaternion, _scale);
  _scaleAbs.set(Math.abs(_scale.x), Math.abs(_scale.y), Math.abs(_scale.z));

  _sizeWorld.copy(_sizeLocal).multiply(_scaleAbs);
  _sizeWorld.x = Math.max(_sizeWorld.x + config.marginXZ, config.minDimension);
  _sizeWorld.y = Math.max(_sizeWorld.y + config.marginY, config.minDimension);
  _sizeWorld.z = Math.max(_sizeWorld.z + config.marginXZ, config.minDimension);

  _centerWorld.copy(_centerLocal).applyMatrix4(mesh.matrixWorld);

  _rotationMatrix.extractRotation(mesh.matrixWorld);
  _obbRotation.setFromMatrix4(_rotationMatrix);
  _halfSize.copy(_sizeWorld).multiplyScalar(0.5);

  const obb = new OBB(_centerWorld.clone(), _halfSize.clone(), _obbRotation.clone());

  const hitboxGeometry = new THREE.BoxGeometry(_sizeWorld.x, _sizeWorld.y, _sizeWorld.z);
  const hitboxMesh = new THREE.Mesh(hitboxGeometry, HITBOX_MATERIAL);
  hitboxMesh.position.copy(_centerWorld);
  hitboxMesh.quaternion.copy(_quaternion);
  hitboxMesh.visible = false;
  hitboxMesh.userData.isCollisionHitbox = true;

  scene.add(hitboxMesh);
  collisionBoxes.push({
    mesh: hitboxMesh,
    obb,
    source: mesh,
    localCenter,
    localSize,
    config,
    baseSize: _sizeWorld.clone()
  });
  return true;
}

/**
 * Builds a single fallback hitbox that wraps the entire object when no mesh was found.
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D} object
 * @returns {{mesh:THREE.Mesh, obb:OBB}|null}
 */
function buildFallbackHitbox(scene, object, config) {
  _worldBox.setFromObject(object);
  if (!isFinite(_worldBox.min.x) || !isFinite(_worldBox.max.x)) return null;

  _worldBox.getSize(_sizeWorld);
  if (_sizeWorld.lengthSq() === 0) return null;

  const localSize = _sizeWorld.clone();
  _sizeWorld.x = Math.max(_sizeWorld.x + config.marginXZ, config.minDimension);
  _sizeWorld.y = Math.max(_sizeWorld.y + config.marginY, config.minDimension);
  _sizeWorld.z = Math.max(_sizeWorld.z + config.marginXZ, config.minDimension);
  _worldBox.getCenter(_centerWorld);
  const localCenter = object.worldToLocal(_centerWorld.clone());

  object.updateWorldMatrix(true, true);
  _rotationMatrix.extractRotation(object.matrixWorld);
  _obbRotation.setFromMatrix4(_rotationMatrix);
  _halfSize.copy(_sizeWorld).multiplyScalar(0.5);

  const obb = new OBB(_centerWorld.clone(), _halfSize.clone(), _obbRotation.clone());

  const hitboxGeometry = new THREE.BoxGeometry(_sizeWorld.x, _sizeWorld.y, _sizeWorld.z);
  const hitboxMesh = new THREE.Mesh(hitboxGeometry, HITBOX_MATERIAL);
  hitboxMesh.position.copy(_centerWorld);
  hitboxMesh.quaternion.setFromRotationMatrix(_rotationMatrix);
  hitboxMesh.visible = false;
  hitboxMesh.userData.isCollisionHitbox = true;

  scene.add(hitboxMesh);
  return {
    mesh: hitboxMesh,
    obb,
    source: object,
    localCenter,
    localSize,
    config,
    baseSize: _sizeWorld.clone()
  };
}

function refreshHitboxEntry(entry) {
  const { source, localCenter, localSize, mesh, obb, config, baseSize } = entry;
  if (!source || !localCenter || !localSize || !mesh || !obb || !config) return;
  source.updateWorldMatrix(true, false);
  source.matrixWorld.decompose(_position, _quaternion, _scale);
  _scaleAbs.set(Math.abs(_scale.x), Math.abs(_scale.y), Math.abs(_scale.z));

  _tmpVec.copy(localCenter).applyMatrix4(source.matrixWorld);
  obb.center.copy(_tmpVec);

  _sizeWorld.copy(localSize).multiply(_scaleAbs);
  _sizeWorld.x = Math.max(_sizeWorld.x + config.marginXZ, config.minDimension);
  _sizeWorld.y = Math.max(_sizeWorld.y + config.marginY, config.minDimension);
  _sizeWorld.z = Math.max(_sizeWorld.z + config.marginXZ, config.minDimension);
  _halfSize.copy(_sizeWorld).multiplyScalar(0.5);
  obb.halfSize.copy(_halfSize);

  _rotationMatrix.extractRotation(source.matrixWorld);
  obb.rotation.setFromMatrix4(_rotationMatrix);

  mesh.position.copy(obb.center);
  mesh.quaternion.setFromRotationMatrix(_rotationMatrix);
  if (baseSize) {
    const sx = baseSize.x !== 0 ? _sizeWorld.x / baseSize.x : 1;
    const sy = baseSize.y !== 0 ? _sizeWorld.y / baseSize.y : 1;
    const sz = baseSize.z !== 0 ? _sizeWorld.z / baseSize.z : 1;
    mesh.scale.set(sx, sy, sz);
  }
  mesh.updateMatrixWorld(true);
}

/**
 * Normalizes user input into a THREE.Vector3 to avoid code duplication.
 * @param {THREE.Vector3|{x:number,y:number,z:number}} source
 * @param {THREE.Vector3} target
 * @returns {THREE.Vector3}
 */
function toVector3(source, target) {
  if (source instanceof THREE.Vector3) {
    target.copy(source);
  } else {
    target.set(source?.x ?? 0, source?.y ?? 0, source?.z ?? 0);
  }
  return target;
}

function normalizeHitboxOptions(options = {}) {
  return {
    marginXZ: Math.max(0, Number.isFinite(options.marginXZ) ? options.marginXZ : DEFAULT_HITBOX_OPTIONS.marginXZ),
    marginY: Math.max(0, Number.isFinite(options.marginY) ? options.marginY : DEFAULT_HITBOX_OPTIONS.marginY),
    minDimension: Math.max(1e-4, Number.isFinite(options.minDimension) ? options.minDimension : DEFAULT_HITBOX_OPTIONS.minDimension)
  };
}
