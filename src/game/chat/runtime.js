import { WG_BUNDLE } from "../../story/wg/generated/scenes.js";
import { collectWGNodes, findWGNode } from "../../story/wg/shared/tree.js";
import { applyWGEffects } from "../../story/wg/runtime/effectRuntime.js";
import { createWGRuntimeContext } from "../../story/wg/runtime/runtimeContext.js";
import { evaluateWGExpression } from "../../story/wg/runtime/expressionEvaluator.js";
import {
  createWGDecisionSession,
  iterateSelectedWGNodes,
  iterateSelectedWGParts,
} from "../../story/wg/runtime/decisionRuntime.js";
import {
  captureWGTextBindings,
  renderWGText,
} from "../../story/wg/runtime/textRuntime.js";

export const chatFail = (message) => { throw new Error(`Chats: ${message}`); };
export const chatDefinition = (id) => WG_BUNDLE.chats[id] || chatFail(`unknown conversation '${id}'`);
export const chatPassage = (chat, id) => chat.passages.find((passage) => passage.id === id) || chatFail(`unknown passage '${id}'`);

export function createChatState() { return { contacts: [], threads: {} }; }

export function addContact(game, npcId) {
  if (!game.npcs.has(npcId)) chatFail(`unknown contact '${npcId}'`);
  if (game.chats.contacts.includes(npcId)) return;
  game.chats.contacts.push(npcId);
  game.chats.threads[npcId] = { history: [], readThrough: 0, active: null, completed: [], queue: [] };
}

export function chatDecisionSession(game, mode, decisions, instanceKey = "") {
  return createWGDecisionSession({
    mode,
    decisions,
    seed: game?.seed ?? 0,
    instanceKey,
    getContext: game ? () => createWGRuntimeContext(game) : null,
    randomNamespace: "chat",
  });
}

function appendMessage(game, thread, node, outgoing = false) {
  const active = thread.active;
  const decisions = {};
  const key = `${active.chatId}:${active.passageId}:${thread.history.length + 1}`;
  const session = chatDecisionSession(game, "record", decisions, key);
  const paragraphs = outgoing
    ? [{ parts: node.send }]
    : [...iterateSelectedWGNodes(node.body, session)];
  const parts = paragraphs.flatMap((paragraph) =>
    [...iterateSelectedWGParts(paragraph.parts, session)]
  );
  thread.history.push({
    id: thread.history.length + 1,
    chatId: active.chatId,
    passageId: active.passageId,
    kind: outgoing ? "outgoing" : "incoming",
    nodeId: node.id,
    sentAt: game.now.toISOString(),
    decisions,
    bindings: captureWGTextBindings(parts, createWGRuntimeContext(game), node.source),
  });
}

function enterPassage(game, thread, passageId) {
  const active = thread.active;
  const chat = chatDefinition(active.chatId);
  active.passageId = passageId;
  active.choices = [];
  active.wait = null;
  const key = `${chat.id}:${passageId}:${thread.history.length + 1}`;
  const session = chatDecisionSession(game, "record", {}, key);
  function visit(nodes) {
    for (const node of iterateSelectedWGNodes(nodes, session)) {
      if (node.type === "message") appendMessage(game, thread, node);
      else if (node.type === "effect") applyWGEffects(game, [node.effect]);
      else if (node.type === "choice") active.choices.push(node.id);
      else if (node.type === "wait") {
        active.wait = { target: node.target.slice(1), dueAt: new Date(game.now.getTime() + Math.round(node.minutes * 60000)).toISOString() };
      } else if (node.type === "finish") {
        thread.completed.push(chat.id);
        thread.active = null;
      } else chatFail(`unsupported node '${node.type}'`);
    }
  }
  visit(chatPassage(chat, passageId).body);
  if (thread.active && !active.wait && !active.choices.length) chatFail("conversation reached a passage without a reply or continuation");
  if (!thread.active && thread.queue.length) activateChat(game, thread, thread.queue.shift());
}

