import { Game } from "../../src/classes/game/game.js";
import { NPC } from "../../src/classes/npc/npc.js";
import { NPC_REGISTRY } from "../../src/data/npc/npcs.js";

const failures = [];

function check(label, condition) {
    if (!condition) failures.push(label);
    else console.log(`PASS: ${label}`);
}

const ids = NPC_REGISTRY.map((definition) => definition.id);
check(
    "every NPC registry definition has a unique non-empty id",
    ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length,
);

for (const definition of NPC_REGISTRY) {
    const npc = new NPC(definition);
    check(`${definition.id} constructs directly with its registry id`, npc.id === definition.id);
    check(
        `${definition.id} constructs directly with its display metadata`,
        npc.meta?.shortName === definition.meta?.shortName &&
            npc.meta?.description === definition.meta?.description &&
            JSON.stringify(npc.meta?.nicknames) === JSON.stringify(definition.meta?.nicknames) &&
            JSON.stringify(npc.meta?.tags) === JSON.stringify(definition.meta?.tags),
    );
}

const defaultGame = new Game({
    seed: 101,
    startDate: new Date("2026-01-12T12:00:00.000Z"),
});
const expectedDefaultIds = NPC_REGISTRY.filter((definition) => !definition.meta?.example).map(
    (definition) => definition.id,
);

check(
    "default Game uses stable registry ids as NPC map keys",
    JSON.stringify([...defaultGame.npcs.keys()]) === JSON.stringify(expectedDefaultIds),
);
check(
    "default Game excludes example-only NPC definitions",
    NPC_REGISTRY.filter((definition) => definition.meta?.example).every(
        (definition) => !defaultGame.npcs.has(definition.id),
    ),
);
check(
    "default Game preserves NPC registry metadata",
    expectedDefaultIds.every((id) => {
        const definition = NPC_REGISTRY.find((candidate) => candidate.id === id);
        const npc = defaultGame.npcs.get(id);
        return (
            npc?.meta?.shortName === definition?.meta?.shortName &&
            npc?.meta?.description === definition?.meta?.description &&
            JSON.stringify(npc?.meta?.nicknames) === JSON.stringify(definition?.meta?.nicknames) &&
            JSON.stringify(npc?.meta?.tags) === JSON.stringify(definition?.meta?.tags)
        );
    }),
);

const taylor = defaultGame.npcs.get("taylor");
const taylorPlace = defaultGame.world
    .getLocation(taylor?.locationId)
    ?.places.find((place) => place.id === taylor?.currentPlaceId);
check(
    "an NPC initialized during an obligation is already at its destination",
    taylor?.brain?.currentGoal?.ruleId === "school" &&
        taylor?.brain?.currentAction?.type === "stay" &&
        taylorPlace?.key === "high_school",
);

const exampleDefinition = NPC_REGISTRY.find((definition) => definition.meta?.example);
if (exampleDefinition) {
    const explicitExampleGame = new Game({
        seed: 202,
        startDate: new Date("2026-01-12T12:00:00.000Z"),
        npcTemplates: [exampleDefinition],
    });
    check(
        "an example-only NPC remains explicitly constructible",
        explicitExampleGame.npcs.get(exampleDefinition.id)?.id === exampleDefinition.id,
    );
}

if (failures.length) {
    console.error("\nNPC registry construction failures:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
} else {
    console.log("All NPC registry construction tests passed.");
}
