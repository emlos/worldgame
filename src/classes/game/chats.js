import { WG_BUNDLE } from "../../generated/wg/scenes.js";
import { keyedRandom01 } from "../../shared/util/random.js";
import { applyWGEffects } from "./scene/wg/effectRuntime.js";
import { createWGRuntimeContext } from "./scene/wg/runtimeContext.js";
import { evaluateWGExpression, resolveWGPath } from "./scene/wg/expressionEvaluator.js";
import { renderWGText } from "./scene/wg/textRuntime.js";

const own = (object, key) => Object.hasOwn(object, key);
const fail = (message) => { throw new Error(`Chats: ${message}`); };
const definition = (id) => WG_BUNDLE.chats[id] || fail(`unknown conversation '${id}'`);
const passageFor = (chat, id) => chat.passages.find((passage) => passage.id === id) || fail(`unknown passage '${id}'`);

export function createChatState() { return { contacts: [], threads: {} }; }

export function addContact(game, npcId) {
  if (!game.npcs.has(npcId)) fail(`unknown contact '${npcId}'`);
  if (game.chats.contacts.includes(npcId)) return;
  game.chats.contacts.push(npcId);
  game.chats.threads[npcId] = { history: [], readThrough: 0, active: null, completed: [], queue: [] };
}

function allNodes(nodes) {
  return nodes.flatMap((node) => [node, ...allNodes(
    node.type === "if" ? [...node.branches.flatMap((branch) => branch.nodes), ...(node.elseNodes || [])]
      : node.type === "random" ? node.variants.flat()
      : node.type === "message" ? node.body : [],
  )]);
}

function chooseBranch(game, node, key, decisions) {
  const id = `${node.type}:${node.runtimeId}`;
  const index = node.type === "if"
    ? node.branches.findIndex((branch) => Boolean(evaluateWGExpression(branch.test, createWGRuntimeContext(game))))
    : Math.floor(keyedRandom01(game.seed, `chat:${key}:${id}`) * node.variants.length);
  decisions[id] = index;
  return node.type === "if" ? (index < 0 ? node.elseNodes || [] : node.branches[index].nodes) : node.variants[index];
}

function selectedNodes(nodes, decisions) {
  return nodes.flatMap((node) => {
    if (node.type !== "if" && node.type !== "random") return [node];
    const index = decisions[`${node.type}:${node.runtimeId}`];
    if (!Number.isInteger(index)) fail("missing saved message branch");
    const selected = node.type === "if"
      ? index === -1 ? node.elseNodes || [] : node.branches[index]?.nodes
      : node.variants[index];
    if (!selected) fail("invalid saved message branch");
    return selectedNodes(selected, decisions);
  });
}

function inlineDecisionId(part) {
  return `inline-if:${part.runtimeId}`;
}

function chooseInlineBranch(game, part, decisions) {
  const index = part.branches.findIndex((branch) =>
    Boolean(evaluateWGExpression(branch.test, createWGRuntimeContext(game)))
  );
  decisions[inlineDecisionId(part)] = index;
  return index < 0 ? part.elseParts || [] : part.branches[index].parts;
}

function selectedInlineParts(parts, decisions) {
  return parts.flatMap((part) => {
    if (part.type !== "inline-if") return [part];
    const index = decisions[inlineDecisionId(part)];
    if (!Number.isInteger(index)) fail("missing saved inline message branch");
    const selected = index < 0
      ? part.elseParts || []
      : part.branches[index]?.parts;
    if (!selected) fail("invalid saved inline message branch");
    return selectedInlineParts(selected, decisions);
  });
}

function resolveMessageParts(game, parts, decisions) {
  for (const part of parts) {
    if (part.type !== "inline-if") continue;
    resolveMessageParts(game, chooseInlineBranch(game, part, decisions), decisions);
  }
}

function resolveMessage(game, nodes, key, decisions) {
  for (const node of nodes) {
    if (node.type === "if" || node.type === "random") {
      resolveMessage(game, chooseBranch(game, node, key, decisions), key, decisions);
    } else if (node.type === "paragraph") {
      resolveMessageParts(game, node.parts, decisions);
    }
  }
}

