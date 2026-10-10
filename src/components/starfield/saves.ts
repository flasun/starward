/**
 * Progress lives in one versioned save under one key. Older builds kept six keys, first named
 * `slipstream-*` and then `starward-*`. Those are read once when no save exists, and left in place
 * so rolling back a deploy still finds them.
 */

import { clamp01 } from "./math.ts";
import { CHAPTERS, chapterOpen, isChartable } from "./system.ts";
import { TASKS } from "./tasks.ts";
import { GOODS, START_CREDITS, STATION_LIMIT, type Depot, type Hold, emptyHold, stationsIn } from "./trade.ts";
import type { CameraView } from "./types.ts";

export const SAVE_KEY = "starward-save";
/** Bump when the shape changes, and teach `parseSave` to lift the older shape. */
export const SAVE_VERSION = 1;

export type LogEntry = { id: string; seconds: number };

export type Settings = {
  speed: number;
  density: number;
  muted: boolean;
  view: CameraView;
  aboveSide: -1 | 0 | 1;
};

export type Save = {
  version: typeof SAVE_VERSION;
  settings: Settings;
  /** Places charted, in the order they were reached. */
  charted: string[];
  chapter: string;
  log: LogEntry[];
  helpSeen: boolean;
  trade: {
    credits: number;
    hold: Hold;
    depots: Depot[];
    /** When the stations last paid out, in epoch ms. */
    paid: number;
  };
};

export type SaveStorage = Pick<Storage, "getItem" | "setItem">;

const VIEWS: readonly CameraView[] = ["cockpit", "chase", "left", "right", "above"];
const LEGACY_PREFIXES = ["starward", "slipstream"] as const;

export function freshSave(now: number): Save {
  return {
    version: SAVE_VERSION,
    settings: { speed: 0.42, density: 0.52, muted: false, view: "cockpit", aboveSide: -1 },
    charted: [],
    chapter: "sun",
    log: [],
    helpSeen: false,
    trade: { credits: START_CREDITS, hold: emptyHold(), depots: [], paid: now },
  };
}

/** `localStorage`, or null where the browser blocks it. */
export function browserStorage(): SaveStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The save, else the old keys, else a fresh start. Never throws. */
export function loadSave(storage: SaveStorage | null, now: number): Save {
  if (!storage) return freshSave(now);
  try {
    const raw = storage.getItem(SAVE_KEY);
    const save = raw === null ? null : parseSave(parseJson(raw), now);
    return save ?? readLegacy(storage, now) ?? freshSave(now);
  } catch {
    return freshSave(now);
  }
}

export function writeSave(storage: SaveStorage | null, save: Save): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage full or blocked; the flight goes on */
  }
}

/** Checks every field. A bad field falls back to its default and the rest still load. */
export function parseSave(value: unknown, now: number): Save | null {
  if (!isRecord(value) || typeof value.version !== "number" || value.version < 1) return null;
  const charted = readCharted(value.charted);
  return {
    version: SAVE_VERSION,
    settings: readSettings(value.settings),
    charted,
    chapter: readChapter(value.chapter, charted),
    log: readLog(value.log),
    helpSeen: value.helpSeen === true,
    trade: readTrade(value.trade, now),
  };
}

