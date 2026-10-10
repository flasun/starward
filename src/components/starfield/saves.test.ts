import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SAVE_KEY,
  SAVE_VERSION,
  TRIAL_KEY,
  freshSave,
  loadSave,
  loadTrialPrefs,
  parseSave,
  writeSave,
  writeTrialPrefs,
  type SaveStorage,
} from "./saves.ts";
import { START_CREDITS, STATION_LIMIT } from "./trade.ts";

const NOW = 1_800_000_000_000;

function memory(entries: Record<string, string> = {}): SaveStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

const blocked: SaveStorage = {
  getItem: () => {
    throw new Error("storage blocked");
  },
  setItem: () => {
    throw new Error("storage blocked");
  },
};

describe("loadSave", () => {
  it("starts fresh with nothing saved, no storage, or blocked storage", () => {
    assert.deepEqual(loadSave(memory(), NOW), freshSave(NOW));
    assert.deepEqual(loadSave(null, NOW), freshSave(NOW));
    assert.deepEqual(loadSave(blocked, NOW), freshSave(NOW));
  });

  it("reads back what it wrote", () => {
    const storage = memory();
    const save = freshSave(NOW - 5000);
    save.settings = { speed: 0.8, density: 0.3, muted: true, view: "above", aboveSide: 1 };
    save.charted = ["earth", "moon"];
    save.log = [{ id: "soft", seconds: 42 }];
    save.helpSeen = true;
    save.trade = { credits: 900, hold: { minerals: 2, water: 0, tech: 1 }, depots: [{ id: "depot-1", chapter: "stars", x: 10, z: -4 }], paid: NOW - 5000 };
    writeSave(storage, save);
    assert.equal(JSON.parse(storage.map.get(SAVE_KEY)!).version, SAVE_VERSION);
    assert.deepEqual(loadSave(storage, NOW), save);
  });

  it("lifts the six Starward keys into one save", () => {
    const storage = memory({
      "starward-settings": JSON.stringify({ speed: 0.7, density: 0.2, muted: true, view: "chase", aboveSide: 0 }),
      "starward-survey": JSON.stringify(["earth", "moon"]),
      "starward-chapter": "sun",
      "starward-help": "seen",
      "starward-log": JSON.stringify([{ id: "sling", seconds: 61 }]),
      "starward-trade": JSON.stringify({ credits: 1234, hold: { water: 3 }, depots: [{ id: "depot-9", x: 1, z: 2 }], paid: NOW - 1000 }),
    });
    const save = loadSave(storage, NOW);
    assert.deepEqual(save.settings, { speed: 0.7, density: 0.2, muted: true, view: "chase", aboveSide: 0 });
    assert.deepEqual(save.charted, ["earth", "moon"]);
    assert.equal(save.chapter, "sun");
    assert.equal(save.helpSeen, true);
    assert.deepEqual(save.log, [{ id: "sling", seconds: 61 }]);
    assert.deepEqual(save.trade, {
      credits: 1234,
      hold: { minerals: 0, water: 3, tech: 0 },
      depots: [{ id: "depot-9", chapter: "sun", x: 1, z: 2 }],
      paid: NOW - 1000,
    });
  });

  it("reads Slipstream keys too, and prefers a Starward key over its Slipstream one", () => {
    const storage = memory({
      "slipstream-survey": JSON.stringify(["earth"]),
      "starward-survey": JSON.stringify(["mars"]),
      "slipstream-trade": JSON.stringify({ credits: 777 }),
    });
    const save = loadSave(storage, NOW);
    assert.deepEqual(save.charted, ["mars"]);
    assert.equal(save.trade.credits, 777);
  });

  it("leaves the old keys in place", () => {
    const storage = memory({ "slipstream-survey": JSON.stringify(["earth"]) });
    writeSave(storage, loadSave(storage, NOW));
    assert.equal(storage.map.get("slipstream-survey"), JSON.stringify(["earth"]));
    assert.ok(storage.map.has(SAVE_KEY));
  });

  it("prefers the save over the old keys", () => {
    const storage = memory({ "starward-survey": JSON.stringify(["earth"]) });
    writeSave(storage, { ...freshSave(NOW), charted: ["mars"] });
    assert.deepEqual(loadSave(storage, NOW).charted, ["mars"]);
  });

  it("falls back to the old keys when the save is unreadable", () => {
    const storage = memory({ [SAVE_KEY]: "{not json", "starward-survey": JSON.stringify(["earth"]) });
    assert.deepEqual(loadSave(storage, NOW).charted, ["earth"]);
  });

  it("calls the old left wing camera by its new name", () => {
    const storage = memory({ "starward-settings": JSON.stringify({ view: "wing" }) });
    assert.equal(loadSave(storage, NOW).settings.view, "left");
  });

  it("keeps the good parts of a damaged old save", () => {
    const storage = memory({
      "starward-settings": "{broken",
      "starward-survey": JSON.stringify(["earth", 4, "atlantis", "earth", "moon"]),
      "starward-log": JSON.stringify([{ id: "soft", seconds: 3 }, { id: "nope", seconds: 1 }, { id: "ring" }, null]),
    });
    const save = loadSave(storage, NOW);
    assert.deepEqual(save.settings, freshSave(NOW).settings);
    assert.deepEqual(save.charted, ["earth", "moon"]);
    assert.deepEqual(save.log, [{ id: "soft", seconds: 3 }]);
  });
});

