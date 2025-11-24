import {
  setTimeOfDay,
  getHours,
  setTimeAuto,
  setTimeSpeed,
  setDayNight,
  showStars,
  areStarsVisible
} from '../util/lights.js';
import { switchToCamera, getActiveCameraType } from '../util/cameras.js';
import { WATER_QUALITY } from '../scene/water/water2.js';

const WATER_OPTIONS = [
  { label: 'Max (volle Auflösung)', value: WATER_QUALITY.ULTRA },
  { label: 'Weniger Auflösung', value: WATER_QUALITY.HIGH },
  { label: 'Noch weniger Auflösung', value: WATER_QUALITY.LOW },
  { label: 'Keine Animation (FPS+)', value: WATER_QUALITY.STATIC }
];

let stylesInjected = false;

/**
 * Builds the in-page control HUD for camera, time of day, water quality, weather, and exposure.
 * @param {import('three').WebGLRenderer} renderer
 * @param {{orbit:Object,drone:Object,fp:Object}} cameras
 * @param {Object} lights
 * @param {{water?:Object, weather?:Object}} [hooks]
 * @returns {{element:HTMLElement, destroy:Function}}
 */
export default function createGUI(renderer, cameras, lights, hooks = {}) {
  injectStyles();
  const root = document.createElement('section');
  root.className = 'hud-panel';

  const state = {
    activeCamera: getActiveCameraType(),
    hours: normalizeHours(getHours()),
    auto: false,
    speed: 0.25,
    exposure: renderer.toneMappingExposure,
    stars: areStarsVisible()
  };

  const viewCard = createCard('Ansicht & Kamera');
  const camGroup = createButtonRow([
    { id: 'orbit', label: 'Orbit' },
    { id: 'drone', label: 'Drone' },
    { id: 'fp', label: 'Ego' }
  ], state.activeCamera, (mode) => {
    state.activeCamera = mode;
    switchToCamera(mode);
  });
  viewCard.body.appendChild(camGroup.element);

  const exposureControl = createSliderControl({
    label: 'Belichtung',
    min: 0.3,
    max: 2.0,
    step: 0.01,
    value: state.exposure,
    format: (v) => v.toFixed(2),
    onInput: (v) => {
      state.exposure = v;
      renderer.toneMappingExposure = v;
    }
  });
  viewCard.body.appendChild(exposureControl);
  root.appendChild(viewCard.card);

  const timeCard = createCard('Zeit & Himmel');
  const timeDisplay = document.createElement('div');
  timeDisplay.className = 'hud-info-text';
  timeCard.body.appendChild(timeDisplay);
  const updateTimeDisplay = () => {
    timeDisplay.textContent = `Aktuelle Zeit: ${formatHoursDisplay(state.hours)} h`;
  };
  updateTimeDisplay();
  let starController = null;
  let autoController = null;
  const syncStars = () => {
    if (!starController) return;
    const actual = areStarsVisible();
    if (state.stars === actual) return;
    state.stars = actual;
    starController.setValue(actual);
  };

  const timeSlider = createSliderControl({
    label: 'Uhrzeit',
    min: 0,
    max: 24,
    step: 1 / 60,
    value: state.hours,
    format: (v) => formatHoursDisplay(v),
    onInput: (v) => {
      state.hours = normalizeHours(v);
      setTimeOfDay(v);
      updateTimeDisplay();
      syncStars();
      return state.hours;
    }
  });
  timeCard.body.appendChild(timeSlider);

  const autoToggle = createToggleControl('Auto-Zeitraffer', state.auto, (value) => {
    state.auto = value;
    setTimeAuto(value);
  });
  autoController = autoToggle;
  timeCard.body.appendChild(autoToggle);

  const speedSlider = createSliderControl({
    label: 'Speed (h/s)',
    min: 0.05,
    max: 3.0,
    step: 0.05,
    value: state.speed,
    format: (v) => v.toFixed(2),
    onInput: (v) => {
      state.speed = v;
      setTimeSpeed(v);
    }
  });
  timeCard.body.appendChild(speedSlider);

  const quickRow = document.createElement('div');
  quickRow.className = 'hud-dual';
  const updateTimeFromCurrent = () => {
    const current = normalizeHours(getHours());
    state.hours = current;
    timeSlider.setValue(current);
    updateTimeDisplay();
  };

  quickRow.appendChild(createActionButton('Tag', () => {
    setDayNight(true);
    updateTimeFromCurrent();
    syncStars();
  }));
  quickRow.appendChild(createActionButton('Nacht', () => {
    setDayNight(false);
    updateTimeFromCurrent();
    syncStars();
  }));
  timeCard.body.appendChild(quickRow);

  const starToggle = createToggleControl('Sterne anzeigen', state.stars, (value) => {
    state.stars = value;
    showStars(value, { manual: true });
  });
  starController = starToggle;
  timeCard.body.appendChild(starToggle);
  root.appendChild(timeCard.card);

  const moveCard = createCard('Bewegung (Drone)');
  moveCard.body.appendChild(createSliderControl({
    label: 'Geschwindigkeit',
    min: 8,
    max: 80,
    step: 1,
    value: cameras.drone._conf.flySpeed,
    format: (v) => `${v.toFixed(0)} u/s`,
    onInput: (v) => { cameras.drone._conf.flySpeed = v; }
  }));
  moveCard.body.appendChild(createSliderControl({
    label: 'min Höhe',
    min: 5,
    max: 200,
    step: 1,
    value: cameras.drone._conf.minHeight,
    format: (v) => `${v.toFixed(0)} m`,
    onInput: (v) => { cameras.drone._conf.minHeight = v; }
  }));
  moveCard.body.appendChild(createSliderControl({
    label: 'max Höhe',
    min: 50,
    max: 800,
    step: 1,
    value: cameras.drone._conf.maxHeight,
    format: (v) => `${v.toFixed(0)} m`,
    onInput: (v) => { cameras.drone._conf.maxHeight = v; }
  }));
  moveCard.body.appendChild(createSliderControl({
    label: 'Turbo-Faktor',
    min: 1.2,
    max: 4.0,
    step: 0.1,
    value: cameras.drone._conf.turbo,
    format: (v) => v.toFixed(1),
    onInput: (v) => { cameras.drone._conf.turbo = v; }
  }));
  moveCard.body.appendChild(createActionButton('Höhe reset', () => cameras.drone.resetHeight()));
  root.appendChild(moveCard.card);

  const perfCard = createCard('Performance & Qualität');
  perfCard.body.appendChild(createSliderControl({
    label: 'Pixel Ratio Max',
    min: 0.8,
    max: 2.0,
    step: 0.1,
    value: 1.4,
    format: (v) => v.toFixed(1),
    onInput: (v) => renderer.__setPixelRatioCap(v)
  }));

  const shadowToggle = createToggleControl('Schatten aktiv', renderer.shadowMap.enabled, (value) => {
    renderer.shadowMap.enabled = value;
  });
  perfCard.body.appendChild(shadowToggle);

  if (hooks.water) {
    const qualityControl = createSelectControl('Wasser-Qualität', WATER_OPTIONS, hooks.water.getQuality?.() ?? WATER_QUALITY.ULTRA, (value) => {
      if (typeof hooks.water.setQuality === 'function') {
        hooks.water.setQuality(value);
      } else if (typeof hooks.water.setPerformanceMode === 'function') {
        hooks.water.setPerformanceMode(value === WATER_QUALITY.STATIC);
      }
    });
    perfCard.body.appendChild(qualityControl);
  }
  root.appendChild(perfCard.card);

  if (hooks.weather) {
    const weatherCard = createCard('Wetter');
    const fogToggle = createToggleControl('Nebel', hooks.weather.isFogEnabled?.() ?? false, (value) => hooks.weather.setFogEnabled?.(value));
    const rainToggle = createToggleControl('Regen', hooks.weather.isRainEnabled?.() ?? false, (value) => hooks.weather.setRainEnabled?.(value));
    weatherCard.body.appendChild(fogToggle);
    weatherCard.body.appendChild(rainToggle);
    root.appendChild(weatherCard.card);
  }

  document.body.appendChild(root);

  function syncLoop() {
    const currentHours = normalizeHours(getHours());
    if (Math.abs(currentHours - state.hours) > 1e-3) {
      state.hours = currentHours;
      timeSlider.setValue(currentHours);
      updateTimeDisplay();
    }
    autoController?.setValue?.(state.auto);
    const starsNow = areStarsVisible();
    if (starsNow !== state.stars) {
      state.stars = starsNow;
      starController?.setValue(starsNow);
    }
    requestAnimationFrame(syncLoop);
  }
  requestAnimationFrame(syncLoop);

  return {
    element: root,
    _hidden: false,
    show() {
      root.classList.remove('hud-panel--hidden');
      this._hidden = false;
    },
    hide() {
      root.classList.add('hud-panel--hidden');
      this._hidden = true;
    },
    setActiveCamera(mode) {
      state.activeCamera = mode;
      camGroup.setValue(mode);
    },
    setAutoMode(enabled) {
      state.auto = !!enabled;
      autoController?.setValue?.(state.auto);
    }
  };
}

