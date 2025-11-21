// FireAndSmokeSystem.js
// Eine Funktion: erzeugt Feuer + Rauch + Licht an einem Anchor/Empty.
// Du brauchst nur noch createFireAndSmokeSystem() aufzurufen.

import * as THREE from 'three';

/**
 * Erzeugt ein Feuer- + Rauch- + Lichtsystem an einem Anchor-Objekt (z.B. Empty aus Blender).
 *
 * @returns {{
 *   update: (deltaTime:number, elapsedTime:number) => void,
 *   fireLight: THREE.PointLight,
 *   firePoints: THREE.Points,
 *   smokePoints: THREE.Points
 * }}
 */
export function createFireAndSmokeSystem(anchor, fireTexture = "/textures/fire.png", smokeTexture = "/textures/smoke.png", intensity, distance) {
    // ---------------------------------------------------------------------------
    // Interne Hilfsfunktionen / Shader (sichtbar nur innerhalb dieser Funktion)
    // ---------------------------------------------------------------------------

    // Vertex-Shader: berechnet Partikelgröße, Rotation und Farbe
    const VERTEX_SHADER = `
    uniform float pointMultiplier;

    attribute float size;
    attribute float angle;
    attribute vec4 aColor;

    varying vec4 vColor;
    varying vec2 vAngle;

    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = size * pointMultiplier / gl_Position.w;

      vAngle = vec2(cos(angle), sin(angle));
      vColor = aColor;
    }`;

    // Fragment-Shader: rotiert die Sprite-Textur und multipliziert mit Farbe/Alpha
    const FRAGMENT_SHADER = `
    uniform sampler2D diffuseTexture;

    varying vec4 vColor;
    varying vec2 vAngle;

    void main() {
      vec2 coords = (gl_PointCoord - 0.5) * mat2(
        vAngle.x, vAngle.y,
        -vAngle.y, vAngle.x
      ) + 0.5;

      gl_FragColor = texture2D(diffuseTexture, coords) * vColor;
    }`;

    // Einfacher linearer Spline für Farb-/Alpha-/Größenverläufe
    function getLinearSpline(lerpFn) {
        const points = [];

        function addPoint(t, value) {
            points.push([t, value]);
        }

        function getValueAt(t) {
            let p1 = 0;

            for (let i = 0; i < points.length; i++) {
                if (points[i][0] >= t) {
                    break;
                }
                p1 = i;
            }

            const p2 = Math.min(points.length - 1, p1 + 1);
            if (p1 === p2) {
                return points[p1][1];
            }

            const localT = (t - points[p1][0]) / (points[p2][0] - points[p1][0]);
            return lerpFn(localT, points[p1][1], points[p2][1]);
        }

        return { addPoint, getValueAt };
    }

    // Generischer Partikelgenerator (Feuer ODER Rauch),
    // bleibt intern, wird nur von dieser Funktion benutzt.
    function createParticleSystem({
                                      parent,
                                      texturePath,
                                      rate,
                                      radius,
                                      maxLife,
                                      maxSize,
                                      baseVelocity,
                                      colorPoints,
                                      alphaPoints,
                                      sizePoints,
                                      blending,
                                  }) {
        const texture = new THREE.TextureLoader().load(texturePath);

        const uniforms = {
            diffuseTexture: { value: texture },
            // FOV-Approx für Punktgröße, 30° reicht hier
            pointMultiplier: {
                value: window.innerHeight / (2.0 * Math.tan(30.0 * Math.PI / 180.0)),
            },
        };

        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            blending,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            vertexColors: true,
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute([], 1));
        geometry.setAttribute('aColor', new THREE.Float32BufferAttribute([], 4));
        geometry.setAttribute('angle', new THREE.Float32BufferAttribute([], 1));

        const points = new THREE.Points(geometry, material);
        parent.add(points);

        // Splines aufbauen
        const alphaSpline = getLinearSpline((t, a, b) => a + t * (b - a));
        alphaPoints.forEach(([t, v]) => alphaSpline.addPoint(t, v));

        const colorSpline = getLinearSpline((t, a, b) => {
            const c = a.clone();
            return c.lerp(b, t);
        });
        colorPoints.forEach(([t, c]) => colorSpline.addPoint(t, c));

        const sizeSpline = getLinearSpline((t, a, b) => a + t * (b - a));
        sizePoints.forEach(([t, v]) => sizeSpline.addPoint(t, v));

        let particles = [];
        let spawnAccumulator = 0.0;

        function addParticles(dt) {
            spawnAccumulator += dt;
            const count = Math.floor(spawnAccumulator * rate);
            spawnAccumulator -= count / rate;

            for (let i = 0; i < count; i++) {
                const life = (Math.random() * 0.75 + 0.25) * maxLife;

                particles.push({
                    position: new THREE.Vector3(
                        (Math.random() * 2 - 1) * radius,
                        (Math.random() * 2 - 1) * radius,
                        (Math.random() * 2 - 1) * radius
                    ),
                    size: (Math.random() * 0.5 + 0.5) * maxSize,
                    colour: new THREE.Color(),
                    alpha: 1.0,
                    life,
                    maxLife: life,
                    rotation: Math.random() * Math.PI * 2,
                    rotationRate: Math.random() * 0.01 - 0.005,
                    velocity: baseVelocity.clone().add(
                        new THREE.Vector3(
                            (Math.random() - 0.5) * 0.2,
                            (Math.random() - 0.5) * 0.2,
                            (Math.random() - 0.5) * 0.2
                        )
                    ),
                });
            }
        }

        function updateParticles(dt) {
            // Lebenszeit reduzieren und tote Partikel entfernen
            for (let p of particles) {
                p.life -= dt;
            }
            particles = particles.filter((p) => p.life > 0.0);

            for (let p of particles) {
                const t = 1.0 - p.life / p.maxLife;

                p.rotation += p.rotationRate;

                p.alpha = alphaSpline.getValueAt(t);
                p.currentSize = p.size * sizeSpline.getValueAt(t);
                p.colour.copy(colorSpline.getValueAt(t));

                p.position.add(p.velocity.clone().multiplyScalar(dt));

                // einfacher Drag
                const drag = p.velocity.clone().multiplyScalar(dt * 0.1);
                drag.x = Math.sign(p.velocity.x) * Math.min(Math.abs(drag.x), Math.abs(p.velocity.x));
                drag.y = Math.sign(p.velocity.y) * Math.min(Math.abs(drag.y), Math.abs(p.velocity.y));
                drag.z = Math.sign(p.velocity.z) * Math.min(Math.abs(drag.z), Math.abs(p.velocity.z));
                p.velocity.sub(drag);
            }
        }

        function updateGeometry() {
            const positions = [];
            const sizes = [];
            const colors = [];
            const angles = [];

            for (let p of particles) {
                positions.push(p.position.x, p.position.y, p.position.z);
                sizes.push(p.currentSize || p.size);
                colors.push(p.colour.r, p.colour.g, p.colour.b, p.alpha);
                angles.push(p.rotation);
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
            geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 4));
            geometry.setAttribute('angle', new THREE.Float32BufferAttribute(angles, 1));

            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.size.needsUpdate = true;
            geometry.attributes.aColor.needsUpdate = true;
            geometry.attributes.angle.needsUpdate = true;
        }

        function clear() {
            particles = [];  // Liste leeren

            // Leere Attribute setzen
            geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
            geometry.setAttribute('size', new THREE.Float32BufferAttribute([], 1));
            geometry.setAttribute('aColor', new THREE.Float32BufferAttribute([], 4));
            geometry.setAttribute('angle', new THREE.Float32BufferAttribute([], 1));

            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.size.needsUpdate = true;
            geometry.attributes.aColor.needsUpdate = true;
            geometry.attributes.angle.needsUpdate = true;
        }


        function update(dt) {
            addParticles(dt);
            updateParticles(dt);
            updateGeometry();
        }

        return { update, clear, points };
    }

    // ---------------------------------------------------------------------------
    // Ab hier: Konkrete Systeme für Feuer, Rauch und das Licht
    // ---------------------------------------------------------------------------

    // 🔥 Feuer direkt am Anchor
    const fireSystem = createParticleSystem({
        parent: anchor,
        texturePath: fireTexture,
        rate: 120,
        radius: 0.7,
        maxLife: 1.0,
        maxSize: 3.0,
        baseVelocity: new THREE.Vector3(0, 1.8, 0),
        blending: THREE.AdditiveBlending,
        colorPoints: [
            [0.0, new THREE.Color(0xffffcc)],
            [0.2, new THREE.Color(0xffcc66)],
            [0.6, new THREE.Color(0xff6600)],
            [1.0, new THREE.Color(0x220000)],
        ],
        alphaPoints: [
            [0.0, 0.0],
            [0.1, 1.0],
            [0.7, 1.0],
            [1.0, 0.0],
        ],
        sizePoints: [
            [0.0, 0.0],
            [0.3, 1.0],
            [1.0, 0.3],
        ],
    });

    // 💡 flackerndes Licht
    const fireLight = new THREE.PointLight(0xffaa55, intensity, distance);
    fireLight.position.set(0, 20, 0);
    anchor.add(fireLight);

    let enabled = true;  // Anfangszustand: an

    function setEnabled(flag) {
        if (enabled === flag) {
            return;
        }   // nichts tun, wenn sich nichts ändert
        enabled = flag;

        fireLight.visible = flag;

        if (!flag) {
            // Tagsüber: alle Partikel weg
            fireSystem.clear();
            smokeSystem.clear();
        }
    }

    // Eine zentrale Update-Funktion für das komplette System
    function update(deltaTime, elapsedTime) {

        if (!enabled) return;
        fireSystem.update(deltaTime);
        smokeSystem.update(deltaTime);

        const baseIntensity = intensity;
        const noise = (Math.random() - 0.5) * 50;
        const sine = Math.sin(elapsedTime * 10.0) * 50;
        fireLight.intensity = baseIntensity + noise + sine;
    }

    // Das ist das einzige, was der Aufrufer sieht/benutzen muss.
    return {
        update,
        setEnabled,
        fireLight,
        firePoints: fireSystem.points,
        smokePoints: smokeSystem.points,
    };
}
