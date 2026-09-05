import { validateNPCRosterSave } from "../../characters/npc/saveValidation.js";
import { validatePlayerSave } from "../../characters/player/saveValidation.js";
import { deriveSeed, validateRandomStreamsSave } from "../../shared/util/random.js";
import {
  SaveValidationError,
  failSave,
  requiredSaveField,
  requireSameSaveValue,
  saveDateMilliseconds,
  saveInteger,
  saveRecord,
  saveUint32,
  validateJsonValue,
} from "../../shared/util/saveValidation.js";
import { validateStorySave } from "../../story/saveValidation.js";
import { validateWorldSave } from "../../world/saveValidation.js";
import { validateActionHistorySave } from "../actionRunner.js";
import { validateDailyAnnouncementsSave } from "../announcements.js";
import { validateChatState } from "../chat/validation.js";
import { validateSavedPlayerPosition } from "../movement.js";
import { validateGpsTargetSave } from "../navigation.js";
import { validateRemindersSave } from "../reminders.js";
import { validateTimerStateSave } from "../timers.js";

export { SaveValidationError };

export function validateGameSave(data) {
  validateJsonValue(data, "save");
  const save = saveRecord(data, "save");
  requireSameSaveValue(
    saveInteger(requiredSaveField(save, "saveVersion", "save"), "save.saveVersion"),
    32,
    "save.saveVersion",
    "version 32",
  );

  const seed = saveUint32(requiredSaveField(save, "seed", "save"), "save.seed");
  validateRandomStreamsSave(requiredSaveField(save, "random", "save"), {
    path: "save.random",
    expectedSeed: seed,
    requiredStreams: ["gameplay"],
  });
  const gameTime = saveDateMilliseconds(requiredSaveField(save, "time", "save"), "save.time");
  const startedAt = saveDateMilliseconds(
    requiredSaveField(save, "startedAt", "save"),
    "save.startedAt",
  );
  if (startedAt > gameTime) {
    failSave("save.startedAt", "must not be after the game clock");
  }
  validateRemindersSave(save);

  const { mapIndex } = validateWorldSave(requiredSaveField(save, "world", "save"), {
    expectedSeed: deriveSeed(seed, "world"),
    expectedTime: gameTime,
  });
  const { npcIds, npcProfiles } = validateNPCRosterSave(
    requiredSaveField(save, "npcs", "save"),
    { mapIndex, gameTime },
  );

  try {
    validateChatState(requiredSaveField(save, "chats", "save"), npcIds);
  } catch (error) {
    failSave("save.chats", error.message);
  }
  validateTimerStateSave(requiredSaveField(save, "timers", "save"), { gameTime });
  validatePlayerSave(requiredSaveField(save, "player", "save"), {
    npcProfiles,
    gameTime,
  });

  const { current } = validateSavedPlayerPosition(save, { mapIndex });
  validateGpsTargetSave(requiredSaveField(save, "gpsTarget", "save"), {
    mapIndex,
    currentLocationId: current.locationId,
  });
  validateDailyAnnouncementsSave(
    requiredSaveField(save, "dailyAnnouncements", "save"),
    { gameTime },
  );
  validateStorySave(save, { gameTime });
  validateActionHistorySave(save, { gameTime });
  return data;
}
