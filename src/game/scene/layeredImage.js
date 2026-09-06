export const LAYERED_IMAGE_VISUAL_TYPE = "layered-image";

function fail(message) {
  throw new TypeError(message);
}

function requirePositiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${path} must be a positive integer`);
  }
}

function requireText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${path} must be a non-empty string`);
  }
}

export function validateLayeredImageVisual(visual, path = "scene.visual") {
  if (!visual || typeof visual !== "object" || Array.isArray(visual)) {
    fail(`${path} must be an object`);
  }
  if (visual.type !== LAYERED_IMAGE_VISUAL_TYPE) {
    fail(`${path}.type must be '${LAYERED_IMAGE_VISUAL_TYPE}'`);
  }

  requirePositiveInteger(visual.width, `${path}.width`);
  requirePositiveInteger(visual.height, `${path}.height`);
  if (visual.alt !== null) requireText(visual.alt, `${path}.alt`);
  if (!Array.isArray(visual.layers) || !visual.layers.length) {
    fail(`${path}.layers must be a non-empty array`);
  }

  const layerIds = new Set();
  visual.layers.forEach((layer, index) => {
    const layerPath = `${path}.layers[${index}]`;
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      fail(`${layerPath} must be an object`);
    }
    requireText(layer.id, `${layerPath}.id`);
    requireText(layer.src, `${layerPath}.src`);
    if (layerIds.has(layer.id)) {
      fail(`Duplicate layered-image layer id '${layer.id}'`);
    }
    layerIds.add(layer.id);
  });

  return visual;
}

export function createLayeredImageVisual({ width, height, alt = null, layers }) {
  return validateLayeredImageVisual({
    type: LAYERED_IMAGE_VISUAL_TYPE,
    width,
    height,
    alt,
    layers: Array.isArray(layers)
      ? layers.map((layer) => ({ id: layer.id, src: layer.src }))
      : layers,
  });
}
