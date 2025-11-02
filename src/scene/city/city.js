// src/scene/city/city.js
import * as THREE from 'three';

/**
 * Große, tragfähige Bodenplatte (sandig-beige, rau & leicht hubbelig),
 * prozedural (keine Assets), absolut undurchsichtig.
 */

// -------- prozedurale Sand-Textur (Canvas) --------
function createSandTexture(size = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Value-Noise + FBM
    const rnd = (x, y, s) => Math.sin((x * 127.1 + y * 311.7 + s * 73.1)) * 43758.5453 % 1;
    function noise(x, y, s) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const a = rnd(xi, yi, s), b = rnd(xi + 1, yi, s);
        const c = rnd(xi, yi + 1, s), d = rnd(xi + 1, yi + 1, s);
        const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
        return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
    const fbm = (x, y) => {
        let v = 0, amp = 0.5, f = 1.0;
        for (let i = 0; i < 6; i++) { v += noise(x * f, y * f, 10.0 + i) * amp; f *= 2; amp *= 0.5; }
        return v;
    };

    const data = ctx.createImageData(size, size);
    const A = new THREE.Color(0xD4C7B3); // hellsand
    const B = new THREE.Color(0xA69B8E); // graubeige

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size;
            const g = fbm(u * 28, v * 28);
            const ripple = 0.5 + 0.5 * Math.sin((u + v * 0.2) * 140.0);
            const m = THREE.MathUtils.clamp(0.55 * g + 0.12 * ripple, 0.0, 1.0);
            const col = A.clone().lerp(B, m);
            const i = (y * size + x) * 4;
            data.data[i] = (col.r * 255) | 0;
            data.data[i + 1] = (col.g * 255) | 0;
            data.data[i + 2] = (col.b * 255) | 0;
            data.data[i + 3] = 255;
        }
    }
    ctx.putImageData(data, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.repeat.set(10, 10);
    return tex;
}

// ------ leichte Mikro-Rauhigkeit auf Geometrie ------
function microDisplacePlane(geometry, amp = 0.5, scale = 0.02) {
    const pos = geometry.attributes.position;
    const rnd = (x, y) => Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const n2 = (x, y) => {
        const i = Math.floor(x), j = Math.floor(y);
        const fx = x - i, fy = y - j;
        const s = Math.sin(rnd(i, j));
        const t = Math.sin(rnd(i + 1, j));
        const u = Math.sin(rnd(i, j + 1));
        const v = Math.sin(rnd(i + 1, j + 1));
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        return (s + sx * (t - s)) * (1 - sy) + (u + sx * (v - u)) * sy;
    };
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const h = n2(x * scale, z * scale) * amp;
        pos.setY(i, h * 0.35); // subtil
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
}

let ground;

export function buildCity(scene, _lights) {
    // sehr große Bodenplatte
    const size = 8000; // 8 km Kachel
    const g = new THREE.PlaneGeometry(size, size, 256, 256);
    microDisplacePlane(g, 0.5, 0.02);

    const sand = createSandTexture(1024);
    const groundMat = new THREE.MeshStandardMaterial({
        map: sand,
        roughness: 0.96,
        metalness: 0.0,
        side: THREE.DoubleSide,   // falls jemand unter y<0 gerät, trotzdem sichtbar
        transparent: false
    });

    ground = new THREE.Mesh(g, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.castShadow = false;

    scene.add(ground);
}

export function updateCity(_dt, _t, _lights, _activeCamera) {
    // Hook für spätere Gebäude/Hotspots
}
