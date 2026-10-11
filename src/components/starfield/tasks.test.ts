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

/** Straight from `from` to `to` over `seconds`, nose along the way. */
function line(task: TaskId, chapter: string, from: Vec, to: Vec, seconds: number, extra: (time: number) => Partial<TaskContext> = () => ({})) {
  const ahead = { x: to.x + (to.x - from.x), y: to.y + (to.y - from.y), z: to.z + (to.z - from.z) };
  return flyFor(only(task), seconds + 0.5, (time) => {
    const f = Math.min(1, time / seconds);
    const ship = { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: from.z + (to.z - from.z) * f };
    return frame(ship, ahead, time, { chapter, ...extra(time) });
  });
}

/** Past `id`'s side at `offset`, slow on the way in and at `exitSpeed` on the way out. */
function pass(task: TaskId, chapter: string, id: string, offset: number, exitSpeed: number): TaskId | null {
  const center = at(id, 0);
  return flyFor(only(task), 8, (time) => {
    const ship = { x: center.x + offset, y: center.y, z: center.z - 1600 + time * 400 };
    return frame(ship, { ...ship, z: ship.z + 10 }, time, { chapter, speed: ship.z < center.z ? 40 : exitSpeed });
  });
}

/** Three seconds and more `distance` from `id`'s center. */
function hover(task: TaskId, chapter: string, id: string, distance: number, extra: Partial<TaskContext> = {}): TaskId | null {
  const center = at(id, 0);
  return flyFor(only(task), 4, (time) => {
    const ship = { ...center, x: center.x + distance };
    return frame(ship, { ...ship, z: ship.z + 10 }, time, { chapter, ...extra });
  });
}

describe("The Near Stars, added", () => {
  const dogs = (second: number) =>
    route("dogs", "stars", [
      [0, NOWHERE],
      [1, near("sirius", 60)],
      [2, NOWHERE],
      [second, near("procyon", 60)],
    ]);

  it("Dog stars counts Sirius and Procyon inside 25 seconds", () => {
    assert.equal(dogs(18), "dogs");
    assert.equal(dogs(30), null);
  });

  it("Giant slingshot counts grazing a giant and leaving faster", () => {
    assert.equal(pass("giant", "stars", "betelgeuse", 300, 60), "giant");
    assert.equal(pass("giant", "stars", "betelgeuse", 300, 40), null);
    assert.equal(pass("giant", "stars", "betelgeuse", 900, 60), null);
  });

  const proxima = at("proxima", 0);
  const alpha = at("alpha", 0);
  const span = Math.hypot(alpha.x - proxima.x, alpha.y - proxima.y, alpha.z - proxima.z);
  const along = (distance: number, side = 0): Vec => ({
    x: proxima.x + ((alpha.x - proxima.x) / span) * distance,
    y: proxima.y + ((alpha.y - proxima.y) / span) * distance + side,
    z: proxima.z + ((alpha.z - proxima.z) / span) * distance,
  });
  const thread = (ship: Vec, extra: Partial<TaskContext> = {}) =>
    fly(only("gap"), (time) => frame(ship, { ...ship, z: ship.z + 10 }, time, { chapter: "stars", ...extra }));
  const middle = (surveyRadius(bodyById("proxima")) + span - surveyRadius(bodyById("alpha"))) / 2;

  it("Centauri gap counts flying between the two, clear of both", () => {
    assert.equal(thread(along(middle)), "gap");
  });

  it("Centauri gap does not count inside either one's range, well off the line, or on Go", () => {
    assert.equal(thread(along(20)), null);
    assert.equal(thread(along(span - 20)), null);
    assert.equal(thread(along(middle, 120)), null);
    assert.equal(thread(along(middle), { autopilot: true }), null);
  });
});

describe("The Milky Way, added", () => {
  const nursery = (last: number) =>
    route("nursery", "galaxy", [
      [0, NOWHERE],
      [1, near("orion-nebula", 80)],
      [2, NOWHERE],
      [12, near("carina", 80)],
      [13, NOWHERE],
      [last, near("eagle", 80)],
    ]);

  it("Nursery run counts all three nebulae inside 45 seconds", () => {
    assert.equal(nursery(30), "nursery");
    assert.equal(nursery(50), null);
  });

  const skin = skinRadius(bodyById("cygnus-x1"));

  it("Event horizon counts three seconds just above Cygnus X-1, by hand", () => {
    assert.equal(hover("horizon", "galaxy", "cygnus-x1", skin * 1.25), "horizon");
    assert.equal(hover("horizon", "galaxy", "cygnus-x1", skin * 2), null);
    assert.equal(hover("horizon", "galaxy", "cygnus-x1", skin * 1.25, { orbiting: true }), null);
  });

  it("Round the remnant counts a full turn round the Ring Nebula, apart from Cluster circuit", () => {
    const ring = holdRadius(bodyById("ring-nebula"));
    assert.equal(circling("remnant", "galaxy", "ring-nebula", ring, 1.05), "remnant");
    assert.equal(circling("remnant", "galaxy", "ring-nebula", ring, 0.5), null);
    // Both circling challenges track at once without resetting each other.
    const memory = createTaskState();
    for (const task of TASKS) if (task.id !== "circuit" && task.id !== "remnant") memory.done[task.id] = true;
    const center = at("pleiades", 0);
    const radius = holdRadius(bodyById("pleiades"));
    const hit = flyFor(memory, 20, (time) => {
      const angle = (time / 20) * 1.05 * Math.PI * 2;
      const ship = { x: center.x + Math.cos(angle) * radius, y: center.y, z: center.z + Math.sin(angle) * radius };
      return frame(ship, center, time, { chapter: "galaxy" });
    });
    assert.equal(hit, "circuit");
  });
});

