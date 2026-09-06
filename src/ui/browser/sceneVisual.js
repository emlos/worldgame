import {
  CANVAS_PLAYBACK_TYPE,
  CANVAS_VISUAL_TYPE,
} from "../../game/scene/canvasVisual.js";

const renderers = new WeakMap();
const imageCaches = new WeakMap();

function imageCacheFor(window) {
  let cache = imageCaches.get(window);
  if (!cache) {
    cache = new Map();
    imageCaches.set(window, cache);
  }
  return cache;
}

function loadImage(window, src) {
  const cache = imageCacheFor(window);
  if (cache.has(src)) return cache.get(src);

  const promise = new Promise((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error(`Could not load scene visual frame '${src}'`)),
      { once: true },
    );
    image.src = src;
  }).catch((error) => {
    cache.delete(src);
    throw error;
  });

  cache.set(src, promise);
  return promise;
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createVisualRandom(seed) {
  let state = hashText(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInterval(playback, random) {
  const { min, max } = playback.intervalMs;
  return min + (max - min) * random();
}

function createTrackState(layer, now, random, reducedMotion) {
  const state = {
    layer,
    frameIndex: 0,
    nextFrameAt: Infinity,
    groupIndex: 0,
    groupFrameIndex: -1,
  };

  if (layer.playback.type === CANVAS_PLAYBACK_TYPE.loop && !reducedMotion) {
    state.nextFrameAt = now + 1000 / layer.playback.fps;
  } else if (layer.playback.type === CANVAS_PLAYBACK_TYPE.burst) {
    state.frameIndex = null;
    if (!reducedMotion) {
      state.nextFrameAt = now + randomInterval(layer.playback, random);
    }
  }
  return state;
}

function advanceLoop(state, now) {
  if (now < state.nextFrameAt) return false;
  const frameDuration = 1000 / state.layer.playback.fps;
  const steps = Math.floor((now - state.nextFrameAt) / frameDuration) + 1;
  state.frameIndex = (state.frameIndex + steps) % state.layer.frames.length;
  state.nextFrameAt += steps * frameDuration;
  return true;
}

function advanceBurst(state, now, random) {
  let changed = false;
  let transitions = 0;
  const { playback, frames } = state.layer;
  const frameDuration = 1000 / playback.fps;
  const groupCount = frames.length / playback.groupSize;

  while (now >= state.nextFrameAt && transitions < 20) {
    transitions += 1;
    changed = true;
    if (state.frameIndex === null) {
      state.groupFrameIndex = 0;
      state.frameIndex = state.groupIndex * playback.groupSize;
      state.nextFrameAt += frameDuration;
    } else if (state.groupFrameIndex + 1 < playback.groupSize) {
      state.groupFrameIndex += 1;
      state.frameIndex += 1;
      state.nextFrameAt += frameDuration;
    } else {
      state.frameIndex = null;
      state.groupFrameIndex = -1;
      state.groupIndex = (state.groupIndex + 1) % groupCount;
      state.nextFrameAt += randomInterval(playback, random);
    }
  }

  if (transitions === 20 && now >= state.nextFrameAt) {
    state.frameIndex = null;
    state.groupFrameIndex = -1;
    state.nextFrameAt = now + randomInterval(playback, random);
  }
  return changed;
}

function createCanvasRenderer(document, visual, motionPreference) {
  const window = document.defaultView;
  if (!window) throw new Error("Canvas scene visuals require a browser window");

  const element = document.createElement("figure");
  element.className = "scene-visual scene-visual--canvas";
  element.style.setProperty("--scene-visual-width", `${visual.width}px`);
  element.style.setProperty(
    "--scene-visual-aspect",
    `${visual.width} / ${visual.height}`,
  );

  if (visual.alt === null) {
    element.setAttribute("aria-hidden", "true");
  } else {
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", visual.alt);
  }

  const canvas = document.createElement("canvas");
  canvas.className = "scene-visual-canvas";
  canvas.width = visual.width;
  canvas.height = visual.height;
  element.append(canvas);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D rendering is unavailable");
  context.imageSmoothingEnabled = false;

  const random = createVisualRandom(visual.animationSeed);
  const hasAnimatedLayers = visual.layers.some(
    (layer) => layer.playback.type !== CANVAS_PLAYBACK_TYPE.static,
  );
  const frameImages = new Map();
  let trackStates = [];
  let animationFrame = null;
  let destroyed = false;
  let hasBeenConnected = false;

  function reducedMotion() {
    return Boolean(motionPreference?.matches);
  }

  function draw() {
    context.clearRect(0, 0, visual.width, visual.height);
    for (const state of trackStates) {
      if (state.frameIndex === null) continue;
      const src = state.layer.frames[state.frameIndex];
      const image = frameImages.get(src);
      if (image) context.drawImage(image, 0, 0, visual.width, visual.height);
    }
  }

  function resetTracks(now) {
    trackStates = visual.layers.map((layer) =>
      createTrackState(layer, now, random, reducedMotion()),
    );
  }

  function schedule() {
    if (!destroyed && hasAnimatedLayers && animationFrame === null) {
      animationFrame = window.requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    animationFrame = null;
    if (destroyed) return;
    if (element.isConnected) hasBeenConnected = true;
    else if (hasBeenConnected) {
      destroy();
      return;
    }

    let changed = false;
    for (const state of trackStates) {
      if (state.layer.playback.type === CANVAS_PLAYBACK_TYPE.loop) {
        changed = advanceLoop(state, now) || changed;
      } else if (state.layer.playback.type === CANVAS_PLAYBACK_TYPE.burst) {
        changed = advanceBurst(state, now, random) || changed;
      }
    }
    if (changed) draw();
    schedule();
  }

  function stopAnimation() {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stopAnimation();
      return;
    }
    resetTracks(window.performance.now());
    draw();
    if (!reducedMotion()) schedule();
  }

  function onMotionPreferenceChange() {
    stopAnimation();
    resetTracks(window.performance.now());
    draw();
    if (!reducedMotion() && !document.hidden) schedule();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopAnimation();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    motionPreference?.removeEventListener?.("change", onMotionPreferenceChange);
    renderers.delete(element);
  }

  renderers.set(element, { destroy });
  document.addEventListener("visibilitychange", onVisibilityChange);
  motionPreference?.addEventListener?.("change", onMotionPreferenceChange);

  const sources = [...new Set(visual.layers.flatMap((layer) => layer.frames))];
  Promise.all(sources.map((src) => loadImage(window, src)))
    .then((images) => {
      if (destroyed) return;
      sources.forEach((src, index) => frameImages.set(src, images[index]));
      resetTracks(window.performance.now());
      draw();
      if (!reducedMotion() && !document.hidden) schedule();
    })
    .catch((error) => {
      element.dataset.loadError = "true";
      console.error(error);
    });

  return element;
}

export function destroySceneVisualElement(element) {
  if (element) renderers.get(element)?.destroy();
}

export function createSceneVisualElement(document, visual, options = {}) {
  if (visual === null) return null;
  if (visual.type === CANVAS_VISUAL_TYPE) {
    return createCanvasRenderer(document, visual, options.motionPreference);
  }
  throw new TypeError(`Unknown scene visual type '${String(visual.type)}'`);
}
