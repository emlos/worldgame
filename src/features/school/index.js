import { defineFeature } from "../catalog.js";
import { SCHOOL_CLASS_BEHAVIOR, SCHOOL_CLASS_BEHAVIOR_ID } from "./classBehavior.js";
import { createSchoolWGContext } from "./context.js";
import { SCHOOL_QUIZ_STORY_SYSTEM } from "./quiz/system.js";
import { SCHOOL_AUTOMATIC_REMINDERS } from "./reminders.js";
import { HIGH_SCHOOL_PLACE_KEY } from "./config.js";
import { SCHOOL_PLACE_DEFINITIONS } from "./places.js";
import { createSchoolState, SCHOOL_SUBJECTS } from "./education.js";
import { SCHOOL_SKILL_CHECK_TARGETS } from "./skillChecks.js";
import { SCHOOL_WG_EFFECT_HANDLERS } from "./effects.js";
import { buildSchoolPhoneStats } from "./phoneStats.js";
import { getSchoolDayPlan } from "./timetable.js";
import { SCHOOL_TIMETABLE_STORY_SYSTEM } from "./timetableSystem.js";
import { validateSchoolStateSave } from "./saveValidation.js";
import { addSchoolNPCDefinitions } from "./npcDefinitions.js";
import { teleportPlayerToSchool } from "./debug.js";

export const SCHOOL_FEATURE = defineFeature({
  id: "school",
  state: {
    create: createSchoolState,
    validateSave: validateSchoolStateSave,
  },
  wgSystems: {
    "school.quiz": SCHOOL_QUIZ_STORY_SYSTEM,
    "school.timetable": SCHOOL_TIMETABLE_STORY_SYSTEM,
  },
  wgContexts: {
    school: createSchoolWGContext,
  },
  storyBehaviors: {
    [SCHOOL_CLASS_BEHAVIOR_ID]: SCHOOL_CLASS_BEHAVIOR,
  },
  automaticReminders: SCHOOL_AUTOMATIC_REMINDERS,
  placeDefinitions: SCHOOL_PLACE_DEFINITIONS,
  skillCheckTargets: SCHOOL_SKILL_CHECK_TARGETS,
  wgEffectHandlers: SCHOOL_WG_EFFECT_HANDLERS,
  wgReferenceCatalogs: { subjects: SCHOOL_SUBJECTS },
  playerStatsSections: [buildSchoolPhoneStats],
  npcScheduleConditions: {
    schoolDay({ game, date, value }) {
      if (typeof value !== "boolean") {
        throw new TypeError("NPC schoolDay schedule conditions must be boolean");
      }
      return getSchoolDayPlan(game, { date }).hasSchool === value;
    },
  },
  npcDefinitionDecorators: [addSchoolNPCDefinitions],
  debugActions: {
    "school.teleport-player": teleportPlayerToSchool,
  },
  navigationDecorators: [(_game, destination) => ({
    ...destination,
    recommended: destination.placeKey === HIGH_SCHOOL_PLACE_KEY,
  })],
});
