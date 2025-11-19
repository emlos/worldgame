// src/data/npc/npcs.js

// Minimal shared shapes; keep it data-only so it’s easy to use anywhere.
export const NPC_REGISTRY = [
    {
        key: "generic_adult",
        label: "Generic Adult Human",
        // Used to generate names; you can swap these out later
        namePool: {
            masc: ["Alex", "Ben", "Carter", "Diego"],
            fem: ["Ada", "Bianca", "Clara", "Dina"],
            nb: ["Cameron", "Dakota", "Drew", "Sky"],
            surnames: ["Morgan", "Rivera", "Kowalski", "Nguyen"],
        },
        ageRange: { min: 20, max: 60 },
        statsTemplate: {
            looks: { min: 1, max: 6 },
            strength: { min: 1, max: 6 },
            intelligence: { min: 1, max: 6 },
        },
        genderWeights: { m: 0.4, f: 0.4, nb: 0.2 },
        bodyTemplateKey: "human", // maps to HUMAN_BODY_TEMPLATE at creation time
        tags: ["human", "adult", "citizen"],
    },

    {
        key: "teenager",
        label: "Teenager",
        namePool: {
            masc: ["Kai", "Ethan", "Milo"],
            fem: ["Freya", "Iris", "Kira"],
            nb: ["Tavi", "Hayden", "Salem"],
            surnames: ["Garcia", "Patel", "Silva"],
        },
        ageRange: { min: 13, max: 19 },
        statsTemplate: {
            looks: { min: 1, max: 7 },
            strength: { min: 1, max: 5 },
            intelligence: { min: 1, max: 7 },
        },
        genderWeights: { m: 0.45, f: 0.45, nb: 0.1 },
        bodyTemplateKey: "human",
        tags: ["human", "teen"],
    },

    // Later you can add:
    // - animals
    // - aliens
    // with different bodyTemplateKey values
];
