import { DAY_KEYS } from "./time.js";
import { LOCATION_TAGS } from "./location.js";

function pick(arr, rnd) {
    return arr[(rnd() * arr.length) | 0];
}
function has(tags, t) {
    return (tags || []).includes(t);
}
function seqName(base, { index }) {
    return `${base} ${index + 1}`;
}

export const PLACE_DISTRIBUTION_KIND = Object.freeze({
    graphCoverage: "graph-coverage",
});

export function getPlaceInstanceTarget(definition, locationCount) {
    const count = Math.max(0, Math.trunc(Number(locationCount) || 0));
    const distribution = definition?.distribution;
    if (distribution?.kind !== PLACE_DISTRIBUTION_KIND.graphCoverage) return 1;

    const minimum = Math.max(
        1,
        Number(distribution.locationsPerInstance?.min) || 1,
    );
    const maximum = Math.max(
        minimum,
        Number(distribution.locationsPerInstance?.max) || minimum,
    );
    const average = (minimum + maximum) / 2;
    const minimumInstances = Math.max(1, Math.ceil(count / maximum));
    const maximumInstances = Math.max(minimumInstances, Math.ceil(count / minimum));
    return Math.max(
        minimumInstances,
        Math.min(maximumInstances, Math.round(count / average)),
    );
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
    community: "community",
    nature: "nature",
    nsfw: "***",
    luxury: "luxury",
};

