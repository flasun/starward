import { holdRadius, orbitLevelRadius, skinRadius } from "./flight.ts";
import {
  BODIES,
  type BodyDef,
  bodiesIn,
  bodyById,
  bodyPosition,
  cameraForward,
  surveyRadius,
  visualRadius,
  worldToCamera,
} from "./system.ts";

/** The flight log. Each chapter has its own challenges, detected only while you fly in it. */
export const TASKS = [
  {
    id: "soft",
    chapter: "sun",
    name: "Soft arrival",
    how: "Reach a world yourself, slower than warp 0.9. Go or an orbit does not count.",
  },
  {
    id: "sling",
    chapter: "sun",
    name: "Slingshot",
    how: "Graze a giant, miss the planet, and leave faster than you arrived.",
  },
  {
    id: "ring",
    chapter: "sun",
    name: "Ring cut",
    how: "Drop onto Saturn’s ring plane and cross it clear of the planet.",
  },
  {
    id: "wing",
    chapter: "sun",
    name: "Hold the wing",
    how: "Keep a moon centered in either wing camera for four seconds.",
  },
  {
    id: "shadow",
    chapter: "sun",
    name: "Shadow pass",
    how: "Come in on a planet from beyond it, so you face the night side.",
  },
  {
    id: "eclipse",
    chapter: "sun",
    name: "Eclipse",
    how: "Face the Sun from near a moon, and hold the moon across its disc.",
  },
  {
    id: "haul",
    chapter: "sun",
    name: "First station",
    how: "Trade goods until you can afford a station, then deploy it in open space.",
  },
  {
    id: "lane",
    chapter: "sun",
    name: "Open the lane",
    how: "Deploy three stations. Each one keeps paying while you fly.",
  },
  {
    id: "neighbours",
    chapter: "stars",
    name: "Neighbours",
    how: "Reach Proxima Centauri, Alpha Centauri, and Barnard’s Star within 30 seconds, without Go.",
  },
  {
    id: "pole",
    chapter: "stars",
    name: "Pole star",
    how: "Steer yourself and keep Polaris on target for four seconds.",
  },
  {
    id: "corona",
    chapter: "stars",
    name: "Corona skim",
    how: "Fly just above a star’s surface for three seconds, by hand.",
  },
  {
    id: "dogs",
    chapter: "stars",
    name: "Dog stars",
    how: "Reach Sirius and Procyon within 25 seconds of each other, without Go.",
  },
  {
    id: "giant",
    chapter: "stars",
    name: "Giant slingshot",
    how: "Graze a giant star, miss it, and leave faster than you arrived.",
  },
  {
    id: "gap",
    chapter: "stars",
    name: "Centauri gap",
    how: "Thread the gap between Proxima and Alpha Centauri by hand, touching neither.",
  },
  {
    id: "arms",
    chapter: "galaxy",
    name: "Arm to arm",
    how: "Fly from the Orion Arm to the Perseus Arm in under 30 seconds, without Go.",
  },
  {
    id: "circuit",
    chapter: "galaxy",
    name: "Cluster circuit",
    how: "Circle a star cluster all the way round. A slingshot lap counts.",
  },
  {
    id: "core",
    chapter: "galaxy",
    name: "Core dive",
    how: "Hold a low orbit round the Galactic Core for ten seconds.",
  },
  {
    id: "nursery",
    chapter: "galaxy",
    name: "Nursery run",
    how: "Reach the Orion, Carina and Eagle nebulae within 45 seconds, without Go.",
  },
  {
    id: "horizon",
    chapter: "galaxy",
    name: "Event horizon",
    how: "Fly just above Cygnus X-1 for three seconds, by hand.",
  },
  {
    id: "remnant",
    chapter: "galaxy",
    name: "Round the remnant",
    how: "Circle the Ring Nebula or the Crab Nebula all the way round. A slingshot lap counts.",
  },
  {
    id: "magellan",
    chapter: "local",
    name: "Magellanic loop",
    how: "Visit both Magellanic Clouds within 20 seconds, without Go.",
  },
  {
    id: "postcard",
    chapter: "local",
    name: "Postcard home",
    how: "Get the Milky Way and Andromeda on screen together, neither one just a speck.",
  },
  {
    id: "swing",
    chapter: "local",
    name: "Galactic slingshot",
    how: "Graze Andromeda or Triangulum, miss it, and leave faster than you arrived.",
  },
  {
    id: "group",
    chapter: "local",
    name: "Local Group tour",
    how: "Reach Triangulum, Andromeda and Messier 32 within 40 seconds, without Go.",
  },
  {
    id: "satellite",
    chapter: "local",
    name: "Satellite lap",
    how: "Circle a Magellanic Cloud all the way round. A slingshot lap counts.",
  },
  {
    id: "collision",
    chapter: "local",
    name: "Collision course",
    how: "From beside the Milky Way, steer yourself and keep Andromeda on target for three seconds.",
  },
  {
    id: "edge",
    chapter: "web",
    name: "Edge of the map",
    how: "Fly from the Virgo Cluster to the Shapley Supercluster in under 40 seconds, without Go.",
  },
  {
    id: "home",
    chapter: "web",
    name: "Look home",
    how: "From the Shapley Supercluster, steer yourself and keep the Virgo Cluster on target for three seconds.",
  },
  {
    id: "attractor",
    chapter: "web",
    name: "Brush the Attractor",
    how: "Fly just above the Great Attractor for three seconds, by hand.",
  },
  {
    id: "spiral",
    chapter: "web",
    name: "Spiral hop",
    how: "Reach Centaurus A, the Whirlpool and the Sombrero within 40 seconds, without Go.",
  },
  {
    id: "clusters",
    chapter: "web",
    name: "Cluster lap",
    how: "Circle a galaxy cluster all the way round. A slingshot lap counts.",
  },
  {
    id: "void",
    chapter: "deep",
    name: "Through the void",
    how: "Fly straight through the Boötes Void by hand, in one side and out the far one.",
  },
  {
    id: "quasar",
    chapter: "deep",
    name: "Quasar skim",
    how: "Fly just above 3C 273 for three seconds, by hand.",
  },
  {
    id: "walls",
    chapter: "deep",
    name: "Wall to wall",
    how: "Fly from the Sloan Great Wall to the Hercules Great Wall in under 30 seconds, without Go.",
  },
  {
    id: "lookback",
    chapter: "deep",
    name: "Look back",
    how: "From the Cosmic Background, steer yourself and keep Laniakea on target for three seconds.",
  },
] as const;

