import { LOCATION_TAGS } from "../data.js";

export const STREET_REGISTRY = [
    // --- Core / Downtown ---
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
        key: "market_st",
        name: "Market Street",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "broadway",
        name: "Broadway",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.tourism,
        ],
    },
    {
        key: "union_blvd",
        name: "Union Boulevard",
        tags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "central_parkway",
        name: "Central Parkway",
        tags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.parkland,
        ],
    },
    {
        key: "liberty_square_dr",
        name: "Liberty Square Drive",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.urban_center,
        ],
    },
    {
        key: "museum_crescent",
        name: "Museum Crescent",
        tags: [
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
        ],
    },

    // --- Mixed Urban / Suburban Hubs ---
    {
        key: "maple_blvd",
        name: "Maple Boulevard",
        tags: [
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.commercial,
        ],
    },
    {
        key: "sunset_ave",
        name: "Sunset Avenue",
        tags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
        ],
    },
    {
        key: "sycamore_rd",
        name: "Sycamore Road",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.residential, LOCATION_TAGS.suburban_hub],
    },

    // --- Parks / Residential ---
    {
        key: "oak_st",
        name: "Oak Street",
        tags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.parkland,
        ],
    },
    {
        key: "parkview_dr",
        name: "Parkview Drive",
        tags: [
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
        ],
    },
    {
        key: "willow_court",
        name: "Willow Court",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.residential, LOCATION_TAGS.parkland],
    },
    {
        key: "greenbelt_loop",
        name: "Greenbelt Loop",
        tags: [
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.tourism,
        ],
    },
    {
        key: "bluebird_pass",
        name: "Bluebird Pass",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.residential, LOCATION_TAGS.urban_edge],
    },

    // --- Historic Neighborhoods ---
    {
        key: "church_row",
        name: "Church Row",
        tags: [
            LOCATION_TAGS.historic,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.tourism,
        ],
    },

    // --- Education / Campus / Research ---
    {
        key: "campus_way",
        name: "Campus Way",
        tags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "scholar_ave",
        name: "Scholar Avenue",
        tags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.historic,
        ],
    },
    {
        key: "charter_school_ln",
        name: "Charter School Lane",
        tags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.suburban,
        ],
    },
    {
        key: "research_parkway",
        name: "Research Parkway",
        tags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.education,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.suburban_hub,
        ],
    },
    {
        key: "old_academy_rd",
        name: "Old Academy Road",
        tags: [
            LOCATION_TAGS.historic,
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.residential,
        ],
    },
    {
        key: "student_commons",
        name: "Student Commons",
        tags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.tourism,
        ],
    },

    // --- Wealthy / High-End ---
    {
        key: "royal_palm_st",
        name: "Royal Palm Street",
        tags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.parkland,
        ],
    },
    {
        key: "summit_heights_dr",
        name: "Summit Heights Drive",
        tags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "crownview_terrace",
        name: "Crownview Terrace",
        tags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.urban_center,
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
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.dense,
        ],
    },

    // --- Coastal / Wealthy / Leisure ---
    {
        key: "promenade_des_fleurs",
        name: "Promenade des Fleurs",
        tags: [
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.coastal,
        ],
    },
    {
        key: "marina_crescent",
        name: "Marina Crescent",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.tourism,
        ],
    },
    {
        key: "marina_blvd",
        name: "Marina Boulevard",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.urban_center,
        ],
    },

    // --- Coastal / Tourism / Crowds ---
    {
        key: "ocean_breeze_walk",
        name: "Ocean Breeze Walk",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "boardwalk_parade",
        name: "Boardwalk Parade",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.commercial,
        ],
    },
    {
        key: "harborfront_rd",
        name: "Harborfront Road",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
        ],
    },

    // --- Industrial / Working-Class / “Abandoned vibe” via tags ---
    {
        key: "ironworks_st",
        name: "Ironworks Street",
        tags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.poor,
        ],
    },
    {
        key: "cinder_lane",
        name: "Cinder Lane",
        tags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.poor,
            LOCATION_TAGS.historic,
        ],
    },
    {
        key: "knotted_rail_spur",
        name: "Knotted Rail Spur",
        tags: [
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.poor,
        ],
    },
    {
        key: "fiber_optic_way",
        name: "Fiber Optic Way",
        tags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.suburban_hub,
        ],
    },
    {
        key: "dockside_ave",
        name: "Dockside Avenue",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.poor,
        ],
    },

    // --- Poor / Dense / Inner-City ---
    {
        key: "shadow_row",
        name: "Shadow Row",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.poor,
            LOCATION_TAGS.residential,
        ],
    },
    {
        key: "red_lantern_way",
        name: "Red Lantern Way",
        tags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.poor,
            LOCATION_TAGS.dense,
        ],
    },
    {
        key: "broken_window_alley",
        name: "Broken Window Alley",
        tags: [LOCATION_TAGS.urban_center, LOCATION_TAGS.historic, LOCATION_TAGS.poor],
    },

    // --- Poor / Suburban ---
    {
        key: "cedar_courts",
        name: "Cedar Courts",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.residential, LOCATION_TAGS.poor],
    },

    // --- Poor / Coastal Edge ---
    {
        key: "seabird_pass",
        name: "Seabird Pass",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.poor,
            LOCATION_TAGS.urban_edge,
        ],
    },

    // --- Rural / Edge / Agricultural ---
    {
        key: "river_rd",
        name: "River Road",
        tags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.coastal,
        ],
    },
    {
        key: "old_mill_rd",
        name: "Old Mill Road",
        tags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.poor,
        ],
    },
    {
        key: "harvest_route",
        name: "Harvest Route",
        tags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.poor,
        ],
    },
    {
        key: "orchard_path",
        name: "Orchard Path",
        tags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.tourism,
        ],
    },
    {
        key: "dusty_trail",
        name: "Dusty Trail",
        tags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.poor,
        ],
    },
    {
        key: "vineyard_ridge_rd",
        name: "Vineyard Ridge Road",
        tags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.parkland,
        ],
    },

    // --- Misc Edge Cases / Glue ---
    {
        key: "hillside_ln",
        name: "Hillside Lane",
        tags: [
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.rural,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.wealthy,
        ],
    },
    {
        key: "innovation_circle",
        name: "Innovation Circle",
        tags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.education,
            LOCATION_TAGS.suburban_hub,
        ],
    },
];
