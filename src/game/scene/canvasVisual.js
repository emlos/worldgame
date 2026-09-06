export const CANVAS_VISUAL_TYPE = "canvas";

export const CANVAS_PLAYBACK_TYPE = Object.freeze({
  static: "static",
  loop: "loop",
  burst: "burst",
});

function fail(message) {
  throw new TypeError(message);
}

function requireRecord(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
}

function requirePositiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${path} must be a positive integer`);
  }
}

function requirePositiveNumber(value, path) {
  if (!Number.isFinite(value) || value <= 0) {
    fail(`${path} must be a positive number`);
  }
}

function requireText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${path} must be a non-empty string`);
  }
}

function validatePlayback(playback, frameCount, path) {
  requireRecord(playback, path);
  if (!Object.values(CANVAS_PLAYBACK_TYPE).includes(playback.type)) {
    fail(`${path}.type must be 'static', 'loop', or 'burst'`);
  }

  if (playback.type === CANVAS_PLAYBACK_TYPE.static) {
    if (frameCount !== 1) fail(`${path} static playback requires exactly one frame`);
    return;
  }

  requirePositiveNumber(playback.fps, `${path}.fps`);
  if (playback.type === CANVAS_PLAYBACK_TYPE.loop) return;

  requirePositiveInteger(playback.groupSize, `${path}.groupSize`);
  if (frameCount % playback.groupSize !== 0) {
    fail(`${path}.groupSize must divide the layer frame count`);
  }
  requireRecord(playback.intervalMs, `${path}.intervalMs`);
  requirePositiveNumber(playback.intervalMs.min, `${path}.intervalMs.min`);
  requirePositiveNumber(playback.intervalMs.max, `${path}.intervalMs.max`);
  if (playback.intervalMs.max < playback.intervalMs.min) {
    fail(`${path}.intervalMs.max must be at least intervalMs.min`);
  }
}

export function validateCanvasVisual(visual, path = "scene.visual") {
  requireRecord(visual, path);
  if (visual.type !== CANVAS_VISUAL_TYPE) {
    fail(`${path}.type must be '${CANVAS_VISUAL_TYPE}'`);
  }

  requirePositiveInteger(visual.width, `${path}.width`);
  requirePositiveInteger(visual.height, `${path}.height`);
  if (visual.alt !== null) requireText(visual.alt, `${path}.alt`);
  requireText(visual.animationSeed, `${path}.animationSeed`);
  if (!Array.isArray(visual.layers) || !visual.layers.length) {
    fail(`${path}.layers must be a non-empty array`);
  }

  const layerIds = new Set();
  visual.layers.forEach((layer, index) => {
    const layerPath = `${path}.layers[${index}]`;
    requireRecord(layer, layerPath);
    requireText(layer.id, `${layerPath}.id`);
    if (layerIds.has(layer.id)) fail(`Duplicate canvas layer id '${layer.id}'`);
    layerIds.add(layer.id);

    if (!Array.isArray(layer.frames) || !layer.frames.length) {
      fail(`${layerPath}.frames must be a non-empty array`);
    }
    layer.frames.forEach((frame, frameIndex) => {
      requireText(frame, `${layerPath}.frames[${frameIndex}]`);
    });
    validatePlayback(layer.playback, layer.frames.length, `${layerPath}.playback`);
  });

  return visual;
}

function cloneLayer(layer) {
  const playback = { ...layer.playback };
  if (playback.intervalMs) playback.intervalMs = { ...playback.intervalMs };
  return {
    id: layer.id,
    frames: [...layer.frames],
    playback,
  };
}

export function createCanvasVisual({
  width,
  height,
  alt = null,
  animationSeed,
  layers,
}) {
  return validateCanvasVisual({
    type: CANVAS_VISUAL_TYPE,
    width,
    height,
    alt,
    animationSeed,
    layers: Array.isArray(layers) ? layers.map(cloneLayer) : layers,
  });
}
