import { sendChatReply, markChatRead } from "../../classes/game/chat/runtime.js";
import { buildChatsView, buildChatThreadView } from "../../classes/game/chat/view.js";
import { setOutcomeText } from "./outcomes.js";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const typingDuration = (text) => Math.max(1500, Math.min(6000, 800 + [...text].length * 35));

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function avatar(contact) {
  const node = element("span", "chat-avatar", contact.name.charAt(0));
  if (contact.iconPath) {
    const image = document.createElement("img");
    image.src = contact.iconPath;
    image.alt = "";
    image.addEventListener("error", () => image.remove(), { once: true });
    node.append(image);
  }
  return node;
}

/** Real-time callbacks only reveal already committed messages; they never run story effects. */
export function createPhoneChats({ getGame, openScreen, onChange }) {
  const dialog = document.querySelector("#player-phone-dialog");
  const listScreen = document.querySelector("#phone-chats-screen");
  const threadScreen = document.querySelector("#phone-chat-thread-screen");
  const list = document.querySelector("#phone-chats-list");
  const appBadge = document.querySelector("#phone-chats-badge");
  const appButton = document.querySelector("#phone-chats-btn");
  const header = document.querySelector("#phone-chat-contact");
  const history = document.querySelector("#phone-chat-history");
  const responses = document.querySelector("#phone-chat-responses");
  const status = document.querySelector("#phone-chat-status");
  const animations = document.querySelector("#phone-chat-animations");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeNpc = null;
  let timer = null;
  let revealThrough = Infinity;
  let pending = [];
  let error = "";

  function badges() {
    const count = buildChatsView(getGame()).unread;
    appBadge.hidden = count === 0;
    appBadge.textContent = count > 99 ? "99+" : String(count);
    appBadge.setAttribute("aria-label", `${count} unread messages`);
    appButton.title = count ? `Chats — ${count} unread messages (C)` : "Chats (C)";
  }

  function acknowledge() {
    if (!activeNpc || !dialog.open || threadScreen.hidden || document.visibilityState !== "visible") return;
    if (history.scrollHeight - history.scrollTop - history.clientHeight > 32) return;
    const view = buildChatThreadView(getGame(), activeNpc);
    markChatRead(getGame(), activeNpc, Math.min(view.messages.length, revealThrough));
    badges();
  }

  function renderList() {
    const view = buildChatsView(getGame());
    list.replaceChildren();
    if (!view.contacts.length) {
      list.append(element("li", "chat-empty", "No contacts yet. Add someone's number to start a conversation."));
      return;
    }
    for (const contact of view.contacts) {
      const item = element("li");
      const button = element("button", "chat-contact-row");
      button.type = "button";
      const details = element("span", "chat-contact-details");
      details.append(element("strong", "", contact.name), element("span", "chat-preview", contact.preview));
      const trailing = element("span", "chat-contact-trailing");
      if (contact.sentAt) trailing.append(element("time", "", timeFormat.format(new Date(contact.sentAt))));
      if (contact.unread) {
        const badge = element("span", "chat-unread", contact.unread > 99 ? "99+" : String(contact.unread));
        badge.setAttribute("aria-label", `${contact.unread} unread messages`);
        trailing.append(badge);
      }
      button.append(avatar(contact), details, trailing);
      button.addEventListener("click", () => openThread(contact.npcId));
      item.append(button);
      list.append(item);
    }
  }

  function renderThread({ scrollToEnd = false } = {}) {
    if (!activeNpc) return;
    const view = buildChatThreadView(getGame(), activeNpc);
    const follow = scrollToEnd || history.scrollHeight - history.scrollTop - history.clientHeight < 40;
    const previousTop = history.scrollTop;
    header.replaceChildren(avatar(view), element("strong", "", view.name));
    history.replaceChildren();
    let previousAt = null;
    for (const message of view.messages.filter((message) => message.id <= revealThrough)) {
      const at = new Date(message.sentAt);
      if (!previousAt || at - previousAt >= 5 * 60000 || at.toISOString().slice(0, 10) !== previousAt.toISOString().slice(0, 10)) {
        const stamp = element("p", "chat-time", `${dateFormat.format(at)} · ${timeFormat.format(at)}`);
        history.append(stamp);
      }
      const bubble = element("div", `chat-bubble chat-bubble--${message.kind}`, message.text);
      bubble.setAttribute("aria-label", `${message.kind === "outgoing" ? "You" : view.name}, ${timeFormat.format(at)}: ${message.text}`);
      history.append(bubble);
      previousAt = at;
    }
    if (!view.messages.length) history.append(element("p", "chat-empty", "Choose a reply below to start the conversation."));
    if (pending.length) {
      const typing = element("div", "chat-bubble chat-bubble--incoming chat-typing");
      typing.setAttribute("role", "status");
      typing.setAttribute("aria-label", `${view.name} is typing`);
      for (let index = 0; index < 3; index++) {
        const dot = element("span");
        dot.setAttribute("aria-hidden", "true");
        typing.append(dot);
      }
      history.append(typing);
    }
    responses.replaceChildren();
    if (!pending.length) {
      for (const choice of view.choices) {
        const button = element("button", "chat-response");
        setOutcomeText(button, choice.label);
        button.type = "button";
        button.disabled = Boolean(choice.disabledReason);
        if (choice.disabledReason) button.title = choice.disabledReason;
        button.addEventListener("click", () => send(view.replyToken, choice.id));
        responses.append(button);
      }
    }
    status.textContent = error || (pending.length ? "" : view.choices.find((choice) => choice.disabledReason)?.disabledReason || (view.waiting ? "Waiting for a reply. You can put your phone away." : view.choices.length ? "" : "No new topics right now."));
    history.scrollTop = follow ? history.scrollHeight : previousTop;
    acknowledge();
  }

  function animateNext() {
    if (!pending.length) return;
    if (reducedMotion.matches || !animations.checked) {
      pending = [];
      revealThrough = Infinity;
      renderThread();
      return;
    }
    const currentGame = getGame();
    const npcId = activeNpc;
    const message = pending[0];
    timer = window.setTimeout(() => {
      timer = null;
      if (getGame() !== currentGame || activeNpc !== npcId || !dialog.open || threadScreen.hidden) return;
      revealThrough = message.id;
      pending.shift();
      if (!pending.length) revealThrough = Infinity;
      renderThread();
      animateNext();
    }, typingDuration(message.text));
  }

  function send(token, choiceId) {
    if (pending.length) return;
    try {
      sendChatReply(getGame(), { ...token, choiceId });
      error = "";
      const view = buildChatThreadView(getGame(), activeNpc);
      revealThrough = token.historyLength + 1; // The outgoing message is immediate.
      pending = view.messages.filter((message) => message.id > revealThrough);
      onChange();
      renderThread({ scrollToEnd: true });
      animateNext();
    } catch (failure) {
      error = failure.message;
      renderThread();
    }
  }

  function leaveThread() {
    window.clearTimeout(timer);
    timer = null;
    pending = [];
    revealThrough = Infinity;
    activeNpc = null;
    error = "";
  }

  function openList() {
    leaveThread();
    openScreen(listScreen, "Chats");
    document.querySelector("#phone-back").setAttribute("aria-label", "Back to phone menu");
    renderList();
    badges();
    listScreen.focus();
  }

  function openThread(npcId) {
    leaveThread();
    activeNpc = npcId;
    openScreen(threadScreen, "Chats");
    document.querySelector("#phone-back").setAttribute("aria-label", "Back to chats");
    renderThread({ scrollToEnd: true });
    threadScreen.focus();
  }

  function refresh() {
    badges();
    if (!listScreen.hidden) renderList();
    if (!threadScreen.hidden && activeNpc) renderThread();
  }

  history.addEventListener("scroll", acknowledge);
  document.addEventListener("visibilitychange", acknowledge);
  dialog.addEventListener("close", leaveThread);
  animations.addEventListener("change", () => {
    if (!animations.checked && pending.length) {
      window.clearTimeout(timer);
      timer = null;
      pending = [];
      revealThrough = Infinity;
      renderThread();
    }
  });
  return { openList, refresh, leaveThread, back() { if (!threadScreen.hidden) { openList(); return true; } return false; } };
}
