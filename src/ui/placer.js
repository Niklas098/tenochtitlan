// src/ui/placer.js
import * as THREE from 'three';
import GUI from 'lil-gui';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { updateHitboxesForObject } from '../util/collision.js';

const DEFAULT_OPTIONS = {
  keyboardMoveSpeed: 32,
  keyboardVerticalSpeed: 24,
  keyboardRotationSpeedDeg: 120
};

const PLACEMENTS_API = '/api/placements';
const PLACEMENTS_FALLBACK = '/data/placements.json';
const PLACER_ROOT_KEY = '__placerRoot';

let suppressEnabledChange = false;
let suppressModeChange = false;

const state = {
  initialized: false,
  enabled: false,
  scene: null,
  domElement: null,
  onEnabledChange: null,
  activeCamera: null,
  options: { ...DEFAULT_OPTIONS },
  placeables: new Set(),
  placeableArray: [],
  placeableArrayDirty: false,
  selection: null,
  selectionDirty: false,
  transformControls: null,
  transformMode: 'translate',
  controlsDragging: false,
  suppressSelectionUntilPointerUp: false,
  gui: null,
  guiState: {
    mode: 'translate',
    x: 0,
    y: 0,
    z: 0,
    rotY: 0
  },
  guiControllers: {},
  keyboard: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    rotateLeft: false,
    rotateRight: false,
    fast: false,
    slow: false
  },
  pointerDown: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  box: new THREE.Box3(),
  boxHelper: null,
  persistedTransforms: new Map(),
  persistenceLoaded: false,
  pendingTransforms: new Map(),
  pendingPersistAfterDrag: false,
  loadPromise: null,
  saveTimer: null
};

const KEY_BINDINGS = {
  KeyW: (down) => state.keyboard.forward = down,
  KeyS: (down) => state.keyboard.backward = down,
  KeyA: (down) => state.keyboard.left = down,
  KeyD: (down) => state.keyboard.right = down,
  KeyR: (down) => state.keyboard.up = down,
  KeyF: (down) => state.keyboard.down = down,
  KeyQ: (down) => state.keyboard.rotateLeft = down,
  KeyE: (down) => state.keyboard.rotateRight = down,
  ShiftLeft: (down) => state.keyboard.fast = down,
  ShiftRight: (down) => state.keyboard.fast = down,
  AltLeft: (down) => state.keyboard.slow = down,
  AltRight: (down) => state.keyboard.slow = down
};

/**
 * Initialises the interactive placer/editor tool.
 *
 * @param {Object} options
 * @param {THREE.Scene} options.scene - Scene containing the placeable objects.
 * @param {HTMLElement} options.domElement - DOM element that receives pointer events (usually renderer.domElement).
 * @param {boolean} [options.defaultEnabled=false] - Whether the tool starts enabled.
 * @param {number} [options.keyboardMoveSpeed] - Horizontal keyboard move speed (units/second).
 * @param {number} [options.keyboardVerticalSpeed] - Vertical keyboard move speed (units/second).
 * @param {number} [options.keyboardRotationSpeedDeg] - Rotation speed in degrees/second.
 */
export function initPlacer({
  scene,
  domElement,
  defaultEnabled = false,
  keyboardMoveSpeed,
  keyboardVerticalSpeed,
  keyboardRotationSpeedDeg,
  onEnabledChange
} = {}) {
  if (state.initialized) return;
  state.scene = scene;
  state.domElement = domElement || document.body;
  state.onEnabledChange = typeof onEnabledChange === 'function' ? onEnabledChange : null;
  state.options.keyboardMoveSpeed = keyboardMoveSpeed ?? DEFAULT_OPTIONS.keyboardMoveSpeed;
  state.options.keyboardVerticalSpeed = keyboardVerticalSpeed ?? DEFAULT_OPTIONS.keyboardVerticalSpeed;
  state.options.keyboardRotationSpeedDeg = keyboardRotationSpeedDeg ?? DEFAULT_OPTIONS.keyboardRotationSpeedDeg;

  startPersistedTransformSync();
  setupSelectionHelper();
  setupGUI();
  setupTransformControls();
  attachEvents();

  state.initialized = true;
  setPlacerEnabled(defaultEnabled);
}

