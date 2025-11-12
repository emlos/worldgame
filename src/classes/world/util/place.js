export class Place {
  constructor({ id, key, name, locationId, props = {} }) {
    this.id = id; // unique string id for this instance
    this.key = key; // registry key ("park", "bus_stop", ...)
    this.name = name; // human label ("Central Park", "Bus Stop")
    this.locationId = locationId; // where on the map it lives
    this.props = props; // any extra attributes (capacity, icon, etc.)
  }
}

export const PLACE_REGISTRY = [
  // Civic & transport
  {
    key: "town_square",
    label: "Town Square",
    unique: true,
    minDistance: 99,
    allowedTags: ["urban_core", "urban_center"],
    weight: 1,
    props: { icon: "🟦", category: "civic" },
  },
  {
    key: "train_station",
    label: "Train Station",
    unique: true,
    minDistance: 99,
    allowedTags: ["urban_edge", "industrial", "suburban_hub"],
    weight: 1,
    props: { icon: "🚉", category: "transport" },
  },
  {
    key: "bus_stop",
    label: "Bus Stop",
    unique: false,
    minDistance: 2, // not adjacent; at least one tile/node between them
    allowedTags: ["urban_core", "urban", "suburban", "industrial", "commercial"],
    weight: 6,
    props: { icon: "🚌", category: "transport" },
  },

  // Leisure / public
  {
    key: "park",
    label: "Park",
    unique: false,
    minDistance: 3,
    allowedTags: ["urban", "suburban", "parkland", "residential"],
    weight: 3,
    props: { icon: "🌳", category: "leisure" },
  },
  {
    key: "stadium",
    label: "Stadium",
    unique: true,
    minDistance: 99,
    allowedTags: ["urban_edge", "suburban", "commercial"],
    weight: 1,
    props: { icon: "🏟️", category: "leisure" },
  },

  // Utilities / services
  {
    key: "hospital",
    label: "Hospital",
    unique: true,
    minDistance: 99,
    allowedTags: ["urban", "urban_core", "suburban"],
    weight: 1,
    props: { icon: "🏥", category: "service" },
  },
  {
    key: "school",
    label: "School",
    unique: false,
    minDistance: 4,
    allowedTags: ["residential", "suburban", "urban"],
    weight: 2,
    props: { icon: "🏫", category: "service" },
  },

  // Commerce
  {
    key: "market",
    label: "Market",
    unique: false,
    minDistance: 3,
    allowedTags: ["urban_core", "urban", "commercial"],
    weight: 2,
    props: { icon: "🧺", category: "commerce" },
  },
  {
    key: "mall",
    label: "Shopping Mall",
    unique: true,
    minDistance: 99,
    allowedTags: ["commercial", "suburban"],
    weight: 1,
    props: { icon: "🏬", category: "commerce" },
  },

  // Safety
  {
    key: "police_station",
    label: "Police Station",
    unique: false,
    minDistance: 6,
    allowedTags: ["urban", "suburban", "commercial"],
    weight: 1,
    props: { icon: "🚓", category: "safety" },
  },
  {
    key: "fire_station",
    label: "Fire Station",
    unique: false,
    minDistance: 6,
    allowedTags: ["urban", "suburban", "industrial"],
    weight: 1,
    props: { icon: "🚒", category: "safety" },
  },
];
