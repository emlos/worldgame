import { failWG } from "./diagnostic.js";

function partsContainChange(parts) {
  return (parts || []).some((part) =>
    part.type === "change" ||
    (part.type === "inline-if" && (
      (part.branches || []).some((branch) => partsContainChange(branch.parts)) ||
      partsContainChange(part.elseParts)
    ))
  );
}

/** Keep chat control flow explicit: a passage ends in choices, a wait, or finish. */
export function validateChat(chat, assignRuntimeNodeIds) {
  const passageIds = new Set();
  const messageIds = new Set();
  for (const passage of chat.passages) {
    if (passageIds.has(passage.id)) failWG(`Duplicate chat passage '${passage.id}'`, passage.source);
    passageIds.add(passage.id);
  }
  const target = (node) => {
    if (!node.target?.startsWith(".") || !passageIds.has(node.target.slice(1))) {
      failWG(`Unknown local chat target '${node.target}'`, node.source);
    }
  };
  for (const passage of chat.passages) {
    const choiceIds = new Set();
    function visit(nodes, inMessage = false, nested = false) {
      for (const [index, node] of nodes.entries()) {
        if (node.type === "if") {
          for (const branch of node.branches) visit(branch.nodes, inMessage, true);
          visit(node.elseNodes || [], inMessage, true);
        } else if (node.type === "random") {
          for (const variant of node.variants) visit(variant, inMessage, true);
        } else if (inMessage) {
          if (node.type !== "paragraph" || partsContainChange(node.parts)) {
            failWG("Messages contain only prose, interpolation, @if, and @random; put effects outside @message", node.source);
          }
        } else if (node.type === "message") {
          if (messageIds.has(node.id)) failWG(`Duplicate message id '${node.id}' in chat '${chat.id}'`, node.source);
          messageIds.add(node.id);
          if (!node.body.length) failWG("Messages cannot be empty", node.source);
          visit(node.body, true);
        } else if (node.type === "choice") {
          if (choiceIds.has(node.id)) failWG(`Duplicate chat choice '${node.id}'`, node.source);
          choiceIds.add(node.id);
          if (!node.send) failWG("Every chat choice requires @send", node.source);
          target(node);
        } else if (node.type === "wait" || node.type === "finish") {
          if (nested || index !== nodes.length - 1) failWG("@wait and @finish must end the passage, outside conditional/random blocks", node.source);
          if (node.type === "wait") target(node);
        } else if (node.type !== "effect") {
          failWG("Chat prose must be inside @message", node.source);
        }
        const effects = node.type === "effect" ? [node.effect] : node.effects || [];
        if (effects.some((effect) => ["chat", "contact"].includes(effect.op))) {
          failWG("Start chats and add contacts from world scenes, not inside chats", node.source);
        }
      }
    }
    visit(passage.body);
    const terminal = ["wait", "finish"].includes(passage.body.at(-1)?.type);
    if (terminal === (choiceIds.size > 0)) failWG("A chat passage must have either reply choices or a final @wait/@finish", passage.source);
    assignRuntimeNodeIds(passage.body);
  }
}
