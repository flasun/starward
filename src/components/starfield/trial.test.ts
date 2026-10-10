import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bodyById, bodyPosition } from "./system.ts";
import {
  type Course,
  type Sample,
  SAMPLE_GAP,
  TRIAL_MAX_SPEED,
  TrialRecorder,
  courseFor,
  crossing,
  dayOf,
  formatTime,
  sample,
  scoreTrace,
  stopRadius,
} from "./trial.ts";

const DAY = "2026-10-10";

/**
 * A pilot who turns toward each stop no faster than the ship can, flies at `pace` of the top
 * speed, and eases off close in so the turn can still catch the stop.
 */
function fly(course: Course, pace = 0.9, every = 2): TrialRecorder {
  const recorder = new TrialRecorder(course);
  let pos = { ...course.start };
  let heading = Math.atan2(-Math.sin(course.yaw), Math.cos(course.yaw));
  let t = 0;
  for (let frame = 0; !recorder.done && t < 900; frame++) {
    t += 0.05;
    const goal = bodyPosition(bodyById(recorder.stop!), course.epoch + t);
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const len = Math.hypot(dx, dz) || 1;
    let turn = Math.atan2(dx, dz) - heading;
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
    heading += Math.max(-1.25 * 0.05, Math.min(1.25 * 0.05, turn));
    const speed = Math.min(TRIAL_MAX_SPEED * pace, Math.max(12, len * 0.45));
    const y = pos.y + Math.max(-2, Math.min(2, goal.y - pos.y));
    pos = { x: pos.x + Math.sin(heading) * speed * 0.05, y, z: pos.z + Math.cos(heading) * speed * 0.05 };
    if (frame % every === 0) recorder.frame(Math.round(t * 1000) / 1000, pos);
  }
  return recorder;
}

describe("courseFor", () => {
  it("is the same course all day, and a different one the next", () => {
    assert.deepEqual(courseFor(DAY), courseFor(DAY));
    assert.notDeepEqual(courseFor(DAY).stops, courseFor("2026-10-11").stops);
  });

  it("picks five different worlds, never two of one family in a row, at a fair length", () => {
    for (let i = 0; i < 400; i++) {
      const day = dayOf(Date.UTC(2026, 0, 1) + i * 86_400_000);
      const course = courseFor(day);
      assert.equal(course.stops.length, 5, day);
      assert.equal(new Set(course.stops).size, 5, day);
      const at = (id: string) => bodyPosition(bodyById(id), course.epoch);
      let length = 0;
      for (let s = 1; s < 5; s++) {
        const a = bodyById(course.stops[s - 1]!);
        const b = bodyById(course.stops[s]!);
        assert.notEqual(a.parent ?? a.id, b.parent ?? b.id, `${day} ${a.id} then ${b.id}`);
        const pa = at(a.id);
        const pb = at(b.id);
        length += Math.hypot(pa.x - pb.x, pa.z - pb.z);
      }
      assert.ok(length > 1300 && length < 3600, `${day} length ${length}`);
      const first = at(course.stops[0]!);
      assert.ok(Math.abs(Math.hypot(course.start.x - first.x, course.start.z - first.z) - 420) < 1, day);
      assert.ok(Math.hypot(course.start.x, course.start.z) > 250, `${day} starts in the Sun's glare`);
    }
  });

  it("takes the UTC day", () => {
    assert.equal(dayOf(Date.UTC(2026, 9, 10, 23, 59)), "2026-10-10");
    assert.equal(dayOf(Date.UTC(2026, 9, 11, 0, 1)), "2026-10-11");
  });
});

describe("crossing", () => {
  const course = courseFor(DAY);
  const stop = course.stops[0]!;
  const at = bodyPosition(bodyById(stop), course.epoch);
  const reach = stopRadius(stop);

  it("finds when a straight line enters a stop's reach", () => {
    const a = sample(0, { x: at.x - reach * 3, y: at.y, z: at.z });
    const b = sample(0.001, { x: at.x, y: at.y, z: at.z });
    const hit = crossing(course, stop, a, b);
    assert.ok(hit !== null && hit > 0 && hit < 0.001);
  });

  it("misses a line that passes wide", () => {
    const a = sample(0, { x: at.x - reach * 3, y: at.y, z: at.z + reach * 2 });
    const b = sample(0.001, { x: at.x + reach * 3, y: at.y, z: at.z + reach * 2 });
    assert.equal(crossing(course, stop, a, b), null);
  });
});

