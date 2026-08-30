import assert from "node:assert/strict";
import test from "node:test";
import { createSceneTransition } from "../src/ui/browser/sceneTransition.js";

function setup({ reduced = false } = {}) {
  const animations = [];
  const attributes = new Map();
  const element = {
    inert: false,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    animate(keyframes, options) {
      const completion = Promise.withResolvers();
      const animation = {
        keyframes, options, cancelled: false,
        finished: completion.promise,
        finish: () => completion.resolve(),
        reject: (error) => completion.reject(error),
        cancel() {
          this.cancelled = true;
          completion.reject(new Error("Animation cancelled"));
        },
      };
      animations.push(animation);
      return animation;
    },
  };
  const listeners = [];
  const reducedMotion = {
    matches: reduced,
    addEventListener(type, listener) {
      assert.equal(type, "change");
      listeners.push(listener);
    },
    enable() {
      this.matches = true;
      for (const listener of listeners) listener();
    },
  };
  const transition = createSceneTransition(element, reducedMotion);
  return { transition, element, attributes, animations, reducedMotion };
}

// Flush the promise continuations between the two animation phases.
async function finish(animation) {
  animation.finish();
  await Promise.resolve();
  await Promise.resolve();
}

function assertUnlocked(context) {
  assert.equal(context.transition.running, false);
  assert.equal(context.element.inert, false);
  assert.equal(context.attributes.has("aria-busy"), false);
  assert.ok(context.animations.every((animation) => animation.cancelled));
}

test("fades out, renders exactly once, then fades in and unlocks input", async () => {
  const context = setup();
  const { transition, animations, element, attributes } = context;
  let renders = 0;
  const playing = transition.play(() => { renders += 1; });
  assert.equal(transition.running, true);
  assert.equal(element.inert, true);
  assert.equal(attributes.get("aria-busy"), "true");
  assert.equal(renders, 0);
  assert.deepEqual(animations[0].keyframes, [{ opacity: 1 }, { opacity: 0 }]);
  assert.equal(animations[0].options.duration, 60);
  await finish(animations[0]);
  assert.equal(renders, 1);
  assert.equal(transition.running, true);
  assert.equal(animations[0].cancelled, true);
  assert.deepEqual(animations[1].keyframes, [{ opacity: 0 }, { opacity: 1 }]);
  assert.equal(animations[1].options.duration, 80);
  await finish(animations[1]);
  assert.equal(await playing, true);
  assert.equal(renders, 1);
  assertUnlocked(context);
});

test("reduced motion renders immediately without animations or a lingering lock", async () => {
  const context = setup({ reduced: true });
  let rendered = false;
  const playing = context.transition.play(() => { rendered = true; });
  assert.equal(rendered, true);
  assert.equal(context.animations.length, 0);
  assertUnlocked(context);
  assert.equal(await playing, true);
});

test("repeated transition requests are ignored instead of queued", async () => {
  const context = setup();
  const { transition, animations } = context;
  let renders = 0;
  const playing = transition.play(() => { renders += 1; });
  assert.equal(await transition.play(() => { renders += 100; }), false);
  await finish(animations[0]);
  assert.equal(await transition.play(() => { renders += 100; }), false);
  await finish(animations[1]);
  await playing;
  assert.equal(renders, 1);
  assertUnlocked(context);
});

test("cancelling fade-out never renders the outdated scene", async () => {
  const context = setup();
  let rendered = false;
  const playing = context.transition.play(() => { rendered = true; });
  context.transition.cancel();
  assert.equal(await playing, false);
  assert.equal(rendered, false);
  assertUnlocked(context);
});

test("cancelling fade-in cannot unlock or overwrite a newer transition", async () => {
  const context = setup();
  const { transition, animations } = context;
  const rendered = [];
  const old = transition.play(() => rendered.push("old"));
  await finish(animations[0]);
  transition.cancel();
  const newer = transition.play(() => rendered.push("new"));
  assert.equal(await old, false);
  assert.equal(transition.running, true);
  assert.equal(context.element.inert, true);
  await finish(animations[2]);
  await finish(animations[3]);
  assert.equal(await newer, true);
  assert.deepEqual(rendered, ["old", "new"]);
  assertUnlocked(context);
});

test("render errors restore visibility and release the input lock", async () => {
  const context = setup();
  const error = new Error("Could not build the scene");
  const playing = context.transition.play(() => { throw error; });
  const rejection = assert.rejects(playing, (actual) => actual === error);
  await finish(context.animations[0]);
  await rejection;
  assertUnlocked(context);
});

test("animation failures release the lock instead of leaving the game stuck", async () => {
  const context = setup();
  const error = new Error("Animation failed");
  const playing = context.transition.play(() => assert.fail("Must not render"));
  const rejection = assert.rejects(playing, (actual) => actual === error);
  context.animations[0].reject(error);
  await rejection;
  assertUnlocked(context);
});

test("enabling reduced motion during fade-out finishes immediately and skips fade-in", async () => {
  const context = setup();
  let renders = 0;
  const playing = context.transition.play(() => { renders += 1; });
  context.reducedMotion.enable();
  assert.equal(await playing, true);
  assert.equal(renders, 1);
  assert.equal(context.animations.length, 1);
  assertUnlocked(context);
});

test("enabling reduced motion during fade-in restores the finished scene", async () => {
  const context = setup();
  const playing = context.transition.play(() => {});
  await finish(context.animations[0]);
  context.reducedMotion.enable();
  assert.equal(await playing, true);
  assertUnlocked(context);
});

test("an immediate render during the swap can cancel without starting fade-in", async () => {
  const context = setup();
  const playing = context.transition.play(() => context.transition.cancel());
  await finish(context.animations[0]);
  assert.equal(await playing, false);
  assert.equal(context.animations.length, 1);
  assertUnlocked(context);
});