function captureBindings(game, parts) {
  const context = createWGRuntimeContext(game);
  const bindings = {};
  for (const part of parts) {
    if (part.type !== "interpolation") continue;
    const value = resolveWGPath(context, part.path);
    if (!["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) {
      fail(`invalid message value '${part.path.join(".")}'`);
    }
    bindings[part.path.join(".")] = value;
  }
  return bindings;
}

function appendMessage(game, thread, node, outgoing = false) {
  const active = thread.active;
  const decisions = {};
  const key = `${active.chatId}:${active.passageId}:${thread.history.length + 1}`;
  if (!outgoing) resolveMessage(game, node.body, key, decisions);
  const parts = outgoing
    ? node.send
    : selectedNodes(node.body, decisions).flatMap((paragraph) =>
        selectedInlineParts(paragraph.parts, decisions)
      );
  thread.history.push({
    id: thread.history.length + 1,
    chatId: active.chatId,
    passageId: active.passageId,
    kind: outgoing ? "outgoing" : "incoming",
    nodeId: node.id,
    sentAt: game.now.toISOString(),
    decisions,
    bindings: captureBindings(game, parts),
  });
}

function enterPassage(game, thread, passageId) {
  const active = thread.active;
  const chat = definition(active.chatId);
  active.passageId = passageId;
  active.choices = [];
  active.wait = null;
  const key = `${chat.id}:${passageId}:${thread.history.length + 1}`;
  function visit(nodes) {
    for (const node of nodes) {
      if (node.type === "if" || node.type === "random") {
        visit(chooseBranch(game, node, key, {}));
      } else if (node.type === "message") appendMessage(game, thread, node);
      else if (node.type === "effect") applyWGEffects(game, [node.effect]);
      else if (node.type === "choice") active.choices.push(node.id);
      else if (node.type === "wait") {
        active.wait = { target: node.target.slice(1), dueAt: new Date(game.now.getTime() + Math.round(node.minutes * 60000)).toISOString() };
      } else if (node.type === "finish") {
        thread.completed.push(chat.id);
        thread.active = null;
      } else fail(`unsupported node '${node.type}'`);
    }
  }
  visit(passageFor(chat, passageId).body);
  if (thread.active && !active.wait && !active.choices.length) fail("conversation reached a passage without a reply or continuation");
  if (!thread.active && thread.queue.length) activateChat(game, thread, thread.queue.shift());
}

function activateChat(game, thread, chatId) {
  thread.active = { chatId, passageId: definition(chatId).passages[0].id, choices: [], wait: null };
  enterPassage(game, thread, thread.active.passageId);
}

/** One-time exchanges. Repeated story hooks never reset a chat or its timer. */
export function startChat(game, chatId) {
  const chat = definition(chatId);
  const thread = game.chats.threads[chat.npcId];
  if (!thread) fail(`add '${chat.npcId}' as a contact before starting a conversation`);
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
  if (game.currentStory && (game.currentStory.type === "sequence" || WG_BUNDLE.scenes[game.currentStory.id]?.kind !== "place")) {
    return "Finish the current scene before replying.";
  }
  return null;
}

function availableChoices(game, thread) {
  if (!thread.active || thread.active.wait) return [];
  const context = createWGRuntimeContext(game);
  const nodes = allNodes(passageFor(definition(thread.active.chatId), thread.active.passageId).body);
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
  if (!thread?.active || thread.active.chatId !== chatId || thread.active.passageId !== passageId || thread.history.length !== historyLength) fail("this reply is no longer available");
  const offered = availableChoices(game, thread).find((choice) => choice.id === choiceId);
  if (!offered || offered.disabledReason) fail(offered?.disabledReason || "this reply is not available");
  const choice = allNodes(passageFor(definition(chatId), passageId).body).find((node) => node.type === "choice" && node.id === choiceId);
  game.runAction({
    label: `chat:${chatId}:${choiceId}`,
    apply() {
      appendMessage(game, thread, choice, true);
      applyWGEffects(game, choice.effects || []);
      enterPassage(game, thread, choice.target.slice(1));
    },
  });
}

function messageSource(record) {
  const nodes = allNodes(passageFor(definition(record.chatId), record.passageId).body);
  return nodes.find((node) => node.id === record.nodeId && node.type === (record.kind === "incoming" ? "message" : "choice")) || fail("unknown saved message");
}

function renderParts(parts, bindings, decisions) {
  return selectedInlineParts(parts, decisions).map((part) => {
    if (part.type === "break") return "\n";
    if (part.type === "text") return part.value;
    let value = String(bindings[part.path.join(".")]);
    for (const filter of part.filters || []) if (filter === "cap") value = value.charAt(0).toUpperCase() + value.slice(1);
    return value;
  }).join("");
}

export function renderChatMessage(record) {
  const node = messageSource(record);
  const paragraphs = record.kind === "outgoing" ? [{ parts: node.send }] : selectedNodes(node.body, record.decisions);
  return paragraphs.map((paragraph) =>
    renderParts(paragraph.parts, record.bindings, record.decisions)
  ).join("\n\n");
}

export function markChatRead(game, npcId, through) {
  const thread = game.chats.threads[npcId];
  if (!thread || !Number.isInteger(through) || through < 0 || through > thread.history.length) fail("invalid read position");
  thread.readThrough = Math.max(thread.readThrough, through);
}

export function buildChatsView(game) {
  const contacts = game.chats.contacts.map((npcId) => {
    const npc = game.npcs.get(npcId);
    const thread = game.chats.threads[npcId];
    const last = thread.history.at(-1);
    return { npcId, name: npc.name, iconPath: npc.meta?.iconPath || null,
      unread: thread.history.filter((record) => record.kind === "incoming" && record.id > thread.readThrough).length,
      preview: last ? renderChatMessage(last) : "No messages yet", sentAt: last?.sentAt || null };
  }).sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || "") || a.name.localeCompare(b.name));
  return { contacts, unread: contacts.reduce((sum, contact) => sum + contact.unread, 0) };
}

