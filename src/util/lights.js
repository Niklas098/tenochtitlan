// src/util/lights.js
import * as THREE from 'three';

let state = { day:true };
let lights = null;
let starField = null;

function makeSunDisk() {
    // weiche Scheibe (Halo), keine stacheligen Strahlen
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(size/2,size/2,0, size/2,size/2,size/2);
    grd.addColorStop(0.00, 'rgba(255,245,200,1.0)');
    grd.addColorStop(0.35, 'rgba(255,228,140,0.65)');
    grd.addColorStop(0.70, 'rgba(255,210,110,0.25)');
    grd.addColorStop(1.00, 'rgba(255,200, 80,0.0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,size,size);

    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(260, 260, 1);
    return sprite;
}

function makeStars() {
    const g = new THREE.BufferGeometry();
    const n = 800;
    const positions = new Float32Array(n * 3);
    for (let i=0;i<n;i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2*v - 1);
        const r = 3000;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);
        positions[i*3+0]=x; positions[i*3+1]=y; positions[i*3+2]=z;
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ size: 2.0, sizeAttenuation: true, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite:false });
    const points = new THREE.Points(g,m);
    points.frustumCulled = false;
    return points;
}

export function createLights(scene) {
    const group = new THREE.Group();

    const hemi = new THREE.HemisphereLight(0xeadfcd, 0x1d2830, 0.4);
    group.add(hemi);

    // Sonne etwas höher über dem Horizont, weit hinten
    const sun = new THREE.DirectionalLight(0xfff2cc, 2.2);
    sun.position.set(-2200, 220, -500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 8000;
    sun.shadow.camera.left = -3000;
    sun.shadow.camera.right = 3000;
    sun.shadow.camera.top = 2200;
    sun.shadow.camera.bottom = -2200;

    const sunDisk = makeSunDisk();
    sunDisk.position.copy(sun.position);

    group.add(sun, sunDisk);

    // Mond
    const moon = new THREE.SpotLight(0xbfd8ff, 0.0, 0, Math.PI/5, 0.35, 1.4);
    moon.position.set(2000, 300, 400);
    moon.target.position.set(0, 0, 0);
    group.add(moon, moon.target);

    // Fackel (Point + Spot)
    const torchGroup = new THREE.Group();
    const torchPoint = new THREE.PointLight(0xffbb66, 0.0, 55, 1.6);
    torchPoint.castShadow = true;
    torchPoint.position.set(0.25, -0.18, -0.45);
    const torchSpot = new THREE.SpotLight(0xffaa66, 0.0, 70, Math.PI/5, 0.45, 1.0);
    torchSpot.position.set(0.15, -0.10, -0.35);
    torchSpot.target.position.set(0, -0.10, -1.2);
    const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.14, 14),
        new THREE.MeshBasicMaterial({ color: 0xff7b2d, toneMapped: false })
    );
    flame.position.set(0.2, -0.05, -0.35);
    flame.rotation.x = Math.PI;
    torchGroup.add(torchPoint, torchSpot, torchSpot.target, flame);

    group.add(torchGroup);
    scene.add(group);

    // Sterne
    starField = makeStars();
    starField.visible = false;
    scene.add(starField);

    lights = { group, hemi, sun, sunDisk, moon, torchGroup, torchPoint, torchSpot, flame, starField };
    setDayNight(true);
    return lights;
}

export function setDayNight(day) {
    const d = !!day;
    state.day = d;
    const { hemi, sun, sunDisk, moon, torchPoint, torchSpot, flame } = lights;
    if (d) {
        hemi.intensity = 0.40;
        sun.intensity = 2.2;
        sunDisk.visible = true;
        moon.intensity = 0.0;
        torchPoint.intensity = 0.0;
        torchSpot.intensity  = 0.0;
        flame.visible = false;
    } else {
        hemi.intensity = 0.06;
        sun.intensity = 0.0;
        sunDisk.visible = false;
        moon.intensity = 0.6;
        torchPoint.intensity = 2.2;
        torchSpot.intensity  = 1.2;
        flame.visible = true;
    }
}

export function showStars(on) {
    if (lights?.starField) lights.starField.visible = !!on;
}

export function isDaytime() { return state.day; }

export function updateSun() {
    if (!lights) return;
    if (!state.day) {
        const t = performance.now();
        const f = Math.sin(t*0.020)*0.25 + Math.sin(t*0.017)*0.2 + Math.random()*0.12;
        lights.torchPoint.intensity = 1.8 + f;
        lights.torchSpot.intensity  = 1.0 + f*0.4;
    }
}

export function attachTorchTo(fpCamera) {
    if (!lights) return;
    fpCamera.add(lights.torchGroup);
    fpCamera.add(lights.torchPoint);
    fpCamera.add(lights.torchSpot);
}
