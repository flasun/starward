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
  /** The place being circled, and how far round the ship has gone. */
  circle: { id: string; last: number; swept: number } | null;
};

export function createTaskState(): TaskMemory {
  return { done: {}, chapter: "sun", inside: {}, sling: null, wing: 0, eclipse: 0, held: {}, routes: {}, circle: null };
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
  } else if (ctx.chapter === "galaxy") {
    leg(memory, ctx, "arms", "orion-arm", "perseus-arm", 30, entered, left, mark);
    circle(memory, ctx, "circuit", ["pleiades", "omega", "core"], mark);
    const core = bodyById("core");
    const pos = bodyPosition(core, ctx.time);
    const dist = hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z);
    hold(memory, ctx, "core", dist > skinRadius(core) && dist < orbitLevelRadius(core, 0) * 1.3, 10, mark);
  } else if (ctx.chapter === "local") {
    visitAll(memory, ctx, "magellan", ["lmc", "smc"], 20, entered, mark);
    const framed = ["home-galaxy", "andromeda"].every((id) => {
      const body = bodyById(id);
      return inFrame(ctx, bodyPosition(body, ctx.time), visualRadius(body));
    });
    hold(memory, ctx, "postcard", framed, 1, mark);
    slingshot(memory, ctx, ["andromeda", "triangulum"], "swing", mark);
  } else if (ctx.chapter === "web") {
    leg(memory, ctx, "edge", "virgo", "shapley", 40, entered, left, mark);
    const shapley = bodyById("shapley");
    const edge = bodyPosition(shapley, ctx.time);
    // About 2.7 hops: room to turn round after arriving, since the ship keeps cruising while it turns.
    const atEdge = hypot(edge.x - ship.x, edge.y - ship.y, edge.z - ship.z) < 1400;
    const virgo = bodyById("virgo");
    hold(memory, ctx, "home", atEdge && byHand && onTarget(ctx, bodyPosition(virgo, ctx.time)), 3, mark);
    hold(memory, ctx, "attractor", skimming(ctx, [bodyById("attractor")]), 3, mark);
  }
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
  const current = memory.circle;
  if (!near) {
    memory.circle = null;
    return;
  }
  if (!current || current.id !== near.id) {
    memory.circle = { id: near.id, last: near.angle, swept: 0 };
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