function createCard(title) {
  const card = document.createElement('article');
  card.className = 'hud-card';

  const header = document.createElement('header');
  header.className = 'hud-card__header';
  const titleEl = document.createElement('span');
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'hud-card__toggle';
  toggle.setAttribute('aria-label', 'Bereich ein-/ausklappen');
  header.appendChild(toggle);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'hud-card__body';
  card.appendChild(body);

  const setCollapsed = (flag) => {
    card.classList.toggle('is-collapsed', flag);
    toggle.textContent = flag ? '+' : '−';
  };
  setCollapsed(false);
  toggle.addEventListener('click', () => {
    setCollapsed(!card.classList.contains('is-collapsed'));
  });

  return { card, body, setCollapsed };
}

function createButtonRow(items, activeId, onSelect) {
  const wrapper = document.createElement('div');
  wrapper.className = 'hud-btn-row';
  const buttons = new Map();
  const setValue = (targetId) => {
    buttons.forEach((btn, id) => {
      btn.classList.toggle('is-active', id === targetId);
    });
  };
  items.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hud-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-active')) return;
      setValue(id);
      onSelect?.(id);
    });
    buttons.set(id, btn);
    wrapper.appendChild(btn);
  });
  setValue(activeId);
  return { element: wrapper, setValue };
}

