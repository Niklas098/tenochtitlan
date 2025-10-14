import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export function createCameras(renderer) {
    const drone = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 3000);
    drone.position.set(200, 180, 200);

    const person = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1500);
    person.position.set(5, 2, 5);

    const orbit = new OrbitControls(drone, renderer.domElement);
    const plock = new PointerLockControls(person, document.body);
    return { drone, person, orbit, plock };
}