function activateChat(game, thread, chatId) {
  thread.active = { chatId, passageId: chatDefinition(chatId).passages[0].id, choices: [], wait: null };
  enterPassage(game, thread, thread.active.passageId);
}

/** One-time exchanges. Repeated story hooks never reset a chat or its timer. */
export function startChat(game, chatId) {
  const chat = chatDefinition(chatId);
  const thread = game.chats.threads[chat.npcId];
  if (!thread) chatFail(`add '${chat.npcId}' as a contact before starting a conversation`);
  if (thread.completed.includes(chatId) || thread.active?.chatId === chatId || thread.queue.includes(chatId)) return;
  if (thread.active) thread.queue.push(chatId);
  else activateChat(game, thread, chatId);
}

export function nextChatDeadline(game) {
  return Math.min(Infinity, ...Object.values(game.chats.threads).flatMap((thread) => thread.active?.wait ? [Date.parse(thread.active.wait.dueAt)] : []));
}

/** Called by simulation at each deadline, never by a render or real-time timer. */
export function deliverDueChats(game) {
  const due = Object.entries(game.chats.threads).filter(([, thread]) => thread.active?.wait && Date.parse(thread.active.wait.dueAt) <= game.now.getTime())
    .sort(([a, left], [b, right]) => Date.parse(left.active.wait.dueAt) - Date.parse(right.active.wait.dueAt) || a.localeCompare(b));
  for (const [, thread] of due) enterPassage(game, thread, thread.active.wait.target);
}

function sendBlockReason(game) {
  if (game.currentStory && WG_BUNDLE.scenes[game.currentStory.id]?.kind !== "place") {
    return "Finish the current scene before replying.";
  }
  return null;
}

export function availableChatChoices(game, thread) {
  if (!thread.active || thread.active.wait) return [];
  const context = createWGRuntimeContext(game);
  const nodes = collectWGNodes(
    chatPassage(chatDefinition(thread.active.chatId), thread.active.passageId).body,
  );
  return thread.active.choices.map((id) => nodes.find((node) => node.type === "choice" && node.id === id))
    .filter((choice) => !choice.when || evaluateWGExpression(choice.when, context))
    .map((choice) => ({
      id: choice.id,
      label: renderWGText(choice.label, context, choice.source),
      disabledReason: sendBlockReason(game) || (choice.requirements || []).find((requirement) => !evaluateWGExpression(requirement.test, context))?.reason || null,
    }));
}

/** Revision identifies the exact displayed reply set, rejecting stale/double sends. */
export function sendChatReply(game, { npcId, chatId, passageId, historyLength, choiceId }) {
  const thread = game.chats.threads[npcId];
  if (!thread?.active || thread.active.chatId !== chatId || thread.active.passageId !== passageId || thread.history.length !== historyLength) chatFail("this reply is no longer available");
  const offered = availableChatChoices(game, thread).find((choice) => choice.id === choiceId);
  if (!offered || offered.disabledReason) chatFail(offered?.disabledReason || "this reply is not available");
  const choice = findWGNode(
    chatPassage(chatDefinition(chatId), passageId).body,
    (node) => node.type === "choice" && node.id === choiceId,
  );
  game.runAction({
    label: `chat:${chatId}:${choiceId}`,
    apply() {
      appendMessage(game, thread, choice, true);
      applyWGEffects(game, choice.effects || []);
      enterPassage(game, thread, choice.target.slice(1));
    },
  });
}

export function chatMessageSource(record) {
  return findWGNode(
    chatPassage(chatDefinition(record.chatId), record.passageId).body,
    (node) => node.id === record.nodeId &&
      node.type === (record.kind === "incoming" ? "message" : "choice"),
  ) || chatFail("unknown saved message");
}

export function markChatRead(game, npcId, through) {
  const thread = game.chats.threads[npcId];
  if (!thread || !Number.isInteger(through) || through < 0 || through > thread.history.length) chatFail("invalid read position");
  thread.readThrough = Math.max(thread.readThrough, through);
}
