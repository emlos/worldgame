import { wgDecisionKey } from "../../story/wg/runtime/decisionRuntime.js";

export function journalDecisionKey(passageId, node) {
  const id = String(passageId || "");
  if (!id) throw new TypeError("Journal decisions require a passage id");
  return `${id}:${wgDecisionKey(node)}`;
}