export function buildChatThreadView(game, npcId) {
  const thread = game.chats.threads[npcId];
  if (!thread) fail("unknown thread");
  return { ...buildChatsView(game).contacts.find((contact) => contact.npcId === npcId),
    messages: thread.history.map((record) => ({ id: record.id, kind: record.kind, sentAt: record.sentAt, text: renderChatMessage(record) })),
    choices: availableChoices(game, thread),
    replyToken: thread.active ? { npcId, chatId: thread.active.chatId, passageId: thread.active.passageId, historyLength: thread.history.length } : null,
    waiting: Boolean(thread.active?.wait), readThrough: thread.readThrough,
  };
}

// Strict references and shapes: saves carry identifiers and captured scalars, never prose or executable nodes.
export function validateChatState(state, npcIds) {
  const object = (value, keys) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !own(value, key))) fail("invalid saved chat fields");
  };
  const strings = (value) => {
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string") || new Set(value).size !== value.length) fail("invalid saved chat ids");
  };
  const integer = (value, max) => { if (!Number.isSafeInteger(value) || value < 0 || value > max) fail("invalid saved chat position"); };
  const date = (value) => { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("invalid saved message date"); };
  object(state, ["contacts", "threads"]);
  strings(state.contacts);
  object(state.threads, state.contacts);
  for (const npcId of state.contacts) {
    if (!npcIds.has(npcId)) fail("saved contact references an unknown NPC");
    const thread = state.threads[npcId];
    object(thread, ["history", "readThrough", "active", "completed", "queue"]);
    if (!Array.isArray(thread.history)) fail("invalid saved history");
    integer(thread.readThrough, thread.history.length);
    strings(thread.completed); strings(thread.queue);
    const ids = [...thread.completed, ...thread.queue, ...(thread.active ? [thread.active.chatId] : [])];
    strings(ids);
    for (const id of ids) if (definition(id).npcId !== npcId) fail("conversation belongs to another contact");
    if (thread.active) {
      const active = thread.active;
      object(active, ["chatId", "passageId", "choices", "wait"]);
      const passage = passageFor(definition(active.chatId), active.passageId);
      const choices = allNodes(passage.body).filter((node) => node.type === "choice");
      strings(active.choices);
      if (active.choices.some((id) => !choices.some((choice) => choice.id === id))) fail("unknown active chat choice");
      if (active.wait) {
        object(active.wait, ["target", "dueAt"]); date(active.wait.dueAt);
        const wait = passage.body.at(-1);
        if (wait?.type !== "wait" || wait.target !== `.${active.wait.target}` || active.choices.length) fail("invalid pending chat continuation");
      } else if (!active.choices.length || ["wait", "finish"].includes(passage.body.at(-1)?.type)) fail("invalid active reply passage");
    } else if (thread.queue.length) fail("queued chats need an active exchange");
    thread.history.forEach((record, index) => {
      object(record, ["id", "chatId", "passageId", "kind", "nodeId", "sentAt", "decisions", "bindings"]);
      if (record.id !== index + 1 || !["incoming", "outgoing"].includes(record.kind) || !ids.includes(record.chatId)) fail("invalid saved message identity");
      date(record.sentAt);
      const node = messageSource(record);
      const usedDecisions = [];
      function inspect(nodes) {
        for (const part of nodes) {
          if (["if", "random"].includes(part.type)) {
            const key = `${part.type}:${part.runtimeId}`;
            usedDecisions.push(key);
            const value = record.decisions[key];
            if (!Number.isInteger(value) || value < (part.type === "if" ? -1 : 0) || value >= (part.type === "if" ? part.branches.length : part.variants.length)) fail("invalid saved branch selection");
            inspect(part.type === "if" ? value < 0 ? part.elseNodes || [] : part.branches[value].nodes : part.variants[value]);
          } else if (part.type === "paragraph") {
            inspectInlineParts(part.parts);
          }
        }
      }
      function inspectInlineParts(parts) {
        for (const part of parts) {
          if (part.type !== "inline-if") continue;
          const key = inlineDecisionId(part);
          usedDecisions.push(key);
          const value = record.decisions[key];
          if (!Number.isInteger(value) || value < -1 || value >= part.branches.length) {
            fail("invalid saved inline branch selection");
          }
          inspectInlineParts(value < 0 ? part.elseParts || [] : part.branches[value].parts);
        }
      }
      if (!record.decisions || typeof record.decisions !== "object" || Array.isArray(record.decisions)) fail("invalid saved decisions");
      if (record.kind === "incoming") inspect(node.body);
      object(record.decisions, usedDecisions);
      const paragraphs = record.kind === "incoming" ? selectedNodes(node.body, record.decisions) : [{ parts: node.send }];
      const bindings = [...new Set(paragraphs
        .flatMap((paragraph) => selectedInlineParts(paragraph.parts, record.decisions))
        .filter((part) => part.type === "interpolation")
        .map((part) => part.path.join(".")))];
      object(record.bindings, bindings);
      for (const value of Object.values(record.bindings)) if (!["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) fail("invalid captured message value");
    });
  }
}
