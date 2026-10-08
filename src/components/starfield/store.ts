/**
 * Game state in one zustand store: what the engine flies by, what the panels show, and what is
 * saved. Each game makes its own store, so a remount or a server render starts clean.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { clamp01 } from "./math.ts";
import { type LogEntry, type Save, type SaveStorage, SAVE_VERSION, freshSave, writeSave } from "./saves.ts";
import { bodyById, nextInNav } from "./system.ts";
import { TASKS } from "./tasks.ts";
import {
  HOLD_MAX,
  STATION_LIMIT,
  type Depot,
  type GoodId,
  type Hold,
  holdUnits,
  payRate,
  priceOf,
  stationCost,
  stationPay,
  stationsIn,
} from "./trade.ts";
import type { CameraView, StarfieldParams } from "./types.ts";

/** One message at a time. Rewards hold a little longer than notes. */
export type Toast = { id: number; title: string; detail?: string; reward: boolean };

export const VIEW_ORDER: readonly CameraView[] = ["cockpit", "chase", "left", "right", "above"];
export const FIRST_FLIGHT = ["earth", "moon", "mars"];
/** Away this long before station earnings get a welcome-back note. */
export const AWAY_MS = 60_000;

export type GameState = {
  // Saved.
  speed: number;
  density: number;
  muted: boolean;
  view: CameraView;
  aboveSide: -1 | 0 | 1;
  charted: string[];
  chapterId: string;
  log: LogEntry[];
  helpSeen: boolean;
  credits: number;
  hold: Hold;
  depots: Depot[];
  paid: number;

  // Flight.
  boost: boolean;
  targetId: string;
  autopilot: boolean;
  orbit: boolean;
  orbitLevel: number;
  focus: boolean;
  paused: boolean;
  reducedMotion: boolean;
  /** The First flight stops still to come. */
  tour: string[] | null;

  // Screen.
  hint: boolean;
  error: string;
  navOpen: boolean;
  moreOpen: boolean;
  mapOpen: boolean;
  atlasOpen: boolean;
  logOpen: boolean;
  lesson: number | null;
  offerOpen: boolean;
  full: boolean;
  noseLevel: boolean;
  nearId: string;
  dismissed: string;
  alert: string;
  coach: string;
  gazeOn: boolean;
  gazeNote: string;
  toasts: Toast[];
};

export type GameActions = {
  /** Takes in a save and pays the stations for the time away. */
  load(save: Save, now: number): void;
  notify(title: string, detail?: string, reward?: boolean): void;
  dropToast(): void;

  setSpeed(value: number): void;
  setDensity(value: number): void;
  toggleMuted(): void;
  cycleView(): void;

  /** Autopilot to a place and hold it in view. */
  flyTo(id: string): void;
  /** Pick a place in the nav. Steering stays with the player. */
  pickTarget(id: string): void;
  /** Hold an orbit round a place, flown by hand. */
  orbitAt(id: string): void;
  /** An orbit height button. The active height again leaves the orbit. */
  pickOrbit(id: string, level: number): void;
  /** Double-tap a world. Again on the world being orbited lets go. */
  focusOn(id: string): void;
  toggleOrbit(): void;
  toggleBoost(): void;
  toggleAutopilot(): void;
  /** A slingshot lap ends with a burn out. */
  endLap(): void;
  /** The brief's Next: on to the place after the one you are at. */
  flyNext(): void;
  /** The nav's Next: on to the place after the target. */
  stepTour(): void;
  startFirstFlight(): void;
  /** Arrive in a chapter, flying to its first place. */
  startChapter(first: string): void;

  /** True the first time a place is charted. Moves the First flight on. */
  chart(id: string): boolean;
  /** True the first time a task is logged. */
  logTask(id: string, seconds: number): boolean;

  buy(good: GoodId): void;
  sell(good: GoodId): void;
  deployStation(at: { x: number; z: number }, now: number): void;
  payStations(now: number): void;

  toggleNav(): void;
  toggleMore(): void;
  openHelp(): void;
  toggleLog(): void;
  closeLesson(): void;
  /** Escape closes the top panel, or pauses when none is open. */
  back(): void;
};

export type Game = GameState & GameActions;
export type GameStore = StoreApi<Game>;

function stateOf(save: Save): Pick<GameState, SavedKey> {
  return {
    ...save.settings,
    charted: save.charted,
    chapterId: save.chapter,
    log: save.log,
    helpSeen: save.helpSeen,
    credits: save.trade.credits,
    hold: save.trade.hold,
    depots: save.trade.depots,
    paid: save.trade.paid,
  };
}

