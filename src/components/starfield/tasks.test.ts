import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { holdRadius, orbitLevelRadius, skinRadius } from "./flight.ts";
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
    chapter: "sun",
    focus: false,
    orbiting: false,
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

  it("does not count arriving fast, on autopilot, or carried in by an orbit", () => {
    assert.equal(arrive({ speed: 30 }), null);
    assert.equal(arrive({ speed: 15, autopilot: true, earned: false }), null);
    assert.equal(arrive({ speed: 15, orbiting: true }), null);
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

/** Frames at 20 per second for `seconds`. Returns the first challenge logged, if any. */
function flyFor(memory: TaskMemory, seconds: number, next: (time: number) => TaskContext): TaskId | null {
  for (let time = 0; time < seconds; time += 0.05) {
    const hit = stepTasks(memory, next(time));
    if (hit) return hit;
  }
  return null;
}

/** `distance` from a place, on the side away from the origin of its chapter's map. */
function near(id: string, distance: number): Vec {
  const pos = at(id, 0);
  const len = Math.hypot(pos.x, pos.z) || 1;
  return { x: pos.x + (pos.x / len) * distance, y: pos.y, z: pos.z + (pos.z / len) * distance };
}

/** Far from every place in every chapter's map. */
const NOWHERE: Vec = { x: 0, y: 3000, z: 0 };

/**
 * A flight through `stops`: each is where the ship sits from its start time until the next stop.
 * The nose points along +z, which no challenge on a route cares about.
 */
function route(task: TaskId, chapter: string, stops: [number, Vec][], extra: Partial<TaskContext> = {}): TaskId | null {
  const end = stops.at(-1)![0] + 0.5;
  return flyFor(only(task), end, (time) => {
    const [, ship] = [...stops].reverse().find(([start]) => time >= start)!;
    return frame(ship, { ...ship, z: ship.z + 10 }, time, { chapter, ...extra });
  });
}

describe("chapters", () => {
  it("runs each chapter's challenges only in that chapter", () => {
    const earth = (t: number) => at("earth", t);
    assert.equal(fly(only("shadow"), (t) => frame(beyond(earth(t), 40), earth(t), t, { chapter: "stars" })), null);
    const ship = near("proxima", 300);
    assert.equal(fly(only("pole"), (t) => frame(ship, at("polaris", t), t)), null);
  });

  it("starts tracking afresh in a new chapter", () => {
    const memory = only("pole");
    const ship = near("proxima", 300);
    const look = (chapter: string) => (time: number) => frame(ship, at("polaris", 0), time, { chapter });
    assert.equal(flyFor(memory, 3, look("stars")), null);
    stepTasks(memory, look("galaxy")(3));
    assert.equal(flyFor(memory, 2, look("stars")), null);
    assert.equal(flyFor(memory, 5, look("stars")), "pole");
  });
});

describe("The Near Stars", () => {
  const home: [number, Vec][] = [
    [0, NOWHERE],
    [1, near("proxima", 40)],
    [2, NOWHERE],
    [8, near("alpha", 60)],
    [9, NOWHERE],
    [20, near("barnard", 40)],
  ];

  it("Neighbours counts the three home stars inside 30 seconds", () => {
    assert.equal(route("neighbours", "stars", home), "neighbours");
  });

  it("Neighbours does not count a slow tour or one flown on Go", () => {
    const slow = home.map(([time, ship]) => [time === 20 ? 40 : time, ship] as [number, Vec]);
    assert.equal(route("neighbours", "stars", slow), null);
    assert.equal(route("neighbours", "stars", home, { autopilot: true, earned: false }), null);
  });

  const ship = near("proxima", 300);
  const pole = (look: Vec, extra: Partial<TaskContext> = {}) =>
    flyFor(only("pole"), 5, (time) => frame(ship, look, time, { chapter: "stars", ...extra }));

  it("Pole star counts keeping Polaris on target", () => {
    assert.equal(pole(at("polaris", 0)), "pole");
  });

  it("Pole star does not count focus aiming for you, or Polaris off target", () => {
    assert.equal(pole(at("polaris", 0), { focus: true }), null);
    assert.equal(pole({ ...at("polaris", 0), x: at("polaris", 0).x + 800 }), null);
  });

  const betelgeuse = at("betelgeuse", 0);
  const skim = (distance: number, extra: Partial<TaskContext> = {}) =>
    flyFor(only("corona"), 4, (time) => {
      const ship = { ...betelgeuse, x: betelgeuse.x + distance };
      return frame(ship, { ...ship, z: ship.z + 10 }, time, { chapter: "stars", ...extra });
    });
  const skin = skinRadius(bodyById("betelgeuse"));

  it("Corona skim counts three seconds just above a star", () => {
    assert.equal(skim(skin * 1.25), "corona");
  });

  it("Corona skim does not count an orbit flying for you, or keeping well clear", () => {
    assert.equal(skim(skin * 1.25, { orbiting: true }), null);
    assert.equal(skim(skin * 2), null);
  });
});

/** Round `id` at `radius`, `turns` times, over `seconds`. */
function circling(task: TaskId, chapter: string, id: string, radius: number, turns: number, seconds = 20): TaskId | null {
  const center = at(id, 0);
  return flyFor(only(task), seconds, (time) => {
    const angle = (time / seconds) * turns * Math.PI * 2;
    const ship = { x: center.x + Math.cos(angle) * radius, y: center.y, z: center.z + Math.sin(angle) * radius };
    return frame(ship, center, time, { chapter });
  });
}

describe("The Milky Way", () => {
  const run = (arrive: number, extra: Partial<TaskContext> = {}) =>
    route(
      "arms",
      "galaxy",
      [
        [0, near("orion-arm", 120)],
        [1, NOWHERE],
        [arrive, near("perseus-arm", 110)],
      ],
      extra,
    );

  it("Arm to arm counts the Orion Arm to the Perseus Arm inside 30 seconds", () => {
    assert.equal(run(20), "arms");
  });

  it("Arm to arm does not count a slow run or one flown on Go", () => {
    assert.equal(run(35), null);
    assert.equal(run(20, { autopilot: true, earned: false }), null);
  });

  const pleiades = holdRadius(bodyById("pleiades"));

  it("Cluster circuit counts a full turn round a cluster", () => {
    assert.equal(circling("circuit", "galaxy", "pleiades", pleiades, 1.05), "circuit");
  });

  it("Cluster circuit does not count half a turn, or a turn too wide", () => {
    assert.equal(circling("circuit", "galaxy", "pleiades", pleiades, 0.5), null);
    assert.equal(circling("circuit", "galaxy", "pleiades", pleiades * 1.5, 1.05), null);
  });

  const core = bodyById("core");
  const dive = (radius: number) => circling("core", "galaxy", "core", radius, 0.2, 11);

  it("Core dive counts ten seconds in a low orbit round the core", () => {
    assert.equal(dive(orbitLevelRadius(core, 0)), "core");
  });

  it("Core dive does not count a mid orbit", () => {
    assert.equal(dive(orbitLevelRadius(core, 1)), null);
  });
});

describe("Out of the Galaxy", () => {
  const loop = (second: number) =>
    route("magellan", "local", [
      [0, NOWHERE],
      [1, near("lmc", 200)],
      [2, NOWHERE],
      [second, near("smc", 140)],
    ]);

  it("Magellanic loop counts both Clouds inside 20 seconds", () => {
    assert.equal(loop(12), "magellan");
  });

  it("Magellanic loop does not count a slow loop", () => {
    assert.equal(loop(30), null);
  });

  // Behind the Milky Way and off to one side, with Andromeda beyond it.
  const vantage: Vec = { x: 800, y: 0, z: -2200 };
  const between = (() => {
    const milky = at("home-galaxy", 0);
    const andromeda = at("andromeda", 0);
    const unit = (to: Vec) => {
      const d = { x: to.x - vantage.x, y: to.y - vantage.y, z: to.z - vantage.z };
      const len = Math.hypot(d.x, d.y, d.z);
      return { x: d.x / len, y: d.y / len, z: d.z / len };
    };
    const a = unit(milky);
    const b = unit(andromeda);
    return { x: vantage.x + (a.x + b.x) * 500, y: vantage.y + (a.y + b.y) * 500, z: vantage.z + (a.z + b.z) * 500 };
  })();
  const postcard = (look: Vec) => fly(only("postcard"), (t) => frame(vantage, look, t + 3, { chapter: "local" }));

  it("Postcard home counts the Milky Way and Andromeda framed together", () => {
    assert.equal(
      flyFor(only("postcard"), 1.5, (time) => frame(vantage, between, time, { chapter: "local" })),
      "postcard",
    );
  });

  it("Postcard home does not count one of them out of view, or Andromeda as a speck", () => {
    assert.equal(postcard({ x: vantage.x + 1000, y: 0, z: vantage.z }), null);
    const far: Vec = { x: 800, y: 0, z: -9000 };
    assert.equal(fly(only("postcard"), (t) => frame(far, at("andromeda", 0), t + 3, { chapter: "local" })), null);
  });

  // Past Andromeda's side, slow on the way in and fast on the way out.
  const swing = (offset: number, exitSpeed: number) => {
    const andromeda = at("andromeda", 0);
    return flyFor(only("swing"), 8, (time) => {
      const ship = { x: andromeda.x + offset, y: andromeda.y, z: andromeda.z - 1600 + time * 400 };
      return frame(ship, { ...ship, z: ship.z + 10 }, time, {
        chapter: "local",
        speed: ship.z < andromeda.z ? 40 : exitSpeed,
      });
    });
  };

  it("Galactic slingshot counts grazing Andromeda and leaving faster", () => {
    assert.equal(swing(700, 60), "swing");
  });

  it("Galactic slingshot does not count leaving no faster, or passing far off", () => {
    assert.equal(swing(700, 40), null);
    assert.equal(swing(1100, 60), null);
  });
});

describe("The Web", () => {
  const edge = (arrive: number) =>
    route("edge", "web", [
      [0, near("virgo", 200)],
      [1, NOWHERE],
      [arrive, near("shapley", 250)],
    ]);

  it("Edge of the map counts Virgo to Shapley inside 40 seconds", () => {
    assert.equal(edge(30), "edge");
  });

  it("Edge of the map does not count a slow run", () => {
    assert.equal(edge(45), null);
  });

  const look = (ship: Vec, extra: Partial<TaskContext> = {}) =>
    flyFor(only("home"), 4, (time) => frame(ship, at("virgo", 0), time, { chapter: "web", ...extra }));

  it("Look home counts keeping Virgo on target from Shapley", () => {
    assert.equal(look(near("shapley", 400)), "home");
  });

  it("Look home does not count from anywhere else, or with focus aiming", () => {
    assert.equal(look(near("virgo", 2000)), null);
    assert.equal(look(near("shapley", 400), { focus: true }), null);
  });

  const brush = (distance: number, extra: Partial<TaskContext> = {}) => {
    const attractor = at("attractor", 0);
    return flyFor(only("attractor"), 4, (time) => {
      const ship = { ...attractor, x: attractor.x + distance };
      return frame(ship, { ...ship, z: ship.z + 10 }, time, { chapter: "web", ...extra });
    });
  };
  const edgeOf = skinRadius(bodyById("attractor"));

  it("Brush the Attractor counts three seconds just above it", () => {
    assert.equal(brush(edgeOf * 1.25), "attractor");
  });

  it("Brush the Attractor does not count Go flying, or keeping well clear", () => {
    assert.equal(brush(edgeOf * 1.25, { autopilot: true, earned: false }), null);
    assert.equal(brush(edgeOf * 2), null);
  });
});
