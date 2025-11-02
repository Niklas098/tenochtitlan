// src/util/cameras.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

let activeType = 'drone';

export function createCameras(renderer) {
    const aspect = window.innerWidth / window.innerHeight;

    // Drohne / Orbit
    const droneCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 40000);
    droneCamera.position.set(1600, 900, 1600);
    const droneControls = new OrbitControls(droneCamera, renderer.domElement);
    droneControls.enableDamping = true;
    droneControls.minDistance = 2;
    droneControls.maxDistance = 15000;
    droneControls.target.set(0, 0, 0);

    // Ego / FP
    const fpCamera = new THREE.PerspectiveCamera(70, aspect, 0.1, 40000);
    fpCamera.position.set(0, 1.75, 0);
    const fpControls = new PointerLockControls(fpCamera, document.body);

    const fp = makeFPController(fpCamera, fpControls);

    return {
        drone: { camera: droneCamera, controls: droneControls },
        fp,
        active: { camera: droneCamera, type: 'drone' }
    };
}

export function switchToCamera(type, cameras) {
    if (type === 'drone') {
        if (cameras.fp.controls.isLocked) cameras.fp.controls.unlock();
        cameras.active.camera = cameras.drone.camera;
        cameras.active.type = 'drone';
        activeType = 'drone';
    } else {
        cameras.active.camera = cameras.fp.camera;
        cameras.active.type = 'fp';
        activeType = 'fp';
    }
}

export function getActiveCameraType() {
    return activeType;
}

function makeFPController(camera, controls) {
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const move = { forward: false, backward: false, left: false, right: false };
    const speed = 30; // m/s

    document.addEventListener('keydown', (e)=>{
        switch(e.code){
            case 'KeyW': case 'ArrowUp': move.forward = true; break;
            case 'KeyS': case 'ArrowDown': move.backward = true; break;
            case 'KeyA': case 'ArrowLeft': move.left = true; break;
            case 'KeyD': case 'ArrowRight': move.right = true; break;
        }
    });
    document.addEventListener('keyup', (e)=>{
        switch(e.code){
            case 'KeyW': case 'ArrowUp': move.forward = false; break;
            case 'KeyS': case 'ArrowDown': move.backward = false; break;
            case 'KeyA': case 'ArrowLeft': move.left = false; break;
            case 'KeyD': case 'ArrowRight': move.right = false; break;
        }
    });

    function update(dt){
        // Dämpfung
        velocity.x -= velocity.x * 8.0 * dt;
        velocity.z -= velocity.z * 8.0 * dt;

        // Richtung aus WASD
        direction.set(0,0,0);
        if (move.forward) direction.z -= 1;
        if (move.backward) direction.z += 1;
        if (move.left) direction.x -= 1;
        if (move.right) direction.x += 1;
        direction.normalize();

        if (controls.isLocked){
            velocity.z -= direction.z * speed * dt;
            velocity.x -= direction.x * speed * dt;

            controls.moveRight( -velocity.x * dt );
            controls.moveForward( -velocity.z * dt );

            // Auf Bodenniveau halten – kein „Durchfallen“ / keine Unterseite
            camera.position.y = 1.75;
        }
    }

    return { camera, controls, update };
}
