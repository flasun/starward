import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bodyById, bodyPosition, surveyRadius, visualRadius } from "./system.ts";
import { TASKS, createTaskState, stepTasks, type TaskContext, type TaskId, type TaskMemory } from "./tasks.ts";

type Vec = { x: number; y: number; z: number };

const SUN: Vec = { x: 0, y: 0, z: 0 };

/** Every challenge but `id` already logged, so only `id` can fire. */
function only(id: TaskId): TaskMemory {
  const memory = createTaskState();
  for (const task of TASKS) if (task.id !== id) memory.done[task.id] = true;
  return memory;
}

/** Yaw and pitch that point the nose from `from` toward `to`. */
function aim(from: Vec, to: Vec): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  const pitch = Math.asin(dy / len);
  const cp = Math.cos(pitch);
  return { yaw: Math.atan2(-dx / len / cp, dz / len / cp), pitch };
}

function frame(ship: Vec, look: Vec, time: number, extra: Partial<TaskContext> = {}): TaskContext {
  return {
    dt: 0.05,
    speed: 30,
    autopilot: false,
    earned: true,
    view: "cockpit",
    ...aim(ship, look),
    eyeX: 0,
    eyeY: 0,
    eyeZ: 0,
    tan: 0.6,
    aspect: 1.6,
    shipX: ship.x,
    shipY: ship.y,
    shipZ: ship.z,
    time,
    ...extra,
  };
}

/** One second of frames. Returns the first challenge logged, if any. */
function fly(memory: TaskMemory, next: (time: number, step: number) => TaskContext): TaskId | null {
  for (let step = 0; step < 20; step++) {
    const hit = stepTasks(memory, next(3 + step * 0.05, step));
    if (hit) return hit;
  }
  return null;
}

/** `distance` out from `body` along the line from the Sun, turned `degrees` about the vertical. */
function beyond(body: Vec, distance: number, degrees = 0): Vec {
  const angle = Math.atan2(body.z, body.x) + (degrees * Math.PI) / 180;
  return { x: body.x + Math.cos(angle) * distance, y: body.y, z: body.z + Math.sin(angle) * distance };
}

const at = (id: string, time: number) => bodyPosition(bodyById(id), time);

describe("earning", () => {
  it("logs nothing while autopilot flies or before the player touches a control", () => {
    const earth = (t: number) => at("earth", t);
    const scene = (extra: Partial<TaskContext>) =>
      fly(only("shadow"), (t) => frame(beyond(earth(t), 40), earth(t), t, extra));
    assert.equal(scene({ autopilot: true, earned: false }), null);
    assert.equal(scene({ earned: false }), null);
    assert.equal(scene({}), "shadow");
  });

  it("logs each challenge once", () => {
    const memory = only("shadow");
    const earth = (t: number) => at("earth", t);
    assert.equal(fly(memory, (t) => frame(beyond(earth(t), 40), earth(t), t)), "shadow");
    assert.equal(fly(memory, (t) => frame(beyond(earth(t), 40), earth(t), t)), null);
  });
});

describe("Shadow pass", () => {
  const earth = (t: number) => at("earth", t);

  it("counts coming in on a planet from beyond it", () => {
    assert.equal(fly(only("shadow"), (t) => frame(beyond(earth(t), 40), earth(t), t)), "shadow");
  });

  it("does not count flying out past the night side", () => {
    assert.equal(fly(only("shadow"), (t) => frame(beyond(earth(t), 40), beyond(earth(t), 400), t)), null);
  });

  it("does not count the day side", () => {
    assert.equal(fly(only("shadow"), (t) => frame(beyond(earth(t), -40), earth(t), t)), null);
  });
});

describe("Soft arrival", () => {
  const earth = (t: number) => at("earth", t);
  const edge = surveyRadius(bodyById("earth"));
  const arrive = (extra: Partial<TaskContext>) =>
    fly(only("soft"), (t, step) => {
      const ship = beyond(earth(t), step === 0 ? edge + 20 : edge - 10, 90);
      return frame(ship, earth(t), t, extra);
    });

  it("counts reaching a world below warp 0.9", () => {
    assert.equal(arrive({ speed: 15 }), "soft");
  });

  it("does not count arriving fast or on autopilot", () => {
    assert.equal(arrive({ speed: 30 }), null);
    assert.equal(arrive({ speed: 15, autopilot: true, earned: false }), null);
  });
});

describe("Ring cut", () => {
  const saturn = (t: number) => at("saturn", t);
  const ring = visualRadius(bodyById("saturn")) * 2;

  it("counts crossing the ring plane clear of the planet", () => {
    assert.equal(
      fly(only("ring"), (t) => frame(beyond(saturn(t), ring, 90), saturn(t), t)),
      "ring",
    );
  });

  it("does not count passing above the rings", () => {
    const above = (t: number) => ({ ...beyond(saturn(t), ring, 90), y: saturn(t).y + 6 });
    assert.equal(fly(only("ring"), (t) => frame(above(t), saturn(t), t)), null);
  });
});

describe("Eclipse", () => {
  const eclipse = (moon: string, distance: number, look: "sun" | "away", degrees = 0, extra: Partial<TaskContext> = {}) =>
    fly(only("eclipse"), (t) => {
      const ship = beyond(at(moon, t), distance, degrees);
      return frame(ship, look === "sun" ? SUN : beyond(ship, 100), t, extra);
    });

  it("counts a nearby moon held across the Sun while facing it", () => {
    assert.equal(eclipse("moon", 60, "sun"), "eclipse");
    assert.equal(eclipse("io", 120, "sun"), "eclipse");
  });

  it("does not count the Sun behind the ship", () => {
    assert.equal(eclipse("moon", 60, "away"), null);
  });

  it("does not count a moon too far off to show as a disc", () => {
    assert.equal(eclipse("moon", 900, "sun"), null);
  });

  it("does not count a moon beside the Sun's disc", () => {
    assert.equal(eclipse("io", 120, "sun", 3.5), null);
  });

  it("does not count autopilot", () => {
    assert.equal(eclipse("moon", 60, "sun", 0, { autopilot: true, earned: false }), null);
  });
});