export type TaskId = (typeof TASKS)[number]["id"];

const GIANTS = ["jupiter", "saturn", "uranus", "neptune"];
const SUN_RADIUS = visualRadius(bodyById("sun"));
const SOFT_SPEED = 22;

export type SlingPass = {
  id: string;
  entry: number;
  min: number;
  tangent: boolean;
  hit: boolean;
};

export type TaskMemory = {
  done: Partial<Record<TaskId, boolean>>;
  /** The chapter the rest of this memory describes. Entering another one clears it. */
  chapter: string;
  inside: Record<string, boolean>;
  sling: SlingPass | null;
  wing: number;
  eclipse: number;
  /** Seconds each hold challenge has been held. */
  held: Partial<Record<TaskId, number>>;
  /** Timed routes under way: when each started and the places it has reached. */
  routes: Partial<Record<TaskId, { start: number; seen: string[] }>>;
  /** For each circling challenge, the place being circled and how far round the ship has gone. */
  circles: Partial<Record<TaskId, { id: string; last: number; swept: number }>>;
  /** Where the ship came into a place it can fly through, and whether it was by hand all the way. */
  passes: Partial<Record<TaskId, { x: number; y: number; z: number; byHand: boolean }>>;
};

export function createTaskState(): TaskMemory {
  return { done: {}, chapter: "sun", inside: {}, sling: null, wing: 0, eclipse: 0, held: {}, routes: {}, circles: {}, passes: {} };
}

