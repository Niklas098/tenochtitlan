// src/util/cameras.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let active = 'drone';

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

    // ===== DRONE (einfaches Free-Fly, keine PointerLock nötig) =====
    const conf = Object.assign(
        { flySpeed: 36, height: 120, minHeight: 25, maxHeight: 350, turbo: 2.0 },
        options.drone || {}
    );
    const drone = new THREE.PerspectiveCamera(70, aspect, 0.1, 9000);
    drone.position.set(0, conf.height, 6);
    let yaw = 0, pitch = -0.1;
    const keys = { w:false, a:false, s:false, d:false, q:false, e:false, shift:false, rmb:false, lastX:0, lastY:0 };

    const onKey = (e, down) => {
        if (e.code === 'KeyW') keys.w = down;
        if (e.code === 'KeyA') keys.a = down;
        if (e.code === 'KeyS') keys.s = down;
        if (e.code === 'KeyD') keys.d = down;
        if (e.code === 'KeyQ') keys.q = down; // runter
        if (e.code === 'KeyE') keys.e = down; // hoch
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = down;
    };
    window.addEventListener('keydown', e=>onKey(e,true));
    window.addEventListener('keyup',   e=>onKey(e,false));

    // Rechte Maustaste gedrückt halten zum Umschauen (ohne PointerLock)
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
        pitch = Math.max(-1.4, Math.min(1.4, pitch));
    });

    // Mausrad: Höhe justieren (sanft)
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
        forward.y = 0; forward.normalize(); // planar
        right.y = 0; right.normalize();

        const move = new THREE.Vector3();
        if (keys.w) move.addScaledVector(forward,  speed);
        if (keys.s) move.addScaledVector(forward, -speed);
        if (keys.a) move.addScaledVector(right,   -speed);
        if (keys.d) move.addScaledVector(right,    speed);
        if (keys.e) move.y += speed; // hoch
        if (keys.q) move.y -= speed; // runter

        drone.position.add(move);
        drone.position.y = THREE.MathUtils.clamp(drone.position.y, conf.minHeight, conf.maxHeight);
    }

    function resetHeight() { drone.position.y = conf.height; }

    // ===== FP (Ego) =====
    const fp = new THREE.PerspectiveCamera(70, aspect, 0.05, 5000);
    fp.position.set(0, 1.8, 3.5); // leicht höher + näher: wirkt „größer“
    const kfp = { w:false, a:false, s:false, d:false, locked:false };
    let yawF=0, pitchF=0;

    const onKeyFp = (e, down) => {
        if (e.code === 'KeyW') kfp.w = down;
        if (e.code === 'KeyA') kfp.a = down;
        if (e.code === 'KeyS') kfp.s = down;
        if (e.code === 'KeyD') kfp.d = down;
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
        const dir = new THREE.Vector3();
        if (kfp.w) dir.z -= 1;
        if (kfp.s) dir.z += 1;
        if (kfp.a) dir.x -= 1;
        if (kfp.d) dir.x += 1;
        dir.normalize();

        const speed = 16 * dt;
        const forward = new THREE.Vector3();
        fp.getWorldDirection(forward);
        forward.y = 0; forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
        fp.position.addScaledVector(forward, dir.z * speed);
        fp.position.addScaledVector(right,   dir.x * speed);
    }

    return {
        orbit: { camera: orbitCam, controls: orbit, update: updateOrbit },
        drone: { camera: drone, update: updateDrone, resetHeight, _conf: conf },
        fp:    { camera: fp,    update: updateFp }
    };
}

export function switchToCamera(type) { active = type; }
export function getActiveCameraType() { return active; }