export const PLACE_REGISTRY = [
    {
        key: "player_home",
        label: "Player Home",
        props: { icon: "🏠", category: [PLACE_TAGS.housing] },
        nameFn: ({}) => `Your Home`,
    },
    // ────────────────────────────
    // CIVIC / TRANSPORT
    // ────────────────────────────
    {
        key: "town_square",
        label: "Town Square",
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.urban_center, LOCATION_TAGS.historic],
        props: { icon: "🟦", category: [PLACE_TAGS.civic, PLACE_TAGS.leisure, PLACE_TAGS.history] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.historic) ? "Old Town Square" : "Town Square",
    },
    {
        key: "civil_office",
        label: "Civil Office",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
        ],
        props: { icon: "🏛️", category: [PLACE_TAGS.civic, PLACE_TAGS.service] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.urban_core) ? "Downtown Civil Office" : "Civil Office",
    },
    {
        key: "jail",
        label: "Jail",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🚔", category: [PLACE_TAGS.safety, PLACE_TAGS.civic], ages: { min: 16 } },
        nameFn: ({ rnd }) => `${pick(["City", "County"], rnd)} Jail`,
    },
    {
        key: "court",
        label: "Court",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.wealthy,
        ],
        props: { icon: "⚖️", category: [PLACE_TAGS.civic] },
        nameFn: ({ rnd }) => `${pick(["District", "Municipal", "County"], rnd)} Court`,
    },
    {
        key: "train_station",
        label: "Train Station",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.urban_core,
        ],
        props: { icon: "🚉", category: [PLACE_TAGS.transport] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.urban) ? "Central Station" : "Train Station",
    },
    {
        key: "bus_stop",
        label: "Bus Stop",
        distribution: {
            kind: PLACE_DISTRIBUTION_KIND.graphCoverage,
            locationsPerInstance: { min: 3, max: 5 },
            maxGraphDistance: 2,
        },
        allowedTags: [
            ...Object.values(LOCATION_TAGS), //bus stops can be everywhere
        ],
        props: {
            icon: "🚌",
            category: [PLACE_TAGS.transport],
            travelTimeMult: 0.4, //how much faster travel is when using bus
            busCost: 2.5,
            schedule: {
                type: "frequency",
                periods: [
                    { label: "day", from: "06:00", to: "22:00", everyMinutes: 15 },
                    { label: "night", from: "22:00", to: "06:00", everyMinutes: 35 },
                ],
            },
        },
        nameFn: ({ index }) => seqName("Bus Stop", { index }),
    },
    {
        key: "boulevard",
        label: "Boulevard",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.coastal,
        ],
        props: { icon: "🛣️", category: [PLACE_TAGS.civic, PLACE_TAGS.leisure, PLACE_TAGS.culture] },
        nameFn: ({ rnd }) =>
            `${pick(
                ["King", "Queen", "Liberty", "Harbor", "Market", "Union", "Elm"],
                rnd,
            )} Boulevard`,
    },
    {
        key: "parking_garage",
        label: "Parking Garage",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🅿️", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(["Central", "Market", "Harbor", "Union"], rnd)} Parking ${pick(
                ["Garage", "Lot"],
                rnd,
            )}`,
    },
    {
        key: "gas_station",
        label: "Gas Station",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "⛽", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["FuelStop", "Highway", "Harbor"], rnd)} Station`,
    },
    {
        key: "bank",
        label: "Bank",
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
        props: { icon: "🏦", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["First National", "Union", "Harborview"], rnd)} Bank`,
    },
    {
        key: "post_office",
        label: "Post Office",
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
        props: { icon: "📮", category: [PLACE_TAGS.service] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.urban_core) ? "Central Post Office" : "Post Office",
    },

    // ────────────────────────────
    // LEISURE / CULTURE
    // ────────────────────────────
    {
        key: "park",
        label: "Park",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🌳", category: [PLACE_TAGS.leisure, PLACE_TAGS.culture] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.urban_core)
                ? `${pick(["Central", "City", "Common"], rnd)} Park`
                : `${pick(["Maple", "Oak", "Riverside", "West"], rnd)} Park`,
    },
    {
        key: "stadium",
        label: "Stadium",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.education, // College stadiums
        ],
        props: { icon: "🏟️", category: [PLACE_TAGS.leisure, PLACE_TAGS.culture] },
        nameFn: ({ tags, rnd }) =>
            `${
                has(tags, LOCATION_TAGS.education)
                    ? "College Stadium"
                    : pick(["Riverview", "Summit", "Harbor", "Union"], rnd)
            } Stadium`,
    },
    {
        key: "theater",
        label: "Theater",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.commercial,
        ],
        props: { icon: "🎭", category: [PLACE_TAGS.culture, PLACE_TAGS.supernatural] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Imperial", "Bijou", "Majestic"], rnd)} Theater`
                : "Theater",
    },
    {
        key: "cinema",
        label: "Cinema",
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
        ],
        props: { icon: "🎬", category: [PLACE_TAGS.culture] },
        nameFn: ({ rnd }) => `${pick(["Arcadia", "Odeon", "Vista", "Galaxy"], rnd)} Cinema`,
    },
    {
        key: "museum",
        label: "Museum",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.education,
        ],
        props: {
            icon: "🏛️",
            category: [PLACE_TAGS.culture, PLACE_TAGS.education, PLACE_TAGS.history],
        },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.coastal)
                ? `${pick(["Maritime", "Harbor"], rnd)} Museum`
                : `${pick(["City", "Regional"], rnd)} Museum`,
    },
    {
        key: "art_gallery",
        label: "Art Gallery",
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
        props: { icon: "🖼️", category: [PLACE_TAGS.culture, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.wealthy)
                ? "Avant-Garde Art Gallery"
                : has(tags, LOCATION_TAGS.historic) || has(tags, LOCATION_TAGS.tourism)
                  ? `${pick(["Old Town", "City", "Olt Millhouse"], rnd)} Gallery`
                  : `${pick(["Modern", "Riverside", "Public"], rnd)} Gallery`,
    },
    {
        key: "library",
        label: "Library",
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
        props: {
            icon: "📚",
            category: [PLACE_TAGS.culture, PLACE_TAGS.education, PLACE_TAGS.leisure],
        },
        nameFn: ({ rnd }) => `${pick(["Central", "North", "West", "Riverside"], rnd)} Library`,
    },
    {
        key: "club",
        label: "Club",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
        ],
        props: { icon: "🎧", category: [PLACE_TAGS.leisure, PLACE_TAGS.nightlife] },
        nameFn: ({ rnd }) => `${pick(["Neon", "Pulse", "Echo", "Velvet"], rnd)} Club`,
    },

    {
        key: "art_center",
        label: "Art Center",
        allowedTags: [
            LOCATION_TAGS.residential,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.rural,
        ],
        props: { icon: "🎨", category: [PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["Maple", "Riverside", "Elm", "Sunset"], rnd)} Art Center`,
    },

    {
        key: "community_center",
        label: "Community Center",
        allowedTags: [
            LOCATION_TAGS.residential,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🏠", category: [PLACE_TAGS.civic, PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) =>
            `${pick(["Riverside", "Northside", "Docktown", "Union"], rnd)} Community Center`,
    },

    // ────────────────────────────
    // COMMERCE / FOOD & DRINK
    // ────────────────────────────
    {
        key: "market",
        label: "Market",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
        ],
        props: { icon: "🧺", category: [PLACE_TAGS.commerce] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Old", "Heritage"], rnd)} Market`
                : `${pick(["Central", "City"], rnd)} Market`,
    },
    {
        key: "flea_market",
        label: "Flea Market",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🧺", category: [PLACE_TAGS.commerce, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Old Town", "Vintage"], rnd)} Flea Market`
                : `${pick(["Harbor", "Riverside", "Sunday"], rnd)} Flea Market`,
    },
    {
        key: "mall",
        label: "Shopping Mall",
        allowedTags: [
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.wealthy,
        ],
        props: { icon: "🏬", category: [PLACE_TAGS.commerce, PLACE_TAGS.food, PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["North", "Harbor", "Grand", "Sunset"], rnd)} Mall`,
    },
    {
        key: "corner_store",
        label: "Corner Store",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🏪", category: [PLACE_TAGS.commerce] },
        nameFn: ({ rnd }) => `${pick(["QuickMart", "Stop&Shop", "MiniMart"], rnd)}`,
    },
    {
        key: "restaurant",
        label: "Restaurant",
        allowedTags: [
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
        props: { icon: "🍽️", category: [PLACE_TAGS.food, PLACE_TAGS.nightlife] },
        nameFn: ({ rnd }) =>
            `${pick(["Olive Court", "Dockside Grill", "Sunset Table", "Elm Bistro"], rnd)}`,
    },
    {
        key: "pizzeria",
        label: "Pizzeria",
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
        props: { icon: "🍕", category: [PLACE_TAGS.food] },
        nameFn: ({ rnd }) =>
            `${pick(["Tony's", "Mama Mia", "Brick Oven", "Harbor Slice"], rnd)} Pizzeria`,
    },
    {
        key: "cafe",
        label: "Cafe",
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
        props: { icon: "☕", category: [PLACE_TAGS.food, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            `${pick(
                has(tags, LOCATION_TAGS.education)
                    ? ["Campus", "Quad", "Student"]
                    : ["Central", "Riverside", "Market"],
                rnd,
            )} Cafe`,
    },
    {
        key: "bar",
        label: "Bar",
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
            LOCATION_TAGS.poor,
        ],
        props: {
            icon: "🍺",
            category: [PLACE_TAGS.food, PLACE_TAGS.nightlife, PLACE_TAGS.leisure],
        },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.poor)
                ? `${pick(["The Rusty Nail", "The Broken Wheel", "The Drunken Sailor"], rnd)}`
                : `${pick(["The Anchor", "The Fox", "The Lantern", "The Brass Rail"], rnd)}`,
    },
    {
        key: "bakery",
        label: "Bakery",
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
        props: { icon: "🥐", category: [PLACE_TAGS.food] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.historic)
                ? `${pick(["Old Town", "Heritage"], rnd)} Bakery`
                : `${pick(["Sunrise", "Maple", "Riverside"], rnd)} Bakery`,
    },
    {
        key: "butcher",
        label: "Butcher's",
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🥩", category: [PLACE_TAGS.food] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.poor)
                ? `${pick(["Budget Meats", "Family Butcher"], rnd)}`
                : `${pick(["Prime Cuts", "Riverside", "Harborview"], rnd)} Butcher's`,
    },

    // ────────────────────────────
    // SERVICES / HEALTH / EDUCATION
    // ────────────────────────────
    {
        key: "clinic",
        label: "Clinic",
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
        props: { icon: "🏥", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["Riverside", "Northside", "Elm"], rnd)} Clinic`,
    },
    {
        key: "hospital",
        label: "Hospital",
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
        props: { icon: "🏥", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["St. Genevieve", "General", "Memorial"], rnd)} Hospital`,
    },
    {
        key: "pharmacy",
        label: "Pharmacy",
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
        props: { icon: "💊", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["City", "Riverside", "Elm", "Union"], rnd)} Pharmacy`,
    },
    {
        key: "doctors_office",
        label: "Doctor's Office",
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
        props: { icon: "🩺", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["Riverside", "Elm Street", "Maple"], rnd)} Medical`,
    },
    {
        key: "gym",
        label: "Gym",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
        ],
        props: { icon: "🏋️", category: [PLACE_TAGS.service, PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["Ironworks", "Pulse", "Forge", "AnyGym"], rnd)} Gym`,
    },
    {
        key: "swimming_pool",
        label: "Swimming Pool",
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.education,
        ],
        props: { icon: "🏊", category: [PLACE_TAGS.leisure] },
        nameFn: ({ rnd }) => `${pick(["Community", "Northside", "Riverside"], rnd)} Pool`,
    },
    {
        key: "salon",
        label: "Salon",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
        ],
        props: { icon: "💇", category: [PLACE_TAGS.service] },
        nameFn: ({ rnd }) => `${pick(["Velvet", "Luxe", "Glow", "ClipJoint"], rnd)} Salon`,
    },
    {
        key: "church",
        label: "Church",
        allowedTags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.poor,
        ],
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
    },

    {
        key: "cemetery",
        label: "Cemetery",
        allowedTags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.poor,
        ],
        props: {
            icon: "🪦",
            category: [PLACE_TAGS.history, PLACE_TAGS.civic, PLACE_TAGS.supernatural],
        },
        nameFn: ({ rnd }) => `${pick(["Oakwood", "Riverside", "Maplewood"], rnd)} Cemetery`,
    },

    // ────────────────────────────
    // EDUCATION/CAREER
    // ────────────────────────────
    {
        key: "primary_school",
        label: "Primary School",
        allowedTags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
        ],
        props: { icon: "🏫", category: [PLACE_TAGS.education] },
        nameFn: ({ rnd }) => `${pick(["Elm Primary School", "Maple Primary"], rnd)}`,
    },
    {
        key: "middle_school",
        label: "Middle School",
        allowedTags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.rural,
        ],
        props: { icon: "🏫", category: [PLACE_TAGS.education] },
        nameFn: ({ rnd }) => `Middle School no. ${pick([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)}`,
    },
    {
        key: "high_school",
        label: "High School",
        allowedTags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.residential,
        ],
        props: { icon: "🏫", category: [PLACE_TAGS.education],
            semesters: [
                { name: "Fall", start: "09-01", end: "12-15" },
                { name: "Spring", start: "01-10", end: "05-20" },
            ],
            schedule: {
                "english": { start: "09:00", end: "09:45" },
                "math": { start: "10:00", end: "10:45" },
                "history": { start: "11:00", end: "11:45" },
                "lunch": { start: "12:00", end: "12:45" },
                "science": { start: "13:00", end: "13:45" },
                "art": { start: "14:00", end: "14:45" },
                "phys-ed": { start: "15:00", end: "15:45" },
            }
         },
        nameFn: ({ rnd }) =>
            `${pick(["St. Genevieve's High School", "Riverside High", "Docktown High"], rnd)}`,
    },
    {
        key: "university",
        label: "University",
        allowedTags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.dense,
        ],
        props: { icon: "🎓", category: [PLACE_TAGS.education] },
        nameFn: () => "University of Docktown",
    },
    {
        key: "office_block",
        label: "Office Block",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
        ],
        props: { icon: "🏢", category: [PLACE_TAGS.commerce, PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(["Union", "Harbor", "Market", "Liberty", "Central"], rnd)} Office Tower`,
    },

    // ────────────────────────────
    // INDUSTRY / UTILITIES / SAFETY
    // ────────────────────────────
    {
        key: "mechanic",
        label: "Mechanic",
        allowedTags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.rural,
        ],
        props: { icon: "🔧", category: [PLACE_TAGS.industry, PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(["Ace Auto", "Riverside Motors", "Dockside Auto", "Union Garage"], rnd)}`,
    },
    {
        key: "police_station",
        label: "Police Station",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🚓", category: [PLACE_TAGS.safety, PLACE_TAGS.civic, PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(["1st Precinct", "Central Precinct", "Harbor Precinct"], rnd)}`,
    },
    {
        key: "fire_station",
        label: "Fire Department",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.rural,
        ],
        props: { icon: "🚒", category: [PLACE_TAGS.safety, PLACE_TAGS.civic, PLACE_TAGS.service] },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Fire Station 1", "Fire Marshall Station", "Volunteer Fire Department"],
                rnd,
            )}`,
    },

    {
        key: "warehouse",
        label: "Warehouse",
        allowedTags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "📦", category: [PLACE_TAGS.industry] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.coastal)
                ? `${pick(["Harbor", "Dockside", "Pier"], rnd)} Warehouse`
                : `${pick(["Union", "Riverside", "North"], rnd)} Warehouse`,
    },

    {
        key: "logistics_depot",
        label: "Logistics Depot",
        allowedTags: [LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge, LOCATION_TAGS.suburban],
        props: { icon: "🚚", category: [PLACE_TAGS.industry] },
        nameFn: ({ rnd }) =>
            `${pick(["TransGlobal", "ExpressLink", "Docktown Freight"], rnd)} Depot`,
    },

    // ────────────────────────────
    // HOUSING
    // ────────────────────────────
    {
        key: "apartment_complex",
        label: "Apartment Complex",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.dense,
        ],
        props: { icon: "🏢", category: [PLACE_TAGS.housing], multi: true },
        nameFn: ({ rnd }) => `${pick(["Riverside", "Maple", "Union", "Elm"], rnd)} Apartments`,
    },
    {
        key: "townhouse",
        label: "Townhouse",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.dense,
        ],
        props: { icon: "🏘", category: [PLACE_TAGS.housing], multi: true },
        nameFn: ({ rnd }) => `${pick(["Lone", "Maple", "Luxurious", "Suburban"], rnd)} House Row`,
    },
    {
        key: "shady_building",
        label: "Shady Building",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.coastal,
        ],
        props: {
            icon: "🏚️",
            category: [PLACE_TAGS.housing, PLACE_TAGS.crime, PLACE_TAGS.supernatural],
            multi: true,
        },
        nameFn: ({ rnd }) =>
            `${pick(["Abandoned", "Derelict", "Vacant", "Shady", "Suspicious"], rnd)} Building`,
    },
    {
        key: "motel",
        label: "Motel",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.rural,
        ],
        props: { icon: "🏨", category: [PLACE_TAGS.housing, PLACE_TAGS.leisure] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.tourism)
                ? `${pick(["Seaside", "Harborview", "Sunset"], rnd)} Motel`
                : `${pick(["Budget Inn", "Travel Lodge", "Roadside"], rnd)}`,
    },

    {
        key: "dorm",
        label: "Dormitory",
        allowedTags: [LOCATION_TAGS.education, LOCATION_TAGS.urban_center, LOCATION_TAGS.poor],
        props: { icon: "🏫", category: [PLACE_TAGS.housing, PLACE_TAGS.education] },
        nameFn: ({ rnd }) => `${pick(["Campus", "University", "Student"], rnd)} Dormitory`,
    },

    // ────────────────────────────
    // WATERFRONT
    // ────────────────────────────
    {
        key: "pier",
        label: "Pier",
        allowedTags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
        ],
        props: { icon: "🛳️", category: [PLACE_TAGS.commerce, PLACE_TAGS.nightlife] },
        nameFn: ({ rnd, tags }) =>
            has(tags, LOCATION_TAGS.tourism)
                ? `${pick(["Boardwalk", "Sunset", "Harborfront"], rnd)} Pier`
                : `${pick(["Pier 3", "Pier 7", "Cargo Pier"], rnd)}`,
    },

    {
        key: "fish_market",
        label: "Fish Market",
        allowedTags: [LOCATION_TAGS.coastal, LOCATION_TAGS.urban_edge],
        props: { icon: "🐟", category: [PLACE_TAGS.commerce, PLACE_TAGS.food, PLACE_TAGS.leisure] },
        nameFn: ({ tags }) =>
            has(tags, LOCATION_TAGS.coastal) ? "Harbor Fish Market" : "Fish Market",
    },
    {
        key: "harbor",
        label: "Harbor",
        allowedTags: [LOCATION_TAGS.coastal],
        props: { icon: "⚓", category: [PLACE_TAGS.industry, PLACE_TAGS.transport] },
        nameFn: () => "Docktown Harbor",
    },

    // ────────────────────────────
    // CRIME
    // ────────────────────────────
    {
        key: "smugglers_den",
        label: "Smuggler's Den",
        allowedTags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🕵️", category: [PLACE_TAGS.crime, PLACE_TAGS.industry] },
        nameFn: ({ rnd }) => `${pick(["Hidden", "Secret", "Underground"], rnd)} Den`,
    },
    {
        key: "night_market",
        label: "Night Market",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_center,
        ],
        props: {
            icon: "🌙",
            category: [PLACE_TAGS.crime, PLACE_TAGS.leisure, PLACE_TAGS.commerce],
        },
        nameFn: ({ rnd }) => `${pick(["Shadow", "Midnight", "Black"], rnd)} Market`,
    },
    {
        key: "abandoned_parking_lot",
        label: "Abandoned Parking Lot",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🚧", category: [PLACE_TAGS.crime] },
        nameFn: ({ rnd }) => `${pick(["Desolate", "Forgotten", "Vacant"], rnd)} Parking Lot`,
    },
    {
        key: "alleyway",
        label: "Alleyway",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.poor,
        ],
        props: { icon: "🚷", category: [PLACE_TAGS.crime] },
        nameFn: ({ tags, rnd }) =>
            !has(tags, LOCATION_TAGS.wealthy)
                ? `${pick(["Dark", "Narrow", "Hidden", "Dirty"], rnd)} Alleyway`
                : `Secluded Alleyway`,
    },

    // ────────────────────────────
    // ***
    // ────────────────────────────

    {
        key: "brothel",
        label: "Brothel",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.poor,
        ],
        props: {
            icon: "💋",
            category: [PLACE_TAGS.crime, PLACE_TAGS.nsfw],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${
                rnd() > 0.5
                    ? pick(["Satis-Factory", "Roxanne's", "Harem", "The Red Lantern"], rnd)
                    : `${pick(
                          ["Black Rose", "Bella's", "Love", "Paradise", "Angel's"],
                          rnd,
                      )} ${pick(
                          [
                              "Gentleman's Club",
                              "Sanctuary",
                              "Cathouse",
                              "Pleasure House",
                              "Sensual Retreat",
                          ],
                          rnd,
                      )}`
            }`,
    },

    {
        key: "strip_club",
        label: "Strip Club",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.tourism,
        ],
        props: { icon: "👙", category: [PLACE_TAGS.crime, PLACE_TAGS.nsfw], ages: { min: 18 } },
        nameFn: ({ rnd }) =>
            `${pick(
                ["Class Act Club", "Essence", "Sleazy Susie's", "The Man Cave", "Liberte Club"],
                rnd,
            )}`,
    },

    {
        key: "adult_store",
        label: "Adult Store",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
        ],
        props: {
            icon: "🔞",
            category: [PLACE_TAGS.commerce, PLACE_TAGS.nsfw],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${pick(["Pleasure Chest", "Cupid's Arrow", "Midnight Secrets", "The Red Room"], rnd)}`,
    },
    {
        key: "love_hotel",
        label: "Love Hotel",
        allowedTags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
        ],
        props: {
            icon: "🏩",
            category: [PLACE_TAGS.housing, PLACE_TAGS.service, PLACE_TAGS.nsfw],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${pick(["Pink Paradise", "Hourly Haven", "Romance Inn", "Secret Stay"], rnd)}`,
    },
    {
        key: "dungeon_club",
        label: "Fetish Club",
        allowedTags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_core, // Basements
            LOCATION_TAGS.urban_edge,
        ],
        props: {
            icon: "⛓️",
            category: [PLACE_TAGS.nightlife, PLACE_TAGS.nsfw, PLACE_TAGS.community],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) => `${pick(["The Cage", "Sanctum", "Chains", "The Cellar"], rnd)}`,
    },
    {
        key: "massage_parlor",
        label: "Massage Parlor",
        allowedTags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.industrial,
        ],
        props: {
            icon: "💆",
            // Often operates in a grey area
            category: [PLACE_TAGS.service, PLACE_TAGS.nsfw, PLACE_TAGS.crime],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${pick(["Happy Endings", "Lotus Touch", "Silk Road", "Relaxation Station"], rnd)}`,
    },
    {
        key: "escort_agency",
        label: "Escort Agency",
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.wealthy, LOCATION_TAGS.commercial],
        props: {
            icon: "💎",
            category: [PLACE_TAGS.service, PLACE_TAGS.nsfw, PLACE_TAGS.luxury],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) =>
            `${pick(["Elite Companions", "Velvet Touch", "Sapphire Escorts", "Gilded Rose"], rnd)}`,
    },
    {
        key: "bathhouse",
        label: "Bathhouse",
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.urban, LOCATION_TAGS.historic],
        props: {
            icon: "🧖",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.nsfw, PLACE_TAGS.community],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) => `${pick(["Steamworks", "The Roman", "Oasis", "Midnight Steam"], rnd)}`,
    },
    {
        key: "nude_beach",
        label: "Secluded Beach",
        allowedTags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.rural, // Hard to get to
            LOCATION_TAGS.parkland,
        ],
        props: {
            icon: "🏖️",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.nsfw, PLACE_TAGS.nature],
            ages: { min: 18 },
        },
        nameFn: ({ rnd }) => `${pick(["Bare Cove", "Moon Bay", "Hidden Sands"], rnd)}`,
    },
    {
        key: "glory_hole",
        label: "Public Restroom",
        allowedTags: [
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.transport, // Bus/Train stations
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.poor,
        ],
        props: {
            icon: "🚽",
            category: [PLACE_TAGS.nsfw, PLACE_TAGS.crime, PLACE_TAGS.civic],
        },
        nameFn: ({ rnd }) => `${pick(["Park", "Station", "Rest Stop"], rnd)} Restroom`,
    },

    // ────────────────────────────
    // LUXURY / HIGH-END
    // ────────────────────────────
    {
        key: "jewelry_store",
        label: "Jewelry Store",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
        ],
        props: { icon: "💎", category: [PLACE_TAGS.commerce, PLACE_TAGS.luxury] },
        nameFn: ({ rnd }) => `${pick(["Diamond", "Gold", "Crystal", "Royal"], rnd)} Jewelers`,
    },
    {
        key: "country_club",
        label: "Country Club",
        allowedTags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.rural, // Estates on the edge
            LOCATION_TAGS.parkland,
        ],
        props: {
            icon: "⛳",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.luxury, PLACE_TAGS.food],
        },
        nameFn: ({ rnd }) =>
            `${pick(["Green Valley", "Oakhaven", "Summit", "Royal Pines"], rnd)} Country Club`,
    },
    {
        key: "yacht_club",
        label: "Yacht Club",
        allowedTags: [LOCATION_TAGS.coastal, LOCATION_TAGS.wealthy, LOCATION_TAGS.tourism],
        props: {
            icon: "🛥️",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.luxury, PLACE_TAGS.nightlife],
        },
        nameFn: ({ rnd }) =>
            `${pick(["Harbor View", "Blue Horizon", "Royal", "Seaside"], rnd)} Yacht Club`,
    },
    {
        key: "fine_dining",
        label: "Fine Dining Restaurant",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
        ],
        props: {
            icon: "🍾",
            category: [PLACE_TAGS.food, PLACE_TAGS.luxury, PLACE_TAGS.nightlife],
        },
        nameFn: ({ rnd }) =>
            `${pick(["L'Etoile", "The Gilded Fork", "Sapphire", "Velvet & Vine"], rnd)}`,
    },
    {
        key: "casino",
        label: "Casino",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.wealthy,
        ],
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
    },
    {
        key: "luxury_hotel",
        label: "Luxury Hotel",
        allowedTags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.coastal,
        ],
        props: {
            icon: "🛎️",
            category: [PLACE_TAGS.housing, PLACE_TAGS.service, PLACE_TAGS.luxury],
        },
        nameFn: ({ rnd }) => `${pick(["Grand", "Imperial", "Ritz", "Majestic"], rnd)} Hotel`,
    },
    {
        key: "designer_boutique",
        label: "Designer Boutique",
        allowedTags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.wealthy, LOCATION_TAGS.tourism],
        props: {
            icon: "👜",
            category: [PLACE_TAGS.commerce, PLACE_TAGS.luxury],
        },
        nameFn: ({ rnd }) => `${pick(["Vogue", "Chic", "Elegance", "Mode"], rnd)} Boutique`,
    },
    {
        key: "spa_resort",
        label: "Day Spa",
        allowedTags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.tourism,
        ],
        props: {
            icon: "🧖‍♀️",
            category: [PLACE_TAGS.service, PLACE_TAGS.luxury, PLACE_TAGS.leisure],
        },
        nameFn: ({ rnd }) => `${pick(["Serenity", "Tranquil", "Eden", "Lotus"], rnd)} Spa`,
    },
    {
        key: "vineyard",
        label: "Vineyard",
        allowedTags: [LOCATION_TAGS.rural, LOCATION_TAGS.wealthy, LOCATION_TAGS.tourism],
        props: {
            icon: "🍇",
            category: [PLACE_TAGS.leisure, PLACE_TAGS.food, PLACE_TAGS.luxury, PLACE_TAGS.industry],
        },
        nameFn: ({ rnd }) => `${pick(["Sunset", "Valley", "River", "Golden"], rnd)} Estate Winery`,
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
        saturday: { from: "09:00", to: "16:00" },
    }),
    crime: hoursAllDay(),
    nsfw: hoursWeekdays({
        from: "23:00",
        to: "06:00",
        saturday: { from: "22:00", to: "07:00" },
        sunday: { from: "23:00", to: "07:00" },
    }),
};

export const DEFAULT_OPENING_HOURS = hoursAllDay();

// Per-place overrides
const SCHOOL_HOURS = hoursWeekdays({ from: "08:00", to: "17:00" });

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
        sunday: { from: "20:00", to: "02:00" },
    }),
    massage_parlor: hoursEveryDay("10:00", "00:00"),
    escort_agency: hoursWeekdays({ from: "10:00", to: "20:00" }), // The office hours (appointments are 24/7)
    bathhouse: hoursAllDay(), // Often 24/7
    nude_beach: hoursEveryDay("06:00", "20:00"), // Daylight mostly, unless...
    glory_hole: hoursAllDay(),
};