describe("scoreTrace", () => {
  const course = courseFor(DAY);

  it("scores a flight the same as the recorder that flew it", () => {
    const run = fly(course);
    assert.equal(run.done, true);
    const score = scoreTrace(course, run.trace);
    assert.deepEqual(score, { ok: true, time: run.splits.at(-1), splits: run.splits });
  });

  it("survives the trip through JSON", () => {
    const run = fly(course, 0.7, 1);
    const wire = JSON.parse(JSON.stringify(run.trace)) as Sample[];
    assert.deepEqual(scoreTrace(course, wire), scoreTrace(course, run.trace));
  });

  it("samples often enough for the server's gap limit", () => {
    const run = fly(course, 0.5, 2);
    for (let i = 1; i < run.trace.length; i++) assert.ok(run.trace[i]![0] - run.trace[i - 1]![0] <= SAMPLE_GAP + 0.11);
  });

  it("rejects a flight faster than the ship", () => {
    const run = fly(course);
    const quick = run.trace.map(([t, x, y, z]) => [t / 2, x, y, z] as Sample);
    assert.deepEqual(scoreTrace(course, quick), { ok: false, reason: "The flight is faster than the ship." });
  });

  it("rejects a flight from somewhere else, with gaps, or with a stop missed", () => {
    const run = fly(course);
    const moved = run.trace.map(([t, x, y, z]) => [t, x + 1, y, z] as Sample);
    assert.equal(scoreTrace(course, moved).ok, false);
    const gappy = run.trace.filter((_, i) => i === 0 || i % 4 !== 0);
    assert.deepEqual(scoreTrace(course, gappy), { ok: false, reason: "The flight record skips time." });
    const short = fly({ ...course, stops: course.stops.slice(0, 4) });
    assert.deepEqual(scoreTrace(course, short.trace), { ok: false, reason: "The flight misses a stop." });
  });

  it("rejects a flight that turns faster than the ship", () => {
    // A slow, legal pace, then a square corner between one sample and the next.
    const { x, y, z } = course.start;
    const trace: Sample[] = [];
    for (let i = 0; i <= 5; i++) trace.push([i * 0.2, x, y, z + i * 10]);
    for (let i = 1; i <= 5; i++) trace.push([1 + i * 0.2, x + i * 10, y, z + 50]);
    assert.deepEqual(scoreTrace(course, trace), { ok: false, reason: "The flight turns faster than the ship." });
    const gentle = trace.slice(0, 6);
    for (let i = 1; i <= 5; i++) gentle.push([1 + i * 0.2, x + i * 1.2, y, z + 50 + i * 9.9]);
    assert.notEqual((scoreTrace(course, gentle) as { reason?: string }).reason, "The flight turns faster than the ship.");
  });

  it("rejects stops taken out of order", () => {
    const [a, b, c, d, e] = course.stops;
    const swapped = fly({ ...course, stops: [b!, a!, c!, d!, e!] });
    const score = scoreTrace(course, swapped.trace);
    if (score.ok) assert.ok(score.time > swapped.splits.at(-1)!, "only counts once flown in order");
  });

  it("rejects samples after the finish and damaged records", () => {
    const run = fly(course);
    const last = run.trace.at(-1)!;
    const extra = [...run.trace, [last[0] + 0.1, last[1], last[2], last[3]] as Sample];
    assert.deepEqual(scoreTrace(course, extra), { ok: false, reason: "The flight goes on after the last stop." });
    assert.equal(scoreTrace(course, [run.trace[0]!, [1, Number.NaN, 0, 0] as Sample]).ok, false);
    assert.equal(scoreTrace(course, [run.trace[0]!]).ok, false);
  });
});

describe("formatTime", () => {
  it("shows minutes, seconds and hundredths", () => {
    assert.equal(formatTime(83.456), "1:23.46");
    assert.equal(formatTime(5.2), "0:05.20");
    assert.equal(formatTime(0), "0:00.00");
  });
});