describe("parseSave", () => {
  it("rejects anything without a version", () => {
    assert.equal(parseSave(null, NOW), null);
    assert.equal(parseSave([], NOW), null);
    assert.equal(parseSave({ charted: ["earth"] }, NOW), null);
  });

  it("opens a later chapter only once the one before it is charted", () => {
    assert.equal(parseSave({ version: 1, chapter: "stars", charted: ["earth"] }, NOW)!.chapter, "sun");
    assert.equal(parseSave({ version: 1, chapter: "nowhere" }, NOW)!.chapter, "sun");
  });

  it("clamps settings and drops bad trade data", () => {
    const save = parseSave(
      {
        version: 1,
        settings: { speed: 4, density: -1, muted: "yes", view: "sideways", aboveSide: 2 },
        trade: {
          credits: -50,
          hold: { minerals: 2.7, water: -3, tech: "lots" },
          depots: [{ id: "a", x: 0, z: 0 }, { id: "b", x: "far", z: 0 }, ...Array.from({ length: 9 }, (_, i) => ({ id: `d${i}`, x: i, z: i }))],
          paid: "yesterday",
        },
      },
      NOW,
    )!;
    assert.deepEqual(save.settings, { speed: 1, density: 0, muted: false, view: "cockpit", aboveSide: -1 });
    assert.equal(save.trade.credits, 0);
    assert.deepEqual(save.trade.hold, { minerals: 2, water: 0, tech: 0 });
    assert.equal(save.trade.depots.length, STATION_LIMIT);
    assert.equal(save.trade.depots[0]!.id, "a");
    assert.equal(save.trade.paid, NOW);
  });

  it("puts stations from before every chapter had them round the Sun, and caps each chapter", () => {
    const depot = (id: string, chapter?: unknown) => ({ id, chapter, x: 1, z: 1 });
    const save = parseSave(
      {
        version: 1,
        trade: {
          depots: [
            depot("old"),
            depot("odd", "atlantis"),
            ...Array.from({ length: 8 }, (_, i) => depot(`star-${i}`, "stars")),
          ],
        },
      },
      NOW,
    )!;
    const where = save.trade.depots.map((item) => `${item.id}@${item.chapter}`);
    assert.deepEqual(where.slice(0, 2), ["old@sun", "odd@sun"]);
    assert.equal(where.filter((item) => item.endsWith("@stars")).length, STATION_LIMIT);
  });

  it("fills in what a save leaves out", () => {
    const save = parseSave({ version: 1 }, NOW)!;
    assert.deepEqual(save, freshSave(NOW));
    assert.equal(save.trade.credits, START_CREDITS);
  });
});

describe("writeSave", () => {
  it("survives blocked storage", () => {
    assert.doesNotThrow(() => writeSave(blocked, freshSave(NOW)));
    assert.doesNotThrow(() => writeSave(null, freshSave(NOW)));
  });
});

describe("trial prefs", () => {
  const store = (raw: string | null): SaveStorage & { saved: Record<string, string> } => {
    const saved: Record<string, string> = raw === null ? {} : { [TRIAL_KEY]: raw };
    return { saved, getItem: (key) => saved[key] ?? null, setItem: (key, value) => void (saved[key] = value) };
  };

  it("round-trips the callsign, pilot key and best", () => {
    const storage = store(null);
    const prefs = { callsign: "Vega", key: "abcdefghijklmnop1234", best: { day: "2026-10-10", time: 61.5 } };
    writeTrialPrefs(storage, prefs);
    assert.deepEqual(loadTrialPrefs(storage), prefs);
  });

  it("starts clean from nothing, junk, or a bad key", () => {
    const clean = { callsign: "", key: "", best: null };
    assert.deepEqual(loadTrialPrefs(null), clean);
    assert.deepEqual(loadTrialPrefs(store("{nope")), clean);
    assert.deepEqual(loadTrialPrefs(store(JSON.stringify({ key: "x y", best: { day: "today", time: -1 } }))), clean);
  });
});
