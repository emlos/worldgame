export class Place {
  constructor({ id, key, name, locationId, props = {} }) {
    this.id = id; // unique string id for this instance
    this.key = key; // registry key ("park", "bus_stop", ...)
    this.name = name; // human label ("Central Park", "Bus Stop")
    this.locationId = locationId; // where on the map it lives
    this.props = props; // any extra attributes (capacity, icon, etc.)
  }
}

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
    nameFn: ({ tags }) => (has(tags, "historic") ? "Old Town Square" : "Town Square"),
    minCount: 1,
  },
  {
    key: "civil_office",
    label: "Civil Office",

    minDistance: 8,
    allowedTags: ["urban_core", "urban", "suburban"],
    weight: 1,
    props: { icon: "🏛️", category: "civic" },
    nameFn: ({ tags }) => (has(tags, "urban_core") ? "Downtown Civil Office" : "Civil Office"),
    minCount: 1,
  },
  {
    key: "train_station",
    label: "Train Station",
    maxCount: 1,
    minDistance: 99,
    allowedTags: ["urban_edge", "industrial", "suburban_hub", "urban"],
    weight: 1,
    props: { icon: "🚉", category: "transport" },
    nameFn: ({ tags }) => (has(tags, "urban_core") ? "Central Station" : "Train Station"),
    minCount: 1,
  },
  {
    key: "bus_station",
    label: "Bus Station",
    maxCount: 1,
    minDistance: 99,
    allowedTags: ["urban", "suburban_hub", "urban_core"],
    weight: 1,
    props: { icon: "🚏", category: "transport" },
    nameFn: ({ tags }) => (has(tags, "urban_core") ? "Central Bus Station" : "Bus Station"),
    minCount: 1,
  },
  {
    key: "bus_stop",
    label: "Bus Stop",

    minDistance: 2,
    allowedTags: ["urban_core", "urban", "suburban", "industrial", "commercial", "residential"],
    weight: 6,
    props: { icon: "🚌", category: "transport" },
    nameFn: ({ index }) => seqName("Bus Stop", { index }),
    minCount: 1,
  },
  {
    key: "boulevard",
    label: "Boulevard",

    minDistance: 6,
    allowedTags: ["urban_core", "urban", "commercial"],
    weight: 1,
    props: { icon: "🛣️", category: "civic" },
    nameFn: ({ rnd }) => `${pick(["King", "Queen", "Liberty", "Harbor", "Market", "Union", "Elm"], rnd)} Boulevard`,
    minCount: 1,
  },

  // ────────────────────────────
  // LEISURE / CULTURE
  // ────────────────────────────
  {
    key: "park",
    label: "Park",

    minDistance: 3,
    allowedTags: ["urban", "suburban", "parkland", "residential", "rural"],
    weight: 3,
    props: { icon: "🌳", category: "leisure" },
    nameFn: ({ rnd, tags }) => (has(tags, "urban_core") ? `${pick(["Central", "City", "Common"], rnd)} Park` : `${pick(["Maple", "Oak", "Riverside", "West"], rnd)} Park`),
    minCount: 1,
  },
  {
    key: "stadium",
    label: "Stadium",
    maxCount: 1,
    minDistance: 99,
    allowedTags: ["urban_edge", "suburban", "commercial"],
    weight: 1,
    props: { icon: "🏟️", category: "leisure" },
    nameFn: ({ rnd }) => `${pick(["Riverview", "Summit", "Harbor", "Union"], rnd)} Stadium`,
    minCount: 1,
  },
  {
    key: "theater",
    label: "Theater",

    minDistance: 6,
    allowedTags: ["urban_core", "urban", "historic", "commercial"],
    weight: 1,
    props: { icon: "🎭", category: "culture" },
    nameFn: ({ rnd, tags }) => (has(tags, "historic") ? `${pick(["Imperial", "Bijou", "Majestic"], rnd)} Theater` : "Theater"),
    minCount: 1,
  },
  {
    key: "cinema",
    label: "Cinema",

    minDistance: 5,
    allowedTags: ["urban", "suburban", "commercial"],
    weight: 2,
    props: { icon: "🎬", category: "culture" },
    nameFn: ({ rnd }) => `${pick(["Arcadia", "Odeon", "Vista", "Galaxy"], rnd)} Cinema`,
    minCount: 1,
  },
  {
    key: "museum",
    label: "Museum",

    minDistance: 12,
    allowedTags: ["urban_core", "urban", "historic", "tourism"],
    weight: 1,
    props: { icon: "🏛️", category: "culture" },
    nameFn: ({ rnd, tags }) => (has(tags, "coastal") ? `${pick(["Maritime", "Harbor"], rnd)} Museum` : `${pick(["City", "Regional"], rnd)} Museum`),
    minCount: 1,
  },
  {
    key: "library",
    label: "Library",

    minDistance: 6,
    allowedTags: ["urban", "suburban", "education", "residential"],
    weight: 2,
    props: { icon: "📚", category: "culture" },
    nameFn: ({ rnd }) => `${pick(["Central", "North", "West", "Riverside"], rnd)} Library`,
    minCount: 1,
  },
  {
    key: "club",
    label: "Club",

    minDistance: 5,
    allowedTags: ["urban_core", "urban", "commercial"],
    weight: 2,
    props: { icon: "🎧", category: "leisure" },
    nameFn: ({ rnd }) => `${pick(["Neon", "Pulse", "Echo", "Velvet"], rnd)} Club`,
    minCount: 1,
  },

  // ────────────────────────────
  // COMMERCE / FOOD & DRINK
  // ────────────────────────────
  {
    key: "market",
    label: "Market",

    minDistance: 3,
    allowedTags: ["urban_core", "urban", "commercial"],
    weight: 2,
    props: { icon: "🧺", category: "commerce" },
    nameFn: ({ rnd, tags }) => (has(tags, "historic") ? `${pick(["Old", "Heritage"], rnd)} Market` : `${pick(["Central", "City"], rnd)} Market`),
    minCount: 1,
  },
  {
    key: "fish_market",
    label: "Fish Market",

    minDistance: 4,
    allowedTags: ["coastal", "commercial", "urban"],
    weight: 2,
    props: { icon: "🐟", category: "commerce" },
    nameFn: ({ tags }) => (has(tags, "coastal") ? "Harbor Fish Market" : "Fish Market"),
    minCount: 1,
  },
  {
    key: "mall",
    label: "Shopping Mall",
    maxCount: 1,
    minDistance: 99,
    allowedTags: ["commercial", "suburban"],
    weight: 1,
    props: { icon: "🏬", category: "commerce" },
    nameFn: ({ rnd }) => `${pick(["North", "Harbor", "Grand", "Sunset"], rnd)} Mall`,
    minCount: 1,
  },
  {
    key: "corner_store",
    label: "Corner Store",

    minDistance: 2,
    allowedTags: ["urban", "suburban", "residential", "commercial"],
    weight: 4,
    props: { icon: "🏪", category: "commerce" },
    nameFn: ({ rnd }) => `${pick(["QuickMart", "Stop&Shop", "MiniMart"], rnd)}`,
    minCount: 1,
  },
  {
    key: "restaurant",
    label: "Restaurant",

    minDistance: 2,
    allowedTags: ["urban", "suburban", "commercial"],
    weight: 4,
    props: { icon: "🍽️", category: "food" },
    nameFn: ({ rnd }) => `${pick(["Olive Court", "Dockside Grill", "Sunset Table", "Elm Bistro"], rnd)}`,
    minCount: 1,
  },
  {
    key: "pizzeria",
    label: "Pizzeria",

    minDistance: 2,
    allowedTags: ["urban", "suburban", "commercial", "residential"],
    weight: 3,
    props: { icon: "🍕", category: "food" },
    nameFn: ({ rnd }) => `${pick(["Tony's", "Mama Mia", "Brick Oven", "Harbor Slice"], rnd)} Pizzeria`,
    minCount: 1,
  },
  {
    key: "cafe",
    label: "Cafe",

    minDistance: 2,
    allowedTags: ["urban_core", "urban", "suburban", "education", "commercial", "residential"],
    weight: 5,
    props: { icon: "☕", category: "food" },
    nameFn: ({ rnd, tags }) => `${pick(has(tags, "education") ? ["Campus", "Quad", "Student"] : ["Central", "Riverside", "Market"], rnd)} Cafe`,
    minCount: 1,
  },
  {
    key: "bar",
    label: "Bar",

    minDistance: 2,
    allowedTags: ["urban_core", "urban", "suburban", "commercial"],
    weight: 4,
    props: { icon: "🍺", category: "food" },
    nameFn: ({ rnd }) => `${pick(["The Anchor", "The Fox", "The Lantern", "The Brass Rail"], rnd)}`,
    minCount: 1,
  },

  // ────────────────────────────
  // SERVICES / HEALTH / EDUCATION
  // ────────────────────────────
  {
    key: "clinic",
    label: "Clinic",

    minDistance: 5,
    allowedTags: ["urban", "suburban", "residential"],
    weight: 2,
    props: { icon: "🏥", category: "service" },
    nameFn: ({ rnd }) => `${pick(["Riverside", "Northside", "Elm"], rnd)} Clinic`,
    minCount: 1,
  },
  {
    key: "hospital",
    label: "Hospital",
    maxCount: 1,
    minDistance: 99,
    allowedTags: ["urban", "urban_core", "suburban"],
    weight: 1,
    props: { icon: "🏥", category: "service" },
    nameFn: ({ rnd }) => `${pick(["St. Genevieve", "General", "Memorial"], rnd)} Hospital`,
    minCount: 1,
  },
  {
    key: "gym",
    label: "Gym",

    minDistance: 3,
    allowedTags: ["urban", "suburban", "residential", "commercial"],
    weight: 2,
    props: { icon: "🏋️", category: "service" },
    nameFn: ({ rnd }) => `${pick(["Ironworks", "Pulse", "Forge", "AnyGym"], rnd)} Gym`,
    minCount: 1,
  },
  {
    key: "salon",
    label: "Salon",

    minDistance: 2,
    allowedTags: ["urban", "suburban", "residential", "commercial"],
    weight: 3,
    props: { icon: "💇", category: "service" },
    nameFn: ({ rnd }) => `${pick(["Velvet", "Luxe", "Glow", "ClipJoint"], rnd)} Salon`,
    minCount: 1,
  },
  {
    key: "church",
    label: "Church",

    minDistance: 12,
    allowedTags: ["urban", "suburban", "historic", "residential"],
    weight: 1,
    props: { icon: "⛪", category: "service" },
    nameFn: ({ rnd }) => `${pick(["St. Genevieve", "All Saints", "Trinity", "Grace"], rnd)} Church`,
    minCount: 1,
  },

  // ────────────────────────────
  // EDUCATION (specific names you gave)
  // ────────────────────────────
  {
    key: "primary_school",
    label: "Primary School",

    minDistance: 8,
    allowedTags: ["urban", "suburban", "residential"],
    weight: 2,
    props: { icon: "🏫", category: "education" },
    nameFn: ({ rnd }) => `${pick(["Primary School of Mayor Brigadier Little", "Elm Primary School", "Maple Primary"], rnd)}`,
    minCount: 1,
  },
  {
    key: "middle_school",
    label: "Middle School",

    minDistance: 10,
    allowedTags: ["urban", "suburban", "residential"],
    weight: 2,
    props: { icon: "🏫", category: "education" },
    nameFn: () => "Middle School no. 1",
    minCount: 1,
  },
  {
    key: "high_school",
    label: "High School",

    minDistance: 16,
    allowedTags: ["urban", "suburban"],
    weight: 1,
    props: { icon: "🏫", category: "education" },
    nameFn: ({ rnd }) => `${pick(["St. Genevieve's High School", "Riverside High", "Docktown High"], rnd)}`,
    minCount: 1,
  },
  {
    key: "university",
    label: "University",
    maxCount: 1,
    minDistance: 99,
    allowedTags: ["education", "urban", "suburban"],
    weight: 1,
    props: { icon: "🎓", category: "education" },
    nameFn: () => "University of Docktown",
    minCount: 1,
  },

  // ────────────────────────────
  // INDUSTRY / UTILITIES / SAFETY
  // ────────────────────────────
  {
    key: "mechanic",
    label: "Mechanic",

    minDistance: 3,
    allowedTags: ["industrial", "urban_edge", "suburban", "commercial"],
    weight: 2,
    props: { icon: "🔧", category: "industry" },
    nameFn: ({ rnd }) => `${pick(["Ace Auto", "Riverside Motors", "Dockside Auto", "Union Garage"], rnd)}`,
    minCount: 1,
  },
  {
    key: "police_station",
    label: "Police Station",

    minDistance: 6,
    allowedTags: ["urban", "suburban", "commercial"],
    weight: 1,
    props: { icon: "🚓", category: "safety" },
    nameFn: ({ rnd }) => `${pick(["1st Precinct", "Central Precinct", "Harbor Precinct"], rnd)}`,
    minCount: 1,
  },
  {
    key: "fire_station",
    label: "Fire Department",

    minDistance: 6,
    allowedTags: ["urban", "suburban", "industrial"],
    weight: 1,
    props: { icon: "🚒", category: "safety" },
    nameFn: ({ rnd }) => `${pick(["Fire Station 1", "Fire Marshall Station", "Volonteer Fire Department"], rnd)}`,
    minCount: 1,
  },

  // ────────────────────────────
  // HOUSING
  // ────────────────────────────
  {
    key: "apartment_complex",
    label: "Apartment Complex",

    minDistance: 2,
    allowedTags: ["urban", "suburban", "residential", "dense"],
    weight: 3,
    props: { icon: "🏢", category: "housing", multi: true },
    nameFn: ({ rnd }) => `${pick(["Riverside", "Maple", "Union", "Elm"], rnd)} Apartments`,
    minCount: 1,
  },
];