function createSliderControl({ label, min, max, step, value, format, onInput }) {
  const wrapper = document.createElement('label');
  wrapper.className = 'hud-control';

  const top = document.createElement('div');
  top.className = 'hud-control__top';
  const spanLabel = document.createElement('span');
  spanLabel.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'hud-control__value';
  top.appendChild(spanLabel);
  top.appendChild(valueEl);
  wrapper.appendChild(top);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valueEl.textContent = format ? format(v) : v.toFixed(2);
    const next = onInput(v);
    if (typeof next === 'number' && Number.isFinite(next)) {
      setValue(next);
    }
  });
  wrapper.appendChild(input);

  const setValue = (v) => {
    input.value = String(v);
    const parsed = parseFloat(input.value);
    valueEl.textContent = format ? format(parsed) : parsed.toFixed(2);
  };

  setValue(value);

  wrapper.setValue = setValue;
  return wrapper;
}

function createToggleControl(label, initial, onChange) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hud-toggle';
  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  btn.appendChild(labelSpan);
  const indicator = document.createElement('span');
  indicator.className = 'hud-toggle__indicator';
  btn.appendChild(indicator);

  const setValue = (value) => {
    btn.classList.toggle('is-active', value);
    indicator.textContent = value ? 'ON' : 'OFF';
  };
  setValue(initial);

  btn.addEventListener('click', () => {
    const next = !btn.classList.contains('is-active');
    setValue(next);
    onChange(next);
  });

  btn.setValue = setValue;
  return btn;
}

