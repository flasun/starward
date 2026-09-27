/** Shared starfield tuning so the HUD and the sim stay in lockstep. */

export const FAR = 96;
export const NEAR = 0.62;
export const MAX_STARS = 9000;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** Slider 0–1 → world units per second along the flight axis. */
export function cruiseSpeed(slider: number, reduced: boolean): number {
  const s = clamp01(slider);
  return reduced ? 8 + s * 26 : 16 + s * 52;
}

/** World speed → the number shown as “warp”. */
export function warpFactor(worldSpeed: number): number {
  return worldSpeed / 24;
}

export function starBudget(density: number, mobile: boolean): number {
  const min = mobile ? 700 : 1400;
  const max = mobile ? 4600 : MAX_STARS;
  return Math.round(min + (max - min) * clamp01(density));
}
