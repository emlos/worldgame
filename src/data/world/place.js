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
    crime: "crime",
    supernatural: "supernatural",
    nsfw: "***",
};

export const PLACE_REGISTRY = [
    {
        id: "player_home",
        label: "Player Home",
        props: { icon: "🏠", category: [PLACE_TAGS.housing] },
        nameFn: ({}) => `Your Home`,
        minCount: 1,
        maxCount: 1,
        weight: 999,
    },
    // ────────────────────────────
    // CIVIC / TRANSPORT
    // ────────────────────────────
    {
        key: "town_square",
        label: "Town Square",
        maxCount: 1,
        minDistance: 99,
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.urban_center, LOCATION_TAGS.historic],
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
        props: { icon: "🚔", category: [PLACE_TAGS.safety, PLACE_TAGS.civic], ages: { min: 16 } },
        nameFn: ({ rnd }) => `${pick(["City", "County"], rnd)} Jail`,
        minCount: 1,
    },
    {
        key: "court",
        label: "Court",
        maxCount: 3,
        minDistance: 20,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.wealthy,
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
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.urban_core,
        ],
        weight: 1,
        props: { icon: "🚉", category: [PLACE_TAGS.transport] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.urban) ? "Central Station" : "Train Station",
        minCount: 1,
    },
    {
        key: "bus_stop",
        label: "Bus Stop",
        minDistance: 3,
        allowedTags: [
            ...Object.values(LOCATION_TAGS), //bus stops can be everywhere
        ],
        weight: 6,
        props: {
            icon: "🚌",
            category: [PLACE_TAGS.transport],
            travelTimeMult: 0.4, //how much faster travel is when using bus
            busFrequencyDay: 15, //how often buses arrive (in minutes)
            busFrequencyNight: 35,
        },
        nameFn: ({ index }) => seqName("Bus Stop", { index }),
        minCount: 1,
        maxCount: Infinity,
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
            LOCATION_TAGS.historic,
            LOCATION_TAGS.coastal,
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
            LOCATION_TAGS.wealthy,
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
            LOCATION_TAGS.coastal,
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
            LOCATION_TAGS.education, // College stadiums
        ],
        weight: 1,
        props: { icon: "🏟️", category: [PLACE_TAGS.leisure, PLACE_TAGS.culture] },
        nameFn: ({ tags, rnd }) =>
            `${
                has(tags, LOCATION_TAGS.education)
                    ? "College Stadium"
                    : pick(["Riverview", "Summit", "Harbor", "Union"], rnd)
            } Stadium`,
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
        props: { icon: "🎭", category: [PLACE_TAGS.culture, PLACE_TAGS.supernatural] },
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
            LOCATION_TAGS.education,
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
            LOCATION_TAGS.wealthy,
        ],
        weight: 1,
        props: { icon: "🖼️", category: [PLACE_TAGS.culture, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.wealthy)
                ? "Avant-Garde Art Gallery"
                : has(tags, LOCATION_TAGS.historic) || has(tags, LOCATION_TAGS.tourism)
                ? `${pick(["Old Town", "City", "Olt Millhouse"], rnd)} Gallery`
                : `${pick(["Modern", "Riverside", "Public"], rnd)} Gallery`,
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
            LOCATION_TAGS.rural,
            LOCATION_TAGS.wealthy,
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
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
        ],
        weight: 2,
        props: { icon: "🎧", category: [PLACE_TAGS.leisure, PLACE_TAGS.nightlife] },
        nameFn: ({ rnd }) => `${pick(["Neon", "Pulse", "Echo", "Velvet"], rnd)} Club`,
        minCount: 1,
    },

    {
        key: "art_center",
        label: "Art Center",
        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.residential,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.rural,
        ],
        weight: 3,
        props: { icon: "🎨", category: [PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["Maple", "Riverside", "Elm", "Sunset"], rnd)} Art Center`,
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
            LOCATION_TAGS.rural,
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
            LOCATION_TAGS.tourism,
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
        minDistance: 50,
        allowedTags: [
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.wealthy,
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
            LOCATION_TAGS.rural,
            LOCATION_TAGS.coastal,
        ],
        weight: 4,
        props: { icon: "🏪", category: [PLACE_TAGS.commerce] },
        nameFn: ({ rnd }) => `${pick(["QuickMart", "Stop&Shop", "MiniMart"], rnd)}`,
        minCount: 1,
        maxCount: 4,
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
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.tourism,
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
            LOCATION_TAGS.rural,
            LOCATION_TAGS.coastal,
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
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
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
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.wealthy,
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
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.wealthy,
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
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.education,
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
            LOCATION_TAGS.rural,
            LOCATION_TAGS.wealthy,
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
            LOCATION_TAGS.wealthy,
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
        props: {
            icon: "⛪",
            category: [
                PLACE_TAGS.service,
                PLACE_TAGS.civic,
                PLACE_TAGS.history,
                PLACE_TAGS.culture,
                PLACE_TAGS.supernatural,
            ],
        },
        nameFn: ({ rnd }) =>
            `${pick(["St. Genevieve", "All Saints", "Trinity", "Grace"], rnd)} Church`,
        minCount: 1,
    },

    {
        key: "cemetery",
        label: "Cemetery",
        maxCount: 1,
        minDistance: 20,
        allowedTags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.historic,
        ],
        weight: 1,
        props: {
            icon: "🪦",
            category: [PLACE_TAGS.history, PLACE_TAGS.civic, PLACE_TAGS.supernatural],
        },
        nameFn: ({ rnd }) => `${pick(["Oakwood", "Riverside", "Maplewood"], rnd)} Cemetery`,
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
            LOCATION_TAGS.rural,
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
            LOCATION_TAGS.commercial,
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
        nameFn: ({ rnd }) => `${pick(["Lone", "Maple", "Luxurious", "Suburban"], rnd)} House Row`,
        minCount: 1,
    },
    {
        key: "shady_building",
        label: "Shady Building",
        minDistance: 12,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.coastal,
        ],
        weight: 1,
        props: {
            icon: "🏚️",
            category: [PLACE_TAGS.housing, PLACE_TAGS.crime, PLACE_TAGS.supernatural],
            multi: true,
        },
        nameFn: ({ rnd }) =>
            `${pick(["Abandoned", "Derelict", "Vacant", "Shady", "Suspicious"], rnd)} Building`,
        minCount: 1,
    },
    {
        key: "motel",
        label: "Motel",
        minDistance: 8,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.rural,
        ],
        weight: 2,
        props: { icon: "🏨", category: [PLACE_TAGS.housing, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.tourism)
                ? `${pick(["Seaside", "Harborview", "Sunset"], rnd)} Motel`
                : `${pick(["Budget Inn", "Travel Lodge", "Roadside"], rnd)}`,
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
    {
        key: "harbor",
        label: "Harbor",
        minDistance: 10,
        allowedTags: [LOCATION_TAGS.coastal],
        weight: 1,
        props: { icon: "⚓", category: [PLACE_TAGS.industry, PLACE_TAGS.transport] },
        nameFn: () => "Docktown Harbor",
        minCount: 1,
    },

    // ────────────────────────────
    // CRIME
    // ────────────────────────────
    {
        key: "smugglers_den",
        label: "Smuggler's Den",
        minDistance: 15,
        allowedTags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.rural,
        ],
        weight: 1,
        props: { icon: "🕵️", category: [PLACE_TAGS.crime, PLACE_TAGS.industry] },
        nameFn: ({ rnd }) => `${pick(["Hidden", "Secret", "Underground"], rnd)} Den`,
        minCount: 1,
    },
    {
        key: "night_market",
        label: "Night Market",
        minDistance: 12,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_center,
        ],
        weight: 1,
        props: {
            icon: "🌙",
            category: [PLACE_TAGS.crime, PLACE_TAGS.leisure, PLACE_TAGS.commerce],
        },
        nameFn: ({ rnd }) => `${pick(["Shadow", "Midnight", "Black"], rnd)} Market`,
        minCount: 1,
    },
    {
        key: "abandoned_parking_lot",
        label: "Abandoned Parking Lot",
        minDistance: 10,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 1,
        props: { icon: "🚧", category: [PLACE_TAGS.crime] },
        nameFn: ({ rnd }) => `${pick(["Desolate", "Forgotten", "Vacant"], rnd)} Parking Lot`,
        minCount: 1,
    },
    {
        key: "alleyway",
        label: "Alleyway",
        minDistance: 2,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.wealthy,
        ],
        weight: 1,
        props: { icon: "🚷", category: [PLACE_TAGS.crime] },
        nameFn: ({ tags, rnd }) =>
            !has(tags, LOCATION_TAGS.wealthy)
                ? `${pick(["Dark", "Narrow", "Hidden", "Dirty"], rnd)} Alleyway`
                : `Secluded Alleyway`,
        minCount: 4,
    },

    // ────────────────────────────
    // ***
    // ────────────────────────────

    {
        key: "brothel",
        label: "Brothel",
        minDistance: 10,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.tourism,
        ],
        weight: 1,
        props: {
            icon: "💋",
            category: [PLACE_TAGS.crime, PLACE_TAGS.nsfw],
            ages: { min: 18 }, //TODO: add min/max age limit to certain locations
        },
        nameFn: ({ rnd }) =>
            `${
                rnd() > 0.5
                    ? pick(["Satis-Factory", "Roxanne's", "Harem", "The Red Lantern"], rnd)
                    : `${pick(
                          ["Black Rose", "Bella's", "Love", "Paradise", "Angel's"],
                          rnd
                      )} ${pick(
                          [
                              "Gentleman's Club",
                              "Sanctuary",
                              "Cathouse",
                              "Pleasure House",
                              "Sensual Retreat",
                          ],
                          rnd
                      )}`
            }`,
        minCount: 1,
    },

    {
        key: "strip_club",
        label: "Strip Club",
        minDistance: 10,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.tourism,
        ],
        weight: 1,
        props: { icon: "👙", category: [PLACE_TAGS.crime, PLACE_TAGS.nsfw] },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Class Act Club", "Essence", "Sleazy Susie's", "The Man Cave", "Liberte Club"],
                rnd
            )}`,
        minCount: 1,
    },

    {
        key: "adult_store",
        label: "Adult Store",
        minDistance: 5,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
        ],
        weight: 2,
        props: {
            icon: "🔞",
            category: [PLACE_TAGS.commerce, PLACE_TAGS.nsfw],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${pick(["Pleasure Chest", "Cupid's Arrow", "Midnight Secrets", "The Red Room"], rnd)}`,
        minCount: 1,
    },
    {
        key: "love_hotel",
        label: "Love Hotel",
        minDistance: 8,
        allowedTags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
        ],
        weight: 2,
        props: {
            icon: "🏩",
            category: [PLACE_TAGS.housing, PLACE_TAGS.service, PLACE_TAGS.nsfw],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${pick(["Pink Paradise", "Hourly Haven", "Romance Inn", "Secret Stay"], rnd)}`,
        minCount: 1,
    },
    {
        key: "dungeon_club",
        label: "Fetish Club",
        maxCount: 1,
        minDistance: 15,
        allowedTags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_core, // Basements
            LOCATION_TAGS.urban_edge,
        ],
        weight: 1,
        props: {
            icon: "⛓️",
            category: [PLACE_TAGS.nightlife, PLACE_TAGS.nsfw, PLACE_TAGS.community],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) => `${pick(["The Cage", "Sanctum", "Chains", "The Cellar"], rnd)}`,
        minCount: 1,
    },
    {
        key: "massage_parlor",
        label: "Massage Parlor",
        minDistance: 5,
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.industrial,
        ],
        weight: 2,
        props: {
            icon: "💆",
            // Often operates in a grey area
            category: [PLACE_TAGS.service, PLACE_TAGS.nsfw, PLACE_TAGS.crime],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${pick(["Happy Endings", "Lotus Touch", "Silk Road", "Relaxation Station"], rnd)}`,
        minCount: 1,
    },
    {
        key: "escort_agency",
        label: "Escort Agency",
        maxCount: 1,
        minDistance: 10,
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.wealthy, LOCATION_TAGS.commercial],
        weight: 1,
        props: {
            icon: "💎",
            category: [PLACE_TAGS.service, PLACE_TAGS.nsfw, PLACE_TAGS.luxury],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${pick(["Elite Companions", "Velvet Touch", "Sapphire Escorts", "Gilded Rose"], rnd)}`,
        minCount: 1,
    },
    {
        key: "bathhouse",
        label: "Bathhouse",
        minDistance: 8,
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.urban, LOCATION_TAGS.historic],
        weight: 1,
        props: {
            icon: "🧖",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.nsfw, PLACE_TAGS.community],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) => `${pick(["Steamworks", "The Roman", "Oasis", "Midnight Steam"], rnd)}`,
        minCount: 1,
    },
    {
        key: "nude_beach",
        label: "Secluded Beach",
        maxCount: 1,
        minDistance: 20,
        allowedTags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.rural, // Hard to get to
            LOCATION_TAGS.parkland,
        ],
        weight: 1,
        props: {
            icon: "🏖️",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.nsfw, PLACE_TAGS.nature],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) => `${pick(["Bare Cove", "Moon Bay", "Hidden Sands"], rnd)}`,
        minCount: 1,
    },
    {
        key: "glory_hole",
        label: "Public Restroom",
        minDistance: 5,
        allowedTags: [
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.transport, // Bus/Train stations
            LOCATION_TAGS.industrial,
        ],
        weight: 2,
        props: {
            icon: "🚽",
            category: [PLACE_TAGS.nsfw, PLACE_TAGS.crime, PLACE_TAGS.civic],
        },
        nameFn: ({ rnd }) => `${pick(["Park", "Station", "Rest Stop"], rnd)} Restroom`,
        minCount: 1,
    },

    // ────────────────────────────
    // LUXURY / HIGH-END
    // ────────────────────────────
    {
        key: "jewelry_store",
        label: "Jewelry Store",
        minDistance: 4,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
        ],
        weight: 2,
        props: { icon: "💎", category: [PLACE_TAGS.commerce, PLACE_TAGS.luxury] },
        nameFn: ({ rnd }) => `${pick(["Diamond", "Gold", "Crystal", "Royal"], rnd)} Jewelers`,
        minCount: 1,
    },
    {
        key: "country_club",
        label: "Country Club",
        maxCount: 1,
        minDistance: 20,
        allowedTags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.rural, // Estates on the edge
            LOCATION_TAGS.parkland,
        ],
        weight: 2,
        props: {
            icon: "⛳",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.luxury, PLACE_TAGS.food],
        },
        nameFn: ({ rnd }) =>
            `${pick(["Green Valley", "Oakhaven", "Summit", "Royal Pines"], rnd)} Country Club`,
        minCount: 1,
    },
    {
        key: "yacht_club",
        label: "Yacht Club",
        maxCount: 1,
        minDistance: 10,
        allowedTags: [LOCATION_TAGS.coastal, LOCATION_TAGS.wealthy, LOCATION_TAGS.tourism],
        weight: 2,
        props: {
            icon: "🛥️",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.luxury, PLACE_TAGS.nightlife],
        },
        nameFn: ({ rnd }) =>
            `${pick(["Harbor View", "Blue Horizon", "Royal", "Seaside"], rnd)} Yacht Club`,
        minCount: 1,
    },
    {
        key: "fine_dining",
        label: "Fine Dining Restaurant",
        minDistance: 5,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
        ],
        weight: 2,
        props: {
            icon: "🍾",
            category: [PLACE_TAGS.food, PLACE_TAGS.luxury, PLACE_TAGS.nightlife],
        },
        nameFn: ({ rnd }) =>
            `${pick(["L'Etoile", "The Gilded Fork", "Sapphire", "Velvet & Vine"], rnd)}`,
        minCount: 1,
    },
    {
        key: "casino",
        label: "Casino",
        maxCount: 1,
        minDistance: 15,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.wealthy,
        ],
        weight: 1,
        props: {
            icon: "🎰",
            category: [
                PLACE_TAGS.leisure,
                PLACE_TAGS.nightlife,
                PLACE_TAGS.luxury,
                PLACE_TAGS.crime,
            ],
        },
        nameFn: ({ rnd }) =>
            `${pick(["Royal Flush", "Golden Chip", "High Roller", "The Palace"], rnd)} Casino`,
        minCount: 1,
    },
    {
        key: "luxury_hotel",
        label: "Luxury Hotel",
        minDistance: 10,
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
        ],
        weight: 2,
        props: {
            icon: "🛎️",
            category: [PLACE_TAGS.housing, PLACE_TAGS.service, PLACE_TAGS.luxury],
        },
        nameFn: ({ rnd }) => `${pick(["Grand", "Imperial", "Ritz", "Majestic"], rnd)} Hotel`,
        minCount: 1,
    },
    {
        key: "designer_boutique",
        label: "Designer Boutique",
        minDistance: 4,
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.wealthy, LOCATION_TAGS.tourism],
        weight: 2,
        props: {
            icon: "👜",
            category: [PLACE_TAGS.commerce, PLACE_TAGS.luxury],
        },
        nameFn: ({ rnd }) => `${pick(["Vogue", "Chic", "Elegance", "Mode"], rnd)} Boutique`,
        minCount: 1,
    },
    {
        key: "spa_resort",
        label: "Day Spa",
        minDistance: 8,
        allowedTags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.tourism,
        ],
        weight: 2,
        props: {
            icon: "🧖‍♀️",
            category: [PLACE_TAGS.service, PLACE_TAGS.luxury, PLACE_TAGS.leisure],
        },
        nameFn: ({ rnd }) => `${pick(["Serenity", "Tranquil", "Eden", "Lotus"], rnd)} Spa`,
        minCount: 1,
    },
    {
        key: "vineyard",
        label: "Vineyard",
        maxCount: 2,
        minDistance: 20,
        allowedTags: [LOCATION_TAGS.rural, LOCATION_TAGS.wealthy, LOCATION_TAGS.tourism],
        weight: 2,
        props: {
            icon: "🍇",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.food, PLACE_TAGS.luxury, PLACE_TAGS.industry],
        },
        nameFn: ({ rnd }) => `${pick(["Sunset", "Valley", "River", "Golden"], rnd)} Estate Winery`,
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
    crime: hoursAllDay(),
    nsfw: hoursWeekdays({
        //TODO: make sure the midnight wrapareound works
        from: "23:00",
        to: "06:00",
        saturday: { from: "22:00", to: "07:00" },
        sunday: { from: "23:00", to: "07:00" },
    }),
};

