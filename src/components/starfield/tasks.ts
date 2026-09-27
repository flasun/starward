import {
  BODIES,
  bodyPosition,
  cameraForward,
  surveyRadius,
  visualRadius,
  worldToCamera,
} from "@/components/starfield/system";

export const TASKS = [
  {
    id: "soft",
    name: "Soft arrival",
    how: "Reach a world yourself, slower than warp 0.9. Go does not count.",
  },
  {
    id: "sling",
    name: "Slingshot",
    how: "Graze a giant, miss the planet, and leave faster than you arrived.",
  },
  {
    id: "ring",
    name: "Ring cut",
    how: "Drop onto Saturn’s ring plane and cross it clear of the planet.",
  },
  {
    id: "wing",
    name: "Hold the wing",
    how: "Keep a moon centered in the wing camera for four seconds.",
  },
  {
    id: "shadow",
    name: "Shadow pass",
    how: "Come in on a planet from beyond it, so you face the night side.",
  },
  {
    id: "eclipse",
    name: "Eclipse",
    how: "Line a moon up so it crosses the Sun.",
  },
] as const;

export type TaskId = (typeof TASKS)[number]["id"];

const GIANTS = ["jupiter", "saturn", "uranus", "neptune"];
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
  inside: Record<string, boolean>;
  sling: SlingPass | null;
  wing: number;
  eclipse: number;
};

export function createTaskState(): TaskMemory {
  return { done: {}, inside: {}, sling: null, wing: 0, eclipse: 0 };
}

export type TaskContext = {
  dt: number;
  speed: number;
  autopilot: boolean;
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
};

function hypot(x: number, y: number, z = 0): number {
  return Math.hypot(x, y, z);
}

export function stepTasks(memory: TaskMemory, ctx: TaskContext): TaskId | null {
  let hit: TaskId | null = null;
  const mark = (id: TaskId) => {
    if (memory.done[id] || hit) return;
    memory.done[id] = true;
    hit = id;
  };

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
    if (!memory.done.soft && inside && !was && !ctx.autopilot && ctx.speed < SOFT_SPEED) mark("soft");
  }

  for (const id of GIANTS) {
    const body = BODIES.find((item) => item.id === id);
    if (!body) continue;
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
      const survey = surveyRadius(body);
      if (
        !memory.done.sling &&
        !active.hit &&
        active.tangent &&
        active.min > vis * 1.35 &&
        active.min < survey * 2.4 &&
        ctx.speed > active.entry * 1.12
      ) {
        mark("sling");
      }
      memory.sling = null;
    }
  }

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
    if (ctx.view !== "wing") memory.wing = 0;
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
    for (const body of BODIES) {
      if (!body.goal || body.parent || body.au <= 0 || body.quiet) continue;
      const pos = bodyPosition(body, ctx.time);
      const dist = hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z);
      const vis = visualRadius(body);
      const pr = hypot(pos.x, pos.y, pos.z) || 1;
      const align = (ship.x * pos.x + ship.y * pos.y + ship.z * pos.z) / (shipR * pr);
      if (dist < surveyRadius(body) && dist > vis * 1.4 && shipR > pr + vis && align > 0.94) mark("shadow");
    }
  }

  if (!memory.done.eclipse) {
    const toSunX = -ship.x;
    const toSunY = -ship.y;
    const toSunZ = -ship.z;
    const sunD = shipR;
    let aligned = false;
    for (const body of BODIES) {
      if (!body.parent) continue;
      const pos = bodyPosition(body, ctx.time);
      const mx = pos.x - ship.x;
      const my = pos.y - ship.y;
      const mz = pos.z - ship.z;
      const md = hypot(mx, my, mz);
      if (md < 6 || md > sunD) continue;
      const cos = (mx * toSunX + my * toSunY + mz * toSunZ) / (md * sunD);
      if (cos > 0.997) aligned = true;
    }
    memory.eclipse = aligned ? memory.eclipse + ctx.dt : 0;
    if (memory.eclipse > 0.45) mark("eclipse");
  }

  return hit;
}
