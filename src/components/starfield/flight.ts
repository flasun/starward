/** Orbit and capture geometry shared by the flight model and the camera. */

import { clamp } from "./math.ts";
import { type BodyDef, visualRadius } from "./system.ts";

/**
 * Orbits up to this radius hold their pace. Every planet's low and mid orbit, and so every lap
 * round the Sun's worlds, is within it: Saturn's mid orbit is the largest, at 110.
 */
const PACE_RADIUS = 110;

export function holdRadius(body: BodyDef): number {
  const vis = visualRadius(body);
  if (body.id === "sun") return 210;
  if (body.speck) return 24;
  if (body.parent) return Math.max(16, vis * 3.2 + 8);
  return Math.max(30, vis * 3.6 + 12);
}

export function skinRadius(body: BodyDef): number {
  const vis = visualRadius(body);
  if (body.id === "sun") return vis * 1.08;
  if (body.speck) return 2.2;
  return Math.max(vis * 1.08, 2.4);
}

export function captureWell(body: BodyDef) {
  const R = visualRadius(body);
  return {
    floor: R * 1.05,
    low1: R * 3.2,
    mid1: R * 8,
    high1: R * 18,
    soi: R * 22,
    gm: 100 * R * 13,
  };
}

export function captureBand(dist: number, well: ReturnType<typeof captureWell>): "low" | "mid" | "high" | "edge" {
  if (dist < well.low1) return "low";
  if (dist < well.mid1) return "mid";
  if (dist <= well.high1) return "high";
  return "edge";
}

export function orbitLevelRadius(body: BodyDef, level: number): number {
  const skin = skinRadius(body);
  const mid = holdRadius(body);
  if (level <= 0) return Math.max(skin * 1.45, skin + 1.2);
  if (level >= 2) return mid * 2.2;
  return mid;
}

export function orbitTangent(rx: number, ry: number, rz: number): { x: number; y: number; z: number } {
  let x = -rz;
  let y = 0;
  let z = rx;
  let len = Math.hypot(x, y, z);
  if (len < 1) {
    x = ry;
    y = -rx;
    z = 0;
    len = Math.hypot(x, y, z) || 1;
  }
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * How fast a held orbit or lap moves round (`along`), and how fast it closes on its height
 * (`toward`: positive drops in from outside, negative climbs out from inside). Past PACE_RADIUS
 * the speeds grow with the orbit, so a lap round a galaxy takes as long as one round Saturn,
 * about 43 seconds, instead of several minutes.
 */
export function orbitPace(want: number, dist: number, reduced: boolean): { along: number; toward: number } {
  const scale = Math.max(1, want / PACE_RADIUS);
  return {
    along: clamp(want * (reduced ? 0.16 : 0.28), reduced ? 6 : 8, (reduced ? 12 : 16) * scale),
    toward: clamp((dist - want) * 0.9, -14 * scale, (reduced ? 16 : 26) * scale),
  };
}
