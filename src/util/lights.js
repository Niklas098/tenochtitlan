import * as THREE from 'three';
export function addLights(scene) {
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(200, 300, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1000;
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.5);
    scene.add(hemi);

    const spot = new THREE.SpotLight(0xffddaa, 1.2, 220, Math.PI/8, 0.2, 1.0);
    spot.position.set(0, 30, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot);
    return { sun, hemi, spot };
}
