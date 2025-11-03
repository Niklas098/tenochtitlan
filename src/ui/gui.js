// src/ui/gui.js
import GUI from 'lil-gui';
import {
  // Zeit-/Orbit-API aus lights.js
  setTimeOfDay, getHours, setTimeAuto, setTimeSpeed,
  // optional: Legacy-Toggle bleibt verfügbar, wird nur hier nicht genutzt
  setDayNight, isDaytime, showStars
} from '../util/lights.js';
import { switchToCamera, getActiveCameraType } from '../util/cameras.js';

export default function createGUI(renderer, cameras, lights) {
  const gui = new GUI({ title: 'Steuerung', width: 320 });

  // === Kamera ===
  const camFolder = gui.addFolder('Kamera');
  camFolder
    .add({ cam: getActiveCameraType() }, 'cam', ['orbit', 'drone', 'fp'])
    .name('Aktiv')
    .onChange(v => switchToCamera(v));

  // === Zeit / Himmelskörper ===
  // ersetzt frühere Tag/Sterne/Sonnenhöhe-Controls
  const timeFolder = gui.addFolder('Zeit / Himmelskörper');
  const Time = {
    uhrzeit: getHours(),   // 0..24 h
    auto: false,           // Auto-Zeitraffer
    speed: 0.25            // Stunden pro Sekunde
  };

  timeFolder
    .add(Time, 'uhrzeit', 0, 24, 0.01)
    .name('Uhrzeit (h)')
    .onChange(v => setTimeOfDay(v));

  timeFolder
    .add(Time, 'auto')
    .name('Auto-Zeitraffer')
    .onChange(v => setTimeAuto(v));

  timeFolder
    .add(Time, 'speed', 0.05, 3.0, 0.05)
    .name('Speed (h/s)')
    .onChange(v => setTimeSpeed(v));

  // Optional: schneller Tag/Nacht-Schalter (nutzt interne Zeit-Mapping)
  // Bei Bedarf einklappen/entfernen:
  const quick = {
    tag: () => setDayNight(true),
    nacht: () => setDayNight(false),
    sterneAn: () => showStars(true),
    sterneAus: () => showStars(false),
  };
  timeFolder.add(quick, 'tag').name('⇢ Tag (13:00)');
  timeFolder.add(quick, 'nacht').name('⇢ Nacht (01:00)');
  // Sterne werden von setTimeOfDay automatisch gesetzt; die nächsten 2 sind nur manuelle Overrides:
  // (Falls du keine manuellen Overrides willst, diese beiden Zeilen entfernen)
  timeFolder.add(quick, 'sterneAn').name('Sterne erzwingen: AN');
  timeFolder.add(quick, 'sterneAus').name('Sterne erzwingen: AUS');

  // === Drone-Tuning ===
  const D = {
    speed: cameras.drone._conf.flySpeed,
    minH: cameras.drone._conf.minHeight,
    maxH: cameras.drone._conf.maxHeight,
    turbo: cameras.drone._conf.turbo,
    reset: () => cameras.drone.resetHeight()
  };
  const fly = gui.addFolder('Drone');
  fly.add(D, 'speed', 8, 80, 1).name('Geschwindigkeit')
    .onChange(v => { cameras.drone._conf.flySpeed = v; });
  fly.add(D, 'minH', 5, 200, 1).name('min Höhe')
    .onChange(v => { cameras.drone._conf.minHeight = v; });
  fly.add(D, 'maxH', 50, 800, 1).name('max Höhe')
    .onChange(v => { cameras.drone._conf.maxHeight = v; });
  fly.add(D, 'turbo', 1.2, 4.0, 0.1).name('Turbo-Faktor')
    .onChange(v => { cameras.drone._conf.turbo = v; });
  fly.add(D, 'reset').name('Höhe reset');

  // === Leistung ===
  const P = { pixelCap: 1.4, shadows: true };
  const perf = gui.addFolder('Leistung');
  perf.add(P, 'pixelCap', 0.8, 2.0, 0.1).name('Pixel Ratio Max')
    .onChange(v => renderer.__setPixelRatioCap(v));
  perf.add(P, 'shadows').name('Schatten an/aus')
    .onChange(v => { renderer.shadowMap.enabled = v; });

  // === Belichtung ===
  const R = { exposure: renderer.toneMappingExposure };
  gui.add(R, 'exposure', 0.3, 2.0, 0.01).name('Belichtung')
    .onChange(v => renderer.toneMappingExposure = v);

  camFolder.open(); timeFolder.open(); fly.open(); perf.open();
  return gui;
}
