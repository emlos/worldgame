import {
  chatDecisionSession,
  chatFail,
  chatMessageSource,
  availableChatChoices,
} from "./runtime.js";
import {
  iterateSelectedWGNodes,
  iterateSelectedWGParts,
} from "../../story/wg/runtime/decisionRuntime.js";
import { renderWGSnapshottedParts } from "../../story/wg/runtime/textRuntime.js";

export function renderChatMessage(record) {
  const node = chatMessageSource(record);
  const session = chatDecisionSession(null, "replay", record.decisions);
  const paragraphs = record.kind === "outgoing"
    ? [{ parts: node.send }]
    : [...iterateSelectedWGNodes(node.body, session)];
  return paragraphs.map((paragraph) =>
    renderWGSnapshottedParts(
      [...iterateSelectedWGParts(paragraph.parts, session)],
      record.bindings,
      paragraph.source || node.source,
    )
  ).join("\n\n");
}

export function buildChatsView(game) {
  const contacts = game.chats.contacts.map((npcId) => {
    const npc = game.npcs.get(npcId);
    const thread = game.chats.threads[npcId];
    const last = thread.history.at(-1);
    return {
      npcId,
      name: npc.name,
      iconPath: npc.meta?.iconPath || null,
      unread: thread.history.filter((record) =>
        record.kind === "incoming" && record.id > thread.readThrough
      ).length,
      preview: last ? renderChatMessage(last) : "No messages yet",
      sentAt: last?.sentAt || null,
    };
  }).sort((a, b) =>
    (b.sentAt || "").localeCompare(a.sentAt || "") || a.name.localeCompare(b.name)
  );
  return { contacts, unread: contacts.reduce((sum, contact) => sum + contact.unread, 0) };
}

export function buildChatThreadView(game, npcId) {
  const thread = game.chats.threads[npcId];
  if (!thread) chatFail("unknown thread");
  return {
    ...buildChatsView(game).contacts.find((contact) => contact.npcId === npcId),
    messages: thread.history.map((record) => ({
      id: record.id,
      kind: record.kind,
      sentAt: record.sentAt,
      text: renderChatMessage(record),
    })),
    choices: availableChatChoices(game, thread),
    replyToken: thread.active
      ? {
          npcId,
          chatId: thread.active.chatId,
          passageId: thread.active.passageId,
          historyLength: thread.history.length,
        }
      : null,
    waiting: Boolean(thread.active?.wait),
    readThrough: thread.readThrough,
  };
}