describe("Out of the Galaxy, added", () => {
  const tour = (last: number) =>
    route("group", "local", [
      [0, NOWHERE],
      [1, near("triangulum", 120)],
      [2, NOWHERE],
      [10, near("andromeda", 150)],
      [11, NOWHERE],
      [last, near("m32", 60)],
    ]);

  it("Local Group tour counts the three inside 40 seconds", () => {
    assert.equal(tour(25), "group");
    assert.equal(tour(50), null);
  });

  it("Satellite lap counts a full turn round a Magellanic Cloud", () => {
    assert.equal(circling("satellite", "local", "smc", holdRadius(bodyById("smc")), 1.05), "satellite");
  });

  const aimAt = (ship: Vec, extra: Partial<TaskContext> = {}) =>
    flyFor(only("collision"), 4, (time) => frame(ship, at("andromeda", 0), time, { chapter: "local", ...extra }));

  it("Collision course counts keeping Andromeda on target from beside the Milky Way", () => {
    assert.equal(aimAt(near("home-galaxy", 400)), "collision");
  });

  it("Collision course does not count from far off, or with focus aiming", () => {
    assert.equal(aimAt(near("lmc", 100)), null);
    assert.equal(aimAt(near("home-galaxy", 400), { focus: true }), null);
  });
});

describe("The Web, added", () => {
  const hop = (last: number) =>
    route("spiral", "web", [
      [0, NOWHERE],
      [1, near("centaurus-a", 80)],
      [2, NOWHERE],
      [12, near("whirlpool", 80)],
      [13, NOWHERE],
      [last, near("sombrero", 80)],
    ]);

  it("Spiral hop counts the three galaxies inside 40 seconds", () => {
    assert.equal(hop(30), "spiral");
    assert.equal(hop(45), null);
  });

  it("Cluster lap counts a full turn round a galaxy cluster", () => {
    assert.equal(circling("clusters", "web", "fornax", holdRadius(bodyById("fornax")), 1.05), "clusters");
  });
});

describe("The Edge of Sight", () => {
  const void_ = at("bootes-void", 0);
  const reach = surveyRadius(bodyById("bootes-void"));
  const across = (offset: number, extra: (time: number) => Partial<TaskContext> = () => ({})) =>
    line(
      "void",
      "deep",
      { x: void_.x - reach * 1.5, y: void_.y, z: void_.z + offset },
      { x: void_.x + reach * 1.5, y: void_.y, z: void_.z + offset },
      10,
      extra,
    );

  it("Through the void counts a straight crossing by hand", () => {
    assert.equal(across(0), "void");
    assert.equal(across(reach * 0.4), "void");
  });

  it("Through the void does not count a glancing pass, or Go for any of it", () => {
    assert.equal(across(reach * 0.8), null);
    assert.equal(across(0, (time) => (time > 5 ? { autopilot: true } : {})), null);
  });

  it("Quasar skim counts three seconds just above 3C 273", () => {
    const skin = skinRadius(bodyById("3c273"));
    assert.equal(hover("quasar", "deep", "3c273", skin * 1.25), "quasar");
    assert.equal(hover("quasar", "deep", "3c273", skin * 2), null);
  });

  const walls = (arrive: number) =>
    route("walls", "deep", [
      [0, near("sloan-wall", 200)],
      [1, NOWHERE],
      [arrive, near("hercules-wall", 250)],
    ]);

  it("Wall to wall counts the run inside 30 seconds", () => {
    assert.equal(walls(20), "walls");
    assert.equal(walls(35), null);
  });

  const lookBack = (ship: Vec, extra: Partial<TaskContext> = {}) =>
    flyFor(only("lookback"), 4, (time) => frame(ship, at("laniakea", 0), time, { chapter: "deep", ...extra }));

  it("Look back counts keeping Laniakea on target from the Cosmic Background", () => {
    assert.equal(lookBack(near("cosmic-background", 500)), "lookback");
    assert.equal(lookBack(near("laniakea", 600)), null);
    assert.equal(lookBack(near("cosmic-background", 500), { focus: true }), null);
  });
});

describe("challenge list", () => {
  it("gives every chapter at least four challenges, each with its own id", () => {
    const ids = TASKS.map((task) => task.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const chapter of ["sun", "stars", "galaxy", "local", "web", "deep"]) {
      assert.ok(TASKS.filter((task) => task.chapter === chapter).length >= 4, chapter);
    }
  });
});
