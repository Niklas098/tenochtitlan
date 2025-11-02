// src/util/renderer.js
import * as THREE from 'three';

export function createRenderer(canvas) {
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        depth: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.physicallyCorrectLights = true;

    // FPS/MS tracker
    const stats = (function() {
        let last = performance.now();
        let frames = 0;
        let fps = 0;
        let ms = 0;
        return {
            update() {
                const now = performance.now();
                frames++;
                const dt = now - last;
                ms = dt.toFixed(2);
                if (dt >= 1000) {
                    fps = frames;
                    frames = 0;
                    last = now;
                }
                return { fps, ms };
            },
            get fps() { return fps; },
            get ms() { return ms; }
        };
    })();

    // HUD
    let overlayEl = document.getElementById('hud');
    if (!overlayEl) {
        overlayEl = document.createElement('div');
        overlayEl.id = 'hud';
        overlayEl.style.position = 'fixed';
        overlayEl.style.top = '10px';
        overlayEl.style.right = '10px';
        overlayEl.style.zIndex = '1000';
        overlayEl.style.padding = '6px 10px';
        overlayEl.style.borderRadius = '8px';
        overlayEl.style.backdropFilter = 'blur(4px)';
        overlayEl.style.background = 'rgba(0,0,0,.35)';
        overlayEl.style.color = '#fff';
        overlayEl.style.font = '12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif';
        overlayEl.textContent = 'Lade...';
        document.body.appendChild(overlayEl);
    }

    return { renderer, stats, overlayEl };
}
