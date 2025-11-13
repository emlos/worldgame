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
    unique: true,
    minDistance: 99,
    allowedTags: ["urban_core", "urban_center"],
    weight: 1,
    props: { icon: "🟦", category: "civic" },
    nameFn: ({ tags }) => (has(tags, "historic") ? "Old Town Square" : "Town Square"),
  },
  {
    key: "civil_office",
    label: "Civil Office",
    unique: false,
    minDistance: 8,
    allowedTags: ["urban_core", "urban", "suburban"],
    weight: 1,
    props: { icon: "🏛️", category: "civic" },
    nameFn: ({ tags }) => (has(tags, "urban_core") ? "Downtown Civil Office" : "Civil Office"),
  },
  {
    key: "train_station",
    label: "Train Station",
    unique: true,
    minDistance: 99,
    allowedTags: ["urban_edge", "industrial", "suburban_hub", "urban"],
    weight: 1,
    props: { icon: "🚉", category: "transport" },
    nameFn: ({ tags }) => (has(tags, "urban_core") ? "Central Station" : "Train Station"),
  },
  {
    key: "bus_station",
    label: "Bus Station",
    unique: true,
    minDistance: 99,
    allowedTags: ["urban", "suburban_hub", "urban_core"],
    weight: 1,
    props: { icon: "🚏", category: "transport" },
    nameFn: ({ tags }) => (has(tags, "urban_core") ? "Central Bus Station" : "Bus Station"),
  },
  {
    key: "bus_stop",
    label: "Bus Stop",
    unique: false,
    minDistance: 2,
    allowedTags: ["urban_core", "urban", "suburban", "industrial", "commercial", "residential"],
    weight: 6,
    props: { icon: "🚌", category: "transport" },
    nameFn: ({ index }) => seqName("Bus Stop", { index }),
  },
  {
    key: "boulevard",
    label: "Boulevard",
    unique: false,
    minDistance: 6,
    allowedTags: ["urban_core", "urban", "commercial"],
    weight: 1,
    props: { icon: "🛣️", category: "civic" },
    nameFn: ({ rnd }) => `${pick(["King", "Queen", "Liberty", "Harbor", "Market", "Union", "Elm"], rnd)} Boulevard`,
  },

  // ────────────────────────────
  // LEISURE / CULTURE
  // ────────────────────────────
  {
    key: "park",
    label: "Park",
    unique: false,
    minDistance: 3,
    allowedTags: ["urban", "suburban", "parkland", "residential", "rural"],
    weight: 3,
    props: { icon: "🌳", category: "leisure" },
    nameFn: ({ rnd, tags }) => (has(tags, "urban_core") ? `${pick(["Central", "City", "Common"], rnd)} Park` : `${pick(["Maple", "Oak", "Riverside", "West"], rnd)} Park`),
  },
  {
    key: "stadium",
    label: "Stadium",
    unique: true,
    minDistance: 99,
    allowedTags: ["urban_edge", "suburban", "commercial"],
    weight: 1,
    props: { icon: "🏟️", category: "leisure" },
    nameFn: ({ rnd }) => `${pick(["Riverview", "Summit", "Harbor", "Union"], rnd)} Stadium`,
  },
  {
    key: "theater",
    label: "Theater",
    unique: false,
    minDistance: 6,
    allowedTags: ["urban_core", "urban", "historic", "commercial"],
    weight: 1,
    props: { icon: "🎭", category: "culture" },
    nameFn: ({ rnd, tags }) => (has(tags, "historic") ? `${pick(["Imperial", "Bijou", "Majestic"], rnd)} Theater` : "Theater"),
  },
  {
    key: "cinema",
    label: "Cinema",
    unique: false,
    minDistance: 5,
    allowedTags: ["urban", "suburban", "commercial"],
    weight: 2,
    props: { icon: "🎬", category: "culture" },
    nameFn: ({ rnd }) => `${pick(["Arcadia", "Odeon", "Vista", "Galaxy"], rnd)} Cinema`,
  },
  {
    key: "museum",
    label: "Museum",
    unique: false,
    minDistance: 12,
    allowedTags: ["urban_core", "urban", "historic", "tourism"],
    weight: 1,
    props: { icon: "🏛️", category: "culture" },
    nameFn: ({ rnd, tags }) => (has(tags, "coastal") ? `${pick(["Maritime", "Harbor"], rnd)} Museum` : `${pick(["City", "Regional"], rnd)} Museum`),
  },
  {
    key: "library",
    label: "Library",
    unique: false,
    minDistance: 6,
    allowedTags: ["urban", "suburban", "education", "residential"],
    weight: 2,
    props: { icon: "📚", category: "culture" },
    nameFn: ({ rnd }) => `${pick(["Central", "North", "West", "Riverside"], rnd)} Library`,
  },
  {
    key: "club",
    label: "Club",
    unique: false,
    minDistance: 5,
    allowedTags: ["urban_core", "urban", "commercial"],
    weight: 2,
    props: { icon: "🎧", category: "leisure" },
    nameFn: ({ rnd }) => `${pick(["Neon", "Pulse", "Echo", "Velvet"], rnd)} Club`,
  },

  // ────────────────────────────
  // COMMERCE / FOOD & DRINK
  // ────────────────────────────
  {
    key: "market",
    label: "Market",
    unique: false,
    minDistance: 3,
    allowedTags: ["urban_core", "urban", "commercial"],
    weight: 2,
    props: { icon: "🧺", category: "commerce" },
    nameFn: ({ rnd, tags }) => (has(tags, "historic") ? `${pick(["Old", "Heritage"], rnd)} Market` : `${pick(["Central", "City"], rnd)} Market`),
  },
  {
    key: "fish_market",
    label: "Fish Market",
    unique: false,
    minDistance: 4,
    allowedTags: ["coastal", "commercial", "urban"],
    weight: 2,
    props: { icon: "🐟", category: "commerce" },
    nameFn: ({ tags }) => (has(tags, "coastal") ? "Harbor Fish Market" : "Fish Market"),
  },
  {
    key: "mall",
    label: "Shopping Mall",
    unique: true,
    minDistance: 99,
    allowedTags: ["commercial", "suburban"],
    weight: 1,
    props: { icon: "🏬", category: "commerce" },
    nameFn: ({ rnd }) => `${pick(["North", "Harbor", "Grand", "Sunset"], rnd)} Mall`,
  },
  {
    key: "corner_store",
    label: "Corner Store",
    unique: false,
    minDistance: 2,
    allowedTags: ["urban", "suburban", "residential", "commercial"],
    weight: 4,
    props: { icon: "🏪", category: "commerce" },
    nameFn: ({ rnd }) => `${pick(["QuickMart", "Stop&Shop", "MiniMart"], rnd)}`,
  },
  {
    key: "restaurant",
    label: "Restaurant",
    unique: false,
    minDistance: 2,
    allowedTags: ["urban", "suburban", "commercial"],
    weight: 4,
    props: { icon: "🍽️", category: "food" },
    nameFn: ({ rnd }) => `${pick(["Olive Court", "Dockside Grill", "Sunset Table", "Elm Bistro"], rnd)}`,
  },
  {
    key: "pizzeria",
    label: "Pizzeria",
    unique: false,
    minDistance: 2,
    allowedTags: ["urban", "suburban", "commercial", "residential"],
    weight: 3,
    props: { icon: "🍕", category: "food" },
    nameFn: ({ rnd }) => `${pick(["Tony's", "Mama Mia", "Brick Oven", "Harbor Slice"], rnd)} Pizzeria`,
  },
  {
    key: "cafe",
    label: "Cafe",
    unique: false,
    minDistance: 2,
    allowedTags: ["urban_core", "urban", "suburban", "education", "commercial", "residential"],
    weight: 5,
    props: { icon: "☕", category: "food" },
    nameFn: ({ rnd, tags }) => `${pick(has(tags, "education") ? ["Campus", "Quad", "Student"] : ["Central", "Riverside", "Market"], rnd)} Cafe`,
  },
  {
    key: "bar",
    label: "Bar",
    unique: false,
    minDistance: 2,
    allowedTags: ["urban_core", "urban", "suburban", "commercial"],
    weight: 4,
    props: { icon: "🍺", category: "food" },
    nameFn: ({ rnd }) => `${pick(["The Anchor", "The Fox", "The Lantern", "The Brass Rail"], rnd)}`,
  },

  // ────────────────────────────
  // SERVICES / HEALTH / EDUCATION
  // ────────────────────────────
  {
    key: "clinic",
    label: "Clinic",
    unique: false,
    minDistance: 5,
    allowedTags: ["urban", "suburban", "residential"],
    weight: 2,
    props: { icon: "🏥", category: "service" },
    nameFn: ({ rnd }) => `${pick(["Riverside", "Northside", "Elm"], rnd)} Clinic`,
  },
  {
    key: "hospital",
    label: "Hospital",
    unique: true,
    minDistance: 99,
    allowedTags: ["urban", "urban_core", "suburban"],
    weight: 1,
    props: { icon: "🏥", category: "service" },
    nameFn: ({ rnd }) => `${pick(["St. Genevieve", "General", "Memorial"], rnd)} Hospital`,
  },
  {
    key: "gym",
    label: "Gym",
    unique: false,
    minDistance: 3,
    allowedTags: ["urban", "suburban", "residential", "commercial"],
    weight: 2,
    props: { icon: "🏋️", category: "service" },
    nameFn: ({ rnd }) => `${pick(["Ironworks", "Pulse", "Forge", "AnyGym"], rnd)} Gym`,
  },
  {
    key: "salon",
    label: "Salon",
    unique: false,
    minDistance: 2,
    allowedTags: ["urban", "suburban", "residential", "commercial"],
    weight: 3,
    props: { icon: "💇", category: "service" },
    nameFn: ({ rnd }) => `${pick(["Velvet", "Luxe", "Glow", "ClipJoint"], rnd)} Salon`,
  },
  {
    key: "church",
    label: "Church",
    unique: false,
    minDistance: 12,
    allowedTags: ["urban", "suburban", "historic", "residential"],
    weight: 1,
    props: { icon: "⛪", category: "service" },
    nameFn: ({ rnd }) => `${pick(["St. Genevieve", "All Saints", "Trinity", "Grace"], rnd)} Church`,
  },

  // ────────────────────────────
  // EDUCATION (specific names you gave)
  // ────────────────────────────
  {
    key: "primary_school",
    label: "Primary School",
    unique: false,
    minDistance: 8,
    allowedTags: ["urban", "suburban", "residential"],
    weight: 2,
    props: { icon: "🏫", category: "education" },
    nameFn: ({ rnd }) => `${pick(["Primary School of Mayor Brigadier Little", "Elm Primary School", "Maple Primary"], rnd)}`,
  },
  {
    key: "middle_school",
    label: "Middle School",
    unique: false,
    minDistance: 10,
    allowedTags: ["urban", "suburban", "residential"],
    weight: 2,
    props: { icon: "🏫", category: "education" },
    nameFn: () => "Middle School no. 1",
  },
  {
    key: "high_school",
    label: "High School",
    unique: false,
    minDistance: 16,
    allowedTags: ["urban", "suburban"],
    weight: 1,
    props: { icon: "🏫", category: "education" },
    nameFn: ({ rnd }) => `${pick(["St. Genevieve's High School", "Riverside High", "Docktown High"], rnd)}`,
  },
  {
    key: "university",
    label: "University",
    unique: true,
    minDistance: 99,
    allowedTags: ["education", "urban", "suburban"],
    weight: 1,
    props: { icon: "🎓", category: "education" },
    nameFn: () => "University of Docktown",
  },

  // ────────────────────────────
  // INDUSTRY / UTILITIES / SAFETY
  // ────────────────────────────
  {
    key: "mechanic",
    label: "Mechanic",
    unique: false,
    minDistance: 3,
    allowedTags: ["industrial", "urban_edge", "suburban", "commercial"],
    weight: 2,
    props: { icon: "🔧", category: "industry" },
    nameFn: ({ rnd }) => `${pick(["Ace Auto", "Riverside Motors", "Dockside Auto", "Union Garage"], rnd)}`,
  },
  {
    key: "police_station",
    label: "Police Station",
    unique: false,
    minDistance: 6,
    allowedTags: ["urban", "suburban", "commercial"],
    weight: 1,
    props: { icon: "🚓", category: "safety" },
    nameFn: ({ rnd }) => `${pick(["1st Precinct", "Central Precinct", "Harbor Precinct"], rnd)}`,
  },
  {
    key: "fire_station",
    label: "Fire Department",
    unique: false,
    minDistance: 6,
    allowedTags: ["urban", "suburban", "industrial"],
    weight: 1,
    props: { icon: "🚒", category: "safety" },
    nameFn: ({ rnd }) => `${pick(["Fire Station 1", "Ladder 3", "Engine 5"], rnd)}`,
  },

  // ────────────────────────────
  // HOUSING
  // ────────────────────────────
  {
    key: "apartment_complex",
    label: "Apartment Complex",
    unique: false,
    minDistance: 2,
    allowedTags: ["urban", "suburban", "residential", "dense"],
    weight: 5,
    props: { icon: "🏢", category: "housing", multi: true },
    nameFn: ({ rnd }) => `${pick(["Riverside", "Maple", "Union", "Elm"], rnd)} Apartments`,
  },
];
