const FADE_IN_DURATION = 60;
const FADE_OUT_DURATION = 80;

/** A short scene-only fade, with input locking and explicit interruption. */
export function createSceneTransition(element, reducedMotion) {
  let active = null;

  function cancel() {
    if (!active) return;
    const operation = active;
    active = null;
    operation.animation?.cancel();
    element.inert = false;
    element.removeAttribute("aria-busy");
  }

  async function fade(operation, from, to, duration) {
    operation.animation?.cancel();
    operation.animation = element.animate(
      [{ opacity: from }, { opacity: to }],
      { duration, easing: "ease-out", fill: "forwards" },
    );
    try {
      await operation.animation.finished;
    } catch (error) {
      // Explicit cancellation must not revive an outdated scene or report an error.
      if (active === operation) throw error;
    }
  }

  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) active?.animation?.finish();
  });

  return {
    get running() {
      return active !== null;
    },
    cancel,
    async play(updateScene) {
      if (active) return false;
      const operation = { animation: null };
      active = operation;
      element.inert = true;
      element.setAttribute("aria-busy", "true");

      try {
        if (!reducedMotion.matches) await fade(operation, 1, 0, FADE_IN_DURATION);
        if (active !== operation) return false;
        updateScene();
        if (active !== operation) return false;
        if (!reducedMotion.matches) await fade(operation, 0, 1, FADE_OUT_DURATION);
        return active === operation;
      } finally {
        if (active === operation) cancel();
      }
    },
  };
}
