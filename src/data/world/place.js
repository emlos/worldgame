import { DAY_KEYS } from "../data.js";

function pick(arr, rnd) {
    return arr[(rnd() * arr.length) | 0];
}
function has(tags, t) {
    return (tags || []).includes(t);
}
function seqName(base, { index }) {
    return `${base} ${index + 1}`;
}

export const PLACE_REGISTRY = [
    // ────────────────────────────
    // CIVIC / TRANSPORT
    // ────────────────────────────
    {
        key: "town_square",
        label: "Town Square",
        maxCount: 1,
        minDistance: 99,
        allowedTags: ["urban_core", "urban_center"],
        weight: 1,
        props: { icon: "🟦", category: "civic" },
        nameFn: ({ tags }) =>
            has(tags, "historic") ? "Old Town Square" : "Town Square",
        minCount: 1,
    },
    {
        key: "civil_office",
        label: "Civil Office",

        minDistance: 8,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "suburban_hub",
        ],
        weight: 1,
        props: { icon: "🏛️", category: "civic" },
        nameFn: ({ tags }) =>
            has(tags, "urban_core") ? "Downtown Civil Office" : "Civil Office",
        minCount: 1,
    },
    {
        key: "jail",
        label: "Jail",

        maxCount: 1,
        minDistance: 99,
        allowedTags: ["urban_edge", "industrial", "urban", "rural"],
        weight: 1,
        props: { icon: "🚔", category: "safety" },
        nameFn: ({ rnd }) => `${pick(["City", "County"], rnd)} Jail`,
        minCount: 1,
    },
    {
        key: "court",
        label: "Court",

        maxCount: 1,
        minDistance: 99,
        allowedTags: ["urban_core", "urban_center", "urban", "suburban_hub"],
        weight: 1,
        props: { icon: "⚖️", category: "civic" },
        nameFn: ({ rnd }) =>
            `${pick(["District", "Municipal", "County"], rnd)} Court`,
        minCount: 1,
    },
    {
        key: "train_station",
        label: "Train Station",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            "urban_core",
            "urban_edge",
            "industrial",
            "suburban_hub",
            "urban",
        ],
        weight: 1,
        props: { icon: "🚉", category: "transport" },
        nameFn: ({ tags }) =>
            has(tags, "urban_core") ? "Central Station" : "Train Station",
        minCount: 1,
    },
    {
        key: "bus_stop",
        label: "Bus Stop",

        minDistance: 2,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "urban_edge",
            "industrial",
            "commercial",
            "residential",
            "rural",
            "parkland",
        ],
        weight: 6,
        props: { icon: "🚌", category: "transport" },
        nameFn: ({ index }) => seqName("Bus Stop", { index }),
        minCount: 1,
    },
    {
        key: "boulevard",
        label: "Boulevard",

        minDistance: 6,
        allowedTags: ["urban_core", "urban_center", "urban", "commercial"],
        weight: 1,
        props: { icon: "🛣️", category: "civic" },
        nameFn: ({ rnd }) =>
            `${pick(
                [
                    "King",
                    "Queen",
                    "Liberty",
                    "Harbor",
                    "Market",
                    "Union",
                    "Elm",
                ],
                rnd
            )} Boulevard`,
        minCount: 1,
    },
    {
        key: "parking_garage",
        label: "Parking Garage",

        minDistance: 4,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "commercial",
            "suburban_hub",
        ],
        weight: 3,
        props: { icon: "🅿️", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Central", "Market", "Harbor", "Union"],
                rnd
            )} Parking ${pick(["Garage", "Lot"], rnd)}`,
        minCount: 1,
    },
    {
        key: "gas_station",
        label: "Gas Station",

        minDistance: 5,
        allowedTags: [
            "urban_edge",
            "industrial",
            "urban",
            "suburban",
            "suburban_hub",
            "rural",
            "commercial",
            "coastal",
        ],
        weight: 2,
        props: { icon: "⛽", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(["FuelStop", "Highway", "Harbor"], rnd)} Station`,
        minCount: 1,
    },
    {
        key: "bank",
        label: "Bank",

        minDistance: 6,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "suburban_hub",
            "commercial",
            "residential",
        ],
        weight: 2,
        props: { icon: "🏦", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(["First National", "Union", "Harborview"], rnd)} Bank`,
        minCount: 1,
    },
    {
        key: "post_office",
        label: "Post Office",

        minDistance: 6,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "suburban_hub",
            "residential",
            "rural",
        ],
        weight: 2,
        props: { icon: "📮", category: "service" },
        nameFn: ({ tags }) =>
            has(tags, "urban_core") ? "Central Post Office" : "Post Office",
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
            "urban_core",
            "urban",
            "suburban",
            "urban_edge",
            "parkland",
            "residential",
            "rural",
        ],
        weight: 3,
        props: { icon: "🌳", category: "leisure" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "urban_core")
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
            "urban_edge",
            "urban",
            "suburban",
            "commercial",
            "suburban_hub",
        ],
        weight: 1,
        props: { icon: "🏟️", category: "leisure" },
        nameFn: ({ rnd }) =>
            `${pick(["Riverview", "Summit", "Harbor", "Union"], rnd)} Stadium`,
        minCount: 1,
    },
    {
        key: "theater",
        label: "Theater",

        minDistance: 6,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "historic",
            "commercial",
        ],
        weight: 1,
        props: { icon: "🎭", category: "culture" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "historic")
                ? `${pick(["Imperial", "Bijou", "Majestic"], rnd)} Theater`
                : "Theater",
        minCount: 1,
    },
    {
        key: "cinema",
        label: "Cinema",

        minDistance: 5,
        allowedTags: [
            "urban_center",
            "urban",
            "suburban",
            "commercial",
            "suburban_hub",
        ],
        weight: 2,
        props: { icon: "🎬", category: "culture" },
        nameFn: ({ rnd }) =>
            `${pick(["Arcadia", "Odeon", "Vista", "Galaxy"], rnd)} Cinema`,
        minCount: 1,
    },
    {
        key: "museum",
        label: "Museum",

        minDistance: 12,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "historic",
            "tourism",
        ],
        weight: 1,
        props: { icon: "🏛️", category: "culture" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "coastal")
                ? `${pick(["Maritime", "Harbor"], rnd)} Museum`
                : `${pick(["City", "Regional"], rnd)} Museum`,
        minCount: 1,
    },
    {
        key: "art_gallery",
        label: "Art Gallery",

        minDistance: 8,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "historic",
            "tourism",
            "education",
            "commercial",
        ],
        weight: 1,
        props: { icon: "🖼️", category: "culture" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "historic") || has(tags, "tourism")
                ? `${pick(["Old Town", "City"], rnd)} Gallery`
                : `${pick(["Modern", "Riverside"], rnd)} Gallery`,
        minCount: 1,
    },
    {
        key: "library",
        label: "Library",

        minDistance: 6,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "education",
            "residential",
        ],
        weight: 2,
        props: { icon: "📚", category: "culture" },
        nameFn: ({ rnd }) =>
            `${pick(["Central", "North", "West", "Riverside"], rnd)} Library`,
        minCount: 1,
    },
    {
        key: "club",
        label: "Club",

        minDistance: 5,
        allowedTags: ["urban_core", "urban_center", "urban", "commercial"],
        weight: 2,
        props: { icon: "🎧", category: "leisure" },
        nameFn: ({ rnd }) =>
            `${pick(["Neon", "Pulse", "Echo", "Velvet"], rnd)} Club`,
        minCount: 1,
    },

    {
        key: "playground",
        label: "Playground",

        minDistance: 2,
        allowedTags: ["residential", "parkland", "urban", "suburban", "rural"],
        weight: 3,
        props: { icon: "👧", category: "leisure" },
        nameFn: ({ rnd }) =>
            `${pick(["Maple", "Riverside", "Elm", "Sunset"], rnd)} Playground`,
        minCount: 1,
    },

    {
        key: "community_center",
        label: "Community Center",

        minDistance: 6,
        allowedTags: [
            "residential",
            "urban",
            "suburban",
            "urban_edge",
            "suburban_hub",
        ],
        weight: 2,
        props: { icon: "🏠", category: "civic" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Riverside", "Northside", "Docktown", "Union"],
                rnd
            )} Community Center`,
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
            "urban_core",
            "urban_center",
            "urban",
            "commercial",
            "historic",
        ],
        weight: 2,
        props: { icon: "🧺", category: "commerce" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "historic")
                ? `${pick(["Old", "Heritage"], rnd)} Market`
                : `${pick(["Central", "City"], rnd)} Market`,
        minCount: 1,
    },
    {
        key: "flea_market",
        label: "Flea Market",

        minDistance: 12,
        allowedTags: [
            "urban_edge",
            "suburban",
            "suburban_hub",
            "parkland",
            "rural",
            "historic",
            "tourism",
            "commercial",
            "industrial",
        ],
        weight: 1,
        props: { icon: "🧺", category: "commerce" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "historic")
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
            "commercial",
            "suburban",
            "suburban_hub",
            "urban_edge",
            "urban",
        ],
        weight: 1,
        props: { icon: "🏬", category: "commerce" },
        nameFn: ({ rnd }) =>
            `${pick(["North", "Harbor", "Grand", "Sunset"], rnd)} Mall`,
        minCount: 1,
    },
    {
        key: "corner_store",
        label: "Corner Store",

        minDistance: 2,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "residential",
            "commercial",
        ],
        weight: 4,
        props: { icon: "🏪", category: "commerce" },
        nameFn: ({ rnd }) =>
            `${pick(["QuickMart", "Stop&Shop", "MiniMart"], rnd)}`,
        minCount: 1,
    },
    {
        key: "restaurant",
        label: "Restaurant",

        minDistance: 2,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "commercial",
            "historic",
            "coastal",
            "suburban_hub",
            "residential",
        ],
        weight: 4,
        props: { icon: "🍽️", category: "food" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Olive Court", "Dockside Grill", "Sunset Table", "Elm Bistro"],
                rnd
            )}`,
        minCount: 1,
    },
    {
        key: "pizzeria",
        label: "Pizzeria",

        minDistance: 2,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "commercial",
            "residential",
        ],
        weight: 3,
        props: { icon: "🍕", category: "food" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Tony's", "Mama Mia", "Brick Oven", "Harbor Slice"],
                rnd
            )} Pizzeria`,
        minCount: 1,
    },
    {
        key: "cafe",
        label: "Cafe",

        minDistance: 2,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "education",
            "commercial",
            "residential",
        ],
        weight: 5,
        props: { icon: "☕", category: "food" },
        nameFn: ({ rnd, tags }) =>
            `${pick(
                has(tags, "education")
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
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "commercial",
        ],
        weight: 4,
        props: { icon: "🍺", category: "food" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["The Anchor", "The Fox", "The Lantern", "The Brass Rail"],
                rnd
            )}`,
        minCount: 1,
    },

    {
        key: "bakery",
        label: "Bakery",

        minDistance: 2,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "residential",
            "commercial",
            "rural",
            "historic",
        ],
        weight: 3,
        props: { icon: "🥐", category: "food" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "historic")
                ? `${pick(["Old Town", "Heritage"], rnd)} Bakery`
                : `${pick(["Sunrise", "Maple", "Riverside"], rnd)} Bakery`,
        minCount: 1,
    },
    {
        key: "butcher",
        label: "Butcher's",

        minDistance: 3,
        allowedTags: [
            "urban_center",
            "urban",
            "suburban",
            "residential",
            "commercial",
            "rural",
            "historic",
        ],
        weight: 2,
        props: { icon: "🥩", category: "food" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "historic")
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
            "urban_center",
            "urban",
            "suburban",
            "urban_edge",
            "residential",
            "rural",
        ],
        weight: 2,
        props: { icon: "🏥", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(["Riverside", "Northside", "Elm"], rnd)} Clinic`,
        minCount: 1,
    },
    {
        key: "hospital",
        label: "Hospital",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "urban_edge",
            "suburban",
            "suburban_hub",
        ],
        weight: 1,
        props: { icon: "🏥", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(["St. Genevieve", "General", "Memorial"], rnd)} Hospital`,
        minCount: 1,
    },
    {
        key: "pharmacy",
        label: "Pharmacy",

        minDistance: 3,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "suburban_hub",
            "residential",
            "commercial",
        ],
        weight: 3,
        props: { icon: "💊", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(["City", "Riverside", "Elm", "Union"], rnd)} Pharmacy`,
        minCount: 1,
    },
    {
        key: "doctors_office",
        label: "Doctor's Office",

        minDistance: 4,
        allowedTags: [
            "urban_center",
            "urban",
            "suburban",
            "suburban_hub",
            "residential",
            "rural",
            "parkland",
        ],
        weight: 2,
        props: { icon: "🩺", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(["Riverside", "Elm Street", "Maple"], rnd)} Medical`,
        minCount: 1,
    },
    {
        key: "gym",
        label: "Gym",

        minDistance: 3,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "residential",
            "commercial",
        ],
        weight: 2,
        props: { icon: "🏋️", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(["Ironworks", "Pulse", "Forge", "AnyGym"], rnd)} Gym`,
        minCount: 1,
    },
    {
        key: "swimming_pool",
        label: "Swimming Pool",

        minDistance: 8,
        allowedTags: [
            "urban_center",
            "urban",
            "suburban",
            "parkland",
            "residential",
            "education",
        ],
        weight: 2,
        props: { icon: "🏊", category: "leisure" },
        nameFn: ({ rnd }) =>
            `${pick(["Community", "Northside", "Riverside"], rnd)} Pool`,
        minCount: 1,
    },
    {
        key: "salon",
        label: "Salon",

        minDistance: 2,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "residential",
            "commercial",
        ],
        weight: 3,
        props: { icon: "💇", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(["Velvet", "Luxe", "Glow", "ClipJoint"], rnd)} Salon`,
        minCount: 1,
    },
    {
        key: "church",
        label: "Church",

        minDistance: 12,
        allowedTags: [
            "urban_center",
            "urban",
            "suburban",
            "historic",
            "residential",
            "rural",
        ],
        weight: 1,
        props: { icon: "⛪", category: "service" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["St. Genevieve", "All Saints", "Trinity", "Grace"],
                rnd
            )} Church`,
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
            "urban",
            "suburban",
            "urban_edge",
            "residential",
            "rural",
        ],
        weight: 2,
        props: { icon: "🏫", category: "education" },
        nameFn: ({ rnd }) =>
            `${pick(["Elm Primary School", "Maple Primary"], rnd)}`,
        minCount: 1,
    },
    {
        key: "middle_school",
        label: "Middle School",

        minDistance: 10,
        allowedTags: [
            "urban",
            "suburban",
            "urban_edge",
            "residential",
            "rural",
        ],
        weight: 2,
        props: { icon: "🏫", category: "education" },
        nameFn: ({ rnd }) =>
            `Middle School no. ${pick([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)}`,
        minCount: 1,
    },
    {
        key: "high_school",
        label: "High School",

        minDistance: 16,
        allowedTags: [
            "urban",
            "suburban",
            "urban_edge",
            "suburban_hub",
            "residential",
        ],
        weight: 1,
        props: { icon: "🏫", category: "education" },
        nameFn: ({ rnd }) =>
            `${pick(
                [
                    "St. Genevieve's High School",
                    "Riverside High",
                    "Docktown High",
                ],
                rnd
            )}`,
        minCount: 1,
    },
    {
        key: "university",
        label: "University",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [
            "education",
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "suburban_hub",
            "dense",
        ],
        weight: 1,
        props: { icon: "🎓", category: "education" },
        nameFn: () => "University of Docktown",
        minCount: 1,
    },
    {
        key: "office_block",
        label: "Office Block",

        minDistance: 4,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "commercial",
            "dense",
        ],
        weight: 3,
        props: { icon: "🏢", category: "commerce" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Union", "Harbor", "Market", "Liberty", "Central"],
                rnd
            )} Office Tower`,
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
            "industrial",
            "urban_edge",
            "suburban",
            "commercial",
            "urban",
        ],
        weight: 2,
        props: { icon: "🔧", category: "industry" },
        nameFn: ({ rnd }) =>
            `${pick(
                [
                    "Ace Auto",
                    "Riverside Motors",
                    "Dockside Auto",
                    "Union Garage",
                ],
                rnd
            )}`,
        minCount: 1,
    },
    {
        key: "police_station",
        label: "Police Station",

        minDistance: 6,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "commercial",
            "residential",
            "suburban_hub",
            "rural",
        ],
        weight: 1,
        props: { icon: "🚓", category: "safety" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["1st Precinct", "Central Precinct", "Harbor Precinct"],
                rnd
            )}`,
        minCount: 1,
    },
    {
        key: "fire_station",
        label: "Fire Department",

        minDistance: 6,
        allowedTags: [
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "urban_edge",
            "industrial",
            "rural",
        ],
        weight: 1,
        props: { icon: "🚒", category: "safety" },
        nameFn: ({ rnd }) =>
            `${pick(
                [
                    "Fire Station 1",
                    "Fire Marshall Station",
                    "Volunteer Fire Department",
                ],
                rnd
            )}`,
        minCount: 1,
    },

    {
        key: "warehouse",
        label: "Warehouse",

        minDistance: 4,
        allowedTags: ["industrial", "urban_edge", "suburban", "coastal"],
        weight: 3,
        props: { icon: "📦", category: "industry" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "coastal")
                ? `${pick(["Harbor", "Dockside", "Pier"], rnd)} Warehouse`
                : `${pick(["Union", "Riverside", "North"], rnd)} Warehouse`,
        minCount: 1,
    },

    {
        key: "logistics_depot",
        label: "Logistics Depot",

        minDistance: 8,
        allowedTags: ["industrial", "urban_edge", "suburban"],
        weight: 1,
        props: { icon: "🚚", category: "industry" },
        nameFn: ({ rnd }) =>
            `${pick(
                ["TransGlobal", "ExpressLink", "Docktown Freight"],
                rnd
            )} Depot`,
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
            "urban_core",
            "urban_center",
            "urban",
            "suburban",
            "residential",
            "dense",
        ],
        weight: 3,
        props: { icon: "🏢", category: "housing", multi: true },
        nameFn: ({ rnd }) =>
            `${pick(["Riverside", "Maple", "Union", "Elm"], rnd)} Apartments`,
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
            "coastal",
            "urban_edge",
            "industrial",
            "commercial",
            "tourism",
        ],
        weight: 2,
        props: { icon: "🛳️", category: "commerce" },
        nameFn: ({ rnd, tags }) =>
            has(tags, "tourism")
                ? `${pick(["Boardwalk", "Sunset", "Harborfront"], rnd)} Pier`
                : `${pick(["Pier 3", "Pier 7", "Cargo Pier"], rnd)}`,
        minCount: 1,
    },

    {
        key: "fish_market",
        label: "Fish Market",

        minDistance: 4,
        allowedTags: ["coastal", "urban_edge"],
        weight: 2,
        props: { icon: "🐟", category: "commerce" },
        nameFn: ({ tags }) =>
            has(tags, "coastal") ? "Harbor Fish Market" : "Fish Market",
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

function hoursWeekdays({
    from = "08:00",
    to = "16:00",
    saturday,
    sunday,
} = {}) {
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
};

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
