import { LAYERED_IMAGE_VISUAL_TYPE } from "../../game/scene/layeredImage.js";

function createLayeredImageElement(document, visual) {
  const element = document.createElement("figure");
  element.className = "scene-visual scene-visual--layered-image";
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

  for (const layer of visual.layers) {
    const image = document.createElement("img");
    image.className = "scene-visual-layer";
    image.dataset.layerId = layer.id;
    image.src = layer.src;
    image.alt = "";
    image.width = visual.width;
    image.height = visual.height;
    image.draggable = false;
    element.append(image);
  }

  return element;
}

export function createSceneVisualElement(document, visual) {
  if (visual === null) return null;
  if (visual.type === LAYERED_IMAGE_VISUAL_TYPE) {
    return createLayeredImageElement(document, visual);
  }
  throw new TypeError(`Unknown scene visual type '${String(visual.type)}'`);
}
