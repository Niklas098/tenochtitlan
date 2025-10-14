import * as THREE from 'three';
import Stats from 'stats.js';
import { createRenderer } from '../util/renderer.js';
import { createCameras } from '../util/cameras.js';
import { addLights } from '../util/lights.js';
import { createGUI } from '../ui/gui.js';
import { createGround } from '../scene/city/ground.js';

const canvas = document.getElementById('app');
const hud = document.getElementById('hud');

// Renderer & Scene
const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Cameras
const { drone, person, orbit, plock } = createCameras(renderer);

// Lights
const lights = addLights(scene);

// Ground
scene.add(createGround());

// State + GUI
const state = { camera:'drone', day:true, spotlight:true };
const gui = createGUI({ scene, lights, state });

// Keyboard shortcuts
addEventListener('keydown', (e)=>{
    if (e.code === 'KeyG') gui._hidden ? gui.show() : gui.hide();
    if (e.code === 'KeyC') state.camera = (state.camera === 'drone') ? 'person' : 'drone';
});

// Person movement
const vel = new THREE.Vector3();
const keys = {};
addEventListener('keydown', e=>keys[e.code]=true);
addEventListener('keyup', e=>keys[e.code]=false);
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

// Stats + HUD
const stats = new Stats(); stats.showPanel(0); document.body.appendChild(stats.dom);
let last = performance.now(); let fps = 0;
function updateHUD(dt){
    const currentFPS = 1/dt; fps = fps ? fps*0.9 + currentFPS*0.1 : currentFPS;
    const used = (performance.memory && performance.memory.usedJSHeapSize) ? (performance.memory.usedJSHeapSize/1024/1024).toFixed(1) : "n/a";
    hud.innerHTML = `FPS: ${Math.round(fps)} | MS: ${(dt*1000).toFixed(1)} | MB: ${used}`;
}

// Aktive Kamera wählen
function activeCamera(){ return state.camera==='drone' ? drone : person; }

// Resize
function onResize(){
    drone.aspect = innerWidth/innerHeight; drone.updateProjectionMatrix();
    person.aspect = innerWidth/innerHeight; person.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

// Main Loop
function loop(){
    stats.begin();
    const now = performance.now();
    const dt = (now-last)/1000; last = now;

    if (state.camera==='person') updatePerson(dt);
    orbit.enabled = (state.camera==='drone');
    if (orbit.enabled) orbit.update();

    renderer.render(scene, activeCamera());
    updateHUD(dt);
    stats.end();
    requestAnimationFrame(loop);
}
loop();