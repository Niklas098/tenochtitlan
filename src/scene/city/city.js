// src/scene/city/city.js
import * as THREE from 'three';

/**
 * Maximal simple Stadtbasis:
 * - nur EINE große, flache Bodenplatte
 * - keine weiteren Objekte/Outlines/Helper
 * - ideal als neutrale Spielfläche für Ego & Drohne
 *
 * Usage:
 *   const city = buildCity({ SIZE: 8000, y: 0, color: 0xD9CEB8 });
 *   scene.add(city);
 */

export function buildCity(opts = {}) {
    const SIZE   = opts.SIZE   ?? 8000;       // Kantenlänge der Platte (sehr groß)
    const y      = opts.y      ?? 0.0;        // Y-Höhe
    const color  = opts.color  ?? 0xD9CEB8;   // sandiges Beige
    const rough  = opts.rough  ?? 0.98;       // schön matt
    const metal  = 0.0;

    // Gruppe als Root (nur damit API kompatibel bleibt)
    const city = new THREE.Group();
    city.name = 'CityRoot';

    // Eine flache, performante Bodengeometrie (1 Segment reicht)
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
    geo.rotateX(-Math.PI / 2);

    // Neutrales, mattes Standardmaterial
    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: metal,
        // Minimale Priorität, falls später andere Planes drüber kommen:
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });

    const ground = new THREE.Mesh(geo, mat);
    ground.name = 'MegaGround';
    ground.position.y = y;
    ground.receiveShadow = true;
    ground.castShadow = false;

    city.add(ground);

    // Kleines Meta (optional)
    city.userData = {
        type: 'flat-ground-only',
        size: SIZE
    };

    return city;
}