export type TaskContext = {
  dt: number;
  speed: number;
  autopilot: boolean;
  /** The player is flying: they have touched a control and autopilot is off. */
  earned: boolean;
  view: string;
  yaw: number;
  pitch: number;
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  tan: number;
  aspect: number;
  shipX: number;
  shipY: number;
  shipZ: number;
  time: number;
  chapter: string;
  /** Focus is turning the nose toward the target for the player. */
  focus: boolean;
  /** An orbit or a slingshot lap is flying the ship. */
  orbiting: boolean;
};

function hypot(x: number, y: number, z = 0): number {
  return Math.hypot(x, y, z);
}

type Mark = (id: TaskId) => void;
type Vec = { x: number; y: number; z: number };

export function stepTasks(memory: TaskMemory, ctx: TaskContext): TaskId | null {
  let hit: TaskId | null = null;
  // Tracking below still runs every frame; only the award waits for the player.
  const mark: Mark = (id) => {
    if (!ctx.earned || memory.done[id] || hit) return;
    memory.done[id] = true;
    hit = id;
  };
  if (memory.chapter !== ctx.chapter) {
    // Each chapter has its own map, so nothing tracked in the last one carries over.
    Object.assign(memory, { ...createTaskState(), done: memory.done, chapter: ctx.chapter });
  }
  if (ctx.chapter === "sun") stepSolarSystem(memory, ctx, mark);
  else stepJourney(memory, ctx, mark);
  return hit;
}

function stepSolarSystem(memory: TaskMemory, ctx: TaskContext, mark: Mark): void {
  const ship = { x: ctx.shipX, y: ctx.shipY, z: ctx.shipZ };
  const shipR = hypot(ship.x, ship.y, ship.z) || 1;

  for (const body of BODIES) {
    if (!body.goal || body.quiet) continue;
    const pos = bodyPosition(body, ctx.time);
    const dist = hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z);
    const bubble = surveyRadius(body);
    const was = memory.inside[body.id] ?? false;
    const inside = dist < bubble;
    memory.inside[body.id] = inside;
    // An orbit carries the ship in at orbit pace, so only a hand-flown arrival counts.
    if (!memory.done.soft && inside && !was && !ctx.autopilot && !ctx.orbiting && ctx.speed < SOFT_SPEED) mark("soft");
  }

  slingshot(memory, ctx, GIANTS, "sling", mark);

  if (!memory.done.ring) {
    const saturn = BODIES.find((item) => item.id === "saturn");
    if (saturn) {
      const pos = bodyPosition(saturn, ctx.time);
      const flat = Math.hypot(ship.x - pos.x, ship.z - pos.z);
      const vis = visualRadius(saturn);
      const slab = Math.abs(ship.y - pos.y) < 1.7;
      if (slab && flat > vis * 1.5 && flat < vis * 2.8) mark("ring");
    }
  }

  if (!memory.done.wing) {
    if (ctx.view !== "left" && ctx.view !== "right" && ctx.view !== "wing") memory.wing = 0;
    else {
      let held = false;
      for (const body of BODIES) {
        if (!body.parent) continue;
        const pos = bodyPosition(body, ctx.time);
        const cam0 = worldToCamera(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z, ctx.yaw, ctx.pitch);
        const camZ = cam0.z - ctx.eyeZ;
        if (camZ < 1) continue;
        const nx = (cam0.x - ctx.eyeX) / camZ / Math.max(0.2, ctx.tan) / Math.max(0.2, ctx.aspect);
        const ny = (cam0.y - ctx.eyeY) / camZ / Math.max(0.2, ctx.tan);
        if (nx * nx + ny * ny < 0.2 * 0.2) held = true;
      }
      memory.wing = held ? memory.wing + ctx.dt : Math.max(0, memory.wing - ctx.dt * 1.5);
      if (memory.wing > 4) mark("wing");
    }
  }

  if (!memory.done.shadow) {
    const forward = cameraForward(ctx.yaw, ctx.pitch);
    for (const body of BODIES) {
      if (!body.goal || body.parent || body.au <= 0 || body.quiet) continue;
      const pos = bodyPosition(body, ctx.time);
      const dist = hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z);
      const vis = visualRadius(body);
      const pr = hypot(pos.x, pos.y, pos.z) || 1;
      const align = (ship.x * pos.x + ship.y * pos.y + ship.z * pos.z) / (shipR * pr);
      // Heading in, not leaving: flying out past the night side doesn't count.
      const inbound =
        (forward.x * (pos.x - ship.x) + forward.y * (pos.y - ship.y) + forward.z * (pos.z - ship.z)) / (dist || 1);
      if (dist < surveyRadius(body) && dist > vis * 1.4 && shipR > pr + vis && align > 0.94 && inbound > 0.5) {
        mark("shadow");
      }
    }
  }

  if (!memory.done.eclipse) {
    const toSunX = -ship.x;
    const toSunY = -ship.y;
    const toSunZ = -ship.z;
    const sunD = shipR;
    const forward = cameraForward(ctx.yaw, ctx.pitch);
    // Looking at the Sun, not lined up with it somewhere behind the ship.
    const facing = (forward.x * toSunX + forward.y * toSunY + forward.z * toSunZ) / sunD;
    const sunAngle = Math.atan(SUN_RADIUS / sunD);
    let aligned = false;
    for (const body of BODIES) {
      if (facing < 0.85 || !body.parent) continue;
      const pos = bodyPosition(body, ctx.time);
      const mx = pos.x - ship.x;
      const my = pos.y - ship.y;
      const mz = pos.z - ship.z;
      const md = hypot(mx, my, mz);
      if (md < 6 || md > sunD) continue;
      const cos = (mx * toSunX + my * toSunY + mz * toSunZ) / (md * sunD);
      const apart = Math.acos(Math.min(1, cos));
      // Over the Sun's disc as seen from here, and near enough to show as a disc itself.
      if (apart < sunAngle && Math.atan(visualRadius(body) / md) > sunAngle * 0.25) aligned = true;
    }
    memory.eclipse = aligned ? memory.eclipse + ctx.dt : 0;
    if (memory.eclipse > 0.45) mark("eclipse");
  }
}

