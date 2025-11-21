// src/scene/city/city.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHitboxForGLB } from '../../util/collision.js';

// -----------------------------------------------------------------------------
// Debug: optionaler Wireframe für geladene Modelle
// -----------------------------------------------------------------------------
function addWireframeHelperForGeometry(scene, geometry, opacity = 0.18, color = 0x00ffff) {
  const wireGeo = new THREE.WireframeGeometry(geometry);
  const wireMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const wire = new THREE.LineSegments(wireGeo, wireMat);
  scene.add(wire);
  return wire;
}

// -----------------------------------------------------------------------------
// eigentliche World-Build-Funktion
// -----------------------------------------------------------------------------
export function buildCity(scene, { groundSize = 2048, groundRepeat = 500 } = {}) {
  const segments = 256; // genug Segmente, damit Displacement wirkt
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, segments, segments);
  groundGeo.rotateX(-Math.PI / 2);

  const textureLoader = new THREE.TextureLoader();
  const base = '/textures/sandy_gravel_02_';

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
    metalness: 0.0,
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.castShadow = false;
  scene.add(ground);
}

// -----------------------------------------------------------------------------
// GLB laden (wie bei dir)
// -----------------------------------------------------------------------------
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
  const loader = new GLTFLoader();
  loader.load(
    url,
    (gltf) => {
      const model = gltf.scene;

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

      // Unterkante auf y=0 ausrichten
      let box = new THREE.Box3().setFromObject(model);
      const dy = -box.min.y;
      if (Math.abs(dy) > 1e-4) {
        model.position.y += dy;
      }
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
    }
  );
}

export function updateCity() {}
