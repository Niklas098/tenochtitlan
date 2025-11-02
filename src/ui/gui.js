import GUI from 'lil-gui';
import { setDayNight, isDaytime, showStars } from '../util/lights.js';
import { switchToCamera, getActiveCameraType } from '../util/cameras.js';

export default function createGUI(renderer, cameras, lights) {
    const gui = new GUI({ title:'Steuerung', width: 320 });

    const camFolder = gui.addFolder('Kamera');
    camFolder.add({ cam:getActiveCameraType() }, 'cam', ['orbit','drone','fp'])
        .name('Aktiv')
        .onChange(v=>switchToCamera(v));

    const lightFolder = gui.addFolder('Licht & Himmel');
    const L = { day:isDaytime(), stars:false, sunY: lights.sun.position.y };
    lightFolder.add(L, 'day').name('Tag').onChange(v=>{
        setDayNight(v); showStars(!v);
    });
    lightFolder.add(L, 'stars').name('Sterne (Nacht)').onChange(v=>showStars(v));
    lightFolder.add(L, 'sunY', 120, 800, 10).name('Sonnenhöhe').onChange(v=>{
        lights.sun.position.y = v;
        lights.sunDisk.position.y = v;
    });

    // Drone-Tuning live
    const D = {
        speed: cameras.drone._conf.flySpeed,
        minH: cameras.drone._conf.minHeight,
        maxH: cameras.drone._conf.maxHeight,
        turbo: cameras.drone._conf.turbo,
        reset: ()=>cameras.drone.resetHeight()
    };
    const fly = gui.addFolder('Drone');
    fly.add(D,'speed', 8, 80, 1).name('Geschwindigkeit')
        .onChange(v=>{ cameras.drone._conf.flySpeed = v; });
    fly.add(D,'minH', 5, 200, 1).name('min Höhe')
        .onChange(v=>{ cameras.drone._conf.minHeight = v; });
    fly.add(D,'maxH', 50, 800, 1).name('max Höhe')
        .onChange(v=>{ cameras.drone._conf.maxHeight = v; });
    fly.add(D,'turbo', 1.2, 4.0, 0.1).name('Turbo-Faktor')
        .onChange(v=>{ cameras.drone._conf.turbo = v; });
    fly.add(D,'reset').name('Höhe reset');

    // ⚙️ Performance-Schalter
    const P = { pixelCap: 1.4, shadows: true };
    const perf = gui.addFolder('Leistung');
    perf.add(P, 'pixelCap', 0.8, 2.0, 0.1).name('Pixel Ratio Max')
        .onChange(v=>renderer.__setPixelRatioCap(v));
    perf.add(P, 'shadows').name('Schatten an/aus')
        .onChange(v => { renderer.shadowMap.enabled = v; });

    const R = { exposure: renderer.toneMappingExposure };
    gui.add(R, 'exposure', .3, 2, .01).name('Belichtung')
        .onChange(v=>renderer.toneMappingExposure = v);

    camFolder.open(); lightFolder.open(); fly.open(); perf.open();
    return gui;
}
