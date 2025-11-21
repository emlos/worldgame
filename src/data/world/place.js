import { DAY_KEYS, LOCATION_TAGS } from "../data.js";

function pick(arr, rnd) {
    return arr[(rnd() * arr.length) | 0];
}
function has(tags, t) {
    return (tags || []).includes(t);
}
function seqName(base, { index }) {
    return `${base} ${index + 1}`;
}

export const PLACE_TAGS = {
    civic: "civic",
    safety: "safety",
    transport: "transport",
    service: "service",
    leisure: "leisure",
    culture: "culture",
    commerce: "commerce",
    food: "food",
    industry: "industry",
    housing: "housing",
    education: "education",
    nightlife: "nightlife",
    history: "history",
};

export const PLACE_REGISTRY = [
    // ────────────────────────────
    // CIVIC / TRANSPORT
    // ────────────────────────────
    {
        key: "town_square",
        label: "Town Square",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.urban_center],
        weight: 1,
        props: { icon: "🟦", category: [PLACE_TAGS.civic, PLACE_TAGS.leisure, PLACE_TAGS.history] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.historic) ? "Old Town Square" : "Town Square",
        minCount: 1,
    },
    {
        key: "civil_office",
        label: "Civil Office",

        minDistance: 8,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 1,
        props: { icon: "🏛️", category: [PLACE_TAGS.civic, PLACE_TAGS.service] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.urban_core) ? "Downtown Civil Office" : "Civil Office",
        minCount: 1,
    },
    {
        key: "jail",
        label: "Jail",

        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.rural,
        ],
        weight: 1,
        props: { icon: "🚔", category: [PLACE_TAGS.safety, PLACE_TAGS.civic] },
        nameFn: ({ rnd }) => `${pick(["City", "County"], rnd)} Jail`,
        minCount: 1,
    },
    {
        key: "court",
        label: "Court",

        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 1,
        props: { icon: "⚖️", category: [PLACE_TAGS.civic] },
        nameFn: ({ rnd }) => `${pick(["District", "Municipal", "County"], rnd)} Court`,
        minCount: 1,
    },
    {
        key: "train_station",
        label: "Train Station",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.urban,
        ],
        weight: 1,
        props: { icon: "🚉", category: [PLACE_TAGS.transport] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.urban_core) ? "Central Station" : "Train Station",
        minCount: 1,
    },
    {
        key: "bus_stop",
        label: "Bus Stop",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.parkland,
        ],
        weight: 6,
        props: { icon: "🚌", category: [PLACE_TAGS.transport] },
        nameFn: ({ index }) => seqName("Bus Stop", { index }),
        minCount: 1,
    },
    {
        key: "boulevard",
        label: "Boulevard",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
        ],
        weight: 1,
        props: { icon: "🛣️", category: [PLACE_TAGS.civic, PLACE_TAGS.leisure, PLACE_TAGS.culture] },
        nameFn: ({ rnd }) =>
            `${pick(
                ["King", "Queen", "Liberty", "Harbor", "Market", "Union", "Elm"],
                rnd
            )} Boulevard`,
        minCount: 1,
    },
    {
        key: "parking_garage",
        label: "Parking Garage",

        minDistance: 4,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 3,
        props: { icon: "🅿️", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(["Central", "Market", "Harbor", "Union"], rnd)} Parking ${pick(
                ["Garage", "Lot"],
                rnd
            )}`,
        minCount: 1,
    },
    {
        key: "gas_station",
        label: "Gas Station",

        minDistance: 5,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.coastal,
        ],
        weight: 2,
        props: { icon: "⛽", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["FuelStop", "Highway", "Harbor"], rnd)} Station`,
        minCount: 1,
    },
    {
        key: "bank",
        label: "Bank",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
        ],
        weight: 2,
        props: { icon: "🏦", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["First National", "Union", "Harborview"], rnd)} Bank`,
        minCount: 1,
    },
    {
        key: "post_office",
        label: "Post Office",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
        ],
        weight: 2,
        props: { icon: "📮", category: [PLACE_TAGS.service] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.urban_core) ? "Central Post Office" : "Post Office",
        minCount: 1,
    },

    // ────────────────────────────
    // LEISURE / CULTURE
    // ────────────────────────────
    {
        key: "park",
        label: "Park",

        minDistance: 3,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
        ],
        weight: 3,
        props: { icon: "🌳", category: [PLACE_TAGS.leisure, PLACE_TAGS.culture] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.urban_core)
                ? `${pick(["Central", "City", "Common"], rnd)} Park`
                : `${pick(["Maple", "Oak", "Riverside", "West"], rnd)} Park`,
        minCount: 1,
    },
    {
        key: "stadium",
        label: "Stadium",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 1,
        props: { icon: "🏟️", category: [PLACE_TAGS.leisure, PLACE_TAGS.culture] },
        nameFn: ({ rnd }) => `${pick(["Riverview", "Summit", "Harbor", "Union"], rnd)} Stadium`,
        minCount: 1,
    },
    {
        key: "theater",
        label: "Theater",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.commercial,
        ],
        weight: 1,
        props: { icon: "🎭", category: [PLACE_TAGS.culture] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Imperial", "Bijou", "Majestic"], rnd)} Theater`
                : "Theater",
        minCount: 1,
    },
    {
        key: "cinema",
        label: "Cinema",

        minDistance: 5,
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 2,
        props: { icon: "🎬", category: [PLACE_TAGS.culture] },
        nameFn: ({ rnd }) => `${pick(["Arcadia", "Odeon", "Vista", "Galaxy"], rnd)} Cinema`,
        minCount: 1,
    },
    {
        key: "museum",
        label: "Museum",

        minDistance: 12,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
        ],
        weight: 1,
        props: {
            icon: "🏛️",
            category: [PLACE_TAGS.culture, PLACE_TAGS.education, PLACE_TAGS.history],
        },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.coastal)
                ? `${pick(["Maritime", "Harbor"], rnd)} Museum`
                : `${pick(["City", "Regional"], rnd)} Museum`,
        minCount: 1,
    },
    {
        key: "art_gallery",
        label: "Art Gallery",

        minDistance: 8,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.education,
            LOCATION_TAGS.commercial,
        ],
        weight: 1,
        props: { icon: "🖼️", category: [PLACE_TAGS.culture, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic) || has(tags, LOCATION_TAGS.tourism)
                ? `${pick(["Old Town", "City"], rnd)} Gallery`
                : `${pick(["Modern", "Riverside"], rnd)} Gallery`,
        minCount: 1,
    },
    {
        key: "library",
        label: "Library",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.education,
            LOCATION_TAGS.residential,
        ],
        weight: 2,
        props: {
            icon: "📚",
            category: [PLACE_TAGS.culture, PLACE_TAGS.education, PLACE_TAGS.leisure],
        },
        nameFn: ({ rnd }) => `${pick(["Central", "North", "West", "Riverside"], rnd)} Library`,
        minCount: 1,
    },
    {
        key: "club",
        label: "Club",

        minDistance: 5,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
        ],
        weight: 2,
        props: { icon: "🎧", category: [PLACE_TAGS.leisure, PLACE_TAGS.nightlife] },
        nameFn: ({ rnd }) => `${pick(["Neon", "Pulse", "Echo", "Velvet"], rnd)} Club`,
        minCount: 1,
    },

    {
        key: "playground",
        label: "Playground",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.residential,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.rural,
        ],
        weight: 3,
        props: { icon: "👧", category: [PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["Maple", "Riverside", "Elm", "Sunset"], rnd)} Playground`,
        minCount: 1,
    },

    {
        key: "community_center",
        label: "Community Center",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.residential,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 2,
        props: { icon: "🏠", category: [PLACE_TAGS.civic, PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) =>
            `${pick(["Riverside", "Northside", "Docktown", "Union"], rnd)} Community Center`,
        minCount: 1,
    },

    // ────────────────────────────
    // COMMERCE / FOOD & DRINK
    // ────────────────────────────
    {
        key: "market",
        label: "Market",

        minDistance: 3,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.historic,
        ],
        weight: 2,
        props: { icon: "🧺", category: [PLACE_TAGS.commerce] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Old", "Heritage"], rnd)} Market`
                : `${pick(["Central", "City"], rnd)} Market`,
        minCount: 1,
    },
    {
        key: "flea_market",
        label: "Flea Market",

        minDistance: 12,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.industrial,
        ],
        weight: 1,
        props: { icon: "🧺", category: [PLACE_TAGS.commerce, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Old Town", "Vintage"], rnd)} Flea Market`
                : `${pick(["Harbor", "Riverside", "Sunday"], rnd)} Flea Market`,
        minCount: 1,
    },
    {
        key: "mall",
        label: "Shopping Mall",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.urban,
        ],
        weight: 1,
        props: { icon: "🏬", category: [PLACE_TAGS.commerce, PLACE_TAGS.food, PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["North", "Harbor", "Grand", "Sunset"], rnd)} Mall`,
        minCount: 1,
    },
    {
        key: "corner_store",
        label: "Corner Store",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
        ],
        weight: 4,
        props: { icon: "🏪", category: [PLACE_TAGS.commerce] },
        nameFn: ({ rnd }) => `${pick(["QuickMart", "Stop&Shop", "MiniMart"], rnd)}`,
        minCount: 1,
    },
    {
        key: "restaurant",
        label: "Restaurant",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.residential,
        ],
        weight: 4,
        props: { icon: "🍽️", category: [PLACE_TAGS.food, PLACE_TAGS.nightlife] },
        nameFn: ({ rnd }) =>
            `${pick(["Olive Court", "Dockside Grill", "Sunset Table", "Elm Bistro"], rnd)}`,
        minCount: 1,
    },
    {
        key: "pizzeria",
        label: "Pizzeria",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
        ],
        weight: 3,
        props: { icon: "🍕", category: [PLACE_TAGS.food] },
        nameFn: ({ rnd }) =>
            `${pick(["Tony's", "Mama Mia", "Brick Oven", "Harbor Slice"], rnd)} Pizzeria`,
        minCount: 1,
    },
    {
        key: "cafe",
        label: "Cafe",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.education,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
        ],
        weight: 5,
        props: { icon: "☕", category: [PLACE_TAGS.food, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            `${pick(
                has(tags, LOCATION_TAGS.education)
                    ? ["Campus", "Quad", "Student"]
                    : ["Central", "Riverside", "Market"],
                rnd
            )} Cafe`,
        minCount: 1,
    },
    {
        key: "bar",
        label: "Bar",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
        ],
        weight: 4,
        props: {
            icon: "🍺",
            category: [PLACE_TAGS.food, PLACE_TAGS.nightlife, PLACE_TAGS.leisure],
        },
        nameFn: ({ rnd }) =>
            `${pick(["The Anchor", "The Fox", "The Lantern", "The Brass Rail"], rnd)}`,
        minCount: 1,
    },

    {
        key: "bakery",
        label: "Bakery",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.historic,
        ],
        weight: 3,
        props: { icon: "🥐", category: [PLACE_TAGS.food] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Old Town", "Heritage"], rnd)} Bakery`
                : `${pick(["Sunrise", "Maple", "Riverside"], rnd)} Bakery`,
        minCount: 1,
    },
    {
        key: "butcher",
        label: "Butcher's",

        minDistance: 3,
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.historic,
        ],
        weight: 2,
        props: { icon: "🥩", category: [PLACE_TAGS.food] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Old Town", "Market"], rnd)} Butcher`
                : `${pick(["Prime Cuts", "Riverside", "Maple"], rnd)} Butcher`,
        minCount: 1,
    },

    // ────────────────────────────
    // SERVICES / HEALTH / EDUCATION
    // ────────────────────────────
    {
        key: "clinic",
        label: "Clinic",

        minDistance: 5,
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
        ],
        weight: 2,
        props: { icon: "🏥", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["Riverside", "Northside", "Elm"], rnd)} Clinic`,
        minCount: 1,
    },
    {
        key: "hospital",
        label: "Hospital",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 1,
        props: { icon: "🏥", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["St. Genevieve", "General", "Memorial"], rnd)} Hospital`,
        minCount: 1,
    },
    {
        key: "pharmacy",
        label: "Pharmacy",

        minDistance: 3,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
        ],
        weight: 3,
        props: { icon: "💊", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["City", "Riverside", "Elm", "Union"], rnd)} Pharmacy`,
        minCount: 1,
    },
    {
        key: "doctors_office",
        label: "Doctor's Office",

        minDistance: 4,
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.parkland,
        ],
        weight: 2,
        props: { icon: "🩺", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["Riverside", "Elm Street", "Maple"], rnd)} Medical`,
        minCount: 1,
    },
    {
        key: "gym",
        label: "Gym",

        minDistance: 3,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
        ],
        weight: 2,
        props: { icon: "🏋️", category: [PLACE_TAGS.service, PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["Ironworks", "Pulse", "Forge", "AnyGym"], rnd)} Gym`,
        minCount: 1,
    },
    {
        key: "swimming_pool",
        label: "Swimming Pool",

        minDistance: 8,
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.education,
        ],
        weight: 2,
        props: { icon: "🏊", category: [PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["Community", "Northside", "Riverside"], rnd)} Pool`,
        minCount: 1,
    },
    {
        key: "salon",
        label: "Salon",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
        ],
        weight: 3,
        props: { icon: "💇", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["Velvet", "Luxe", "Glow", "ClipJoint"], rnd)} Salon`,
        minCount: 1,
    },
    {
        key: "church",
        label: "Church",

        minDistance: 12,
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
        ],
        weight: 1,
        props: { icon: "⛪", category: [PLACE_TAGS.service, PLACE_TAGS.civic, PLACE_TAGS.history, PLACE_TAGS.culture] },
        nameFn: ({ rnd }) =>
            `${pick(["St. Genevieve", "All Saints", "Trinity", "Grace"], rnd)} Church`,
        minCount: 1,
    },

    // ────────────────────────────
    // EDUCATION/CAREER
    // ────────────────────────────
    {
        key: "primary_school",
        label: "Primary School",

        minDistance: 8,
        allowedTags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
        ],
        weight: 2,
        props: { icon: "🏫", category: [PLACE_TAGS.education] },
        nameFn: ({ rnd }) => `${pick(["Elm Primary School", "Maple Primary"], rnd)}`,
        minCount: 1,
    },
    {
        key: "middle_school",
        label: "Middle School",

        minDistance: 10,
        allowedTags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
        ],
        weight: 2,
        props: { icon: "🏫", category: [PLACE_TAGS.education] },
        nameFn: ({ rnd }) => `Middle School no. ${pick([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)}`,
        minCount: 1,
    },
    {
        key: "high_school",
        label: "High School",

        minDistance: 16,
        allowedTags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.residential,
        ],
        weight: 1,
        props: { icon: "🏫", category: [PLACE_TAGS.education] },
        nameFn: ({ rnd }) =>
            `${pick(["St. Genevieve's High School", "Riverside High", "Docktown High"], rnd)}`,
        minCount: 1,
    },
    {
        key: "university",
        label: "University",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.dense,
        ],
        weight: 1,
        props: { icon: "🎓", category: [PLACE_TAGS.education] },
        nameFn: () => "University of Docktown",
        minCount: 1,
    },
    {
        key: "office_block",
        label: "Office Block",

        minDistance: 4,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
        ],
        weight: 3,
        props: { icon: "🏢", category: [PLACE_TAGS.commerce, PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(["Union", "Harbor", "Market", "Liberty", "Central"], rnd)} Office Tower`,
        minCount: 1,
    },

    // ────────────────────────────
    // INDUSTRY / UTILITIES / SAFETY
    // ────────────────────────────
    {
        key: "mechanic",
        label: "Mechanic",

        minDistance: 3,
        allowedTags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.urban,
        ],
        weight: 2,
        props: { icon: "🔧", category: [PLACE_TAGS.industry, PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(["Ace Auto", "Riverside Motors", "Dockside Auto", "Union Garage"], rnd)}`,
        minCount: 1,
    },
    {
        key: "police_station",
        label: "Police Station",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.rural,
        ],
        weight: 1,
        props: { icon: "🚓", category: [PLACE_TAGS.safety, PLACE_TAGS.civic, PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(["1st Precinct", "Central Precinct", "Harbor Precinct"], rnd)}`,
        minCount: 1,
    },
    {
        key: "fire_station",
        label: "Fire Department",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.rural,
        ],
        weight: 1,
        props: { icon: "🚒", category: [PLACE_TAGS.safety, PLACE_TAGS.civic, PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Fire Station 1", "Fire Marshall Station", "Volunteer Fire Department"],
                rnd
            )}`,
        minCount: 1,
    },

    {
        key: "warehouse",
        label: "Warehouse",

        minDistance: 4,
        allowedTags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.coastal,
        ],
        weight: 3,
        props: { icon: "📦", category: [PLACE_TAGS.industry] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.coastal)
                ? `${pick(["Harbor", "Dockside", "Pier"], rnd)} Warehouse`
                : `${pick(["Union", "Riverside", "North"], rnd)} Warehouse`,
        minCount: 1,
    },

    {
        key: "logistics_depot",
        label: "Logistics Depot",

        minDistance: 8,
        allowedTags: [LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge, LOCATION_TAGS.suburban],
        weight: 1,
        props: { icon: "🚚", category: [PLACE_TAGS.industry] },
        nameFn: ({ rnd }) =>
            `${pick(["TransGlobal", "ExpressLink", "Docktown Freight"], rnd)} Depot`,
        minCount: 1,
    },

    // ────────────────────────────
    // HOUSING
    // ────────────────────────────
    {
        key: "apartment_complex",
        label: "Apartment Complex",

        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.dense,
        ],
        weight: 3,
        props: { icon: "🏢", category: [PLACE_TAGS.housing], multi: true },
        nameFn: ({ rnd }) => `${pick(["Riverside", "Maple", "Union", "Elm"], rnd)} Apartments`,
        minCount: 1,
    },
    {
        key: "townhouse",
        label: "Townhouse",

        minDistance: 1,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.dense,
        ],
        weight: 2,
        props: { icon: "🏘", category: [PLACE_TAGS.housing], multi: true },
        nameFn: ({ rnd }) =>
            `${pick(["Lone", "Maple", "Luxurious", "Dilapidated"], rnd)} House Row`,
        minCount: 1,
    },

    // ────────────────────────────
    // WATERFRONT
    // ────────────────────────────
    {
        key: "pier",
        label: "Pier",

        minDistance: 6,
        allowedTags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
        ],
        weight: 2,
        props: { icon: "🛳️", category: [PLACE_TAGS.commerce, PLACE_TAGS.nightlife] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.tourism)
                ? `${pick(["Boardwalk", "Sunset", "Harborfront"], rnd)} Pier`
                : `${pick(["Pier 3", "Pier 7", "Cargo Pier"], rnd)}`,
        minCount: 1,
    },

    {
        key: "fish_market",
        label: "Fish Market",

        minDistance: 4,
        allowedTags: [LOCATION_TAGS.coastal, LOCATION_TAGS.urban_edge],
        weight: 2,
        props: { icon: "🐟", category: [PLACE_TAGS.commerce, PLACE_TAGS.food, PLACE_TAGS.leisure] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.coastal) ? "Harbor Fish Market" : "Fish Market",
        minCount: 1,
    },
];

// ---- reusable opening-hour patterns --------------------------------

export function emptySchedule() {
    return {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
    };
}

function hoursEveryDay(from, to) {
    const s = emptySchedule();
    for (const d of Object.keys(s)) {
        s[d].push({ from, to });
    }
    return s;
}

function hoursAllDay() {
    return hoursEveryDay("00:00", "24:00");
}

function hoursWeekdays({ from = "08:00", to = "16:00", saturday, sunday } = {}) {
    const s = emptySchedule();
    for (const d of [DAY_KEYS[1], DAY_KEYS[2], DAY_KEYS[3], DAY_KEYS[4], DAY_KEYS[5]]) {
        s[d].push({ from, to });
    }
    if (saturday && saturday.from && saturday.to) {
        s.sat.push({ from: saturday.from, to: saturday.to });
    }
    if (sunday && sunday.from && sunday.to) {
        s.sun.push({ from: sunday.from, to: sunday.to });
    }
    return s;
}

// Category defaults (broad strokes, override by key if needed)
export const DEFAULT_OPENING_HOURS_BY_CATEGORY = {
    transport: hoursAllDay(), // bus/train etc.
    safety: hoursAllDay(), // police / fire / jail
    housing: hoursAllDay(),
    leisure: hoursWeekdays({ from: "06:00", to: "22:00" }),
    education: hoursWeekdays({ from: "08:00", to: "15:00" }),
    civic: hoursWeekdays({ from: "09:00", to: "17:00" }),
    commerce: hoursWeekdays({
        from: "09:00",
        to: "18:00",
        saturday: { from: "10:00", to: "14:00" },
    }),
    food: hoursEveryDay("10:00", "22:00"),
    service: hoursWeekdays({
        from: "09:00",
        to: "17:00",
        saturday: { from: "10:00", to: "13:00" },
    }),
    culture: hoursWeekdays({
        from: "10:00",
        to: "18:00",
        saturday: { from: "10:00", to: "18:00" },
        sunday: { from: "12:00", to: "18:00" },
    }),
    industry: hoursWeekdays({ from: "07:00", to: "17:00" }),
    nightlife: hoursEveryDay("18:00", "03:00"),
    history: hoursWeekdays({
        from: "10:00",
        to: "17:00",
        saturday: { from: "9:00", to: "16:00" },
    }),
};

export const DEFAULT_OPENING_HOURS = hoursAllDay();

// Per-place overrides, for things you explicitly mentioned
const SCHOOL_HOURS = hoursWeekdays({ from: "08:00", to: "16:00" });

export const DEFAULT_OPENING_HOURS_BY_KEY = {
    // Explicitly 24/7
    park: hoursAllDay(),
    playground: hoursAllDay(),
    bus_stop: hoursAllDay(),
    train_station: hoursAllDay(),
    town_square: hoursAllDay(),
    pier: hoursAllDay(),

    // Schools – weekdays only
    primary_school: SCHOOL_HOURS,
    middle_school: SCHOOL_HOURS,
    high_school: SCHOOL_HOURS,
    university: hoursWeekdays({ from: "08:00", to: "20:00" }),

    // Nightlife examples
    bar: hoursEveryDay("17:00", "02:00"),
    club: hoursEveryDay("20:00", "04:00"),
};
