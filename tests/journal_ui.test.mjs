import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildJournalWritingView } from "../src/game/journal/view.js";
import { WG_BUNDLE } from "../src/story/wg/generated/scenes.js";
import { renderJournalReadPage } from "../src/ui/browser/journalUI.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.className = "";
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }
}

const document = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
};

test("the read-only diary UI renders a completed entry and page controls", () => {
  const game = new Game({
    seed: 441,
    startDate: new Date("2026-09-04T12:00:00.000Z"),
  });
  game.story.home = { unpack: 5 };
  game.setFlag("cafe_employee");
  game.refreshJournalAvailability();
  const topic = Object.values(WG_BUNDLE.journals).find((definition) =>
    definition.prompt.some((part) => part.type === "text" && part.value === "I actually got a job.")
  );
  game.startJournalEntry(topic.id);
  const view = buildJournalWritingView(game);
  const choice = view.choices.find((candidate) => candidate.label === "dealing with customers");
  game.chooseJournalOption({ ...view.token, choiceId: choice.id });

  const dialog = new FakeElement("dialog");
  const dateElement = new FakeElement("p");
  const contentElement = new FakeElement("div");
  const previousButton = new FakeElement("button");
  const nextButton = new FakeElement("button");
  const resolvedIndex = renderJournalReadPage({
    game,
    pageIndex: 99,
    document,
    dialog,
    dateElement,
    contentElement,
    previousButton,
    nextButton,
    formatDate: (date) => date.toISOString().slice(0, 10),
  });

  assert.equal(resolvedIndex, 0);
  assert.equal(dialog.dataset.mode, "read");
  assert.equal(dateElement.textContent, "2026-09-04");
  assert.equal(contentElement.children.length, 1);
  assert.equal(contentElement.children[0].className, "journal-entry");
  assert.match(
    contentElement.children[0].children.map((child) => child.textContent).join(" "),
    /Customers, definitely/,
  );
  assert.equal(previousButton.disabled, true);
  assert.equal(nextButton.disabled, true);
});
