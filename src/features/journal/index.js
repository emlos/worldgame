import { defineFeature } from "../catalog.js";
import { JOURNAL_STORY_SYSTEM } from "./system.js";

export const JOURNAL_FEATURE = defineFeature({
  id: "journal",
  wgSystems: {
    "journal.diary": JOURNAL_STORY_SYSTEM,
  },
});
