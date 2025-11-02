// src/app/main.js
import * as THREE from 'three';
import { createRenderer } from '../util/renderer.js';
import { createCameras, switchToCamera, getActiveCameraType } from '../util/cameras.js';
import { createLights, setDayNight, updateSun, isDaytime, attachTorchTo, showStars } from '../util/lights.js';
import { buildCity, updateCity } from '../scene/city/city.js';
import createGUI from '../ui/gui.js';

let renderer, scene, cameras, clock, lights, gui, stats, overlayEl;

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xC9D5E6);

    const canvas = document.getElementById('app');
    if (!canvas) {
        console.error("FEHLER: <canvas id='app'> fehlt in index.html");
        return;
    }

    ({ renderer, stats, overlayEl } = createRenderer(canvas));

    // Drei Modi: orbit (klassisch), drone (Free-Fly), fp (Ego)
    cameras = createCameras(renderer, canvas, {
        drone: { flySpeed: 36, height: 120, minHeight: 25, maxHeight: 350, turbo: 2.0 }
    });
    switchToCamera('drone');

    lights = createLights(scene);

    // Kleinere Map, damit FP größer wirkt
    buildCity(scene, { groundSize: 2400 });

    attachTorchTo(cameras.fp.camera);

    gui = createGUI(renderer, cameras, lights);

    setDayNight(true);
    showStars(false);

    clock = new THREE.Clock();
    window.addEventListener('resize', onResize);
    onResize();

    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyC') {
            const order = ['orbit','drone','fp'];
            const cur = order.indexOf(getActiveCameraType());
            const next = order[(cur+1) % order.length];
            switchToCamera(next);
        }
        if (e.code === 'KeyN') {
            const day = !isDaytime();
            setDayNight(day);
            scene.background = day ? new THREE.Color(0xC9D5E6) : new THREE.Color(0x05070A);
            showStars(!day);
        }
        if (e.code === 'KeyG') {
            gui._hidden ? gui.show() : gui.hide();
        }
        if (e.code === 'KeyR') {
            cameras.drone.resetHeight();
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    cameras.orbit.update(dt);
    cameras.drone.update(dt);
    cameras.fp.update(dt);

    updateSun(dt);
    updateCity(dt, t, scene, getActiveCameraType());

    scene.background = isDaytime() ? new THREE.Color(0xC9D5E6) : new THREE.Color(0x05070A);

    const type = getActiveCameraType();
    const cam = type === 'orbit' ? cameras.orbit.camera
        : type === 'drone' ? cameras.drone.camera
            : cameras.fp.camera;

    renderer.render(scene, cam);

    const mem = performance?.memory ? (performance.memory.usedJSHeapSize / (1024*1024)).toFixed(0) : '—';
    overlayEl.textContent = `Cam: ${type.toUpperCase()} · ${isDaytime()?'DAY':'NIGHT'} · FPS:${stats.fps} · MS:${stats.ms} · MB:${mem}`;
    stats.update();
}

function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    for (const k of ['orbit','drone','fp']) {
        const cam = cameras[k].camera;
        cam.aspect = window.innerWidth / window.innerHeight;
        cam.updateProjectionMatrix();
    }
}
