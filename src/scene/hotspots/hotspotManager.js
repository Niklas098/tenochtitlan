import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const TMP_POS = new THREE.Vector3();
const TMP_ICON = new THREE.Vector3();

/** Info icon colors (tweakable). */
const ICON_GRADIENT_INNER = 'rgba(117, 169, 238, 0.9)';
const ICON_GRADIENT_MID   = 'rgba(54, 149, 226, 0.75)';
const ICON_GRADIENT_OUTER = 'rgba(77, 211, 235, 0)';
const ICON_TEXT_COLOR     = 'rgba(230,238,255,1.0)';
const ICON_TEXT_STROKE    = 'rgba(0, 0, 0, 0.86)';



function toVector3(input) {
  if (!input) return null;
  if (input.isVector3) return input.clone();
  if (Array.isArray(input) && input.length === 3) {
    return new THREE.Vector3(Number(input[0]) || 0, Number(input[1]) || 0, Number(input[2]) || 0);
  }
  if (typeof input === 'object' && 'x' in input && 'y' in input && 'z' in input) {
    return new THREE.Vector3(Number(input.x) || 0, Number(input.y) || 0, Number(input.z) || 0);
  }
  return null;
}

function createInfoTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.5
  );
  grad.addColorStop(0, ICON_GRADIENT_INNER);
  grad.addColorStop(0.45, ICON_GRADIENT_MID);
  grad.addColorStop(1, ICON_GRADIENT_OUTER);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = ICON_TEXT_COLOR;
  ctx.font = `bold ${Math.floor(size * 0.56)}px "Inter", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(50,140,255,0.75)';
  ctx.shadowBlur = size * 0.06;
  if (ICON_TEXT_STROKE) {
    ctx.lineWidth = size * 0.05;
    ctx.strokeStyle = ICON_TEXT_STROKE;
    ctx.strokeText('i', size / 2, size / 2);
  }
  ctx.fillText('i', size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createInfoSprite() {
  const texture = createInfoTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    opacity: 0.95,
    blending: THREE.NormalBlending
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;
  return sprite;
}

function createPromptUI() {
  let el = document.getElementById('hotspot-prompt');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hotspot-prompt';
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.bottom = '28px';
    el.style.transform = 'translateX(-50%)';
    el.style.padding = '8px 14px';
    el.style.borderRadius = '999px';
    el.style.background = 'rgba(10, 24, 48, 0.75)';
    el.style.color = '#e8f2ff';
    el.style.font = '14px/1.2 "Inter", "Segoe UI", sans-serif';
    el.style.letterSpacing = '0.02em';
    el.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.35)';
    el.style.backdropFilter = 'blur(8px)';
    el.style.zIndex = '1200';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s ease';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
  }
  return {
    show(text) {
      el.textContent = text;
      el.style.opacity = '1';
    },
    hide() {
      el.style.opacity = '0';
    }
  };
}

function createInfoPanel(options = {}) {
  const { onVisibilityChange } = options;
  let wrapper = document.getElementById('hotspot-info');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'hotspot-info';
    wrapper.style.position = 'fixed';
    wrapper.style.inset = '0';
    wrapper.style.display = 'none';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.background = 'rgba(0, 0, 0, 0.45)';
    wrapper.style.backdropFilter = 'blur(6px)';
    wrapper.style.zIndex = '1300';

    const card = document.createElement('div');
    card.style.maxWidth = '520px';
    card.style.width = '90%';
    card.style.padding = '22px';
    card.style.borderRadius = '16px';
    card.style.background = 'linear-gradient(135deg, rgba(10,18,32,0.92), rgba(16,32,62,0.92))';
    card.style.color = '#e8f2ff';
    card.style.boxShadow = '0 18px 60px rgba(0,0,0,0.5)';
    card.style.border = '1px solid rgba(120,170,255,0.25)';
    card.style.position = 'relative';
    card.style.font = '15px/1.45 "Inter", "Segoe UI", sans-serif';

    const title = document.createElement('h2');
    title.style.margin = '0 0 10px 0';
    title.style.fontSize = '20px';
    title.style.letterSpacing = '0.01em';

    const body = document.createElement('div');
    body.id = 'hotspot-info-body';
    body.style.whiteSpace = 'pre-wrap';
    body.style.opacity = '0.92';

    const close = document.createElement('button');
    close.textContent = 'Schließen';
    close.style.position = 'absolute';
    close.style.top = '12px';
    close.style.right = '12px';
    close.style.background = 'rgba(255,255,255,0.08)';
    close.style.color = '#e8f2ff';
    close.style.border = '1px solid rgba(255,255,255,0.12)';
    close.style.borderRadius = '12px';
    close.style.padding = '6px 10px';
    close.style.cursor = 'pointer';
    close.style.font = '12px/1 "Inter", "Segoe UI", sans-serif';

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(close);
    wrapper.appendChild(card);
    document.body.appendChild(wrapper);

    wrapper.addEventListener('click', (e) => {
      if (e.target === wrapper) hide();
    });
    close.addEventListener('click', hide);

    window.addEventListener('keydown', (e) => {
      if (wrapper.style.display === 'flex' && e.code === 'Escape') hide();
    });
  }

  let currentId = null;
  const titleEl = wrapper.querySelector('h2');
  const bodyEl = document.getElementById('hotspot-info-body');

  function show({ id, title, description }) {
    currentId = id || null;
    if (titleEl) titleEl.textContent = title || 'Info';
    if (bodyEl) bodyEl.textContent = description || '';
    wrapper.style.display = 'flex';
    onVisibilityChange?.(true);
  }

  function hide() {
    wrapper.style.display = 'none';
    currentId = null;
    onVisibilityChange?.(false);
  }

  return {
    show,
    hide,
    isOpen: () => wrapper.style.display !== 'none',
    get currentId() {
      return currentId;
    }
  };
}

function resolveAnchorPosition(hotspot) {
  if (hotspot.anchor?.getWorldPosition) {
    hotspot.anchor.updateWorldMatrix?.(true, false);
    hotspot.anchor.getWorldPosition(TMP_POS);
    return TMP_POS;
  }
  if (hotspot.position) {
    return hotspot.position;
  }
  return null;
}

export function createHotspotManager(scene, options = {}) {
  const { onPanelVisibilityChange } = options;
  const hotspots = [];
  const prompt = createPromptUI();
  const panel = createInfoPanel({
    onVisibilityChange: (visible) => {
      onPanelVisibilityChange?.(visible);
    }
  });
  let active = null;

  function addHotspot({
    id,
    anchor = null,
    position = null,
    radius = 7,
    height = 4,
    glowStrength = 1,
    title = 'Hotspot',
    description = '',
    promptText = 'Drücke E für Info'
  } = {}) {
    const sprite = createInfoSprite();
    const baseScale = 3.2;
    sprite.scale.setScalar(baseScale);
    scene.add(sprite);

    hotspots.push({
      id: id || `hotspot-${hotspots.length + 1}`,
      anchor,
      position: toVector3(position),
      radius,
      height,
      glowStrength,
      title,
      description,
      promptText,
      sprite,
      baseScale,
      phase: Math.random() * Math.PI * 2
    });
  }

  function setActive(hs) {
    if (active === hs) return;
    active = hs;
    if (active) prompt.show(active.promptText || 'E – Info lesen');
    else prompt.hide();
  }

  function update(dt, camera) {
    if (!camera) return;
    const camPos = camera.position;
    let best = null;
    let bestDist = Infinity;
    const t = performance.now() * 0.001;

    hotspots.forEach((hs) => {
      const anchorPos = resolveAnchorPosition(hs);
      if (!anchorPos) return;

      const dist = anchorPos.distanceTo(camPos);
      if (dist < hs.radius && dist < bestDist) {
        best = hs;
        bestDist = dist;
      }

      const bob = Math.sin(t * 1.6 + hs.phase) * 0.3;
      const pulse = 0.7 + 0.3 * (Math.sin(t * 2.3 + hs.phase) * 0.5 + 0.5);
      const glow = Math.max(0.2, hs.glowStrength || 1);

      const iconPos = TMP_ICON.copy(anchorPos).addScaledVector(UP, hs.height + bob);
      hs.sprite.position.copy(iconPos);
      hs.sprite.scale.setScalar(hs.baseScale * (0.9 + pulse * 0.2) * glow);
      if (hs.sprite.material) {
        hs.sprite.material.opacity = Math.min(1, (0.55 + pulse * 0.35) * glow);
      }
    });

    setActive(best);
  }

  function handleInteract() {
    if (!active) return false;
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    panel.show(active);
    return true;
  }

  function closePanel() {
    panel.hide();
  }

  return {
    addHotspot,
    update,
    handleInteract,
    closePanel,
    isPanelOpen: () => panel.isOpen(),
    get activeHotspotId() {
      return active?.id ?? null;
    }
  };
}