export const DEFAULT_OPENING_HOURS = hoursAllDay();

// Per-place overrides
const SCHOOL_HOURS = hoursWeekdays({ from: "08:00", to: "16:00" });

export const DEFAULT_OPENING_HOURS_BY_KEY = {
    // 24/7 LOCATIONS
    park: hoursAllDay(),
    town_square: hoursAllDay(),
    bus_stop: hoursAllDay(),
    train_station: hoursAllDay(),
    boulevard: hoursAllDay(),
    parking_garage: hoursAllDay(),
    gas_station: hoursAllDay(),
    hospital: hoursAllDay(),
    police_station: hoursAllDay(),
    fire_station: hoursAllDay(),
    jail: hoursAllDay(),
    motel: hoursAllDay(),
    pier: hoursAllDay(),
    alleyway: hoursAllDay(),
    abandoned_parking_lot: hoursAllDay(),

    // CIVIC & SERVICES (Standard Business Hours)
    civil_office: hoursWeekdays({ from: "09:00", to: "17:00" }),
    court: hoursWeekdays({ from: "09:00", to: "16:30" }),
    bank: hoursWeekdays({
        from: "09:00",
        to: "16:00",
        saturday: { from: "09:00", to: "13:00" },
    }),
    post_office: hoursWeekdays({
        from: "08:30",
        to: "17:00",
        saturday: { from: "09:00", to: "13:00" },
    }),
    office_block: hoursWeekdays({ from: "07:00", to: "19:00" }), // Building access
    mechanic: hoursWeekdays({
        from: "08:00",
        to: "18:00",
        saturday: { from: "09:00", to: "14:00" },
    }),

    // HEALTH & SELF CARE
    clinic: hoursWeekdays({ from: "08:00", to: "18:00" }),
    doctors_office: hoursWeekdays({ from: "09:00", to: "17:00" }),
    pharmacy: hoursEveryDay("08:00", "21:00"),
    gym: hoursEveryDay("05:00", "23:00"), // Early open, late close
    salon: hoursWeekdays({
        from: "10:00",
        to: "19:00",
        saturday: { from: "09:00", to: "17:00" },
    }),

    // COMMERCE & FOOD
    mall: hoursEveryDay("10:00", "21:00"),
    corner_store: hoursEveryDay("07:00", "23:00"), // Convenience hours
    market: hoursEveryDay("07:00", "15:00"), // Morning farmers market feel
    fish_market: hoursEveryDay("05:00", "13:00"), // Early catch
    bakery: hoursEveryDay("06:00", "16:00"), // Early riser
    cafe: hoursEveryDay("07:00", "19:00"),
    butcher: hoursWeekdays({
        from: "08:00",
        to: "18:00",
        saturday: { from: "08:00", to: "16:00" },
    }),
    restaurant: hoursEveryDay("11:00", "23:00"),
    pizzeria: hoursEveryDay("11:00", "23:00"),

    // NIGHTLIFE & LEISURE
    bar: hoursEveryDay("16:00", "02:00"),
    club: hoursEveryDay("21:00", "04:00"),
    strip_club: hoursEveryDay("20:00", "04:00"),
    brothel: hoursEveryDay("18:00", "06:00"),
    night_market: hoursEveryDay("18:00", "02:00"), // Only open at night
    theater: hoursEveryDay("14:00", "23:00"),
    cinema: hoursEveryDay("12:00", "00:00"),

    // CULTURE & COMMUNITY
    library: hoursWeekdays({
        from: "09:00",
        to: "20:00",
        saturday: { from: "10:00", to: "17:00" },
        sunday: { from: "12:00", to: "17:00" },
    }),
    museum: hoursWeekdays({
        from: "10:00",
        to: "18:00",
        saturday: { from: "10:00", to: "18:00" },
        sunday: { from: "10:00", to: "17:00" },
    }), // Usually closed Mondays in real life, but weekdays generic here
    art_gallery: hoursWeekdays({
        from: "11:00",
        to: "19:00",
        saturday: { from: "11:00", to: "20:00" },
        sunday: { from: "12:00", to: "18:00" },
    }),
    church: hoursEveryDay("08:00", "20:00"),
    cemetery: hoursEveryDay("06:00", "20:00"), // Dawn to dusk
    community_center: hoursEveryDay("08:00", "21:00"),

    // SCHOOLS
    primary_school: SCHOOL_HOURS,
    middle_school: SCHOOL_HOURS,
    high_school: SCHOOL_HOURS,
    university: hoursWeekdays({ from: "08:00", to: "22:00" }), // Late classes/library access

    // LUXURY
    jewelry_store: hoursWeekdays({
        from: "10:00",
        to: "18:00",
        saturday: { from: "10:00", to: "17:00" },
    }),
    designer_boutique: hoursWeekdays({
        from: "10:00",
        to: "19:00",
        saturday: { from: "10:00", to: "18:00" },
        sunday: { from: "12:00", to: "17:00" },
    }),
    country_club: hoursEveryDay("06:00", "22:00"), // Early golf, late dinner
    yacht_club: hoursEveryDay("08:00", "23:00"),
    fine_dining: hoursEveryDay("17:00", "23:00"), // Dinner service only usually
    casino: hoursAllDay(), // Casinos rarely close
    luxury_hotel: hoursAllDay(),
    spa_resort: hoursEveryDay("09:00", "20:00"),
    vineyard: hoursWeekdays({
        from: "10:00",
        to: "17:00",
        saturday: { from: "10:00", to: "18:00" },
        sunday: { from: "10:00", to: "16:00" },
    }),

    //NSFW
    adult_store: hoursEveryDay("10:00", "02:00"), // Late night retail
    love_hotel: hoursAllDay(), // 24/7 short stay
    dungeon_club: hoursWeekdays({ 
        from: "21:00", 
        to: "05:00", 
        saturday: { from: "21:00", to: "06:00" }, // Weekend focused
        sunday: { from: "20:00", to: "02:00" }
    }),
    massage_parlor: hoursEveryDay("10:00", "00:00"),
    escort_agency: hoursWeekdays({ from: "10:00", to: "20:00" }), // The office hours (appointments are 24/7)
    bathhouse: hoursAllDay(), // Often 24/7
    nude_beach: hoursEveryDay("06:00", "20:00"), // Daylight mostly, unless...
    glory_hole: hoursAllDay(),
};
