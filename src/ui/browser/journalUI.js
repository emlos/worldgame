import { buildJournalReadView } from "../../game/journal/view.js";

export function makeJournalEntryElement(document, entry) {
  const article = document.createElement("article");
  article.className = "journal-entry";
  for (const text of entry.paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    article.append(paragraph);
  }
  return article;
}

export function renderJournalReadPage({
  game,
  pageIndex,
  document,
  dialog,
  dateElement,
  contentElement,
  previousButton,
  nextButton,
  formatDate,
}) {
  const view = buildJournalReadView(game);
  dialog.dataset.mode = "read";
  previousButton.hidden = false;
  nextButton.hidden = false;

  if (!view.pages.length) {
    const empty = document.createElement("p");
    empty.className = "journal-empty-page";
    empty.textContent = "The pages are still blank.";
    dateElement.textContent = "Nothing written yet";
    contentElement.replaceChildren(empty);
    previousButton.disabled = true;
    nextButton.disabled = true;
    return 0;
  }

  const resolvedIndex = Math.max(0, Math.min(pageIndex, view.pages.length - 1));
  const page = view.pages[resolvedIndex];
  dateElement.textContent = formatDate(new Date(`${page.date}T12:00:00.000Z`));
  contentElement.replaceChildren(
    ...page.entries.map((entry) => makeJournalEntryElement(document, entry)),
  );
  previousButton.disabled = resolvedIndex <= 0;
  nextButton.disabled = resolvedIndex >= view.pages.length - 1;
  return resolvedIndex;
}
