// src/util/surfaces.js
/**
 * Shared identifiers for walkable surface materials.
 */
export const SurfaceTypes = Object.freeze({
  SAND: 'sand',
  STONE: 'stone'
});

/**
 * Recursively tags an object (and its meshes) with the provided surface type.
 * @param {THREE.Object3D} object
 * @param {string} type
 */
export function markSurface(object, type) {
  if (!object) return;
  object.userData = object.userData || {};
  object.userData.walkSurface = type;

  if (typeof object.traverse === 'function') {
    object.traverse((child) => {
      child.userData = child.userData || {};
      child.userData.walkSurface = type;
    });
  }
}

/**
 * Reads the walk surface type that was previously assigned to an object.
 * @param {THREE.Object3D} object
 * @returns {string|null}
 */
export function getSurfaceType(object) {
  return object?.userData?.walkSurface ?? null;
}
