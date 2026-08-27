//TODO: locationText.js -> generic random lines to show per location tag/for specific locations
//-> if a location fits both a tag AND it has a specifically defined pool of lines, then join all the eligible lines for a location in a single pool and pick from that pool

//TODO: placeText.js -> generic random lines to show per place tag/for specific places
//-> if a place fits both a tag AND it has a specifically defined pool of lines, then join all the eligible lines for a place in a single pool and pick from that pool

//TODO: specialText.js -> random lines to show when certain flags are true, or when certain conditions are met (e.g. player has a certain item, or has completed a certain quest, there is a full moon, etc..)

export const LOCATION_DESCRIPTIONS = Object.freeze([
  "People pass through at an unhurried pace, each occupied with their own destination.",
  "The surrounding streets carry the low, constant noise of the town.",
  "A few distant conversations drift through the air before fading again.",
  "The area feels lived-in, marked by the routines of the people who pass through it.",
  "Traffic and footsteps create a steady rhythm along the street.",
]);

export const PLACE_DESCRIPTIONS = Object.freeze([
  "The room has the familiar atmosphere of a place used throughout the day.",
  "Small signs of recent activity are visible around you.",
  "The sounds from outside become quieter once you step in.",
  "People come and go, rarely paying much attention to the door.",
  "The place settles into the ordinary rhythm of the day.",
]);

export const SCENE_TEXT = Object.freeze({
  sectionHeading: Object.freeze({
    events: "Things to do",
    places: "Places of interest",
    people: "People here",
    travel: "Travel",
    local: "Other",
    navigation: "Navigation",
  }),

  locationHeading(streetName, locationName) {
    return streetName ? `${streetName} · ${locationName}` : locationName;
  },

  locationIntroduction(streetName, locationName) {
    return streetName
      ? `You are near ${streetName} in ${locationName}.`
      : `You are in ${locationName}.`;
  },

  placeIntroduction(placeName, locationName) {
    return `You are inside ${placeName} in ${locationName}.`;
  },

  travelChoice(streetName, destinationName) {
    return `Follow ${streetName || "the road"} to ${destinationName}`;
  },

  loiterChoice: "Loiter for a while",
  leaveChoice: "Leave",

  placeAccess(access, currentPlaceName = null) {
    switch (access.code) {
      case "already-inside":
        return `You must leave ${currentPlaceName || "this place"} first.`;
      case "not-here":
        return "That place is not available from here.";
      case "closed":
        return `${access.place?.name || "That place"} is closed.`;
      case "missing-access-flag": {
        const ownerName = access.owner?.meta?.shortName || access.owner?.name;
        return ownerName
          ? `You need ${ownerName}'s permission to enter.`
          : "You do not have permission to enter that place.";
      }
      case "age-minimum":
        return `You must be at least ${access.requiredAge} to enter.`;
      case "age-maximum":
        return `You must be ${access.requiredAge} or younger to enter.`;
      case "allowed":
        return null;
      default:
        return "You cannot enter that place right now.";
    }
  },

  travelLog(destinationName) {
    return `Travel to ${destinationName}`;
  },

  enterLog(placeName) {
    return `Enter ${placeName}`;
  },

  leaveLog(placeName) {
    return `Leave ${placeName}`;
  },

  loiterLog: "Loiter",

  travelResult(destinationName) {
    return `You arrive in ${destinationName}.`;
  },

  enterResult(placeName) {
    return `You enter ${placeName}.`;
  },

  leaveResult(placeName) {
    return `You step outside ${placeName}.`;
  },

  loiterResult: "You spend a little while watching the area around you.",

});
