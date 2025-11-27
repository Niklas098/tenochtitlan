import * as THREE from 'three';

let loadingManager = null;
let overlayEl = null;
let fillEl = null;
let barEl = null;
let labelEl = null;
let overlayDismissed = false;
let manualReady = false;
let assetsReady = false;
let totalTrackedItems = 0;

/** Returns singleton DOM references for the loading overlay. */
function ensureElements() {
  if (overlayEl) return;
  overlayEl = document.getElementById('loading-screen');
  if (!overlayEl) return;
  fillEl = overlayEl.querySelector('[data-loading-bar-fill]');
  barEl = overlayEl.querySelector('[role="progressbar"]');
  labelEl = overlayEl.querySelector('[data-loading-label]');
}

function setOverlayVisible(visible) {
  ensureElements();
  if (!overlayEl || overlayDismissed) return;
  overlayEl.classList.toggle('loading-screen--hidden', !visible);
}

function setOverlayHidden() {
  ensureElements();
  if (!overlayEl) return;
  overlayDismissed = true;
  overlayEl.classList.add('loading-screen--hidden');
}

function updateProgress(progress) {
  ensureElements();
  if (!fillEl) return;
  const percent = Math.max(0, Math.min(1, progress));
  fillEl.style.width = `${percent * 100}%`;
  if (barEl) {
    barEl.setAttribute('aria-valuenow', String(Math.round(percent * 100)));
  }
  if (labelEl) {
    labelEl.textContent = percent >= 0.99 ? 'Bereit' : 'Lade Umgebung...';
  }
}

function tryHideOverlay() {
  if (overlayDismissed) return;
  if (!manualReady) return;
  if (!assetsReady && totalTrackedItems > 0) return;
  setOverlayHidden();
}

/**
 * Returns the shared loading manager used for all asset loaders.
 * Hooks into lifecycle events to update the loading overlay.
 */
export function getAssetLoadingManager() {
  if (loadingManager) return loadingManager;

  loadingManager = new THREE.LoadingManager();

  loadingManager.onStart = (_url, itemsLoaded, itemsTotal) => {
    totalTrackedItems = itemsTotal;
    updateProgress(itemsTotal ? itemsLoaded / itemsTotal : 0);
    setOverlayVisible(true);
  };

  loadingManager.onProgress = (_url, itemsLoaded, itemsTotal) => {
    totalTrackedItems = Math.max(totalTrackedItems, itemsTotal);
    updateProgress(itemsTotal ? itemsLoaded / itemsTotal : 0);
  };

  loadingManager.onLoad = () => {
    assetsReady = true;
    updateProgress(1);
    tryHideOverlay();
  };

  loadingManager.onError = (url) => {
    console.warn('Asset failed to load:', url);
  };

  return loadingManager;
}

/**
 * Marks the application bootstrap as complete; the overlay will disappear
 * once all tracked assets finished loading (or immediately if none were tracked).
 */
export function markInitialLoadComplete() {
  manualReady = true;
  tryHideOverlay();
}