/** Graze a body without hitting it, nose across the line to it, and leave faster than you came in. */
function slingshot(memory: TaskMemory, ctx: TaskContext, ids: readonly string[], task: TaskId, mark: Mark): void {
  const ship = { x: ctx.shipX, y: ctx.shipY, z: ctx.shipZ };
  for (const id of ids) {
    const body = bodyById(id);
    const pos = bodyPosition(body, ctx.time);
    const dx = pos.x - ship.x;
    const dy = pos.y - ship.y;
    const dz = pos.z - ship.z;
    const dist = hypot(dx, dy, dz);
    const vis = visualRadius(body);
    const shell = surveyRadius(body) * 3.2;
    const active = memory.sling;
    if (dist < vis * 1.2 && active?.id === id) active.hit = true;
    if (dist < shell) {
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      const nz = dz / (dist || 1);
      const forward = cameraForward(ctx.yaw, ctx.pitch);
      const facing = Math.abs(forward.x * nx + forward.y * ny + forward.z * nz);
      if (!active || active.id !== id) {
        memory.sling = { id, entry: ctx.speed, min: dist, tangent: facing < 0.5, hit: dist < vis * 1.2 };
      } else if (dist < active.min) {
        active.min = dist;
        active.tangent = facing < 0.5;
      }
    } else if (active?.id === id && dist > shell * 1.12) {
      // Big places hold their laps farther out than their survey range, so the lap counts too.
      const reach = Math.max(surveyRadius(body) * 2.4, holdRadius(body) * 1.2);
      if (
        !memory.done[task] &&
        !active.hit &&
        active.tangent &&
        active.min > vis * 1.35 &&
        active.min < reach &&
        ctx.speed > active.entry * 1.12
      ) {
        mark(task);
      }
      memory.sling = null;
    }
  }
}

