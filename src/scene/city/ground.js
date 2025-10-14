import * as THREE from 'three';
export function createGround() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(1600, 1600),
        new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 1.0, metalness: 0 })
    );
    ground.rotation.x = -Math.PI/2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    return ground;
}
