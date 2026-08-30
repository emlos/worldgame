import { outcomeForChange, setOutcomeText } from "./outcomes.js";

function changeElement(document, change) {
  const item = document.createElement("span");
  item.className = "scene-change";
  item.dataset.outcome = outcomeForChange(change);
  item.textContent = change.label;
  return item;
}

/** Append scene prose and feedback using only text nodes and known elements. */
export function renderSceneContent(element, content) {
  const document = element.ownerDocument;
  for (const block of content) {
    if (block.type === "paragraph") {
      const paragraph = document.createElement("p");
      if (!block.parts) {
        setOutcomeText(paragraph, block.text);
      } else {
        let text = "";
        const flushText = () => {
          if (!text) return;
          const fragment = document.createElement("span");
          setOutcomeText(fragment, text);
          paragraph.append(...fragment.childNodes);
          text = "";
        };
        for (const part of block.parts) {
          if (part.type === "text") text += part.text;
          else if (part.type === "break") text += "\n";
          else if (part.type === "change") {
            flushText();
            const feedback = document.createElement("span");
            feedback.className = "scene-inline-change";
            const separator = document.createElement("span");
            separator.className = "scene-change-separator";
            separator.textContent = " | ";
            separator.setAttribute("aria-hidden", "true");
            feedback.append(separator, changeElement(document, part.change));
            paragraph.append(feedback);
          }
        }
        flushText();
      }
      element.append(paragraph);
    } else if (block.type === "changes") {
      const changes = document.createElement("div");
      changes.className = "scene-changes";
      changes.append(...block.items.map((change) => changeElement(document, change)));
      element.append(changes);
    }
  }
}

/** A null heading hides the title while preserving a separate choice section. */
export function createChoiceSection(document, section, makeButton) {
  const element = document.createElement("section");
  element.className = section.heading === null
    ? "choice-section choice-section--headingless"
    : "choice-section";
  if (section.heading !== null) {
    const heading = document.createElement("h2");
    heading.textContent = section.heading;
    element.append(heading);
  }
  const list = document.createElement("div");
  list.className = "choices";
  list.append(...section.choices.map(makeButton));
  element.append(list);
  return element;
}
