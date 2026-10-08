/** Saves from before the rename live under `slipstream-*`. Each one is copied to its Starward key once. */

const NAMES = ["settings", "survey", "help", "log", "chapter", "trade"] as const;

/** The old keys stay put, so rolling back a deploy still finds them. */
export function carryOldSaves(): void {
  for (const name of NAMES) {
    try {
      const next = `starward-${name}`;
      if (localStorage.getItem(next) !== null) continue;
      const old = localStorage.getItem(`slipstream-${name}`);
      if (old !== null) localStorage.setItem(next, old);
    } catch {
      /* storage blocked; the flight starts fresh */
    }
  }
}
