export const BUS_STOP_KEY = "bus_stop";
export const BUS_BOARDING_SCENE_ID = "transit.bus-boarding";
export const BUS_TIMETABLE_SCENE_ID = "transit.bus-timetable";

export const BUS_SERVICE = Object.freeze({
  fare: 2.5,
  travelTimeMultiplier: 0.4,
  periods: Object.freeze([
    Object.freeze({ label: "day", from: "06:00", to: "22:00", everyMinutes: 15 }),
    Object.freeze({ label: "night", from: "22:00", to: "06:00", everyMinutes: 35 }),
  ]),
});
