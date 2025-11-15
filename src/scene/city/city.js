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
// Fallback-Textur, falls deine echte JPG nicht gefunden wird
// -----------------------------------------------------------------------------
function makeFallbackSandTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d4c7b3';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#b39a7d';
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

// -----------------------------------------------------------------------------
// Boden-Geometrie ein bisschen „hubbelig“ machen
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// aus einer Height-/Displacement-Textur eine Normalmap basteln (reines JS)
// -----------------------------------------------------------------------------
function createNormalFromHeightTex(heightTex, strength = 1.0, repeat = 6) {
  if (!heightTex.image) return null;

  const img = heightTex.image;
  const w = img.width;
  const h = img.height;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);

  const getH = (x, y) => {
    x = Math.max(0, Math.min(w - 1, x));
    y = Math.max(0, Math.min(h - 1, y));
    const i = (y * w + x) * 4;
    return src.data[i] / 255.0;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hL = getH(x - 1, y);
      const hR = getH(x + 1, y);
      const hD = getH(x, y - 1);
      const hU = getH(x, y + 1);

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;

      let nx = -dx;
      let ny = -dy;
      let nz = dz;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
      nx /= len; ny /= len; nz /= len;

      const i = (y * w + x) * 4;
      dst.data[i + 0] = (nx * 0.5 + 0.5) * 255;
      dst.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      dst.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      dst.data[i + 3] = 255;
    }
  }

  ctx.putImageData(dst, 0, 0);

  const normalTex = new THREE.CanvasTexture(c);
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.repeat.set(repeat, repeat);
  normalTex.colorSpace = THREE.NoColorSpace;
  return normalTex;
}

// -----------------------------------------------------------------------------
// wenn disp fehlt, aber diff da ist: wenigstens eine Bump-Map erzeugen
// -----------------------------------------------------------------------------
function createHeightFromDiffuse(diffTex, repeat = 6) {
  if (!diffTex || !diffTex.image) return null;
  const img = diffTex.image;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// -----------------------------------------------------------------------------
// eigentliche World-Build-Funktion
// -----------------------------------------------------------------------------
export function buildCity(scene, { groundSize = 2400 } = {}) {
  // 1. große Bodenfläche
  const seg = 256; // viele Segmente -> Displacement wirkt
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, seg, seg);
  groundGeo.rotateX(-Math.PI / 2);
  displaceGroundGeometry(groundGeo, 0.08, 0.0028);

  // 2. Material mit Fallback
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
    map: makeFallbackSandTexture(),
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.castShadow = false;
  scene.add(ground);

  // 3. DEINE echten Dateien
  //    Lege sie hier hin:
  //    public/textures/coast_sand_01/coast_sand_01_diff_4k.jpg
  //    public/textures/coast_sand_01/coast_sand_01_disp_4k.png
  const base = '/textures/coast_sand_01/';
  const repeat = 106; // dein Wert
  let loadedDiffuse = null;

  // --- Diffuse ---
  new THREE.TextureLoader().load(
    base + 'coast_sand_01_diff_4k.jpg',
    (tx) => {
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.repeat.set(repeat, repeat);
      tx.colorSpace = THREE.SRGBColorSpace;
      loadedDiffuse = tx;
      groundMat.map = tx;
      groundMat.needsUpdate = true;
    },
    undefined,
    () => {
      console.info('coast_sand_01_diff_4k.jpg nicht gefunden – Fallback bleibt.');
    }
  );

  // --- Displacement + daraus Normal bauen ---
  new THREE.TextureLoader().load(
    base + 'coast_sand_01_disp_4k.png',
    (tx) => {
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.repeat.set(repeat, repeat);
      tx.colorSpace = THREE.NoColorSpace;

      // echtes Displacement
      groundMat.displacementMap = tx;
      groundMat.displacementScale = 0.4; // Haptik
      groundMat.displacementBias = 0.0;

      // zusätzliche Normalmap aus der displacement bauen
      const normalFromDisp = createNormalFromHeightTex(tx, 2.5, repeat);
      if (normalFromDisp) {
        groundMat.normalMap = normalFromDisp;
        groundMat.normalScale = new THREE.Vector2(1, 1);
      }

      groundMat.needsUpdate = true;
    },
    undefined,
    () => {
      // wenn disp fehlt: wenigstens Bump aus diff
      if (loadedDiffuse) {
        const bump = createHeightFromDiffuse(loadedDiffuse, repeat);
        if (bump) {
          groundMat.bumpMap = bump;
          groundMat.bumpScale = 0.35;
          groundMat.needsUpdate = true;
        }
      }
    }
  );

  // HIER könntest du jetzt optional deinen Tempel laden:
  // loadGLB(scene, { url: '/models/tempel.glb', scale: 1.0 });
}

// -----------------------------------------------------------------------------
// GLB laden (wie bei dir)
// -----------------------------------------------------------------------------
export function loadGLB(
  scene,
  {
    url = '/models/pyramide.glb',
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
