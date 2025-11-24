import {loadGLB} from "../city/city.js";
import {createFireSystem} from "./fire.js";

let torchModel = null;
let torchFX    = null;
/** Internal on/off state for the ego torch. */
let torchActive = false;

/**
 * Attaches a torch model with fire FX to the first-person camera.
 * @param {THREE.Camera} fpCamera - First-person camera used as parent.
 * @param {Object} [options]
 * @param {string} [options.url='/models/Fackel_Empty.glb'] - Torch GLB path.
 * @param {string} [options.emptyName='TorchFirePoint'] - Empty name inside the GLB used as fire anchor.
 * @param {string} [options.fireTex='/textures/fire.png'] - Flame texture path.
 * @param {number} [options.intensity=500] - Base light intensity.
 * @param {number} [options.distance=500] - Light range.
 */
export function initEgoTorch(fpCamera, {
    url= '/models/Fackel_Empty.glb',
    emptyName= 'TorchFirePoint',
    fireTex= '/textures/fire.png',
    intensity= 500,
    distance= 500
} = {}) {

    loadGLB(fpCamera, {
        url,
        position: { x: 2, y: -0.7, z: -2 },
        rotation: { x: 0, y: 0.3, z: 0 },
        scale: 1.5,
        hitboxOptions: null,
        onLoaded: (model) => {
            torchModel = model;

            let fireMarker = null;
            model.traverse((child) => {
                if (child.name === emptyName) {
                    fireMarker = child;
                }
            });

            if (!fireMarker) {
                console.warn(`EgoTorch: Empty "${emptyName}" not found in torch GLB`);
                return;
            }

            torchFX = createFireSystem(
                fireMarker,
                fireTex,
                intensity,
                distance,
                0.1,
                10,
                50,
                100
            );

            applyTorchActiveState();
        }
    });
}

/** Keeps torch visibility and particle effects in sync with activation. */
function applyTorchActiveState() {
    if (!torchModel || !torchFX) return;
    torchModel.visible = torchActive;
    torchFX.setEnabled(torchActive);
}

/**
 * External toggle to switch the torch on/off.
 * Call per frame as needed, e.g. when switching to FP at night.
 */
export function setEgoTorchActive(flag) {
    torchActive = flag;
    applyTorchActiveState();
}

/**
 * Advances torch animation; no-ops when inactive or not yet loaded.
 */
export function updateEgoTorch(dt, elapsed) {
    if (!torchActive || !torchFX) return;
    torchFX.update(dt, elapsed);
}
