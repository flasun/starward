/** Dock trade and deep-space stations. Prices are fixed per world so a run has a reason. */

export const GOODS = [
  { id: "minerals", name: "Minerals" },
  { id: "water", name: "Water" },
  { id: "tech", name: "Tech" },
] as const;

export type GoodId = (typeof GOODS)[number]["id"];

export type Hold = Record<GoodId, number>;

export type Depot = { id: string; x: number; z: number };

export const START_CREDITS = 240;
export const HOLD_MAX = 8;
export const STATION_COST = 480;
export const STATION_LIMIT = 6;
const INCOME_PER_SEC = 0.12;
const OFFLINE_CAP_MS = 6 * 60 * 60 * 1000;

const ROCK = new Set(["mercury", "venus", "mars", "ceres", "pluto", "io", "callisto"]);
const ICE = new Set(["moon", "europa", "ganymede", "enceladus", "titan", "triton", "charon"]);
const GIANT = new Set(["jupiter", "saturn", "uranus", "neptune"]);

export function emptyHold(): Hold {
  return { minerals: 0, water: 0, tech: 0 };
}

export function holdUnits(hold: Hold): number {
  return hold.minerals + hold.water + hold.tech;
}

export function canDock(body: { id: string; goal: boolean; speck?: boolean; form?: string }): boolean {
  return body.goal && !body.speck && !body.form && body.id !== "sun";
}

export function priceOf(id: string, good: GoodId): number {
  if (id === "earth") return good === "tech" ? 18 : good === "water" ? 11 : 14;
  if (ROCK.has(id)) return good === "minerals" ? 7 : good === "water" ? 20 : 32;
  if (ICE.has(id)) return good === "water" ? 6 : good === "minerals" ? 16 : 30;
  if (GIANT.has(id)) return good === "minerals" ? 24 : good === "water" ? 18 : 28;
  return good === "tech" ? 36 : 16;
}

/** Credits earned by stations since the last payout. Time away counts, up to six hours. */
export function stationPay(count: number, since: number, now: number): { gain: number; at: number } {
  const elapsed = Math.min(Math.max(0, now - since), OFFLINE_CAP_MS);
  return { gain: Math.floor((count * INCOME_PER_SEC * elapsed) / 1000), at: now };
}
