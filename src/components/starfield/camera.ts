/** Camera placement: where the eye sits behind, beside, or above the ship for each view. */

import { clamp } from "./math.ts";
import { type BodyDef, bodyPosition, surveyRadius, visualRadius, worldToCamera } from "./system.ts";
import type { CameraView } from "./types.ts";

/** What the camera needs to know about the ship and its surroundings this frame. */
export type CameraShip = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  boost: number;
  orbitSign: number;
  time: number;
  aboveSide: number;
  bodies: BodyDef[];
};

/** Where the camera sits relative to the ship, in ship space, for a view. */
export function cameraEye(
  view: CameraView,
  orbitOn: boolean,
  reduced: boolean,
  stickX: number,
  ship: CameraShip,
): [number, number, number] {
  const pull = reduced ? ship.boost * 0.4 : ship.boost;
  const out = ship.orbitSign || 1;
  if (view === "chase") {
    if (orbitOn) return [out * (reduced ? 1.6 : 3.4), reduced ? 2.2 : 3.15, reduced ? -10 : -8.4];
    return [0, 1.7 + pull * 0.55, -11 - pull * 4.2];
  }
  if (view === "left" || view === "right") {
    const side = view === "left" ? -1 : 1;
    if (orbitOn) return [side * (reduced ? 7 : 9.2), reduced ? 2 : 2.8, reduced ? -8 : -5.6];
    return [side * (6.4 + pull * 1.8), 1.6 + pull * 0.35, -10 - pull * 2.8];
  }
  if (view === "above") return abovePerch(orbitOn, reduced, stickX, ship);
  if (orbitOn) return [out * (reduced ? 0.2 : 0.72), reduced ? 0.28 : 0.58, reduced ? 0.08 : -0.35];
  return [0, 0.15 - pull * 0.12, 0.15 - pull * 1.15];
}

/** Overhead perch. Left, center, or right, still swinging to frame an orbit. */
function abovePerch(orbitOn: boolean, reduced: boolean, stickX: number, ship: CameraShip): [number, number, number] {
  const slot = reduced ? 0 : clamp(Math.round(ship.aboveSide), -1, 1);
  const shoulder = slot * 6.4;
  if (orbitOn) {
    if (reduced) return [shoulder || -(ship.orbitSign || 1) * 5.5, 3.6, -9.4];
    const swing = ship.time * 0.36 * (ship.orbitSign || 1);
    const sway = slot === 0 ? 4.6 : 1.5;
    return [shoulder * 0.82 + Math.sin(swing) * sway, 3.55 + Math.abs(slot) * 0.2, -11.2 - Math.cos(swing) * 0.55];
  }
  const pass = passFrame(ship);
  const lean = reduced ? 0 : stickX;
  const nose = reduced ? 0 : ship.pitch;
  const x = shoulder + pass.side * (1.5 + pass.weight * 2.1) - lean * 1.3;
  const y = 3.15 + pass.weight * 1.2 - nose * 1.4 + ship.boost * 0.4 + Math.abs(slot) * 0.15;
  const z = -8.4 - pass.weight * (2.2 + ship.boost * 2.6) - Math.abs(lean) * 1.1 - ship.boost * 1.6;
  return [clamp(x, -11, 11), clamp(y, 2.15, 5.2), clamp(z, -14, -6.4)];
}

/** Where the nearest body sits in view, and how close the pass is. */
export function passFrame(ship: CameraShip): { side: number; weight: number } {
  let best = 0;
  let side = 0;
  for (const body of ship.bodies) {
    if (body.quiet) continue;
    const pos = bodyPosition(body, ship.time);
    const dist = Math.hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z);
    const reach = Math.max(surveyRadius(body) * 1.7, visualRadius(body) * 8);
    const weight = clamp(1 - dist / reach, 0, 1);
    if (weight <= best) continue;
    const cam = worldToCamera(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z, ship.yaw, ship.pitch);
    if (cam.z < 0.8) continue;
    best = weight;
    side = clamp(cam.x / Math.max(cam.z, 0.8), -1.2, 1.2);
  }
  return { side, weight: best };
}