function stepJourney(memory: TaskMemory, ctx: TaskContext, mark: Mark): void {
  const ship = { x: ctx.shipX, y: ctx.shipY, z: ctx.shipZ };
  const entered: string[] = [];
  const left: string[] = [];
  for (const body of bodiesIn(ctx.chapter)) {
    const pos = bodyPosition(body, ctx.time);
    const inside = hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z) < surveyRadius(body);
    const was = memory.inside[body.id] ?? false;
    memory.inside[body.id] = inside;
    if (inside && !was) entered.push(body.id);
    if (!inside && was) left.push(body.id);
  }
  // Routes are flown by hand. Go at any point drops the one under way.
  if (ctx.autopilot) memory.routes = {};
  const byHand = !ctx.autopilot && !ctx.focus && !ctx.orbiting;

  if (ctx.chapter === "stars") {
    visitAll(memory, ctx, "neighbours", ["proxima", "alpha", "barnard"], 30, entered, mark);
    const polaris = bodyById("polaris");
    hold(memory, ctx, "pole", byHand && onTarget(ctx, bodyPosition(polaris, ctx.time)), 4, mark);
    const stars = bodiesIn("stars").filter((body) => body.form === "star");
    hold(memory, ctx, "corona", skimming(ctx, stars), 3, mark);
    visitAll(memory, ctx, "dogs", ["sirius", "procyon"], 25, entered, mark);
    slingshot(memory, ctx, ["arcturus", "betelgeuse", "polaris", "rigel"], "giant", mark);
    if (byHand && between(ctx, "proxima", "alpha")) mark("gap");
  } else if (ctx.chapter === "galaxy") {
    leg(memory, ctx, "arms", "orion-arm", "perseus-arm", 30, entered, left, mark);
    circle(memory, ctx, "circuit", ["pleiades", "omega", "core"], mark);
    const core = bodyById("core");
    const pos = bodyPosition(core, ctx.time);
    const dist = hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z);
    hold(memory, ctx, "core", dist > skinRadius(core) && dist < orbitLevelRadius(core, 0) * 1.3, 10, mark);
    visitAll(memory, ctx, "nursery", ["orion-nebula", "carina", "eagle"], 45, entered, mark);
    hold(memory, ctx, "horizon", skimming(ctx, [bodyById("cygnus-x1")]), 3, mark);
    circle(memory, ctx, "remnant", ["ring-nebula", "crab"], mark);
  } else if (ctx.chapter === "local") {
    visitAll(memory, ctx, "magellan", ["lmc", "smc"], 20, entered, mark);
    const framed = ["home-galaxy", "andromeda"].every((id) => {
      const body = bodyById(id);
      return inFrame(ctx, bodyPosition(body, ctx.time), visualRadius(body));
    });
    hold(memory, ctx, "postcard", framed, 1, mark);
    slingshot(memory, ctx, ["andromeda", "triangulum"], "swing", mark);
    visitAll(memory, ctx, "group", ["triangulum", "andromeda", "m32"], 40, entered, mark);
    circle(memory, ctx, "satellite", ["lmc", "smc"], mark);
    const milky = bodyPosition(bodyById("home-galaxy"), ctx.time);
    const besideHome = hypot(milky.x - ship.x, milky.y - ship.y, milky.z - ship.z) < 700;
    const andromeda = bodyPosition(bodyById("andromeda"), ctx.time);
    hold(memory, ctx, "collision", besideHome && byHand && onTarget(ctx, andromeda), 3, mark);
  } else if (ctx.chapter === "web") {
    leg(memory, ctx, "edge", "virgo", "shapley", 40, entered, left, mark);
    const shapley = bodyById("shapley");
    const edge = bodyPosition(shapley, ctx.time);
    // About 2.7 hops: room to turn round after arriving, since the ship keeps cruising while it turns.
    const atEdge = hypot(edge.x - ship.x, edge.y - ship.y, edge.z - ship.z) < 1400;
    const virgo = bodyById("virgo");
    hold(memory, ctx, "home", atEdge && byHand && onTarget(ctx, bodyPosition(virgo, ctx.time)), 3, mark);
    hold(memory, ctx, "attractor", skimming(ctx, [bodyById("attractor")]), 3, mark);
    visitAll(memory, ctx, "spiral", ["centaurus-a", "whirlpool", "sombrero"], 40, entered, mark);
    circle(memory, ctx, "clusters", ["virgo", "fornax", "perseus-cluster", "coma", "stephan", "shapley"], mark);
  } else if (ctx.chapter === "deep") {
    passThrough(memory, ctx, "void", "bootes-void", byHand, entered, left, mark);
    hold(memory, ctx, "quasar", skimming(ctx, [bodyById("3c273")]), 3, mark);
    leg(memory, ctx, "walls", "sloan-wall", "hercules-wall", 30, entered, left, mark);
    const glow = bodyPosition(bodyById("cosmic-background"), ctx.time);
    const atGlow = hypot(glow.x - ship.x, glow.y - ship.y, glow.z - ship.z) < 1400;
    const home = bodyPosition(bodyById("laniakea"), ctx.time);
    hold(memory, ctx, "lookback", atGlow && byHand && onTarget(ctx, home), 3, mark);
  }
}

