// src/util/renderer.js
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';

export function createRenderer(){
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const stats = new Stats();
    stats.dom.style.position = 'fixed';
    stats.dom.style.top = '8px';
    stats.dom.style.left = '8px';
    stats.dom.style.zIndex = '9999';

    const overlayEl = document.createElement('div');
    overlayEl.style.position = 'fixed';
    overlayEl.style.bottom = '10px';
    overlayEl.style.left = '10px';
    overlayEl.style.padding = '6px 10px';
    overlayEl.style.background = 'rgba(0,0,0,0.45)';
    overlayEl.style.color = '#fff';
    overlayEl.style.fontFamily = 'monospace';
    overlayEl.style.fontSize = '12px';
    overlayEl.style.borderRadius = '8px';
    overlayEl.style.zIndex = '9999';
    overlayEl.textContent = '';

    return { renderer, stats, overlayEl };
}
