import {
  getNPCInteractionAccess,
  getNPCsAtCurrentPosition,
  getNPCsAtLocation,
} from "../characters/npc/presence.js";
import { createNPCs, initializeNPCBrains } from "../characters/npc/roster.js";
import {
  clearDailyFlag,
  clearStoryFlag,
  hasDailyFlag,
  hasStoryFlag,
  setDailyFlag,
  setStoryFlag,
} from "../story/storyState.js";
import { runGameAction } from "./actionRunner.js";
import {
  dismissDailyAnnouncements,
} from "./announcements.js";
import { initializeNewGame } from "./bootstrap.js";
import {
  addContact as addGameContact,
  startChat as startGameChat,
} from "./chat/runtime.js";
import { emitGameEvent, subscribeGameEvent } from "./events.js";
import {
  getPlaceAccess,
  movePlayerTo,
  relocatePlayer,
  setPlayerPlace,
} from "./movement.js";
import {
  buildGpsRoute,
  clearGpsTarget,
  setGpsTarget,
} from "./navigation.js";
import { hydrateGame, serializeGame } from "./persistence/gameSave.js";
import { addReminder, clearReminder } from "./reminders.js";
import {
  restartTimer as restartGameTimer,
  startTimer as startGameTimer,
  stopTimer as stopGameTimer,
} from "./timers.js";
import { advanceGameTime, jumpGameTime } from "./timeline.js";

export {
  SaveValidationError,
  validateGameSave,
} from "./persistence/saveValidation.js";

/** Mutable game aggregate and public command/query facade. */
export class Game {
  constructor(options = {}) {
    initializeNewGame(this, options);
  }

  get now() {
    return this.world.time.toDate();
  }

  get location() {
    return this.world.getLocation(this.currentLocationId);
  }

  get currentPlace() {
    return this.world.getPlace(this.currentLocationId, this.currentPlaceId);
  }

  get npcsArray() {
    return [...this.npcs.values()];
  }

  getRNG(name = "gameplay") {
    return this.random.stream(name);
  }

  addContact(npcId) {
    return addGameContact(this, npcId);
  }

  startChat(chatId) {
    return startGameChat(this, chatId);
  }

  advanceMinutes(minutes, options = {}) {
    return advanceGameTime(this, minutes, options);
  }

  jumpToDate(value, options = {}) {
    return jumpGameTime(this, value, options);
  }

  moveTo(locationId, options = {}) {
    return movePlayerTo(this, locationId, options);
  }

  setCurrentPlace(options = {}) {
    return setPlayerPlace(this, options);
  }

  setFlag(flag, value = true) {
    return setStoryFlag(this, flag, value);
  }

  clearFlag(flag) {
    return clearStoryFlag(this, flag);
  }

  hasFlag(flag) {
    return hasStoryFlag(this, flag);
  }

  unlockPlacesByKey(placeKey) {
    return this.world.unlockPlacesByKey(placeKey);
  }

  relocatePlayer(destination) {
    return relocatePlayer(this, destination);
  }

  setDailyFlag(flag, value = true) {
    return setDailyFlag(this, flag, value);
  }

  clearDailyFlag(flag) {
    return clearDailyFlag(this, flag);
  }

  hasDailyFlag(flag) {
    return hasDailyFlag(this, flag);
  }

  addReminder(id) {
    return addReminder(this, id);
  }

  clearReminder(id) {
    return clearReminder(this, id);
  }

  startTimer(id) {
    return startGameTimer(this, id);
  }

  restartTimer(id) {
    return restartGameTimer(this, id);
  }

  stopTimer(id) {
    return stopGameTimer(this, id);
  }

  dismissDailyAnnouncements() {
    return dismissDailyAnnouncements(this);
  }

  setGpsTarget(placeId) {
    return setGpsTarget(this, placeId);
  }

  clearGpsTarget() {
    return clearGpsTarget(this);
  }

  getGpsRoute() {
    return buildGpsRoute(this);
  }

  getNPCsAtLocation(locationId = this.currentLocationId) {
    return getNPCsAtLocation(this, locationId);
  }

  getNPCsAtCurrentPosition() {
    return getNPCsAtCurrentPosition(this);
  }

  getNPCInteractionAccess(npcOrId, options = {}) {
    return getNPCInteractionAccess(this, npcOrId, options);
  }

  getPlaceAccess(placeOrId, options = {}) {
    return getPlaceAccess(this, placeOrId, options);
  }

  runAction(action) {
    return runGameAction(this, action);
  }

  on(eventName, callback) {
    return subscribeGameEvent(this, eventName, callback);
  }

  _dispatchListeners(eventName, args) {
    return emitGameEvent(this, eventName, args);
  }

  toJSON() {
    return serializeGame(this);
  }

  static fromJSON(data) {
    return hydrateGame(Object.create(Game.prototype), data);
  }

  // Kept for the browser NPC diagnostics, which can add a roster after
  // constructing an intentionally empty game.
  _createNPCs(templates) {
    return createNPCs(this, templates);
  }

  _initializeNPCBrains() {
    return initializeNPCBrains(this);
  }
}
