/** Shared by keyboard dispatch, button hints, and the phone's hotkey reference. */
export const MENU_HOTKEYS = [
  { id: "phone", key: "p", label: "P", description: "Open / close phone", group: "Menus", scope: "phone" },
  { id: "diary", key: "d", label: "D", description: "Open diary", group: "Menus", scope: "game" },
  { id: "map", key: "m", label: "M", description: "Open map", group: "Menus", scope: "game" },
  { id: "relationships", key: "r", label: "R", description: "Relationships", group: "Phone apps", scope: "phone" },
  { id: "gps", key: "g", label: "G", description: "GPS", group: "Phone apps", scope: "phone" },
  { id: "stats", key: "s", label: "S", description: "Player stats", group: "Phone apps", scope: "phone" },
  { id: "settings", key: ",", label: ",", description: "Settings", group: "Phone apps", scope: "phone" },
  { id: "back", key: "Escape", label: "Esc", description: "Back in phone / close dialog", group: "Navigation", scope: "dialog" },
];

/** Indices follow rendered order, including disabled choices, across sections. */
export function choiceHotkeyLabel(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 20) return null;
  const digit = String((index + 1) % 10);
  return index >= 10 ? `Shift+${digit}` : digit;
}

function choiceIndex(event) {
  // Physical digit codes still identify Shift+1 when event.key is "!".
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code || "");
  const digit = match?.[1] ?? (/^[0-9]$/.test(event.key) ? event.key : null);
  // With Num Lock off, preserve the keypad's navigation keys.
  if (event.code?.startsWith("Numpad") && !/^[0-9]$/.test(event.key)) return null;
  if (digit === null) return null;
  return (digit === "0" ? 9 : Number(digit) - 1) + (event.shiftKey ? 10 : 0);
}

export function isTypingTarget(target) {
  return Boolean(
    target?.isContentEditable ||
    target?.closest?.("input, textarea, select, [role='textbox'], [role='searchbox'], [role='combobox']"),
  );
}

/** Resolve input without mutating game or DOM state. Dialogs own their input. */
export function resolveKeyboardAction(event, {
  dialog = null,
  phoneHome = true,
  transitioning = false,
  typing = isTypingTarget(event.target),
  choices = [],
} = {}) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return null;
  if (event.altKey || event.ctrlKey || event.metaKey) return null;

  const binding = MENU_HOTKEYS.find((hotkey) => hotkey.key.toLowerCase() === event.key?.toLowerCase());
  if (binding?.scope === "dialog" && !event.shiftKey) {
    if (!dialog) return null;
    return { type: dialog === "phone" && !phoneHome ? "phone-home" : "close-dialog" };
  }
  if (typing || transitioning || (dialog && dialog !== "phone")) return null;

  if (binding && binding.scope !== "dialog" && !event.shiftKey) {
    if (dialog && binding.scope === "game") return null;
    return { type: "menu", id: binding.id };
  }
  if (dialog) return null;

  const index = choiceIndex(event);
  if (index === null || !choices[index] || choices[index].disabled) return null;
  return { type: "choice", index };
}
