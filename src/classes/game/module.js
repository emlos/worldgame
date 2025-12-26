import * as localisation from "./util/localisation.js";
import * as scheduler from "./util/npcai.js";
import * as scenemanager from "./util/sceneManager.js";

export * from "./util/localisation.js";
export * from "./util/npcai.js";
export * from "./util/sceneManager.js";

if (debug) {
    Object.assign(window, {
        ...localisation,
        ...scheduler,
        ...scenemanager,
    });
}
