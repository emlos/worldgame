import test from "node:test";
import assert from "node:assert/strict";

import { renderSceneContent } from "../src/ui/browser/sceneContent.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.className = "";
    this.scope = "";
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }
}

const document = {
  createElement(tagName) {
    return new FakeElement(tagName, document);
  },
};

test("scene content renders accessible table headings and rows", () => {
  const root = new FakeElement("div", document);
  renderSceneContent(root, [{
    type: "table",
    caption: "Weekly classes",
    columns: ["Day", "Lesson 1"],
    rows: [
      ["Monday", ""],
      ["Tuesday", "English · 09:00-09:45"],
    ],
  }]);

  const wrapper = root.children[0];
  const table = wrapper.children[0];
  assert.equal(wrapper.className, "scene-table-scroll");
  assert.equal(table.className, "scene-table");
  assert.equal(table.children[0].textContent, "Weekly classes");
  assert.equal(table.children[1].children[0].children[0].scope, "col");
  assert.equal(table.children[2].children[0].children[0].scope, "row");
  assert.equal(table.children[2].children[0].children[1].textContent, "");
  assert.equal(
    table.children[2].children[1].children[1].textContent,
    "English · 09:00-09:45",
  );
});