/** One key per part, `starward-*` first. Null when the player has never saved. */
function readLegacy(storage: SaveStorage, now: number): Save | null {
  let found = false;
  const read = (name: string): string | null => {
    for (const prefix of LEGACY_PREFIXES) {
      const raw = storage.getItem(`${prefix}-${name}`);
      if (raw !== null) {
        found = true;
        return raw;
      }
    }
    return null;
  };
  const settings = readSettings(parseJson(read("settings")));
  const charted = readCharted(parseJson(read("survey")));
  // The chapter was stored as a bare string, and the help flag as "seen".
  const chapter = readChapter(read("chapter"), charted);
  const log = readLog(parseJson(read("log")));
  const helpSeen = read("help") === "seen";
  const trade = readTrade(parseJson(read("trade")), now);
  if (!found) return null;
  return { version: SAVE_VERSION, settings, charted, chapter, log, helpSeen, trade };
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readSettings(value: unknown): Settings {
  const settings = freshSave(0).settings;
  if (!isRecord(value)) return settings;
  if (isNumber(value.speed)) settings.speed = clamp01(value.speed);
  if (isNumber(value.density)) settings.density = clamp01(value.density);
  if (typeof value.muted === "boolean") settings.muted = value.muted;
  // Before there were two wing cameras, the left one was called "wing".
  if (value.view === "wing") settings.view = "left";
  if (VIEWS.includes(value.view as CameraView)) settings.view = value.view as CameraView;
  if (value.aboveSide === -1 || value.aboveSide === 0 || value.aboveSide === 1) settings.aboveSide = value.aboveSide;
  return settings;
}

function readCharted(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === "string" && isChartable(id));
  return [...new Set(ids)];
}

/** A chapter the save has not opened yet falls back to the Sun. */
function readChapter(value: unknown, charted: readonly string[]): string {
  if (typeof value !== "string") return "sun";
  return CHAPTERS.some((chapter) => chapter.id === value) && chapterOpen(value, charted) ? value : "sun";
}

function readLog(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) return [];
  const log: LogEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !isNumber(entry.seconds)) continue;
    const id = entry.id;
    if (!TASKS.some((task) => task.id === id) || log.some((item) => item.id === id)) continue;
    log.push({ id, seconds: entry.seconds });
  }
  return log;
}

function readTrade(value: unknown, now: number): Save["trade"] {
  const trade = freshSave(now).trade;
  if (!isRecord(value)) return trade;
  if (isNumber(value.credits)) trade.credits = Math.max(0, Math.floor(value.credits));
  if (isRecord(value.hold)) {
    for (const good of GOODS) {
      const amount = value.hold[good.id];
      if (isNumber(amount) && amount > 0) trade.hold[good.id] = Math.floor(amount);
    }
  }
  if (Array.isArray(value.depots)) {
    for (const item of value.depots) {
      if (!isRecord(item) || typeof item.id !== "string" || !isNumber(item.x) || !isNumber(item.z)) continue;
      // Stations from before every chapter had them are all round the Sun.
      const chapter = CHAPTERS.some((entry) => entry.id === item.chapter) ? (item.chapter as string) : "sun";
      if (stationsIn(trade.depots, chapter).length >= STATION_LIMIT) continue;
      trade.depots.push({ id: item.id, chapter, x: item.x, z: item.z });
    }
  }
  if (isNumber(value.paid)) trade.paid = value.paid;
  return trade;
}

/**
 * The daily trial keeps its own key, written only once a player races: the callsign, this
 * browser's pilot key (which owns that callsign on the board), and today's best.
 */
export const TRIAL_KEY = "starward-trial";

export type TrialPrefs = { callsign: string; key: string; best: { day: string; time: number } | null };

export function loadTrialPrefs(storage: SaveStorage | null): TrialPrefs {
  const prefs: TrialPrefs = { callsign: "", key: "", best: null };
  try {
    const value = parseJson(storage?.getItem(TRIAL_KEY) ?? null);
    if (!isRecord(value)) return prefs;
    if (typeof value.callsign === "string") prefs.callsign = value.callsign.slice(0, 40);
    if (typeof value.key === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value.key)) prefs.key = value.key;
    const best = value.best;
    if (isRecord(best) && typeof best.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(best.day) && isNumber(best.time) && best.time > 0) {
      prefs.best = { day: best.day, time: best.time };
    }
  } catch {
    /* blocked storage: start clean */
  }
  return prefs;
}

export function writeTrialPrefs(storage: SaveStorage | null, prefs: TrialPrefs): void {
  try {
    storage?.setItem(TRIAL_KEY, JSON.stringify(prefs));
  } catch {
    /* full or blocked: the trial still flies */
  }
}
