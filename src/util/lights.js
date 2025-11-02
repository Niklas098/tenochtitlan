// src/util/lights.js
import * as THREE from 'three';

let _isDay = true;

export function isDaytime(){ return _isDay; }

// ----------------- Skydome Shader -----------------
const skyVertex = `
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  vDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const skyFragment = `
precision highp float;
varying vec3 vDir;
uniform float uDay;      // 1 = Tag, 0 = Nacht
uniform vec3  uSunDir;

void main(){
  float h = clamp(vDir.y*0.5 + 0.5, 0.0, 1.0);
  vec3 dayZenith   = vec3(0.58, 0.68, 0.75);
  vec3 dayHorizon  = vec3(0.85, 0.90, 0.95);
  vec3 nightZenith = vec3(0.03, 0.05, 0.10);
  vec3 nightHorizon= vec3(0.08, 0.10, 0.16);

  vec3 daySky   = mix(dayHorizon, dayZenith, pow(h, 0.6));
  vec3 nightSky = mix(nightHorizon, nightZenith, pow(h, 0.7));

  float sunGlow = max(dot(normalize(-uSunDir), normalize(vDir)), 0.0);
  sunGlow = pow(sunGlow, 120.0) * 0.35;

  vec3 sky = mix(nightSky, daySky, uDay) + vec3(sunGlow) * uDay;
  gl_FragColor = vec4(sky, 1.0);
}
`;

export function createLights(scene, renderer) {
    // Hemisphäre (Himmel/Boden)
    const hemi = new THREE.HemisphereLight(0xb1e1ff, 0x887766, 0.35);
    scene.add(hemi);

    // Sonne (Directional)
    const sun = new THREE.DirectionalLight(0xfff2cc, 2.2);
    sun.position.set(-1, 0.45, -0.25).normalize();
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 12000;
    sun.shadow.camera.left = -4000;
    sun.shadow.camera.right = 4000;
    sun.shadow.camera.top = 4000;
    sun.shadow.camera.bottom = -4000;
    scene.add(sun);
    scene.add(sun.target);

    // sichtbare Sonne
    const sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(50, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xffee88, toneMapped: false })
    );
    scene.add(sunMesh);

    // Mond (nachts gegenüber der Sonne)
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(35, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xdedede, toneMapped: false })
    );
    moon.visible = false;
    scene.add(moon);

    // Sterne: moderat
    const starCount = 350;
    const starGeom = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const radius = 10000;
    for (let i = 0; i < starCount; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);
        starPos[i*3+0] = x * radius;
        starPos[i*3+1] = y * radius;
        starPos[i*3+2] = z * radius;
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ size: 6, sizeAttenuation: true, color: 0xffffff, depthWrite: false });
    const stars = new THREE.Points(starGeom, starMat);
    stars.visible = false;
    scene.add(stars);

    // Skydome (BackSide) – wird in main() auf die Kamera positioniert
    const skyGeo = new THREE.SphereGeometry(20000, 64, 32);
    const skyMat = new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
            uDay: { value: 1.0 },
            uSunDir: { value: sun.position.clone().normalize() }
        }
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyDome);

    // Fackel (an Ego-Kamera koppelbar)
    const torchGroup = new THREE.Group();
    const handle = new THREE.CylinderGeometry(0.03, 0.05, 0.6, 12);
    const handleMesh = new THREE.Mesh(
        handle,
        new THREE.MeshStandardMaterial({ color: 0x553b2a, roughness: 0.9, metalness: 0.0 })
    );
    handleMesh.castShadow = true;
    handleMesh.position.set(0, -0.3, 0);
    torchGroup.add(handleMesh);

    const flameGeo = new THREE.SphereGeometry(0.07, 12, 12);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
    const flameMesh = new THREE.Mesh(flameGeo, flameMat);
    flameMesh.position.set(0, 0.05, 0);
    torchGroup.add(flameMesh);

    const torchLight = new THREE.PointLight(0xffaa55, 2.6, 28, 2.0);
    torchLight.castShadow = true;
    torchLight.shadow.mapSize.set(1024,1024);
    torchLight.position.set(0, 0.05, 0);
    torchGroup.add(torchLight);
    torchGroup.visible = false;
    scene.add(torchGroup);

    const lights = {
        hemi, sun, sunMesh,
        moon, stars, skyDome,
        torchGroup, torchLight,
        updateTorch: ()=>{
            if (!_isDay && torchGroup.visible){
                torchLight.intensity = 2.1 + Math.sin(performance.now()*0.01)*0.25 + Math.random()*0.15;
            }
        },
        get isDay(){ return _isDay; }
    };

    setDayNight(true, scene, lights);
    return lights;
}

export function setDayNight(isDay, scene, lights) {
    _isDay = !!isDay;

    // Helligkeiten
    lights.hemi.intensity = _isDay ? 0.35 : 0.08;
    lights.sun.intensity  = _isDay ? 2.2  : 0.05;

    // Sichtbarkeit
    lights.stars.visible  = !_isDay;
    lights.moon.visible   = !_isDay;
    lights.torchGroup.visible = !_isDay;  // Fackel nur nachts

    // Skydome-Uniform
    lights.skyDome.material.uniforms.uDay.value = _isDay ? 1.0 : 0.0;
}

export function updateSun(time, lights){
    // langsamer Bogen knapp über Horizont
    const speed = 0.02;
    const a = time * speed;
    const dir = new THREE.Vector3(
        -Math.cos(a),
        0.3 + 0.2 * Math.abs(Math.sin(a)), // 0.3..0.5
        -0.25
    ).normalize();

    lights.sun.position.copy(dir);
    lights.sun.target.position.set(0,0,0);

    // sichtbare Sonne weit in diese Richtung
    const far = 15000;
    lights.sunMesh.position.copy(dir.clone().multiplyScalar(far));

    // Mond gegenüber der Sonne
    const moonDir = dir.clone().multiplyScalar(-1);
    lights.moon.position.copy(moonDir.multiplyScalar(far * 0.95));

    // Skydome bekommt aktuelle Sonnenrichtung
    lights.skyDome.material.uniforms.uSunDir.value.copy(dir);
}

export function attachTorchTo(fpCamera, _scene, lights){
    // Torch rechts unten im Sichtfeld
    lights.torchGroup.position.set(0.25, -0.25, -0.6);
    fpCamera.add(lights.torchGroup);
    fpCamera.add(lights.torchLight);
}