/**
 * In the gap between two places: alongside the line joining them, close to it, and outside both
 * arrival ranges.
 */
function between(ctx: TaskContext, a: string, b: string): boolean {
  const pa = bodyPosition(bodyById(a), ctx.time);
  const pb = bodyPosition(bodyById(b), ctx.time);
  const abx = pb.x - pa.x;
  const aby = pb.y - pa.y;
  const abz = pb.z - pa.z;
  const len = hypot(abx, aby, abz) || 1;
  const along = ((ctx.shipX - pa.x) * abx + (ctx.shipY - pa.y) * aby + (ctx.shipZ - pa.z) * abz) / len;
  if (along <= 0 || along >= len) return false;
  const cx = pa.x + (abx / len) * along;
  const cy = pa.y + (aby / len) * along;
  const cz = pa.z + (abz / len) * along;
  const off = hypot(ctx.shipX - cx, ctx.shipY - cy, ctx.shipZ - cz);
  const clear = (id: string, at: Vec) => hypot(ctx.shipX - at.x, ctx.shipY - at.y, ctx.shipZ - at.z) > surveyRadius(bodyById(id));
  return off < len * 0.2 && clear(a, pa) && clear(b, pb);
}

/**
 * Through a place the ship can fly into, by hand from entry to exit, coming out on the far side:
 * the exit at least 120 degrees round from the entry, so the line ran near the middle.
 */
function passThrough(
  memory: TaskMemory,
  ctx: TaskContext,
  task: TaskId,
  id: string,
  byHand: boolean,
  entered: readonly string[],
  left: readonly string[],
  mark: Mark,
): void {
  const center = bodyPosition(bodyById(id), ctx.time);
  const offset = { x: ctx.shipX - center.x, y: ctx.shipY - center.y, z: ctx.shipZ - center.z };
  if (entered.includes(id)) memory.passes[task] = { ...offset, byHand };
  const pass = memory.passes[task];
  if (!pass) return;
  pass.byHand &&= byHand;
  if (!left.includes(id)) return;
  delete memory.passes[task];
  const cos =
    (pass.x * offset.x + pass.y * offset.y + pass.z * offset.z) /
    ((hypot(pass.x, pass.y, pass.z) || 1) * (hypot(offset.x, offset.y, offset.z) || 1));
  if (pass.byHand && cos < -0.5) mark(task);
}

/** Just above the surface of one of `bodies`, flown by hand: a low orbit sits in this band too. */
function skimming(ctx: TaskContext, bodies: readonly BodyDef[]): boolean {
  if (ctx.autopilot || ctx.orbiting) return false;
  return bodies.some((body) => {
    const pos = bodyPosition(body, ctx.time);
    const dist = hypot(pos.x - ctx.shipX, pos.y - ctx.shipY, pos.z - ctx.shipZ);
    const skin = skinRadius(body);
    return dist > skin && dist < skin * 1.5;
  });
}

