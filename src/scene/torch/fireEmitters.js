// src/scene/torch/fireEmitters.js
import * as THREE from 'three';

// Ganz einfacher globaler Speicher aller Feuer
const _emitters = [];

// Einmalige Hilfsfunktionen (simplere Version als in torch.js)
// Du kannst hier auch direkt Code aus torch.js wiederverwenden oder auslagern.
function makeCartoonFlameTexture({
                                     size = 256,
                                     outerColor = '#ff8a23',
                                     innerColor = '#ffe86b',
                                     outlineColor = '#6c2b00',
                                     includeInner = true,
                                 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);
    const midX = size / 2;
    const baseY = size * 0.92;
    const topY = size * 0.5;

    ctx.beginPath();
    ctx.moveTo(midX, baseY);
    ctx.quadraticCurveTo(midX - size * 0.18, (baseY + topY) * 0.6, midX, topY);
    ctx.quadraticCurveTo(midX + size * 0.18, (baseY + topY) * 0.6, midX, baseY);
    ctx.closePath();

    const outerGradient = ctx.createLinearGradient(midX, baseY, midX, topY);
    outerGradient.addColorStop(0.0, '#ff6a16');
    outerGradient.addColorStop(0.45, outerColor);
    outerGradient.addColorStop(0.9, '#ffd27a');
    ctx.fillStyle = outerGradient;
    ctx.fill();

    if (includeInner) {
        ctx.beginPath();
        ctx.moveTo(midX, baseY - size * 0.04);
        ctx.quadraticCurveTo(midX - size * 0.10, (baseY + topY) * 0.62, midX, topY + size * 0.04);
        ctx.quadraticCurveTo(midX + size * 0.10, (baseY + topY) * 0.62, midX, baseY - size * 0.04);
        ctx.closePath();

        const innerGradient = ctx.createLinearGradient(midX, baseY, midX, topY);
        innerGradient.addColorStop(0, innerColor);
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

function createFlameSprite(scale = 0.7) {
    const tex = makeCartoonFlameTexture();
    const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0.0);
    sprite.scale.set(scale, scale * 1.6, 1);
    sprite.position.set(0, 0, 0);
    return sprite;
}

/**
 * Erzeugt eine Feuerstelle (Flamme + Licht) an einem Parent-Objekt.
 * @param {Object} opts
 * @param {THREE.Object3D} opts.parent - z.B. ein Node aus dem GLB oder direkt die Szene.
 * @param {THREE.Vector3|{x:number,y:number,z:number}} [opts.offset] - Offset relativ zum Parent.
 * @param {number} [opts.intensity=4] - Basis-Lichtstärke.
 * @param {number} [opts.radius=14]   - Reichweite des Lichts.
 */
export function createFireEmitter({
                                      parent,
                                      offset = { x: 0, y: 0, z: 0 },
                                      intensity = 20,
                                      radius = 30,
                                  } = {}) {
    if (!parent) return null;

    const root = new THREE.Group();
    root.position.set(offset.x, offset.y, offset.z);
    parent.add(root);

    // Flammensprite
    const flame = createFlameSprite(0.9);
    flame.position.y = 0.2;
    root.add(flame);

    // kleines Glut-Mesh
    const emberGeo = new THREE.SphereGeometry(0.12, 14, 14);
    emberGeo.translate(0, 0.12, 0);
    const ember = new THREE.Mesh(
        emberGeo,
        new THREE.MeshBasicMaterial({ color: 0xffa63a, transparent: true, opacity: 0.7 })
    );
    root.add(ember);

    // Punktlicht
    const light = new THREE.PointLight(0xffc982, 0, radius, 1.4);
    light.position.set(0, 0.4, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    root.add(light);

    const emitter = {
        root,
        light,
        flame,
        ember,
        baseIntensity: intensity,
        time: Math.random() * 10,
        active: false,
    };
    _emitters.push(emitter);
    return emitter;
}

/**
 * Muss pro Frame aufgerufen werden.
 * @param {number} dt - DeltaTime in Sekunden.
 * @param {boolean} isNight - true, wenn Nacht, sonst false.
 */
export function updateFireEmitters(dt, isNight) {
    for (const e of _emitters) {
        e.time += dt;

        e.active = !!isNight;
        e.root.visible = e.active;

        const targetIntensity = e.active ? e.baseIntensity : 0;
        const k = 1 - Math.exp(-Math.max(dt, 0.0001) * (e.active ? 7 : 12));
        const flickerSlow = Math.sin(e.time * 2.2) * 0.35;
        const flickerFast = Math.sin(e.time * 9.5 + 0.5) * 0.18;
        const noise = (Math.random() - 0.5) * 0.18;
        const flicker = THREE.MathUtils.clamp(1 + flickerSlow + flickerFast + noise, 0.5, 1.4);

        e.light.intensity = THREE.MathUtils.lerp(
            e.light.intensity,
            targetIntensity * flicker,
            k
        );

        const norm = THREE.MathUtils.clamp(
            (e.light.intensity || 0) / (e.baseIntensity || 1),
            0,
            1.3
        );

        // Flammengröße + leichte Rotation
        if (e.flame) {
            const s = 0.6 + norm * 0.7;
            e.flame.scale.set(s, s * 1.6, 1);
            e.flame.material.opacity = 0.5 + norm * 0.5;
            e.flame.material.rotation = Math.sin(e.time * 1.7) * 0.25;
        }

        // Glut-Puls
        if (e.ember) {
            const pulse = 1 + Math.sin(e.time * 4.0) * 0.06;
            e.ember.scale.setScalar(0.9 * pulse + norm * 0.3);
            e.ember.material.opacity = 0.4 + norm * 0.35;
        }
    }
}