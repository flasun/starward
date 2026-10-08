/** Dock trade and deep-space stations. Prices are fixed per place so a run has a reason. */

import { JOURNEY } from "./journey.ts";
import type { BodyDef } from "./system.ts";

export const GOODS = [
  { id: "minerals", name: "Minerals" },
  { id: "water", name: "Water" },
  { id: "tech", name: "Tech" },
] as const;

export type GoodId = (typeof GOODS)[number]["id"];

export type Hold = Record<GoodId, number>;

/** A station, in the open space of the chapter it was deployed in. */
export type Depot = { id: string; chapter: string; x: number; z: number };

export const START_CREDITS = 240;
export const HOLD_MAX = 8;
/** Each chapter's open space holds this many stations. */
export const STATION_LIMIT = 6;
const STATION_BASE = 480;
/** What one station pays before its chapter's scale, in thousandths of a credit per second. */
const PAY_MILLI = 120;
const OFFLINE_CAP_MS = 6 * 60 * 60 * 1000;

/** Prices, station costs, and station pay all rise together, chapter by chapter. */
const SCALE: Record<string, number> = { sun: 1, stars: 2, galaxy: 3, local: 4.5, web: 6 };

export function chapterScale(chapter: string): number {
  return SCALE[chapter] ?? 1;
}

const ROCK = new Set(["mercury", "venus", "mars", "ceres", "pluto", "io", "callisto"]);
const ICE = new Set(["moon", "europa", "ganymede", "enceladus", "titan", "triton", "charon"]);
const GIANT = new Set(["jupiter", "saturn", "uranus", "neptune"]);

/** Beyond the Sun, each kind of place is cheap in one good and dear in another. */
const KINDS = {
  /** The red dwarfs and Sun-like stars next door. */
  red: { minerals: 8, water: 18, tech: 32 },
  bright: { minerals: 26, water: 20, tech: 10 },
  giant: { minerals: 18, water: 7, tech: 30 },
  /** Gas clouds, spiral arms, and the Magellanic Clouds. */
  nebula: { minerals: 22, water: 6, tech: 28 },
  /** Star clusters, and clusters of galaxies. */
  cluster: { minerals: 9, water: 24, tech: 26 },
  galaxy: { minerals: 28, water: 18, tech: 9 },
} satisfies Record<string, Hold>;

function kindOf(place: BodyDef): keyof typeof KINDS {
  if (place.form === "star") return place.group === "Bright" ? "bright" : place.group === "Giants" ? "giant" : "red";
  if (place.form === "cluster") return "cluster";
  if (place.form === "galaxy") return "galaxy";
  return "nebula";
}

export function emptyHold(): Hold {
  return { minerals: 0, water: 0, tech: 0 };
}

export function holdUnits(hold: Hold): number {
  return hold.minerals + hold.water + hold.tech;
}

/** Every place you can chart has a market, except the Sun and the specks too small to dock at. */
export function canDock(body: { id: string; goal: boolean; speck?: boolean }): boolean {
  return body.goal && !body.speck && body.id !== "sun";
}

export function priceOf(id: string, good: GoodId): number {
  if (id === "earth") return good === "tech" ? 18 : good === "water" ? 11 : 14;
  if (ROCK.has(id)) return good === "minerals" ? 7 : good === "water" ? 20 : 32;
  if (ICE.has(id)) return good === "water" ? 6 : good === "minerals" ? 16 : 30;
  if (GIANT.has(id)) return good === "minerals" ? 24 : good === "water" ? 18 : 28;
  const place = JOURNEY.find((body) => body.id === id);
  if (place?.chapter) return Math.round(KINDS[kindOf(place)][good] * chapterScale(place.chapter));
  return good === "tech" ? 36 : 16;
}

export function stationCost(chapter: string): number {
  return Math.round(STATION_BASE * chapterScale(chapter));
}

export function stationsIn(depots: readonly Depot[], chapter: string): Depot[] {
  return depots.filter((depot) => depot.chapter === chapter);
}

/** What all the stations pay together, in thousandths of a credit per second. */
export function payRate(depots: readonly Depot[]): number {
  return depots.reduce((sum, depot) => sum + Math.round(PAY_MILLI * chapterScale(depot.chapter)), 0);
}

/**
 * Whole credits earned at `rate` since the last payout. Time away counts, up to six hours.
 * `at` keeps the part of a credit not yet paid, so short payouts add up instead of rounding away.
 */
export function stationPay(rate: number, since: number, now: number): { gain: number; at: number } {
  const elapsed = Math.min(Math.max(0, now - since), OFFLINE_CAP_MS);
  if (rate <= 0) return { gain: 0, at: now };
  const gain = Math.floor((rate * elapsed) / 1_000_000);
  const used = Math.ceil((gain * 1_000_000) / rate);
  return { gain, at: now - elapsed + used };
}
