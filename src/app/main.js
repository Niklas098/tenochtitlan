// src/app/main.js
import * as THREE from 'three';
import { createRenderer } from '../util/renderer.js';
import { createCameras, switchToCamera, getActiveCameraType } from '../util/cameras.js';
import { createLights, setDayNight, updateSun, isDaytime, attachTorchTo } from '../util/lights.js';
import { buildCity, updateCity } from '../scene/city/city.js';
import createGUI from '../ui/gui.js';

let renderer, scene, cameras, clock, lights, gui, stats, overlayEl;

init();
animate();

function init() {
    // Szene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xAEB7BD);
    scene.fog = new THREE.FogExp2(0xAEB7BD, 0.00012); // dezente Atmosphäre

    // Renderer + Stats + Overlay
    const { renderer: r, stats: s, overlayEl: o } = createRenderer();
    renderer = r; stats = s; overlayEl = o;
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(stats.dom);
    document.body.appendChild(overlayEl);

    // Kameras
    cameras = createCameras(renderer);

    // Lichter (Sonne/Mond/Sterne/Skydome, Fackel)
    lights = createLights(scene, renderer);

    // Startzustand: Tag
    setDayNight(true, scene, lights);

    // Welt (nur Boden – Gebäude kommen später)
    buildCity(scene, lights);

    // Fackel an Ego-Kamera koppeln
    attachTorchTo(cameras.fp.camera, scene, lights);

    // GUI (minimal)
    gui = createGUI({
        onToggleDayNight: (v) => setDayNight(v, scene, lights),
        onCameraChange: (type) => switchToCamera(type, cameras),
        isDay: () => isDaytime(),
        getCameraType: () => getActiveCameraType(),
        renderer,
    });

    // Standard: Drohne
    switchToCamera('drone', cameras);

    // Clock
    clock = new THREE.Clock();

    // Events
    window.addEventListener('resize', onResize);
    onResize();

    // PointerLock bei Ego
    window.addEventListener('click', () => {
        if (getActiveCameraType() === 'fp') cameras.fp.controls.lock();
    });

    // Tastatur: C = Kamera umschalten
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyC') {
            const next = getActiveCameraType() === 'drone' ? 'fp' : 'drone';
            switchToCamera(next, cameras);
            if (next === 'fp') cameras.fp.controls.lock();
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    // Sonne/Mond animieren
    updateSun(t, lights);

    // Skydome auf Kamera „kleben“
    if (lights.skyDome) lights.skyDome.position.copy(cameras.active.camera.position);

    // Welt-Updates (Hook für später)
    updateCity(dt, t, lights, cameras.active.camera);

    // Controls
    cameras.drone.controls.update();
    cameras.fp.update(dt);

    // Fackel-Flackern
    lights.updateTorch(dt);

    // Render
    renderer.render(scene, cameras.active.camera);

    // Stats/Overlay
    stats.update();
    const mem = performance && performance.memory ? (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(0) : '—';
    overlayEl.textContent = `Camera: ${getActiveCameraType().toUpperCase()} | ${isDaytime() ? 'Day' : 'Night'} | MB: ${mem}`;
}

function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    for (const k of ['drone', 'fp']) {
        const cam = cameras[k].camera;
        cam.aspect = window.innerWidth / window.innerHeight;
        cam.updateProjectionMatrix();
    }
}
