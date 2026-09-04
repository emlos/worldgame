import { collectWGNodes } from "../../../shared/wg/tree.js";
import {
  iterateSelectedWGNodes,
  iterateSelectedWGParts,
} from "../wg/decisionRuntime.js";
import {
  chatDecisionSession,
  chatDefinition,
  chatFail,
  chatMessageSource,
  chatPassage,
} from "./runtime.js";

const own = (object, key) => Object.hasOwn(object, key);

// Saves carry identifiers and captured scalars, never prose or executable nodes.
export function validateChatState(state, npcIds) {
  const object = (value, keys) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key)) ||
      keys.some((key) => !own(value, key))
    ) chatFail("invalid saved chat fields");
  };
  const strings = (value) => {
    if (
      !Array.isArray(value) ||
      value.some((id) => typeof id !== "string") ||
      new Set(value).size !== value.length
    ) chatFail("invalid saved chat ids");
  };
  const integer = (value, max) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > max) {
      chatFail("invalid saved chat position");
    }
  };
  const date = (value) => {
    if (
      typeof value !== "string" ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    ) chatFail("invalid saved message date");
  };

  object(state, ["contacts", "threads"]);
  strings(state.contacts);
  object(state.threads, state.contacts);
  for (const npcId of state.contacts) {
    if (!npcIds.has(npcId)) chatFail("saved contact references an unknown NPC");
    const thread = state.threads[npcId];
    object(thread, ["history", "readThrough", "active", "completed", "queue"]);
    if (!Array.isArray(thread.history)) chatFail("invalid saved history");
    integer(thread.readThrough, thread.history.length);
    strings(thread.completed);
    strings(thread.queue);
    const ids = [
      ...thread.completed,
      ...thread.queue,
      ...(thread.active ? [thread.active.chatId] : []),
    ];
    strings(ids);
    for (const id of ids) {
      if (chatDefinition(id).npcId !== npcId) {
        chatFail("conversation belongs to another contact");
      }
    }

    if (thread.active) {
      const active = thread.active;
      object(active, ["chatId", "passageId", "choices", "wait"]);
      const passage = chatPassage(chatDefinition(active.chatId), active.passageId);
      const choices = collectWGNodes(passage.body, (node) => node.type === "choice");
      strings(active.choices);
      if (active.choices.some((id) => !choices.some((choice) => choice.id === id))) {
        chatFail("unknown active chat choice");
      }
      if (active.wait) {
        object(active.wait, ["target", "dueAt"]);
        date(active.wait.dueAt);
        const wait = passage.body.at(-1);
        if (
          wait?.type !== "wait" ||
          wait.target !== `.${active.wait.target}` ||
          active.choices.length
        ) chatFail("invalid pending chat continuation");
      } else if (
        !active.choices.length ||
        ["wait", "finish"].includes(passage.body.at(-1)?.type)
      ) {
        chatFail("invalid active reply passage");
      }
    } else if (thread.queue.length) {
      chatFail("queued chats need an active exchange");
    }

    thread.history.forEach((record, index) => {
      object(record, [
        "id",
        "chatId",
        "passageId",
        "kind",
        "nodeId",
        "sentAt",
        "decisions",
        "bindings",
      ]);
      if (
        record.id !== index + 1 ||
        !["incoming", "outgoing"].includes(record.kind) ||
        !ids.includes(record.chatId)
      ) chatFail("invalid saved message identity");
      date(record.sentAt);
      const node = chatMessageSource(record);
      if (
        !record.decisions ||
        typeof record.decisions !== "object" ||
        Array.isArray(record.decisions)
      ) chatFail("invalid saved decisions");

      const session = chatDecisionSession(null, "replay", record.decisions);
      let selectedParts;
      try {
        const paragraphs = record.kind === "incoming"
          ? [...iterateSelectedWGNodes(node.body, session)]
          : [{ parts: node.send }];
        selectedParts = paragraphs.flatMap((paragraph) =>
          [...iterateSelectedWGParts(paragraph.parts, session)]
        );
      } catch (error) {
        chatFail(error.message);
      }
      object(record.decisions, [...session.usedKeys]);
      const bindings = [...new Set(selectedParts
        .filter((part) => part.type === "interpolation")
        .map((part) => part.path.join(".")))];
      object(record.bindings, bindings);
      for (const value of Object.values(record.bindings)) {
        if (
          !["string", "number", "boolean"].includes(typeof value) ||
          (typeof value === "number" && !Number.isFinite(value))
        ) chatFail("invalid captured message value");
      }
    });
  }
}
