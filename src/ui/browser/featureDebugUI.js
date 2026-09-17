function appendDebugFields(document, sectionElement, fields = []) {
  if (!fields.length) return;
  const list = document.createElement("dl");
  list.className = "debug-state";
  for (const field of fields) {
    const term = document.createElement("dt");
    term.textContent = String(field.label ?? "");
    const value = document.createElement("dd");
    value.textContent = String(field.value ?? "");
    list.append(term, value);
  }
  sectionElement.append(list);
}

function appendDebugDetails(document, sectionElement, details = []) {
  for (const item of details) {
    const detailsElement = document.createElement("details");
    detailsElement.className = "debug-details";
    detailsElement.open = Boolean(item.open);

    const summary = document.createElement("summary");
    summary.textContent = String(item.summary ?? "Details");
    const content = document.createElement("pre");
    content.className = "debug-code";
    content.textContent = String(item.text ?? "");
    detailsElement.append(summary, content);
    sectionElement.append(detailsElement);
  }
}

export function renderFeatureDebugActions(document, container, catalog, onAction) {
  const buttons = catalog.listDebugActions().map(({ id, label }) => {
    const button = document.createElement("button");
    button.className = "debug-button";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => onAction(id));
    return button;
  });
  container.replaceChildren(...buttons);
  container.hidden = buttons.length === 0;
}

export function renderFeatureDebugSections(document, container, sections) {
  const elements = sections.map((section) => {
    const element = document.createElement("section");
    element.className = "debug-section";
    if (section.id) element.dataset.debugSection = String(section.id);

    const heading = document.createElement("h3");
    heading.textContent = String(section.title ?? "Feature");
    element.append(heading);
    appendDebugFields(document, element, section.fields);
    appendDebugDetails(document, element, section.details);
    return element;
  });
  container.replaceChildren(...elements);
  container.hidden = elements.length === 0;
}
