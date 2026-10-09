/**
 * Hands-free flying with gaze: hold a world in the sights to pick it, and close your eyes for a
 * moment to Go or Stop. No DOM here.
 */

/** How long a world sits in the sights before it is picked. */
export const DWELL_MS = 1500;
/** A deliberate blink: longer than a natural one, shorter than resting your eyes. */
export const BLINK_MIN_MS = 600;
export const BLINK_MAX_MS = 2500;

/** A place's disc on screen, as the engine projects it: x and y 0 to 1, radius in screen heights. */
export type Pick = { id: string; x: number; y: number; rad: number };

/** Small worlds are hard to hold dead center, so the sights reach at least this far. */
const SIGHT_REACH = 0.05;

/**
 * The place under the reticle at the center of the screen: the one whose disc, or the minimum
 * reach round a small one, covers the center most closely. Empty when none does.
 */
export function sighted(picks: readonly Pick[], aspect: number, allow: (id: string) => boolean): string {
  let best = "";
  let bestScore = 1;
  for (const pick of picks) {
    if (!allow(pick.id)) continue;
    const off = Math.hypot((pick.x - 0.5) * aspect, pick.y - 0.5);
    const score = off / Math.max(pick.rad, SIGHT_REACH);
    if (score < bestScore) {
      bestScore = score;
      best = pick.id;
    }
  }
  return best;
}

/** Holding a world in the sights. Each hold picks once. */
export class Dwell {
  private id = "";
  private since = 0;
  private done = false;

  /** Feed what is in the sights, or "" for nothing that may be picked. */
  update(id: string, now: number): { progress: number; picked: string } {
    if (id !== this.id) {
      this.id = id;
      this.since = now;
      this.done = false;
    }
    if (!id || this.done) return { progress: 0, picked: "" };
    const progress = Math.min(1, (now - this.since) / DWELL_MS);
    if (progress < 1) return { progress, picked: "" };
    this.done = true;
    return { progress: 0, picked: id };
  }
}

/**
 * Both eyes closed for a moment, then opened: fires on opening, so the player sees what it did.
 * The open level drifts with the player, so a lowered gaze or heavy lids do not count as closed.
 */
export class LongBlink {
  private open = 0.1;
  private closedAt: number | null = null;

  /** How closed the eyes are, 0 to 1, or null with no face in view. True when a blink lands. */
  update(closed: number | null, now: number): boolean {
    if (closed === null) {
      this.closedAt = null;
      return false;
    }
    const shut = Math.max(0.5, this.open + 0.3);
    if (this.closedAt === null) {
      if (closed > shut) this.closedAt = now;
      else this.open += (closed - this.open) * 0.05;
      return false;
    }
    if (closed > shut - 0.2) return false;
    const held = now - this.closedAt;
    this.closedAt = null;
    return held >= BLINK_MIN_MS && held <= BLINK_MAX_MS;
  }
}