function createSelectControl(label, options, currentValue, onChange) {
  const wrapper = document.createElement('label');
  wrapper.className = 'hud-control';

  const spanLabel = document.createElement('div');
  spanLabel.className = 'hud-control__top';
  spanLabel.textContent = label;
  wrapper.appendChild(spanLabel);

  const select = document.createElement('select');
  select.className = 'hud-select';
  options.forEach(({ label: text, value }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    if (value === currentValue) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    onChange(select.value);
  });
  wrapper.appendChild(select);
  return wrapper;
}

function createActionButton(label, action) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hud-btn hud-btn--ghost';
  btn.textContent = label;
  btn.addEventListener('click', action);
  return btn;
}

function normalizeHours(hours) {
  return ((hours % 24) + 24) % 24;
}

function formatHoursDisplay(hours) {
  let h = Math.floor(hours);
  let minutes = Math.round((hours - h) * 60);
  if (minutes === 60) {
    minutes = 0;
    h = (h + 1) % 24;
  }
  return `${String(h).padStart(2, '0')}.${String(minutes).padStart(2, '0')}`;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .hud-panel {
      position: fixed;
      top: 60px;
      right: 24px;
      width: 320px;
      max-height: calc(100vh - 120px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      z-index: 900;
      padding-bottom: 20px;
      background: none;
    }
    .hud-panel--hidden { display: none; }
    .hud-card {
      background: rgba(8, 18, 34, 0.85);
      border-radius: 16px;
      border: 1px solid rgba(120, 170, 255, 0.18);
      box-shadow: 0 18px 45px rgba(0,0,0,0.4);
      padding: 14px 16px 16px;
      color: #e8f2ff;
      backdrop-filter: blur(16px);
    }
    .hud-card__header {
      font: 600 14px/1 'Inter', 'Segoe UI', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.75;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .hud-card__toggle {
      border: none;
      background: rgba(255,255,255,0.08);
      color: #e8f2ff;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      font: 600 16px/1 'Inter', sans-serif;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .hud-card__toggle:hover {
      background: rgba(255,255,255,0.2);
    }
    .hud-card__body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .hud-card.is-collapsed .hud-card__body {
      display: none;
    }
    .hud-btn-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .hud-btn {
      border: none;
      border-radius: 12px;
      padding: 10px;
      font: 600 13px/1 'Inter', sans-serif;
      color: #d4e7ff;
      background: rgba(255,255,255,0.05);
      transition: background 0.2s ease, color 0.2s ease;
      cursor: pointer;
    }
    .hud-btn.is-active {
      background: linear-gradient(135deg, #2f77ff, #43a0ff);
      color: #fff;
    }
    .hud-btn--ghost {
      border: 1px solid rgba(255,255,255,0.2);
      background: transparent;
    }
    .hud-control {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .hud-control__top {
      display: flex;
      justify-content: space-between;
      font: 600 12px/1.2 'Inter', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgba(255,255,255,0.75);
    }
    .hud-control__value {
      font-weight: 600;
      color: #fff;
    }
    .hud-control input[type="range"] {
      width: 100%;
      accent-color: #3c8dff;
    }
    .hud-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-radius: 12px;
      padding: 10px 12px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.03);
      color: #dce9ff;
      font: 600 13px/1 'Inter', sans-serif;
      cursor: pointer;
      transition: border 0.2s ease, background 0.2s ease;
    }
    .hud-toggle.is-active {
      border-color: rgba(66, 147, 255, 0.8);
      background: rgba(40, 86, 186, 0.3);
    }
    .hud-toggle__indicator {
      font-size: 12px;
      opacity: 0.8;
      letter-spacing: 0.04em;
    }
    .hud-dual {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .hud-select {
      width: 100%;
      border-radius: 10px;
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(6,20,40,0.9);
      color: #e8f2ff;
      font: 600 13px/1 'Inter', sans-serif;
    }
    .hud-info-text {
      font: 500 13px/1.4 'Inter', sans-serif;
      opacity: 0.75;
    }
    @media (max-width: 900px) {
      .hud-panel {
        position: fixed;
        top: auto;
        bottom: 10px;
        right: 10px;
        width: calc(100vw - 40px);
        max-height: 60vh;
      }
    }
  `;
  document.head.appendChild(style);
}
