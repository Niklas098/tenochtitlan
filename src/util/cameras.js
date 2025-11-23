// src/util/cameras.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isInsideAnyHitbox, findSafeSpawnPosition } from './collision.js';

let active = 'drone';
let onCameraSwitch = null;
const FP_BASE_HEIGHT = 1.85;          // "Boden" / Augenhöhe
const SWITCH_TMP = new THREE.Vector3();

export function createCameras(renderer, canvas, options = {}) {
    const aspect = window.innerWidth / window.innerHeight;

    // ===== ORBIT =====
    const orbitCam = new THREE.PerspectiveCamera(60, aspect, 0.1, 9000);
    orbitCam.position.set(180, 140, 220);
    const orbit = new OrbitControls(orbitCam, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.screenSpacePanning = true;
    orbit.maxPolarAngle = Math.PI * 0.49;
    orbit.target.set(0,10,0);
    function updateOrbit() { if (active === 'orbit') orbit.update(); }

    // ===== DRONE =====
    const conf = Object.assign(
        { flySpeed: 32, height: 120, minHeight: 25, maxHeight: 350, turbo: 1.8 },
        options.drone || {}
    );
    const drone = new THREE.PerspectiveCamera(70, aspect, 0.1, 9000);
    drone.position.set(0, conf.height, 6);
    let yaw = 0, pitch = -0.08;
    const keys = { w:false, a:false, s:false, d:false, q:false, e:false, shift:false, rmb:false, lastX:0, lastY:0 };

    const onKey = (e, down) => {
        if (e.code === 'KeyW') keys.w = down;
        if (e.code === 'KeyA') keys.a = down;
        if (e.code === 'KeyS') keys.s = down;
        if (e.code === 'KeyD') keys.d = down;
        if (e.code === 'KeyQ') keys.q = down;
        if (e.code === 'KeyE') keys.e = down;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = down;
    };
    window.addEventListener('keydown', e=>onKey(e,true));
    window.addEventListener('keyup',   e=>onKey(e,false));

    renderer.domElement.addEventListener('contextmenu', e=>e.preventDefault());
    renderer.domElement.addEventListener('mousedown', (e)=>{ if (e.button===2){ keys.rmb=true; keys.lastX=e.clientX; keys.lastY=e.clientY; }});
    window.addEventListener('mouseup', (e)=>{ if (e.button===2) keys.rmb=false; });
    window.addEventListener('mousemove', (e)=>{
        if (active!=='drone' || !keys.rmb) return;
        const dx = e.clientX - keys.lastX;
        const dy = e.clientY - keys.lastY;
        keys.lastX = e.clientX; keys.lastY = e.clientY;
        const s = 0.003;
        yaw   -= dx * s;
        pitch -= dy * s;
        pitch = Math.max(-1.3, Math.min(1.3, pitch));
    });

    renderer.domElement.addEventListener('wheel', (e) => {
        if (active !== 'drone') return;
        e.preventDefault();
        const delta = Math.sign(e.deltaY);
        const step = 6 * (keys.shift ? conf.turbo : 1);
        const newY = THREE.MathUtils.clamp(drone.position.y - delta * step, conf.minHeight, conf.maxHeight);
        drone.position.y = newY;
    }, { passive: false });

    function updateDrone(dt) {
        if (active !== 'drone') return;
        drone.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

        const mult = keys.shift ? conf.turbo : 1.0;
        const speed = conf.flySpeed * mult * dt;

        const forward = new THREE.Vector3(0,0,-1).applyQuaternion(drone.quaternion);
        const right   = new THREE.Vector3(1,0, 0).applyQuaternion(drone.quaternion);
        forward.y = 0; forward.normalize();
        right.y = 0; right.normalize();

        const move = new THREE.Vector3();
        if (keys.w) move.addScaledVector(forward,  speed);
        if (keys.s) move.addScaledVector(forward, -speed);
        if (keys.a) move.addScaledVector(right,   -speed);
        if (keys.d) move.addScaledVector(right,    speed);
        if (keys.e) move.y += speed;
        if (keys.q) move.y -= speed;

        if (move.lengthSq() > 0) {
            const candidate = drone.position.clone().add(move);
            candidate.y = THREE.MathUtils.clamp(candidate.y, conf.minHeight, conf.maxHeight);
            if (!isInsideAnyHitbox(candidate)) {
                drone.position.copy(candidate);
            }
        }

        drone.position.y = THREE.MathUtils.clamp(drone.position.y, conf.minHeight, conf.maxHeight);
    }

    function resetHeight() { drone.position.y = conf.height; }

    // ===== FP (Ego) =====
    // längere Sichtweite nötig, damit die fernen Berge im Ego-Modus nicht ausgeclippt werden
    const fp = new THREE.PerspectiveCamera(70, aspect, 0.05, 15000);
    fp.position.set(0, FP_BASE_HEIGHT, 3.2);

    const kfp = { w:false, a:false, s:false, d:false, locked:false, jumping:false };
    let yawF=0, pitchF=0;
    let fpVelY = 0;                       // vertikale Geschwindigkeit
    const GRAVITY = -24;                  // m/s^2 ungefähr
    const JUMP_SPEED = 9.5;               // Sprung-Impuls

    const onKeyFp = (e, down) => {
        if (e.code === 'KeyW') kfp.w = down;
        if (e.code === 'KeyA') kfp.a = down;
        if (e.code === 'KeyS') kfp.s = down;
        if (e.code === 'KeyD') kfp.d = down;

        // springen
        if (e.code === 'Space' && down) {
            // nur springen, wenn wir auf dem Boden sind
            if (Math.abs(fp.position.y - FP_BASE_HEIGHT) < 0.001) {
                fpVelY = JUMP_SPEED;
                kfp.jumping = true;
            }
        }
    };
    window.addEventListener('keydown', e=>onKeyFp(e,true));
    window.addEventListener('keyup',   e=>onKeyFp(e,false));

    canvas.addEventListener('click', ()=> {
        if (active === 'fp' && !kfp.locked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', ()=> {
        kfp.locked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', e=> {
        if (active!=='fp' || !kfp.locked) return;
        const s = 0.0026;
        yawF   -= e.movementX * s;
        pitchF -= e.movementY * s;
        pitchF = Math.max(-1.5, Math.min(1.5, pitchF));
        fp.quaternion.setFromEuler(new THREE.Euler(pitchF, yawF, 0, 'YXZ'));
    });

    function updateFp(dt) {
        if (active!=='fp') return;

        // horizontale Bewegung
        const dir = new THREE.Vector3();
        // W/S waren vertauscht → nun korrekt
        if (kfp.w) dir.z += 1;
        if (kfp.s) dir.z -= 1;
        if (kfp.a) dir.x -= 1;
        if (kfp.d) dir.x += 1;
        dir.normalize();

        const speed = 16 * dt;
        const forward = new THREE.Vector3();
        fp.getWorldDirection(forward);
        forward.y = 0; forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
        const move = new THREE.Vector3();
        move.addScaledVector(forward, dir.z * speed);
        move.addScaledVector(right,   dir.x * speed);

        if (move.lengthSq() > 0) {
            const candidate = fp.position.clone().add(move);
            if (!isInsideAnyHitbox(candidate)) {
                fp.position.copy(candidate);
            }
        }

        // vertikale Bewegung (Sprung + Gravitation)
        fpVelY += GRAVITY * dt;                       // Gravitation anwenden
        fp.position.y += fpVelY * dt;                 // vertikale Position updaten

        // Boden-Kollision
        if (fp.position.y < FP_BASE_HEIGHT) {
            fp.position.y = FP_BASE_HEIGHT;
            fpVelY = 0;
            kfp.jumping = false;
        }
    }

    onCameraSwitch = (prev, next) => {
        if (prev === next) return;
        if (next === 'fp') {
            SWITCH_TMP.set(drone.position.x, FP_BASE_HEIGHT, drone.position.z);
            const safe = findSafeSpawnPosition(SWITCH_TMP);
            fp.position.copy(safe);
            fpVelY = 0;
            kfp.jumping = false;
        }
    };

    return {
        orbit: { camera: orbitCam, controls: orbit, update: updateOrbit },
        drone: { camera: drone, update: updateDrone, resetHeight, _conf: conf },
        fp:    { camera: fp,    update: updateFp }
    };
}

export function switchToCamera(type) {
    if (active === type) return;
    const prev = active;
    active = type;
    if (onCameraSwitch) onCameraSwitch(prev, type);
}
export function getActiveCameraType() { return active; }