const SAVED = [
  "speed",
  "density",
  "muted",
  "view",
  "aboveSide",
  "charted",
  "chapterId",
  "log",
  "helpSeen",
  "credits",
  "hold",
  "depots",
  "paid",
] as const satisfies readonly (keyof GameState)[];

type SavedKey = (typeof SAVED)[number];

export function saveOf(state: GameState): Save {
  return {
    version: SAVE_VERSION,
    settings: { speed: state.speed, density: state.density, muted: state.muted, view: state.view, aboveSide: state.aboveSide },
    charted: state.charted,
    chapter: state.chapterId,
    log: state.log,
    helpSeen: state.helpSeen,
    trade: { credits: state.credits, hold: state.hold, depots: state.depots, paid: state.paid },
  };
}

/** What the engine reads at the start of each frame. */
export function paramsOf(state: GameState): StarfieldParams {
  return {
    speed: state.speed,
    density: state.density,
    boost: state.boost,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    targetId: state.targetId,
    autopilot: state.autopilot,
    focus: state.focus,
    orbit: state.orbit,
    orbitLevel: state.orbitLevel,
    view: state.view,
    aboveSide: state.aboveSide,
    paused: state.paused,
    // Only this chapter's stations: the others sit on other maps.
    depots: stationsIn(state.depots, state.chapterId),
  };
}

/** Writes the save whenever a saved field changes. Returns the unsubscribe. */
export function keepSaved(store: GameStore, storage: SaveStorage | null): () => void {
  return store.subscribe((state, prev) => {
    if (SAVED.some((key) => state[key] !== prev[key])) writeSave(storage, saveOf(state));
  });
}

const flying = (id: string) => ({ targetId: id, orbit: false, boost: false, autopilot: true, focus: true });
const orbiting = (id: string) => ({ targetId: id, orbit: true, boost: false, autopilot: false, focus: false });

