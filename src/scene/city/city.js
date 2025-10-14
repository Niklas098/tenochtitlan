// src/scene/city/city.js
import * as THREE from 'three';

/**
 * Tenochtitlan – Stadt-Grundriss (Variante B – korrigiert)
 * 1u = 1m. Rechteckige Karte mit:
 *  - Straßen (dunkle Streifen)
 *  - niedrigen Gebäude-Blöcken (0.4–2m)
 *  - Umfassungsmauer (Coatepantli)
 *  - Anchors (für spätere Blender-Modelle)
 */

export function buildCity() {
    // ---------- Maße ----------
    const MAP = 640;
    const BASE_H = 0.12;
    const STREET_W = 10;
    const LANE_W = 6;
    const WALL_TH = 4;
    const WALL_H = 3;
    const CORE = 520;
    const CORE_Y = BASE_H;

    // ---------- Materialien ----------
    const MAT = {
        base:   new THREE.MeshStandardMaterial({ color: 0xEEE5D5, roughness: 0.95 }),
        core:   new THREE.MeshStandardMaterial({ color: 0xE6D7BF, roughness: 0.94 }),
        street: new THREE.MeshStandardMaterial({ color: 0xB7A690, roughness: 0.92 }),
        block:  new THREE.MeshStandardMaterial({ color: 0xD9CBB5, roughness: 0.92 }),
        dark:   new THREE.MeshStandardMaterial({ color: 0xA18F79, roughness: 0.9  }),
        wall:   new THREE.MeshStandardMaterial({ color: 0xCAB79B, roughness: 0.9  }),
        anchor: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.85 })
    };

    const city = new THREE.Group();
    city.name = 'CityRoot';

    // ---------- Basis & Core ----------
    const base = new THREE.Mesh(new THREE.BoxGeometry(MAP, BASE_H, MAP), MAT.base);
    base.position.set(0, BASE_H / 2, 0);
    base.receiveShadow = true;
    base.name = 'MapBase';
    city.add(base);
    addOutline(city, base, 0x111111, 0.35);

    const core = new THREE.Mesh(new THREE.BoxGeometry(CORE, BASE_H, CORE), MAT.core);
    core.position.set(0, CORE_Y + BASE_H / 2, 0);
    core.receiveShadow = true;
    core.name = 'CityCore';
    city.add(core);
    addOutline(city, core, 0x000000, 0.35);

    // ---------- Wände ----------
    const wall = new THREE.Group();
    wall.name = 'PerimeterWall';
    const wallY = CORE_Y + BASE_H + WALL_H / 2;
    const seg = (w, d, x, z, rot = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), MAT.wall);
        m.position.set(x, wallY, z);
        m.rotation.y = rot;
        m.castShadow = m.receiveShadow = true;
        wall.add(m);
        addOutline(wall, m, 0x000000, 0.3);
    };
    const L = CORE + WALL_TH * 2 + 10;
    seg(L, WALL_TH, 0,  (CORE / 2) + WALL_TH, 0);
    seg(L, WALL_TH, 0, -(CORE / 2) - WALL_TH, 0);
    seg(WALL_TH, L,  (CORE / 2) + WALL_TH, 0, 0);
    seg(WALL_TH, L, -(CORE / 2) - WALL_TH, 0, 0);
    city.add(wall);

    // ---------- Straßen ----------
    const streets = new THREE.Group();
    streets.name = 'Streets';
    const streetY = CORE_Y + BASE_H + 0.02;
    const mkStreet = (len, w, x, z, rot = 0, name = 'Street') => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, len), MAT.street);
        g.position.set(x, streetY, z);
        g.rotation.y = rot;
        g.receiveShadow = true;
        g.name = name;
        streets.add(g);
    };
    mkStreet(CORE - 40, STREET_W, 0, 0, 0, 'Street_NS');
    mkStreet(CORE - 40, STREET_W, 0, 0, Math.PI / 2, 'Street_EW');
    mkStreet(CORE - 80, LANE_W,  CORE * 0.22,  0, Math.PI / 2, 'Lane_E1');
    mkStreet(CORE - 80, LANE_W, -CORE * 0.22,  0, Math.PI / 2, 'Lane_W1');
    mkStreet(CORE - 80, LANE_W,  0,  CORE * 0.22, 0, 'Lane_N1');
    mkStreet(CORE - 80, LANE_W,  0, -CORE * 0.22, 0, 'Lane_S1');
    city.add(streets);

    // ---------- Anchors-Gruppe (vorher anlegen!) ----------
    const anchors = new THREE.Group();
    anchors.name = 'Anchors';
    city.add(anchors);

    // ---------- Snap-Daten ----------
    const snapInfo = {};

    // ---------- Blöcke ----------
    const blocks = new THREE.Group();
    blocks.name = 'Blocks';
    const padY = streetY + 0.03;

    const mkBlock = (key, x, z, sx, sz, h = 1.2, mat = MAT.block) => {
        const g = new THREE.Group();
        g.name = key;
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), mat);
        m.position.set(0, h / 2, 0);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        addOutline(g, m, 0x000000, 0.33);
        g.position.set(x, padY, z);
        blocks.add(g);

        const a = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), MAT.anchor);
        a.position.set(x, padY + h + 0.05, z);
        a.name = 'ANK_' + key;
        a.userData.isAnchor = true;
        anchors.add(a);

        snapInfo[key] = { pos: a.position.clone(), size: new THREE.Vector3(sx, h, sz) };
    };

    const mkRound = (key, x, z, r = 16, h = 1.6) => {
        const g = new THREE.Group();
        g.name = key;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.6, 48), MAT.block);
        base.position.y = 0.3;
        base.receiveShadow = true;
        g.add(base);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), MAT.dark);
        body.position.y = 0.3 + h / 2;
        body.castShadow = body.receiveShadow = true;
        g.add(body);
        addOutline(g, body, 0x000000, 0.33);
        g.position.set(x, padY, z);
        blocks.add(g);

        const a = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), MAT.anchor);
        a.position.set(x, padY + 0.3 + h + 0.05, z);
        a.name = 'ANK_' + key;
        a.userData.isAnchor = true;
        anchors.add(a);

        snapInfo[key] = { pos: a.position.clone(), radius: r, height: h };
    };

    // ---------- Gebäude-Layout ----------
    mkBlock('TemploMayor',  CORE * 0.14, -CORE * 0.06, 110, 110, 2.0, MAT.dark);
    mkBlock('Tzompantli',   CORE * 0.14 - 72, -CORE * 0.02, 52, 22, 0.8);
    mkBlock('CentralSmall', CORE * 0.02, -CORE * 0.04, 34, 26, 1.0);
    mkBlock('Side_S1',      CORE * 0.36,  CORE * 0.16, 60, 60, 1.6, MAT.dark);
    mkBlock('Side_S2',      CORE * 0.20,  CORE * 0.10, 44, 44, 1.4, MAT.dark);
    mkBlock('Side_S3',      CORE * 0.48, -CORE * 0.02, 66, 66, 1.8, MAT.dark);
    mkBlock('Ballcourt',    CORE * 0.04,  CORE * 0.30, 82, 28, 0.9, MAT.dark);
    mkRound('Ehecatl',     -CORE * 0.22,  CORE * 0.06, 16, 1.6);
    mkBlock('West_A',      -CORE * 0.38, -CORE * 0.10, 86, 40, 0.9);
    mkBlock('West_B',      -CORE * 0.39,  CORE * 0.22, 120, 46, 0.9);
    mkBlock('South_A',     -CORE * 0.06,  CORE * 0.42, 44, 18, 0.8);
    mkBlock('South_B',      CORE * 0.28,  CORE * 0.44, 38, 18, 0.8);
    mkBlock('Palace_S',     0,            CORE * 0.53, 280, 70, 0.9);
    mkBlock('Palace_W',    -CORE * 0.50,  0,           110, 240, 0.9);
    city.add(blocks);

    // ---------- UserData ----------
    city.userData = {
        scale: { meter: 1 },
        map: { size: MAP, core: CORE },
        snap: snapInfo,
        anchors: Object.fromEntries(
            anchors.children.map(n => [n.name, n.position.clone()])
        )
    };

    return city;

    // ---------- Helper ----------
    function addOutline(root, mesh, color = 0x000000, opacity = 0.35) {
        const eg = new THREE.EdgesGeometry(mesh.geometry);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        const l = new THREE.LineSegments(eg, mat);
        l.position.copy(mesh.position);
        l.rotation.copy(mesh.rotation);
        root.add(l);
    }
}