/**
 * Advances the placer state and applies keyboard-driven transforms.
 * @param {number} delta - Frame delta time in seconds.
 */
export function updatePlacer(delta = 0) {
  if (!state.initialized) return;
  if (!state.enabled || !state.selection) {
    if (state.boxHelper) {
      state.boxHelper.visible = state.enabled && !!state.selection;
    }
    return;
  }

  applyKeyboardMovement(delta);
  updateSelectionHelper();
}

/**
 * Enables or disables the placer UI and interaction handlers.
 * @param {boolean} enabled
 */
export function setPlacerEnabled(enabled) {
  const nextEnabled = !!enabled;
  const changed = nextEnabled !== state.enabled;
  state.enabled = nextEnabled;
  if (!state.enabled) {
    state.controlsDragging = false;
    state.pendingPersistAfterDrag = false;
    state.suppressSelectionUntilPointerUp = false;
    state.pointerDown = null;
  }
  refreshTransformControlsState();
  refreshCursor();
  if (state.gui) {
    state.enabled ? state.gui.show() : state.gui.hide();
  }
  if (changed && typeof state.onEnabledChange === 'function') {
    state.onEnabledChange(state.enabled);
  }
}

/**
 * Sets the active camera used for raycasting and TransformControls.
 * @param {THREE.Camera} camera
 */
export function setPlacerActiveCamera(camera) {
  state.activeCamera = camera || null;
  if (state.transformControls && state.activeCamera) {
    state.transformControls.camera = state.activeCamera;
  }
}

/**
 * Registers an object so it can be picked and edited by the placer.
 * @param {THREE.Object3D} object3D
 * @param {string} [id] - Stable identifier used for persistence.
 */
export function registerPlaceableObject(object3D, id) {
  if (!object3D || state.placeables.has(object3D)) return;

  const root = object3D;
  annotateAsPlaceableRoot(root);
  root.userData.placerId = typeof id === 'string' && id.length > 0 ? id : (root.userData.placerId || root.uuid);
  if (!root.userData.placerDefault) {
    root.userData.placerDefault = captureTransform(root);
  }

  state.placeables.add(root);
  state.placeableArrayDirty = true;

  applyKnownTransforms(root);
  updateHitboxesForObject(root);
}

/**
 * Returns the currently selected placeable root object.
 * @returns {THREE.Object3D|null}
 */
export function getCurrentlySelectedObject() {
  return state.selection || null;
}

function setupSelectionHelper() {
  if (!state.scene) return;
  state.boxHelper = new THREE.Box3Helper(state.box, new THREE.Color(0xffd166));
  state.boxHelper.visible = false;
  state.scene.add(state.boxHelper);
}

function setupGUI() {
  state.gui = new GUI({ title: 'Placer', width: 300 });
  state.gui.domElement.style.zIndex = '5';

  const transform = state.gui.addFolder('Transform');
  state.guiControllers.mode = transform.add(state.guiState, 'mode', ['translate', 'rotate']).name('Gizmo')
    .onChange((mode) => {
      if (suppressModeChange) return;
      setTransformMode(mode);
    });

  state.guiControllers.x = transform.add(state.guiState, 'x').name('Pos X').onChange((v) => applyGuiTransform('x', v));
  state.guiControllers.y = transform.add(state.guiState, 'y').name('Pos Y').onChange((v) => applyGuiTransform('y', v));
  state.guiControllers.z = transform.add(state.guiState, 'z').name('Pos Z').onChange((v) => applyGuiTransform('z', v));
  state.guiControllers.rotY = transform.add(state.guiState, 'rotY').name('Rotation Y (°)').onChange((v) => applyGuiTransform('rotY', v));

  toggleTransformInputs(false);

  const actionsFolder = state.gui.addFolder('Aktionen');
  const actions = {
    resetRot: () => resetSelectionRotation(),
    resetHeight: () => resetSelectionHeight(),
    resetAll: () => resetSelectionDefaults(),
    cloneRow: () => cloneSelectionRow(),
    exportLayout: () => exportLayoutToClipboard(),
    importLayout: () => importLayoutFromPrompt(),
    reloadLayout: () => reloadLayoutFromServer()
  };
  actionsFolder.add(actions, 'resetRot').name('Rotation → Default');
  actionsFolder.add(actions, 'resetHeight').name('Höhe → Default');
  actionsFolder.add(actions, 'resetAll').name('Alles → Default');
  actionsFolder.add(actions, 'cloneRow').name('Reihe duplizieren');
  actionsFolder.add(actions, 'exportLayout').name('Layout kopieren');
  actionsFolder.add(actions, 'importLayout').name('Layout einfügen');
  actionsFolder.add(actions, 'reloadLayout').name('Layout vom Server laden');

  // Standardmäßig versteckt, bis der Placer aktiv ist
  state.gui.hide();
}