export function createGameStore(now = Date.now()): GameStore {
  let toastSeq = 0;
  return createStore<Game>()((set, get) => ({
    ...stateOf(freshSave(now)),
    boost: false,
    targetId: "earth",
    autopilot: false,
    orbit: false,
    orbitLevel: 1,
    focus: false,
    paused: false,
    reducedMotion: false,
    tour: null,
    hint: true,
    error: "",
    navOpen: false,
    moreOpen: false,
    mapOpen: false,
    atlasOpen: false,
    logOpen: false,
    lesson: null,
    offerOpen: true,
    full: false,
    noseLevel: false,
    nearId: "",
    dismissed: "",
    alert: "",
    coach: "",
    gazeOn: false,
    gazeNote: "",
    toasts: [],

    load(save, at) {
      const income = stationPay(payRate(save.trade.depots), save.trade.paid, at);
      set({
        ...stateOf(save),
        credits: Math.max(0, Math.floor(save.trade.credits + income.gain)),
        paid: income.at,
      });
      if (income.gain > 0 && at - save.trade.paid >= AWAY_MS) {
        get().notify(`+${income.gain.toLocaleString()} Cr`, "Your stations earned this while you were away.", true);
      }
    },
    notify(title, detail, reward = false) {
      toastSeq += 1;
      const toast = { id: toastSeq, title, detail, reward };
      set((state) => ({ toasts: [...state.toasts, toast] }));
    },
    dropToast() {
      set((state) => ({ toasts: state.toasts.slice(1) }));
    },

    setSpeed(value) {
      set({ speed: clamp01(value) });
    },
    setDensity(value) {
      set({ density: clamp01(value) });
    },
    toggleMuted() {
      set((state) => ({ muted: !state.muted }));
    },
    cycleView() {
      const { view, aboveSide } = get();
      if (view === "above") {
        // Above steps left, center, right, then back round to the cockpit.
        if (aboveSide < 1) set({ aboveSide: aboveSide < 0 ? 0 : 1 });
        else set({ aboveSide: -1, view: "cockpit" });
        return;
      }
      const next = VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length]!;
      set(next === "above" ? { view: next, aboveSide: -1 } : { view: next });
    },

    flyTo(id) {
      set(flying(id));
    },
    pickTarget(id) {
      set({ targetId: id, orbit: false, autopilot: false, focus: true, navOpen: false });
    },
    orbitAt(id) {
      set(orbiting(id));
    },
    pickOrbit(id, level) {
      const { orbit, targetId, orbitLevel } = get();
      if (orbit && targetId === id && orbitLevel === level) set({ orbit: false });
      else set({ orbitLevel: level, ...orbiting(id) });
    },
    focusOn(id) {
      const { targetId, orbit } = get();
      if (targetId === id && orbit) set({ orbit: false, focus: false, autopilot: false });
      else set({ ...flying(id), orbit: true });
    },
    toggleOrbit() {
      set((state) => (state.orbit ? { orbit: false } : { orbit: true, boost: false, autopilot: false, focus: false }));
    },
    toggleBoost() {
      set((state) => ({ boost: !state.boost, orbit: false }));
    },
    toggleAutopilot() {
      set((state) => ({ autopilot: !state.autopilot, orbit: false }));
    },
    endLap() {
      set({ orbit: false, boost: true, autopilot: false });
    },
    flyNext() {
      const { nearId, chapterId } = get();
      const next = nearId ? nextInNav(chapterId, nearId) : undefined;
      if (!next) return;
      set({ ...flying(next.id), dismissed: nearId });
    },
    stepTour() {
      const { targetId, chapterId, nearId } = get();
      const next = nextInNav(chapterId, targetId);
      if (!next || next.id === targetId) return;
      set({ ...flying(next.id), navOpen: false, ...(nearId ? { dismissed: nearId } : {}) });
    },
    startFirstFlight() {
      set({
        ...flying(FIRST_FLIGHT[0]!),
        tour: [...FIRST_FLIGHT],
        offerOpen: false,
        hint: false,
        lesson: null,
        paused: false,
        coach: "First flight: Earth, then the Moon, then Mars.",
      });
    },
    startChapter(first) {
      set({ ...flying(first), dismissed: "", navOpen: false, mapOpen: false });
    },

    chart(id) {
      const { charted, tour } = get();
      if (charted.includes(id)) return false;
      const next = [...charted, id];
      const index = tour ? tour.indexOf(id) : -1;
      const after = index >= 0 ? tour?.[index + 1] : undefined;
      if (after) set({ charted: next, ...flying(after), coach: `Next: ${bodyById(after).name}.` });
      else if (index >= 0) set({ charted: next, tour: null, autopilot: false, coach: "First flight done. Pick the next world." });
      else set({ charted: next });
      return true;
    },
    logTask(id, seconds) {
      const { log } = get();
      if (log.some((entry) => entry.id === id) || !TASKS.some((task) => task.id === id)) return false;
      set({ log: [...log, { id, seconds }] });
      return true;
    },

    buy(good) {
      const { nearId, credits, hold } = get();
      if (!nearId) return;
      const cost = priceOf(nearId, good);
      if (credits < cost || holdUnits(hold) >= HOLD_MAX) return;
      set({ credits: credits - cost, hold: { ...hold, [good]: hold[good] + 1 } });
    },
    sell(good) {
      const { nearId, credits, hold } = get();
      if (!nearId || hold[good] < 1) return;
      set({ credits: credits + priceOf(nearId, good), hold: { ...hold, [good]: hold[good] - 1 } });
    },
    deployStation(at, now) {
      const { nearId, chapterId, credits, depots, logTask, notify } = get();
      const cost = stationCost(chapterId);
      if (nearId || credits < cost || stationsIn(depots, chapterId).length >= STATION_LIMIT) return;
      const count = depots.length + 1;
      const depot = { id: `depot-${now}`, chapter: chapterId, x: at.x, z: at.z };
      set({ credits: credits - cost, depots: [...depots, depot], moreOpen: false });
      logTask("haul", 0);
      if (count >= 3) logTask("lane", 0);
      if (count === 3) notify("Three stations are paying you");
      else notify("Station deployed", "It earns while you fly.");
    },
    payStations(now) {
      const { depots, paid } = get();
      if (depots.length === 0) {
        set({ paid: now });
        return;
      }
      const income = stationPay(payRate(depots), paid, now);
      set((state) => ({ paid: income.at, credits: state.credits + income.gain }));
    },

    toggleNav() {
      set((state) => ({ navOpen: !state.navOpen, moreOpen: false }));
    },
    toggleMore() {
      set((state) => ({ moreOpen: !state.moreOpen, navOpen: false }));
    },
    openHelp() {
      set({ lesson: 0, logOpen: false });
    },
    toggleLog() {
      set((state) => ({ logOpen: !state.logOpen, lesson: null }));
    },
    closeLesson() {
      set({ lesson: null, helpSeen: true });
    },
    back() {
      const { lesson, logOpen, moreOpen, navOpen, closeLesson } = get();
      if (lesson !== null) closeLesson();
      else if (logOpen) set({ logOpen: false });
      else if (moreOpen) set({ moreOpen: false });
      else if (navOpen) set({ navOpen: false });
      else set((state) => ({ paused: !state.paused }));
    },
  }));
}
