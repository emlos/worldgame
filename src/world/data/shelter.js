// Outdoor has full weather exposure. Covered blocks precipitation but follows
// outdoor air; indoor blocks both weather and ambient temperature penalties.
export const PlaceShelter = Object.freeze({
  OUTDOOR: "outdoor",
  COVERED: "covered",
  INDOOR: "indoor",
});

const SHELTER_VALUES = new Set(Object.values(PlaceShelter));

export function normalizePlaceShelter(value) {
  const shelter = value ?? PlaceShelter.OUTDOOR;
  if (!SHELTER_VALUES.has(shelter)) {
    throw new RangeError(`Unknown place shelter '${String(shelter)}'`);
  }
  return shelter;
}

export function getPlaceShelter(place) {
  // No current place means the player is on the location's outdoor streets.
  return normalizePlaceShelter(place?.props?.shelter);
}