function setupTransformControls() {
  if (!state.scene || !state.domElement) return;
  const camera = state.activeCamera || new THREE.PerspectiveCamera();
  state.transformControls = new TransformControls(camera, state.domElement);
  state.transformControls.enabled = false;
  state.transformControls.visible = false;
  state.transformControls.setMode(state.transformMode);

  state.transformControls.addEventListener('dragging-changed', ({ value }) => {
    state.controlsDragging = value;
    if (value) {
      state.suppressSelectionUntilPointerUp = true;
    } else {
      if (state.pendingPersistAfterDrag) {
        persistTransform(state.selection);
        state.pendingPersistAfterDrag = false;
      }
      // Delay lifting suppression so pointerup from the gizmo click does not re-trigger selection.
      setTimeout(() => {
        state.suppressSelectionUntilPointerUp = false;
      }, 0);
    }
    refreshCursor();
  });

  state.transformControls.addEventListener('objectChange', () => {
    if (!state.selection) return;
    state.selectionDirty = true;
    syncGuiFromSelection();
    state.selection.updateMatrixWorld(true);
    updateHitboxesForObject(state.selection);
    if (state.controlsDragging) {
      state.pendingPersistAfterDrag = true;
    } else {
      persistTransform(state.selection);
    }
  });

  state.scene.add(state.transformControls);
}

function attachEvents() {
  if (!state.domElement) return;
  state.domElement.addEventListener('pointerdown', onPointerDown);
  state.domElement.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', (e) => handleKey(e, true), true);
  window.addEventListener('keyup', (e) => handleKey(e, false), true);
}

function handleKey(event, down) {
  if (!state.enabled || (!state.selection && event.code !== 'Escape')) return;

  if (down) {
    if (event.code === 'Digit1') setTransformMode('translate');
    if (event.code === 'Digit2') setTransformMode('rotate');
  }

  const handler = KEY_BINDINGS[event.code];
  if (handler) {
    handler(down);
    event.stopPropagation();
    event.preventDefault();
    return;
  }

  if (event.code === 'Escape' && down) {
    setSelection(null);
  }
}

function onPointerDown(event) {
  if (!state.enabled || event.button !== 0) return;
  state.pointerDown = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event) {
  if (!state.enabled || event.button !== 0) return;
  if (!state.pointerDown) return;
  const dx = Math.abs(event.clientX - state.pointerDown.x);
  const dy = Math.abs(event.clientY - state.pointerDown.y);
  state.pointerDown = null;
  if (dx > 4 || dy > 4) return;
  if (state.controlsDragging || state.suppressSelectionUntilPointerUp) return;

  updatePointerFromEvent(event);
  const hit = pickPlaceable();
  if (hit) {
    setSelection(hit.root);
  } else {
    setSelection(null);
  }
}

function pickPlaceable() {
  const camera = state.activeCamera;
  if (!camera) return null;
  state.raycaster.setFromCamera(state.pointer, camera);
  const targets = getPlaceableArray();
  if (!targets.length) return null;
  const intersections = state.raycaster.intersectObjects(targets, true);
  if (!intersections.length) return null;
  const first = intersections[0];
  const root = resolvePlaceableRoot(first.object);
  if (!root) return null;
  return { root, point: first.point.clone() };
}

