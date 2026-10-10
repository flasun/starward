import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { type BoardStore, type D1Like, cleanCallsign, d1Store, memoryStore, readBoard, submitRun } from "./board.ts";
import { bodyById, bodyPosition } from "./system.ts";
import { type Course, type Sample, TRIAL_MAX_SPEED, TrialRecorder, courseFor } from "./trial.ts";

const NOW = Date.UTC(2026, 9, 10, 12);
const DAY = "2026-10-10";
const KEY_A = "pilot-key-aaaaaaaaaaaaaaaa";
const KEY_B = "pilot-key-bbbbbbbbbbbbbbbb";

/** A flight that respects the ship's turn rate; `pace` scales its top speed. */
function fly(course: Course, pace: number): Sample[] {
  const recorder = new TrialRecorder(course);
  let pos = { ...course.start };
  let heading = Math.atan2(-Math.sin(course.yaw), Math.cos(course.yaw));
  let t = 0;
  while (!recorder.done && t < 900) {
    t += 0.05;
    const goal = bodyPosition(bodyById(recorder.stop!), course.epoch + t);
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    let turn = Math.atan2(dx, dz) - heading;
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
    heading += Math.max(-0.0625, Math.min(0.0625, turn));
    const speed = Math.min(TRIAL_MAX_SPEED * pace, Math.max(12, Math.hypot(dx, dz) * 0.45));
    pos = { x: pos.x + Math.sin(heading) * speed * 0.05, y: pos.y + Math.max(-2, Math.min(2, goal.y - pos.y)), z: pos.z + Math.cos(heading) * speed * 0.05 };
    recorder.frame(Math.round(t * 1000) / 1000, pos);
  }
  return recorder.trace;
}

/** D1's binding over Node's SQLite, with the real migration applied. */
function sqliteD1(): D1Like {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../../d1/migrations/0001_trial.sql", import.meta.url), "utf8"));
  return {
    prepare: (sql) => ({
      bind: (...values) => {
        const statement = db.prepare(sql);
        const args = values as (string | number)[];
        return {
          first: async <T,>() => (statement.get(...args) as T | undefined) ?? null,
          all: async <T,>() => ({ results: statement.all(...args) as T[] }),
          run: async () => statement.run(...args),
        };
      },
    }),
  };
}

const course = courseFor(DAY);
const quick = fly(course, 0.9);
const slow = fly(course, 0.5);

describe("cleanCallsign", () => {
  it("keeps a tidy name and keys it without case or separators", () => {
    assert.deepEqual(cleanCallsign("  Star   Fox "), { ok: true, callsign: "Star Fox", key: "starfox" });
    assert.deepEqual(cleanCallsign("ace_7"), { ok: true, callsign: "ace_7", key: "ace7" });
  });

  it("turns away names that are too short, too long, oddly built, or rude", () => {
    for (const name of ["ab", "a".repeat(17), "-ace", "ace!", "a..b", "Fuckface"]) assert.equal(cleanCallsign(name).ok, false, name);
  });
});

for (const [name, make] of [
  ["memory", memoryStore],
  ["D1 (SQLite)", () => d1Store(sqliteD1())],
] as [string, () => BoardStore][]) {
  describe(`submitRun on ${name}`, () => {
    it("posts a run, ranks it, and keeps each pilot's best", async () => {
      const store = make();
      const first = await submitRun(store, { day: DAY, callsign: "Vega", key: KEY_A, trace: slow }, NOW, "net-1");
      assert.equal(first.ok, true);
      const second = await submitRun(store, { day: DAY, callsign: "Altair", key: KEY_B, trace: quick }, NOW, "net-2");
      assert.ok(second.ok && second.rank === 1 && second.total === 2);
      const again = await submitRun(store, { day: DAY, callsign: "vega", key: KEY_A, trace: quick }, NOW, "net-1");
      assert.ok(again.ok);
      if (!again.ok || !first.ok) return;
      assert.equal(again.best, again.time);
      const worse = await submitRun(store, { day: DAY, callsign: "Vega", key: KEY_A, trace: slow }, NOW, "net-1");
      assert.ok(worse.ok && worse.best === again.best && worse.time === first.time);
      const board = await readBoard(store, DAY);
      assert.equal(board.total, 2);
      assert.deepEqual(board.top.map((entry) => entry.callsign).sort(), ["Altair", "Vega"]);
      assert.ok(board.top[0]!.time <= board.top[1]!.time);
    });

    it("keeps a callsign for the browser that claimed it", async () => {
      const store = make();
      await submitRun(store, { day: DAY, callsign: "Vega", key: KEY_A, trace: slow }, NOW, "net-1");
      const taken = await submitRun(store, { day: DAY, callsign: "V.E.G.A", key: KEY_B, trace: quick }, NOW, "net-2");
      assert.deepEqual(taken, { ok: false, reason: "That callsign belongs to another pilot. Pick another." });
    });

    it("refuses closed days, bad records, missing keys, and floods", async () => {
      const store = make();
      const post = (over: Partial<Parameters<typeof submitRun>[1]>, now = NOW, ip = "net-1") =>
        submitRun(store, { day: DAY, callsign: "Vega", key: KEY_A, trace: quick, ...over }, now, ip);
      assert.equal((await post({ day: "2026-10-09" })).ok, false);
      assert.equal((await post({}, Date.UTC(2026, 9, 11, 0, 10))).ok, true, "just after midnight still counts");
      assert.equal((await post({}, Date.UTC(2026, 9, 11, 0, 20))).ok, false);
      assert.equal((await post({ trace: quick.slice(0, -1) })).ok, false);
      assert.equal((await post({ key: "short" })).ok, false);
      let last = await post({}, NOW, "net-9");
      for (let i = 0; i < 25 && last.ok; i++) last = await post({}, NOW + i, "net-9");
      assert.deepEqual(last, { ok: false, reason: "Too many posts from here. Try again in a few minutes." });
      assert.equal((await post({}, NOW + 11 * 60_000, "net-9")).ok, true, "the window moves on");
    });
  });
}
