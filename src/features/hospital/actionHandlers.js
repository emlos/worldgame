import {
  CHOICE_ERROR_CODE,
  actionResult,
  failChoice,
  runChoiceAction,
} from "../../game/scene/choiceRuntime.js";
import {
  HOSPITAL_PLACE_KEY,
  healTreatmentRegions,
  injuredTreatmentRegions,
  introduceSasha,
  sashaIsOnDuty,
} from "./care.js";
import { HOSPITAL_TREATMENT_ACTION } from "./sceneDecorators.js";

export function performHospitalTreatment(game, _choice, minutes) {
  if (game.currentPlace?.key !== HOSPITAL_PLACE_KEY) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "Treatment is only available at the hospital");
  }
  const regions = injuredTreatmentRegions(game.player.body);
  if (!regions.length) {
    failChoice(CHOICE_ERROR_CODE.disabledChoice, "You have no injuries to treat");
  }
  if (minutes !== regions.length * 60) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "Treatment duration does not match your injuries");
  }
  const doctorHere = sashaIsOnDuty(game);
  let firstMeeting = false;
  runChoiceAction(game, {
    label: "Receive hospital treatment",
    minutes,
    energyFree: true,
    resting: true,
    apply(currentGame) {
      firstMeeting = introduceSasha(currentGame);
      healTreatmentRegions(currentGame.player.body, regions);
      currentGame.setFlag("hospital.treatment_received");
    },
  });
  return actionResult({
    paragraphs: [
      ...(firstMeeting
        ? ['"I\'m Dr. Sasha Volkov," the doctor says. "You\'re welcome here anytime."']
        : []),
      doctorHere
        ? "Dr. Volkov examines your injuries and treats each affected region. By the time the treatment is finished, the pain has eased and you can move normally again."
        : "The hospital staff examine your injuries and treat each affected region. By the time treatment is finished, the pain has eased and you can move normally again.",
    ],
  });
}

export const HOSPITAL_ACTION_HANDLERS = Object.freeze({
  [HOSPITAL_TREATMENT_ACTION]: performHospitalTreatment,
});