function updatePointerFromEvent(event) {
  const rect = state.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function resolvePlaceableRoot(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData[PLACER_ROOT_KEY]) {
      return current.userData[PLACER_ROOT_KEY];
    }
    current = current.parent;
  }
  return null;
}

function annotateAsPlaceableRoot(root) {
  root.traverse((child) => {
    if (!child.userData) child.userData = {};
    child.userData[PLACER_ROOT_KEY] = root;
  });
}

function setSelection(object) {
  if (state.selection === object) return;
  state.selection = object || null;
  state.selectionDirty = true;
  syncGuiFromSelection();
  refreshTransformControlsState();
  refreshCursor();
}

function toggleTransformInputs(enabled) {
  const { x, y, z, rotY } = state.guiControllers;
  [x, y, z, rotY].forEach((ctrl) => {
    if (!ctrl) return;
    if (enabled) ctrl.enable(); else ctrl.disable();
  });
}

function syncGuiFromSelection() {
  const sel = state.selection;
  if (!sel) {
    state.guiState.x = 0;
    state.guiState.y = 0;
    state.guiState.z = 0;
    state.guiState.rotY = 0;
    toggleTransformInputs(false);
  } else {
    state.guiState.x = sel.position.x;
    state.guiState.y = sel.position.y;
    state.guiState.z = sel.position.z;
    state.guiState.rotY = THREE.MathUtils.radToDeg(sel.rotation.y);
    toggleTransformInputs(true);
  }

  ['x', 'y', 'z', 'rotY'].forEach((key) => {
    const ctrl = state.guiControllers[key];
    if (ctrl) ctrl.updateDisplay();
  });

}

function applyGuiTransform(axis, value) {
  if (!state.selection) return;
  const numeric = Number(value) || 0;
  if (axis === 'rotY') {
    state.selection.rotation.y = THREE.MathUtils.degToRad(numeric);
  } else {
    state.selection.position[axis] = numeric;
  }
  markSelectionChanged();
}

function resetSelectionRotation() {
  const sel = state.selection;
  if (!sel?.userData?.placerDefault) return;
  const rot = sel.userData.placerDefault.rotation;
  sel.rotation.set(rot[0], rot[1], rot[2]);
  markSelectionChanged();
}

function resetSelectionHeight() {
  const sel = state.selection;
  if (!sel?.userData?.placerDefault) return;
  sel.position.y = sel.userData.placerDefault.position[1];
  markSelectionChanged();
}

function resetSelectionDefaults() {
  const sel = state.selection;
  if (!sel?.userData?.placerDefault) return;
  applyTransformData(sel, sel.userData.placerDefault);
  markSelectionChanged();
}

function cloneSelectionRow() {
  if (!state.selection || !state.scene || typeof window === 'undefined') return;
  const count = parseInt(window.prompt('Wie viele zusätzliche Segmente?', '5') || '0', 10);
  if (!Number.isFinite(count) || count <= 0) return;
  const spacing = parseFloat(window.prompt('Abstand zwischen Segmenten (Einheiten)', '6') || '0');
  if (!Number.isFinite(spacing) || spacing === 0) return;

  const base = state.selection;
  const forward = new THREE.Vector3();
  base.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();

  const start = base.position.clone();

  for (let i = 1; i <= count; i++) {
    const clone = base.clone(true);
    clone.position.copy(start).addScaledVector(forward, spacing * i);
    // frische userData, damit Ids/Defaults nicht geteilt werden
    clone.userData = { ...base.userData };
    delete clone.userData.placerDefault;
    delete clone.userData.placerId;
    const newId = `${base.userData?.placerId || base.name || 'placeable'}-${THREE.MathUtils.generateUUID()}`;
    state.scene.add(clone);
    registerPlaceableObject(clone, newId);
    persistTransform(clone); // sofort ins Persisted-Layout übernehmen
  }
}