/** Seconds held build while `on`, and drain half again as fast while not, so a wobble costs little. */
function hold(memory: TaskMemory, ctx: TaskContext, task: TaskId, on: boolean, seconds: number, mark: Mark): void {
  const held = memory.held[task] ?? 0;
  const next = on ? held + ctx.dt : Math.max(0, held - ctx.dt * 1.5);
  memory.held[task] = next;
  if (next > seconds) mark(task);
}

/** Reach every place in `places`, in any order, inside `limit` seconds of reaching the first. */
function visitAll(
  memory: TaskMemory,
  ctx: TaskContext,
  task: TaskId,
  places: readonly string[],
  limit: number,
  entered: readonly string[],
  mark: Mark,
): void {
  if (ctx.autopilot) return;
  for (const id of entered) {
    if (!places.includes(id)) continue;
    let route = memory.routes[task];
    if (!route || ctx.time - route.start > limit) {
      route = { start: ctx.time, seen: [] };
      memory.routes[task] = route;
    }
    if (!route.seen.includes(id)) route.seen.push(id);
    if (route.seen.length === places.length) mark(task);
  }
}

/** Leave `from` and reach `to` within `limit` seconds. */
function leg(
  memory: TaskMemory,
  ctx: TaskContext,
  task: TaskId,
  from: string,
  to: string,
  limit: number,
  entered: readonly string[],
  left: readonly string[],
  mark: Mark,
): void {
  if (ctx.autopilot) return;
  if (left.includes(from)) memory.routes[task] = { start: ctx.time, seen: [from] };
  const route = memory.routes[task];
  if (!route || !entered.includes(to)) return;
  if (ctx.time - route.start <= limit) mark(task);
  delete memory.routes[task];
}

/** A full turn round one of `ids`, staying within a wide orbit of it. A lap counts. */
function circle(memory: TaskMemory, ctx: TaskContext, task: TaskId, ids: readonly string[], mark: Mark): void {
  let near: { id: string; angle: number } | null = null;
  for (const id of ids) {
    const body = bodyById(id);
    const pos = bodyPosition(body, ctx.time);
    const dx = ctx.shipX - pos.x;
    const dz = ctx.shipZ - pos.z;
    if (hypot(dx, ctx.shipY - pos.y, dz) < holdRadius(body) * 1.3) {
      near = { id, angle: Math.atan2(dz, dx) };
      break;
    }
  }
  const current = memory.circles[task];
  if (!near) {
    delete memory.circles[task];
    return;
  }
  if (!current || current.id !== near.id) {
    memory.circles[task] = { id: near.id, last: near.angle, swept: 0 };
    return;
  }
  let turn = near.angle - current.last;
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  current.swept += turn;
  current.last = near.angle;
  if (Math.abs(current.swept) >= Math.PI * 2) mark(task);
}

/** The cone the HUD calls On target: about 5.4 degrees either side of the nose. */
const ON_TARGET = Math.atan(0.16 / 1.7);

function onTarget(ctx: TaskContext, pos: Vec): boolean {
  const dx = pos.x - ctx.shipX;
  const dy = pos.y - ctx.shipY;
  const dz = pos.z - ctx.shipZ;
  const dist = hypot(dx, dy, dz) || 1;
  const forward = cameraForward(ctx.yaw, ctx.pitch);
  const cos = (forward.x * dx + forward.y * dy + forward.z * dz) / dist;
  return Math.acos(Math.min(1, cos)) < ON_TARGET;
}

/** On screen, and big enough to read as a shape: at least 4% of the screen's height across its radius. */
function inFrame(ctx: TaskContext, pos: Vec, radius: number): boolean {
  const cam = worldToCamera(pos.x - ctx.shipX, pos.y - ctx.shipY, pos.z - ctx.shipZ, ctx.yaw, ctx.pitch);
  const depth = cam.z - ctx.eyeZ;
  if (depth < 1) return false;
  const tan = Math.max(0.2, ctx.tan);
  const x = (cam.x - ctx.eyeX) / depth / tan / Math.max(0.2, ctx.aspect);
  const y = (cam.y - ctx.eyeY) / depth / tan;
  return Math.abs(x) < 0.9 && Math.abs(y) < 0.85 && radius / depth / tan > 0.04;
}
