import { LOCATION_TAGS } from "../data.js";

export const STREET_REGISTRY = [
    {
        key: "kings_way",
        name: "King's Way",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "maple_blvd",
        name: "Maple Blvd",
        tags: [
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
        ],
    },
    {
        key: "oak_st",
        name: "Oak St",
        tags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.parkland,
        ],
    },
    {
        key: "river_rd",
        name: "River Rd",
        tags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.coastal,
        ],
    },
    {
        key: "sunset_ave",
        name: "Sunset Ave",
        tags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.commercial,
        ],
    },
    {
        key: "old_mill_rd",
        name: "Old Mill Rd",
        tags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
        ],
    },
    {
        key: "harborfront_rd",
        name: "Harborfront Rd",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.urban,
        ],
    },
    {
        key: "dockside_ave",
        name: "Dockside Ave",
        tags: [LOCATION_TAGS.coastal, LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge],
    },
    {
        key: "market_st",
        name: "Market St",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
        ],
    },
    {
        key: "union_blvd",
        name: "Union Blvd",
        tags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "campus_way",
        name: "Campus Way",
        tags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "parkview_dr",
        name: "Parkview Dr",
        tags: [
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
        ],
    },
    {
        key: "church_row",
        name: "Church Row",
        tags: [
            LOCATION_TAGS.historic,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.residential,
        ],
    },
    {
        key: "hillside_ln",
        name: "Hillside Ln",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.rural, LOCATION_TAGS.residential],
    },

    // ─────────────────────────────────────────────────────────────
    // NEW ENTRIES
    // ─────────────────────────────────────────────────────────────

    // --- Wealthy / High-End ---
    {
        key: "royal_palm_terrace",
        name: "Royal Palm Terrace",
        tags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.parkland,
        ],
    },
    {
        key: "summit_heights_dr",
        name: "Summit Heights Dr",
        tags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "gilded_mile",
        name: "The Gilded Mile",
        tags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.luxury,
        ],
    },
    {
        key: "promenade_des_fleurs",
        name: "Promenade des Fleurs",
        tags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.urban,
        ],
    },

    // --- Gritty / Industrial / Crime ---
    {
        key: "ironworks_alley",
        name: "Ironworks Alley",
        tags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.crime,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "cinder_lane",
        name: "Cinder Lane",
        tags: [LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge, LOCATION_TAGS.residential],
    },
    {
        key: "shadow_row",
        name: "Shadow Row",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.crime,
            LOCATION_TAGS.nightlife,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "red_lantern_way",
        name: "Red Lantern Way",
        tags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.nightlife,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.crime,
        ],
    },

    // --- Suburban / Residential Cozy ---
    {
        key: "willow_court",
        name: "Willow Court",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.residential, LOCATION_TAGS.parkland],
    },
    {
        key: "sycamore_circle",
        name: "Sycamore Circle",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.residential, LOCATION_TAGS.family],
    },
    {
        key: "bluebird_pass",
        name: "Bluebird Pass",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.residential, LOCATION_TAGS.urban_edge],
    },

    // --- Coastal / Tourism ---
    {
        key: "ocean_breeze_walk",
        name: "Ocean Breeze Walk",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.leisure,
            LOCATION_TAGS.commercial,
        ],
    },
    {
        key: "marina_blvd",
        name: "Marina Blvd",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.transport,
        ],
    },
    {
        key: "boardwalk_parade",
        name: "Boardwalk Parade",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.nightlife,
            LOCATION_TAGS.dense,
        ],
    },

    // --- Rural / Agriculture ---
    {
        key: "harvest_route",
        name: "Harvest Route",
        tags: [LOCATION_TAGS.rural, LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge],
    },
    {
        key: "orchard_path",
        name: "Orchard Path",
        tags: [LOCATION_TAGS.rural, LOCATION_TAGS.parkland, LOCATION_TAGS.residential],
    },
    {
        key: "dusty_trail",
        name: "Dusty Trail",
        tags: [LOCATION_TAGS.rural, LOCATION_TAGS.urban_edge, LOCATION_TAGS.historic],
    },

    // --- Tech / Modern / Education ---
    {
        key: "innovation_circle",
        name: "Innovation Circle",
        tags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.education,
            LOCATION_TAGS.modern,
        ],
    },
    {
        key: "scholar_ave",
        name: "Scholar Ave",
        tags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.historic,
        ],
    },
    {
        key: "fiber_optic_way",
        name: "Fiber Optic Way",
        tags: [LOCATION_TAGS.urban_edge, LOCATION_TAGS.commercial, LOCATION_TAGS.industrial],
    },

    // --- Civic / Generic Urban ---
    {
        key: "liberty_square_dr",
        name: "Liberty Square Dr",
        tags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.civic, LOCATION_TAGS.historic],
    },
    {
        key: "central_parkway",
        name: "Central Parkway",
        tags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.transport,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "broadway",
        name: "Broadway",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.nightlife,
            LOCATION_TAGS.culture,
        ],
    },
];
