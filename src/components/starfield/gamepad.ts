/** Gamepads, read once a frame into a steering stick and button presses. No DOM here. */

/** What a button asks for. */
export type PadCommand =
  | "go"
  | "back"
  | "pause"
  | "orbit"
  | "view"
  | "prev"
  | "next"
  | "faster"
  | "slower"
  | "boost"
  | "level"
  | "log";

/** The commands the game handles. The engine levels the nose itself. */
export type GameCommand = Exclude<PadCommand, "level">;

/** The standard layout: A B X Y, bumpers, triggers, Back, Start, sticks, then the D-pad. */
export const PAD_BUTTONS: Readonly<Partial<Record<number, PadCommand>>> = {
  0: "go",
  1: "back",
  2: "orbit",
  3: "view",
  4: "prev",
  5: "next",
  6: "level",
  7: "boost",
  8: "log",
  9: "pause",
  12: "faster",
  13: "slower",
  14: "prev",
  15: "next",
};

/** A pad the browser does not map: only the four face buttons are anywhere near certain. */
const FALLBACK_BUTTONS: Readonly<Partial<Record<number, PadCommand>>> = {
  0: "go",
  1: "back",
  2: "orbit",
  3: "view",
};

/** Held, these repeat: a speed change keeps stepping. */
const REPEATS: ReadonlySet<PadCommand> = new Set(["faster", "slower"]);
const REPEAT_DELAY = 350;
const REPEAT_EVERY = 120;

/** Sticks rest a little off center. Inside this radius counts as centered. */
export const DEAD_ZONE = 0.15;

export type PadButton = { readonly pressed: boolean; readonly value: number };
export type PadLike = {
  readonly index: number;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly PadButton[];
};

export type PadRead = {
  /** Left stick, -1 to 1. Up is negative, as W is. */
  x: number;
  y: number;
  /** Buttons that went down this frame, plus held repeats. */
  presses: PadCommand[];
  /** A stick off center or a mapped button held. */
  active: boolean;
};

/**
 * A radial dead zone, rescaled so the stick still reaches 1, with a gentle curve for fine
 * steering near the center.
 */
export function deadZone(x: number, y: number, zone = DEAD_ZONE): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (!(mag > zone)) return { x: 0, y: 0 };
  const scaled = Math.pow(Math.min(1, (mag - zone) / (1 - zone)), 1.5);
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

/** Triggers are analog. A gap between press and release, so a half-held one does not chatter. */
function isDown(button: PadButton, held: boolean): boolean {
  const value = button.value || (button.pressed ? 1 : 0);
  return value > (held ? 0.3 : 0.5);
}

export class PadReader {
  /** Pad index to the buttons it is holding. */
  private readonly held = new Map<number, Set<number>>();
  private readonly repeatAt = new Map<string, number>();

  reset(): void {
    this.held.clear();
    this.repeatAt.clear();
  }

  /**
   * Reads every pad. The stick comes from whichever is pushed furthest. A pad's first read takes
   * what it holds as already held, so the press that wakes a pad does nothing else.
   */
  read(pads: readonly (PadLike | null)[], now: number): PadRead {
    const out: PadRead = { x: 0, y: 0, presses: [], active: false };
    let furthest = 0;
    const seen = new Set<number>();
    for (const pad of pads) {
      if (!pad) continue;
      seen.add(pad.index);
      const stick = deadZone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      const mag = Math.hypot(stick.x, stick.y);
      if (mag > furthest) {
        furthest = mag;
        out.x = stick.x;
        out.y = stick.y;
      }
      const fresh = !this.held.has(pad.index);
      const held = this.held.get(pad.index) ?? new Set<number>();
      this.held.set(pad.index, held);
      const table = pad.mapping === "standard" ? PAD_BUTTONS : FALLBACK_BUTTONS;
      pad.buttons.forEach((button, i) => {
        const command = table[i];
        if (!command) return;
        const key = `${pad.index}:${i}`;
        if (!isDown(button, held.has(i))) {
          held.delete(i);
          this.repeatAt.delete(key);
          return;
        }
        out.active = true;
        if (!held.has(i)) {
          held.add(i);
          if (fresh) return;
          out.presses.push(command);
          if (REPEATS.has(command)) this.repeatAt.set(key, now + REPEAT_DELAY);
          return;
        }
        const due = this.repeatAt.get(key);
        if (due !== undefined && now >= due) {
          out.presses.push(command);
          this.repeatAt.set(key, now + REPEAT_EVERY);
        }
      });
    }
    for (const index of [...this.held.keys()]) {
      if (seen.has(index)) continue;
      this.held.delete(index);
      for (const key of [...this.repeatAt.keys()]) if (key.startsWith(`${index}:`)) this.repeatAt.delete(key);
    }
    if (furthest > 0) out.active = true;
    return out;
  }
}
