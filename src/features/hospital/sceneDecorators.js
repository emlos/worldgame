import { createChoice } from "../../game/scene/choiceContract.js";
import { HOSPITAL_PLACE_KEY, injuredTreatmentRegions, sashaIsOnDuty } from "./care.js";

export const HOSPITAL_TREATMENT_ACTION = "hospital.treat";

export const HOSPITAL_SCENE_DECORATORS = Object.freeze([{
  id: "treatment",
  applies: ({ game, scene }) => scene.kind === "place" &&
    game.currentPlace?.key === HOSPITAL_PLACE_KEY,
  decorate: ({ game, scene }) => {
    const regions = injuredTreatmentRegions(game.player.body);
    const doctorHere = sashaIsOnDuty(game);
    const choice = createChoice({
      id: "hospital:treat",
      label: `Get treatment (${regions.length} ${regions.length === 1 ? "region" : "regions"})`,
      durationMinutes: regions.length * 60,
      energyFree: true,
      resting: true,
      enabled: regions.length > 0,
      disabledReason: regions.length ? null : "You have no injuries to treat.",
      action: { type: HOSPITAL_TREATMENT_ACTION },
    });
    const section = { id: "treatment", heading: "Treatment", choices: [choice] };
    const navigationIndex = scene.sections.findIndex(({ id }) => id === "navigation");
    const sections = [...scene.sections];
    sections.splice(navigationIndex < 0 ? sections.length : navigationIndex, 0, section);
    return {
      ...scene,
      content: [
        ...scene.content,
        {
          type: "paragraph",
          text: doctorHere
            ? "Dr. Volkov is on duty. You can ask them to examine any injuries."
            : "Dr. Volkov is off duty. The hospital's other staff can still treat you.",
        },
        {
          type: "paragraph",
          text: regions.length
            ? `Treatment will take ${regions.length} ${regions.length === 1 ? "hour" : "hours"}: one hour each for ${regions.map((region) => region.label).join(", ")}.`
            : "You do not currently need treatment.",
        },
      ],
      sections,
    };
  },
}]);
