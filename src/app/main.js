// src/app/main.js
import * as THREE from 'three';
import Stats from 'stats.js';
import { createRenderer } from '../util/renderer.js';
import { createCameras } from '../util/cameras.js';
import { addLights } from '../util/lights.js';
import { createGUI } from '../ui/gui.js';
import { createGround } from '../scene/city/ground.js';
import { buildCity } from '../scene/city/city.js';

const canvas = document.getElementById('app');
const hud = document.getElementById('hud');

// ------------------------------------------------------------------
// Renderer & Scene
// ------------------------------------------------------------------
const renderer = createRenderer(canvas);

// ► Nachkonfigurieren (gegen „dunkel“/harte Schatten)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// „schwarzer“ Grundstücks-Hintergrund → sehr dunkles Grau (kein totales Schwarz)
scene.background = new THREE.Color(0x0e0f12);

// ------------------------------------------------------------------
// Cameras & Lights
// ------------------------------------------------------------------
const { drone, person, orbit, plock } = createCameras(renderer);

// Kamera: großes Far-Plane, weite Distanzen
[drone, person].forEach(cam => {
    cam.near = 0.1;
    cam.far = 20000;
    cam.updateProjectionMatrix();
});
drone.position.set(1800, 1600, 1800);

// Grundbeleuchtung weich und hell genug – addLights() kann bleiben,
// wir ergänzen aber eine „helle“ Baseline und setzen Shadow-Bias.
const lights = addLights(scene);

// Falls addLights keine Hemisphäre/Ambient setzt, ergänzen:
const hemi = new THREE.HemisphereLight(0xffffff, 0xdccfbd, 0.55);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.14);
scene.add(ambient);

// Eine „Sonne“ mit weichen Schatten und Bias gegen Akne/Banding:
const sun = new THREE.DirectionalLight(0xffffff, 1.05);
sun.position.set(1200, 2200, 1400);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 8000;
sun.shadow.camera.left = -3000;
sun.shadow.camera.right = 3000;
sun.shadow.camera.top = 3000;
sun.shadow.camera.bottom = -3000;
// ► wichtig gegen „schwarze Kanten/Artefakte“ beim Rotieren:
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.6;
scene.add(sun);

// ------------------------------------------------------------------
// Ground (neutraler Untergrund) – DEUTLICH größer
// ------------------------------------------------------------------
const ground = createGround?.({ size: 4000, color: 0x0b0c0f }) ?? createGround();
ground.receiveShadow = true;
// Falls createGround keine Größe kennt: brutal skalieren
if (!ground.userData?.size) ground.scale.setScalar(4.0);
scene.add(ground);

// ------------------------------------------------------------------
// City (GRUNDRISS stark vergrößert)
// ------------------------------------------------------------------
// Achtung: city.js muss die opts {MAP, CORE} unterstützen (meine Version tut das).
const city = buildCity({ MAP: 1600, CORE: 1320 });
scene.add(city);

// Optionale Helper-Container, damit GUI togglen kann
if (!city.userData.helpers) {
    const helpers = new THREE.Group(); helpers.name = 'Helpers'; helpers.visible = false;
    scene.add(helpers); city.userData.helpers = helpers;
}
if (!city.userData.placeholders) {
    const placeholders = scene.getObjectByName('Blocks') ?? new THREE.Group();
    placeholders.name = 'Blocks';
    city.userData.placeholders = placeholders;
}

// ------------------------------------------------------------------
// GUI
// ------------------------------------------------------------------
const state = {
    camera: 'drone',
    day: true,
    spotlight: true,
    showHelpers: false,
    showPlaceholders: true
};
const gui = createGUI({ scene, lights, state });

// Kleiner zusätzlicher GUI-Ordner nur für Layer
import GUI from 'lil-gui';
const more = new GUI({ title: 'City Layers' });
more.add(state, 'showHelpers').name('Helpers (Grid/Axes)').onChange(v=>{
    if (city.userData.helpers) city.userData.helpers.visible = v;
});
more.add(state, 'showPlaceholders').name('Placeholders (Blocks)').onChange(v=>{
    if (city.userData.placeholders) city.userData.placeholders.visible = v;
});

// ------------------------------------------------------------------
// Steuerung / Bewegung
// ------------------------------------------------------------------
const vel = new THREE.Vector3();
const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup',   e => keys[e.code] = false);

function updatePerson(dt){
    const speed = 10;
    vel.set(0,0,0);
    if (keys['KeyW']) vel.z -= speed;
    if (keys['KeyS']) vel.z += speed;
    if (keys['KeyA']) vel.x -= speed;
    if (keys['KeyD']) vel.x += speed;
    plock.moveRight(vel.x * dt);
    plock.moveForward(vel.z * dt);
}

// Maus-Sperre bei Klick im Personenmodus
window.addEventListener('pointerdown', ()=>{
    if (state.camera==='person' && !plock.isLocked) plock.lock();
});

// Kamera-Umschalter & GUI Toggle
addEventListener('keydown', (e)=>{
    if (e.code === 'KeyG') { gui._hidden ? (gui.show(), more.show()) : (gui.hide(), more.hide()); }
    if (e.code === 'KeyC')  { state.camera = (state.camera === 'drone') ? 'person' : 'drone'; }
});

// OrbitControls: sanft, keine Unteransicht
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.minDistance = 200;
orbit.maxDistance = 6000;
orbit.maxPolarAngle = Math.PI * 0.49;
orbit.minPolarAngle = Math.PI * 0.12;
orbit.target.set(0, 0.25, 0);

// ------------------------------------------------------------------
// Resize
// ------------------------------------------------------------------
function onResize(){
    drone.aspect = innerWidth/innerHeight; drone.updateProjectionMatrix();
    person.aspect = innerWidth/innerHeight; person.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

// ------------------------------------------------------------------
// Stats + HUD
// ------------------------------------------------------------------
const stats = new Stats(); stats.showPanel(0); document.body.appendChild(stats.dom);
let last = performance.now(); let fps = 0;

function activeCamera(){ return state.camera==='drone' ? drone : person; }

function updateHUD(dt){
    const currentFPS = 1/dt; fps = fps ? fps*0.9 + currentFPS*0.1 : currentFPS;
    const used = (performance.memory && performance.memory.usedJSHeapSize)
        ? (performance.memory.usedJSHeapSize/1024/1024).toFixed(1)
        : "n/a";
    hud.innerHTML = `FPS: ${Math.round(fps)} | MS: ${(dt*1000).toFixed(1)} | MB: ${used}`;
}

// ------------------------------------------------------------------
// Loop
// ------------------------------------------------------------------
function loop(){
    stats.begin();
    const now = performance.now();
    const dt = (now - last) / 1000; last = now;

    if (state.camera==='person') updatePerson(dt);
    orbit.enabled = (state.camera==='drone');
    if (orbit.enabled) orbit.update();

    renderer.render(scene, activeCamera());
    updateHUD(dt);
    stats.end();
    requestAnimationFrame(loop);
}
loop();
