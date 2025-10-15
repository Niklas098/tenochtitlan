// src/scene/city/city.js
import * as THREE from 'three';

/**
 * Tenochtitlan – Hauptplaza Grundriss (stabil & groß)
 * Variante B: niedrige Platzhalter-Volumina, Straßen als Planes,
 * getrennte Ebenen gegen Z-Fighting, dezente Outlines.
 * 1u = 1m. buildCity({ MAP, CORE }) optional.
 */

export function buildCity(opts = {}) {
    // ---------------- Größen ----------------
    const MAP    = opts.MAP  ?? 1600;   // gesamte Bodenplatte (quadratisch)
    const CORE   = opts.CORE ?? 1320;   // innerer rechteckiger Bezirksbereich
    const BASE_H = 15;                // physische Dicke der Platten (stabil)

    // Fest definierte Ebenen (gegen coplanare Artefakte)
    const Z = {
        base: BASE_H / 2,                 // MapBase Ober-/Unterseite sauber getrennt
        core: BASE_H + BASE_H / 2,        // CityCore liegt deutlich darüber
        street: BASE_H * 2 + 0.02,        // Straßen minimal darüber (Plane)
        pad: BASE_H * 2 + 0.18,           // Gebäude-Pads/Volumina noch einmal höher
        wall: BASE_H * 2 + 0.18,          // Wände auf gleicher Ebene wie Pads
        outlineLift: 0.03                 // Outlines minimal anheben
    };

    // Mauer & Straßen
    const WALL_TH = 6;
    const WALL_H  = 3.2;
    const GATE_W  = 40;
    const GATE_D  = 22;

    const STREET_W = 16;                // Hauptachsen
    const LANE_W   = 10;                // Nebenachsen

    // ---------------- Materialien (hell, matt, kein Metall) ----------------
    const MAT = {
        base:   new THREE.MeshStandardMaterial({ color: 0xEFE7D7, roughness: 0.98, metalness: 0.0 }),
        core:   new THREE.MeshStandardMaterial({ color: 0xE6D7BF, roughness: 0.98, metalness: 0.0 }),
        wall:   new THREE.MeshStandardMaterial({ color: 0xD6C3A5, roughness: 0.98, metalness: 0.0 }),
        street: new THREE.MeshStandardMaterial({
            color: 0xC7B59B, roughness: 0.99, metalness: 0.0,
            // wichtig gegen Moiré: unter alles „schieben“
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        }),
        block:  new THREE.MeshStandardMaterial({ color: 0xDECDB7, roughness: 0.98, metalness: 0.0 }),
        dark:   new THREE.MeshStandardMaterial({ color: 0xB1997F, roughness: 0.99, metalness: 0.0 }),
        anchor: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1.0,  metalness: 0.0 })
    };

    const city = new THREE.Group();
    city.name = 'CityRoot';

    // ---------------- Base & Core ----------------
    const base = new THREE.Mesh(new THREE.BoxGeometry(MAP, BASE_H, MAP), MAT.base);
    base.position.set(0, Z.base, 0);
    base.receiveShadow = false;         // Basis schattet nicht → ruhiger
    base.name = 'MapBase';
    city.add(base);
    outline(city, base, 0x111111, 0.22, Z.outlineLift);

    const core = new THREE.Mesh(new THREE.BoxGeometry(CORE, BASE_H, CORE), MAT.core);
    core.position.set(0, Z.core, 0);
    core.receiveShadow = true;
    core.name = 'CityCore';
    city.add(core);
    outline(city, core, 0x000000, 0.24, Z.outlineLift);

    // ---------------- Perimeter-Wall + Gates ----------------
    const wall = new THREE.Group();
    wall.name = 'PerimeterWall';
    const wallY = Z.wall + WALL_H / 2;

    const addWallSeg = (w, d, x, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), MAT.wall);
        m.position.set(x, wallY, z);
        m.castShadow = m.receiveShadow = true;
        wall.add(m);
        outline(wall, m, 0x000000, 0.22, Z.outlineLift);
    };

    const L = CORE + WALL_TH * 2;
    // Seiten (Torbereiche freilassen)
    addWallSeg((L - GATE_W - 10), WALL_TH,  (GATE_W + 10)/2,  CORE/2 + WALL_TH/2); // N (rechts vom Nordtor)
    addWallSeg((L - GATE_W - 10), WALL_TH, -(GATE_W + 10)/2, -CORE/2 - WALL_TH/2); // S (links vom Südtor)
    addWallSeg(WALL_TH, (L - GATE_W - 10),  CORE/2 + WALL_TH/2, -(GATE_W + 10)/2); // E
    addWallSeg(WALL_TH, (L - GATE_W - 10), -CORE/2 - WALL_TH/2,  (GATE_W + 10)/2); // W

    const addGate = (name, x, z, rotY) => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(GATE_W, WALL_H, GATE_D), MAT.wall);
        g.position.set(x, wallY, z);
        g.rotation.y = rotY;
        g.castShadow = g.receiveShadow = true;
        g.name = name;
        wall.add(g);
        outline(wall, g, 0x000000, 0.22, Z.outlineLift);

        // optische Durchfahrt: kleine Straßen-Plane
        const s = plane(STREET_W * 0.7, GATE_D + 10, x, Z.street, z, rotY, MAT.street);
        wall.add(s);
    };
    addGate('Gate_W', -CORE/2 - WALL_TH/2, 0, Math.PI/2);
    addGate('Gate_E',  CORE/2 + WALL_TH/2, 0, Math.PI/2);
    addGate('Gate_S',  0, -CORE/2 - WALL_TH/2, 0);

    city.add(wall);

    // ---------------- Streets (Planes, ohne Schatten) ----------------
    const streets = new THREE.Group();
    streets.name = 'Streets';

    const addStreet = (len, w, x, z, rot = 0, name = 'Street') => {
        const s = plane(w, len, x, Z.street, z, rot, MAT.street);
        s.name = name;
        streets.add(s);
    };

    // Hauptkreuz (leicht NE-versetzt – wie Vorlage)
    addStreet(CORE - 80, STREET_W,  CORE * 0.08,  0, Math.PI / 2, 'Main_EW');
    addStreet(CORE - 80, STREET_W,  0,         -CORE * 0.06, 0,   'Main_NS');

    // Nebengassen
    addStreet(CORE - 160, LANE_W,  -CORE * 0.36, 0, Math.PI / 2, 'Lane_W');
    addStreet(CORE - 160, LANE_W,   CORE * 0.00,  CORE * 0.22, 0, 'Lane_S_Mid');
    addStreet(CORE - 160, LANE_W,   CORE * 0.26,  CORE * 0.22, 0, 'Lane_S_E');
    addStreet(CORE - 160, LANE_W,   CORE * 0.36,  0, Math.PI / 2, 'Lane_E');

    // Torzufahrten
    addStreet(120, LANE_W, -CORE/2 + 60, 0, Math.PI/2, 'Gate_W_Access');
    addStreet(120, LANE_W,  CORE/2 - 60, 0, Math.PI/2, 'Gate_E_Access');
    addStreet(120, LANE_W,  0, -CORE/2 + 60, 0, 'Gate_S_Access');

    city.add(streets);

    // ---------------- Anchors (vor Blocks!) ----------------
    const anchors = new THREE.Group();
    anchors.name = 'Anchors';
    city.add(anchors);
    const snap = {}; // wird in mkBlock/mkRound gefüllt

    // ---------------- Blocks (niedrige Volumina – austauschbar) ----------------
    const blocks = new THREE.Group();
    blocks.name = 'Blocks';

    const mkBlock = (key, x, z, sx, sz, h = 1.2, mat = MAT.block) => {
        const g = new THREE.Group();
        g.name = key;

        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), mat);
        m.position.set(0, h / 2, 0);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        outline(g, m, 0x000000, 0.24, Z.outlineLift);

        g.position.set(x, Z.pad, z);
        blocks.add(g);

        const a = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), MAT.anchor);
        a.position.set(x, Z.pad + h + 0.05, z);
        a.name = 'ANK_' + key;
        a.userData.isAnchor = true;
        anchors.add(a);

        snap[key] = { pos: a.position.clone(), size: new THREE.Vector3(sx, h, sz) };
    };

    const mkRound = (key, x, z, r = 22, h = 1.6) => {
        const g = new THREE.Group();
        g.name = key;

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.6, 48),
            MAT.block
        );
        base.position.y = 0.3;
        base.receiveShadow = true;
        g.add(base);

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r, h, 48),
            MAT.dark
        );
        body.position.y = 0.3 + h / 2;
        body.castShadow = body.receiveShadow = true;
        g.add(body);

        outline(g, body, 0x000000, 0.24, Z.outlineLift);

        g.position.set(x, Z.pad, z);
        blocks.add(g);

        const a = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), MAT.anchor);
        a.position.set(x, Z.pad + 0.3 + h + 0.05, z);
        a.name = 'ANK_' + key;
        a.userData.isAnchor = true;
        anchors.add(a);

        snap[key] = { pos: a.position.clone(), radius: r, height: h };
    };

    // -------- Layout (nah am Top-Down) --------
    // Obere Hauptplattform (Templo-Mayor-Komplex) – leicht NE-versetzt
    mkBlock('TemploMayor',   CORE * 0.18, -CORE * 0.16, 360, 240, 1.2, MAT.dark);

    // Zwei Nebenpyramiden oben mittig
    mkBlock('Top_Side_L',    CORE * 0.02, -CORE * 0.14, 120, 120, 1.2, MAT.dark);
    mkBlock('Top_Side_R',    CORE * 0.36, -CORE * 0.12, 120, 120, 1.2, MAT.dark);

    // West- & Ost-Hofanlagen
    mkBlock('West_Palace',  -CORE * 0.46, -CORE * 0.02, 220, 300, 1.0);
    mkBlock('East_Palace',   CORE * 0.46, -CORE * 0.02, 220, 300, 1.0);

    // Tzompantli vor der Hauptplattform
    mkBlock('Tzompantli',    CORE * 0.02, -CORE * 0.05, 140, 28, 0.8);

    // Zentralsockel + runder Ehécatl darunter
    mkBlock('Central_Small', CORE * 0.00,  CORE * 0.02, 100, 70, 1.0);
    mkRound('Ehecatl',       CORE * 0.08,  CORE * 0.12, 26, 1.6);

    // Südost-Komplex, Ballcourt, südlicher Palaststreifen
    mkBlock('SE_Complex',    CORE * 0.38,  CORE * 0.32, 260, 240, 1.2, MAT.dark);
    mkBlock('Ballcourt',    -CORE * 0.24,  CORE * 0.28, 200, 50, 1.0, MAT.dark);
    mkBlock('South_Palace',  0,            CORE * 0.48, 760, 120, 1.0);

    city.add(blocks);

    // ---------------- GUI-Container ----------------
    const helpers = new THREE.Group();
    helpers.name = 'Helpers';
    helpers.visible = false;
    city.userData.helpers = helpers;
    city.userData.placeholders = blocks; // Alias für GUI
    city.add(helpers);

    // ---------------- userData ----------------
    city.userData.scale   = { meter: 1 };
    city.userData.map     = { size: MAP, core: CORE };
    city.userData.snap    = snap;
    city.userData.anchors = Object.fromEntries(
        anchors.children.map(n => [n.name, n.position.clone()])
    );

    return city;

    // ---------------- Utilities ----------------
    function outline(root, mesh, color = 0x000000, opacity = 0.24, lift = 0.0) {
        const eg = new THREE.EdgesGeometry(mesh.geometry);
        const mat = new THREE.LineBasicMaterial({
            color, transparent: true, opacity,
            depthWrite: false, depthTest: true
        });
        const l = new THREE.LineSegments(eg, mat);
        l.position.copy(mesh.position);
        l.position.y += lift; // minimal über die Fläche heben → kein Z-Fight
        l.rotation.copy(mesh.rotation);
        root.add(l);
    }

    function plane(w, d, x, y, z, rotY, material) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
        m.rotation.x = -Math.PI / 2;
        if (rotY) m.rotation.y = rotY;
        m.position.set(x, y, z);
        // Straßen werfen/empfangen keine Schatten → keine dunklen Streifen
        m.receiveShadow = false;
        m.castShadow = false;
        return m;
    }
}