function applyKeyboardMovement(delta) {
  const sel = state.selection;
  if (!sel) return;

  const kb = state.keyboard;
  const { keyboardMoveSpeed, keyboardVerticalSpeed, keyboardRotationSpeedDeg } = state.options;
  const multiplier = kb.fast ? 3 : kb.slow ? 0.3 : 1;

  const dirX = (kb.right ? 1 : 0) - (kb.left ? 1 : 0);
  const dirZ = (kb.backward ? 1 : 0) - (kb.forward ? 1 : 0);
  const dirY = (kb.up ? 1 : 0) - (kb.down ? 1 : 0);
  const rotDir = (kb.rotateRight ? 1 : 0) - (kb.rotateLeft ? 1 : 0);

  let moved = false;

  if (dirX || dirZ) {
    const length = Math.hypot(dirX, dirZ) || 1;
    sel.position.x += (dirX / length) * keyboardMoveSpeed * multiplier * delta;
    sel.position.z += (dirZ / length) * keyboardMoveSpeed * multiplier * delta;
    moved = true;
  }

  if (dirY) {
    sel.position.y += dirY * keyboardVerticalSpeed * multiplier * delta;
    moved = true;
  }

  if (rotDir) {
    const rotSpeed = THREE.MathUtils.degToRad(keyboardRotationSpeedDeg);
    sel.rotation.y += rotDir * rotSpeed * multiplier * delta;
    moved = true;
  }

  if (moved) {
    markSelectionChanged();
  }
}

function markSelectionChanged() {
  state.selectionDirty = true;
  syncGuiFromSelection();
  if (state.selection) {
    state.selection.updateMatrixWorld(true);
    updateHitboxesForObject(state.selection);
    if (state.controlsDragging) {
      state.pendingPersistAfterDrag = true;
    } else {
      persistTransform(state.selection);
    }
  }
}

function updateSelectionHelper() {
  if (!state.boxHelper) return;
  if (!state.selection) {
    state.boxHelper.visible = false;
    state.selectionDirty = false;
    return;
  }
  if (!state.selectionDirty) return;
  state.box.setFromObject(state.selection);
  state.boxHelper.visible = state.enabled;
  state.boxHelper.updateMatrixWorld(true);
  state.selectionDirty = false;
}

function refreshTransformControlsState() {
  if (!state.transformControls) return;
  if (state.enabled && state.selection) {
    state.transformControls.attach(state.selection);
    state.transformControls.visible = true;
  } else {
    state.transformControls.detach();
    state.transformControls.visible = false;
  }
  state.transformControls.enabled = state.enabled;
  state.transformControls.setMode(state.transformMode);
}

function startPersistedTransformSync() {
  if (state.loadPromise) return;
  state.loadPromise = loadPersistedTransformsFromServer();
}

async function loadPersistedTransformsFromServer() {
  if (typeof fetch === 'undefined') {
    state.persistenceLoaded = true;
    return;
  }

  const sources = [PLACEMENTS_API, PLACEMENTS_FALLBACK];
  let loaded = {};

  for (const url of sources) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      loaded = await res.json().catch(() => ({}));
      break;
    } catch (err) {
      console.warn('Placer: Konnte Layout nicht laden von', url, err);
    }
  }

  if (!loaded || typeof loaded !== 'object') {
    loaded = {};
  }

  state.persistedTransforms.clear();
  Object.entries(loaded).forEach(([id, data]) => state.persistedTransforms.set(id, data));
  state.persistenceLoaded = true;

  if (state.pendingTransforms.size > 0) {
    state.pendingTransforms.forEach((data, id) => state.persistedTransforms.set(id, data));
    state.pendingTransforms.clear();
    schedulePersistedSave();
  }

  state.placeables.forEach((obj) => applyKnownTransforms(obj));
  state.selectionDirty = true;
}

function refreshCursor() {
  if (!state.domElement) return;
  if (!state.enabled) {
    state.domElement.style.cursor = '';
  } else if (state.controlsDragging) {
    state.domElement.style.cursor = 'grabbing';
  } else {
    state.domElement.style.cursor = state.selection ? 'pointer' : 'crosshair';
  }
}

function getPlaceableArray() {
  if (!state.placeableArrayDirty) return state.placeableArray;
  state.placeableArray.length = 0;
  state.placeables.forEach((obj) => state.placeableArray.push(obj));
  state.placeableArrayDirty = false;
  return state.placeableArray;
}

