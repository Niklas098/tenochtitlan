import {loadGLB} from "../city/city.js";
import {createFireSystem} from "./fire.js";

let torchModel = null;
let torchFX    = null;
let torchActive = false;    // interner Zustand (an/aus)

/**
 * Einmal aufrufen, z.B. direkt nach dem Erzeugen der Kameras.
 * fpCamera: deine Ego-Kamera (cameras.fp.camera)
 */
export function initEgoTorch(fpCamera, {
    url= '/models/Fackel_Empty.glb',  // dein Fackel-GLB
    emptyName= 'TorchFirePoint',               // Name des Empties im GLB
    fireTex= '/textures/fire.png',
    intensity= 500,
    distance= 500
} = {}) {

    // WICHTIG: statt scene übergeben wir hier die FP-Kamera als "parent"
    loadGLB(fpCamera, {
        url,
        // Position RELATIV zur Kamera (wie "in der Hand")
        position: { x: 2, y: -0.7, z: -2 },
        rotation: { x: 0, y: 0.3, z: 0 },
        scale: 1.5,
        hitboxOptions: null, // Fackel braucht idR keine Kollision
        onLoaded: (model) => {
            torchModel = model;

            // Empty oben an der Fackel finden
            let fireMarker = null;
            model.traverse((child) => {
                if (child.name === emptyName) {
                    fireMarker = child;
                }
            });

            if (!fireMarker) {
                console.warn(`EgoTorch: Kein Empty "${emptyName}" im Torch-GLB gefunden!`);
                return;
            }

            // Feuer-System an diesem Empty erzeugen
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

            // aktuellen Aktiv-Status anwenden
            applyTorchActiveState();
        }
    });
}

// interne Helper-Funktion, um sichtbarkeit & FX zu synchronisieren
function applyTorchActiveState() {
    if (!torchModel || !torchFX) return;
    torchModel.visible = torchActive;
    torchFX.setEnabled(torchActive);
}

/**
 * Von außen steuerst du nur: Fackel an/aus.
 * Z.B. in animate(): setEgoTorchActive(active === 'fp' && isNight)
 */
export function setEgoTorchActive(flag) {
    torchActive = flag;
    applyTorchActiveState();
}

/**
 * Im animate()-Loop aufrufen. Animiert nur, wenn Fackel aktiv ist und FX existiert.
 */
export function updateEgoTorch(dt, elapsed) {
    if (!torchActive || !torchFX) return;
    torchFX.update(dt, elapsed);
}