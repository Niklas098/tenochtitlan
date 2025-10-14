import GUI from 'lil-gui';
import * as THREE from 'three';

export function createGUI({ scene, lights, state }) {
    const gui = new GUI();
    gui.add(state, 'camera', ['drone','person']).name('Kamera');
    gui.add(state, 'day').name('Tag/Nacht').onChange(v=>{
        scene.background = new THREE.Color(v?0x87ceeb:0x0b0e29);
        lights.sun.intensity = v?1.1:0.06;
        lights.hemi.intensity = v?0.5:0.2;
    });
    gui.add(state, 'spotlight').name('Spot an/aus').onChange(v=>{
        lights.spot.intensity = v?1.2:0.0;
    });
    return gui;
}