function setTransformMode(mode) {
  if (!mode) return;
  state.transformMode = mode;
  state.guiState.mode = mode;
  if (state.guiControllers.mode) {
    suppressModeChange = true;
    state.guiControllers.mode.setValue(mode);
    suppressModeChange = false;
  }
  if (state.transformControls) {
    state.transformControls.setMode(mode);
  }
}

function persistTransform(object) {
  if (!object) return;
  const id = object.userData?.placerId;
  if (!id) return;
  const data = captureTransform(object);
  const existing = state.persistenceLoaded
    ? (state.persistedTransforms.get(id) || {})
    : (state.pendingTransforms.get(id) || {});
  const merged = { ...existing, ...data };
  if (!state.persistenceLoaded) {
    state.pendingTransforms.set(id, merged);
    return;
  }
  state.persistedTransforms.set(id, merged);
  schedulePersistedSave();
}

function schedulePersistedSave() {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    savePersistedTransforms();
  }, 200);
}

function savePersistedTransforms() {
  if (typeof fetch === 'undefined') return;
  const payload = buildLayoutPayload();
  fetch(PLACEMENTS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch((err) => {
    console.warn('Placer: Speichern auf dem Server fehlgeschlagen.', err);
  });
}

function clearPersistedTransforms() {
  state.persistedTransforms.clear();
  state.pendingTransforms.clear();
  state.placeables.forEach((obj) => {
    if (obj.userData?.placerDefault) {
      applyTransformData(obj, obj.userData.placerDefault);
    }
  });
  state.selectionDirty = true;
  state.persistenceLoaded = true;
  schedulePersistedSave();
}

function reloadLayoutFromServer() {
  state.loadPromise = null;
  state.persistenceLoaded = false;
  state.pendingTransforms.clear();
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }
  startPersistedTransformSync();
}

function exportLayoutToClipboard() {
  const payload = buildLayoutPayload();
  const text = JSON.stringify(payload, null, 2);
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.clipboard?.writeText) {
    nav.clipboard.writeText(text).catch(() => promptFallbackCopy(text));
  } else {
    promptFallbackCopy(text);
  }
}

function importLayoutFromPrompt() {
  if (typeof window === 'undefined') return;
  const input = window.prompt('Layouts aus JSON einfügen:');
  if (!input) return;
  try {
    const parsed = JSON.parse(input);
    state.persistedTransforms.clear();
    state.pendingTransforms.clear();
    Object.entries(parsed).forEach(([id, data]) => state.persistedTransforms.set(id, data));
    state.placeables.forEach((obj) => applyKnownTransforms(obj));
    state.selectionDirty = true;
    state.persistenceLoaded = true;
    schedulePersistedSave();
  } catch (err) {
    alert('Konnte Layout nicht importieren: ' + err.message);
  }
}

function promptFallbackCopy(text) {
  if (typeof window === 'undefined') return;
  try {
    window.prompt('JSON kopieren (Strg+C, Enter):', text);
  } catch (_) {}
}

function applyKnownTransforms(object) {
  if (!object) return;
  const id = object.userData?.placerId;
  if (!id) return;
  const data = state.persistedTransforms.get(id);
  if (!data) return;
  applyTransformData(object, data);
}

function buildLayoutPayload() {
  const payload = {};
  state.persistedTransforms.forEach((value, key) => {
    payload[key] = value;
  });
  if (state.pendingTransforms.size > 0) {
    state.pendingTransforms.forEach((value, key) => {
      payload[key] = value;
    });
  }
  return payload;
}

function applyTransformData(object, data) {
  if (!object || !data) return;
  if (Array.isArray(data.position)) {
    object.position.set(data.position[0], data.position[1], data.position[2]);
  }
  if (Array.isArray(data.rotation)) {
    object.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
  }
  if (Array.isArray(data.scale)) {
    object.scale.set(data.scale[0], data.scale[1], data.scale[2]);
  }
  object.updateMatrixWorld(true);
}

function captureTransform(object) {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z]
  };
}
