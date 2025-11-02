// src/ui/gui.js
import GUI from 'lil-gui';

/**
 * Minimal & klar:
 * - Kamera: drone | fp (C)
 * - Tag/Nacht
 * - Exposure
 */
export function createGUI({ onToggleDayNight, onCameraChange, isDay, getCameraType, renderer }) {
    const gui = new GUI({ title: 'Steuerung' });

    const general = gui.addFolder('Allgemein');
    const lighting = gui.addFolder('Licht');

    // Kamera
    const camOpts = { camera: getCameraType() };
    general.add(camOpts, 'camera', ['drone', 'fp'])
        .name('Kamera (C)')
        .onChange(onCameraChange);

    // Tag/Nacht
    const dayOpts = { day: isDay() };
    lighting.add(dayOpts, 'day')
        .name('Tag / Nacht')
        .onChange(onToggleDayNight);

    // Exposure
    const r = { exposure: renderer.toneMappingExposure };
    general.add(r, 'exposure', 0.3, 2.0, 0.01)
        .name('Exposure')
        .onChange((v)=>{ renderer.toneMappingExposure = v; });

    general.open();
    lighting.open();

    return gui;
}

export default createGUI;
