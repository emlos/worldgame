export const LOCATION_TAGS = {
    rural: "rural",
    suburban: "suburban",
    suburban_hub: "suburban_hub",
    urban: "urban",
    urban_center: "urban_center",
    urban_core: "urban_core",
    urban_edge: "urban_edge",
    parkland: "parkland",
    industrial: "industrial",
    commercial: "commercial",
    residential: "residential",
    historic: "historic",
    tourism: "tourism",
    education: "education",
    dense: "dense",
    coastal: "coastal",
    wealthy: "wealthy",
};

/**
 * District registry:
 * - key: unique identifier
 * - label: human-readable name
 * - tags: list of tags that characterize this district
 * - weight: relative probability during random generation
 * - min/max (optional): soft constraints for typical counts in a town
 */
export const LOCATION_REGISTRY = [
    // ==============================================
    // URBAN CORE (High Density / Commercial)
    // ==============================================
    {
        key: "downtown",
        label: "Downtown",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
        ],
        weight: 3,
        min: 1,
    },
    {
        key: "financial_district",
        label: "Financial District",
        tags: [
            LOCATION_TAGS.urban_core,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.dense,
        ],
        weight: 1,
        max: 1,
    },
    {
        key: "market_district",
        label: "Market District",
        tags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.tourism,
        ],
        weight: 2,
    },

    // ==============================================
    // URBAN RESIDENTIAL & CULTURE
    // ==============================================
    {
        key: "residential_core",
        label: "High-Rise Residential",
        tags: [
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.dense,
        ],
        weight: 4,
    },
    {
        key: "garden_district",
        label: "Garden District",
        tags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism
        ],
        weight: 1,
    },
    {
        key: "arts_district",
        label: "Arts District",
        tags: [
            LOCATION_TAGS.urban,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.historic,
            LOCATION_TAGS.urban_center,
        ],
        weight: 1,
    },

    // ==============================================
    // SUBURBAN & HUBS
    // ==============================================
    {
        key: "suburb",
        label: "Suburb",
        tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.residential],
        weight: 6,
    },
    {
        key: "gated_estates",
        label: "Gated Estates",
        tags: [
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.residential,
            LOCATION_TAGS.wealthy,
            LOCATION_TAGS.parkland,
        ],
        weight: 2,
    },
    {
        key: "suburban_town_center",
        label: "Suburban Town Center",
        tags: [
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
        ],
        weight: 3,
    },
    {
        key: "shopping_complex",
        label: "Mega-Mall Complex",
        tags: [
            LOCATION_TAGS.suburban_hub,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.tourism,
        ],
        weight: 2,
    },

    // ==============================================
    // INDUSTRIAL & INNOVATION
    // ==============================================
    {
        key: "industrial_park",
        label: "Industrial Park",
        tags: [LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge, LOCATION_TAGS.urban],
        weight: 3,
    },
    {
        key: "tech_park",
        label: "Innovation Tech Park",
        tags: [
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.education,
            LOCATION_TAGS.wealthy,
        ],
        weight: 1,
    },

    // ==============================================
    // COASTAL & WATER
    // ==============================================
    {
        key: "harbor",
        label: "Industrial Harbor",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.industrial,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.urban_edge,
        ],
        weight: 1,
        max: 1,
    },
    {
        key: "boardwalk",
        label: "Coastal Boardwalk",
        tags: [
            LOCATION_TAGS.coastal,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.commercial,
            LOCATION_TAGS.residential,
        ],
        weight: 1,
    },

    // ==============================================
    // EDUCATION & CAMPUS
    // ==============================================
    {
        key: "campus",
        label: "University District",
        tags: [
            LOCATION_TAGS.education,
            LOCATION_TAGS.urban,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.dense,
            LOCATION_TAGS.parkland,
        ],
        weight: 1,
        max: 1,
    },

    // ==============================================
    // HISTORIC & TOURISM
    // ==============================================
    {
        key: "old_town",
        label: "Old Town",
        tags: [
            LOCATION_TAGS.historic,
            LOCATION_TAGS.tourism,
            LOCATION_TAGS.urban_center,
            LOCATION_TAGS.urban,
        ],
        weight: 2,
    },

    // ==============================================
    // RURAL & GREEN SPACES
    // ==============================================
    {
        key: "parklands",
        label: "City Parklands",
        tags: [
            LOCATION_TAGS.parkland,
            LOCATION_TAGS.suburban,
            LOCATION_TAGS.urban_edge,
            LOCATION_TAGS.tourism,
        ],
        weight: 2,
    },
    {
        key: "rural_edge",
        label: "Rural Edge",
        tags: [LOCATION_TAGS.rural, LOCATION_TAGS.residential],
        weight: 3,
    },
    {
        key: "agri_belt",
        label: "Agricultural Belt",
        tags: [
            LOCATION_TAGS.rural,
            LOCATION_TAGS.industrial, // Farming as industry
            LOCATION_TAGS.urban_edge,
        ],
        weight: 2,
    },
];
