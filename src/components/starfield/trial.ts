/**
 * The daily time trial: one course a day for everyone, flown by hand. The client records the
 * flight as a trace; the server scores the same trace with the same code, so the board's time
 * is the time the flight shows. No DOM here.
 */

import { cruiseSpeed } from "./math.ts";
import { bodiesIn, bodyById, bodyPosition, orbitRadius, surveyRadius } from "./system.ts";

export type Vec = { x: number; y: number; z: number };

export type Course = {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  /** Where the solar system is when the run starts, in game seconds. */
  epoch: number;
  start: Vec;
  /** Facing the first stop. */
  yaw: number;
  /** Reach these in order. */
  stops: string[];
};

/** The fastest the ship can fly: full cruise with full boost. */
export const TRIAL_MAX_SPEED = cruiseSpeed(1, false) * (1 + 3.8);
/** A sample at least this often, in game seconds. */
export const SAMPLE_GAP = 0.2;
/** The server's limit on the gap between samples: frames come at most 0.05 apart. */
const MAX_GAP = 0.5;
/** Longer than this and the run is over. */
export const TRIAL_LIMIT = 15 * 60;
const MAX_SAMPLES = Math.ceil(TRIAL_LIMIT / SAMPLE_GAP) + 64;
/**
 * How fast the ship's heading can turn: the stick's yaw rate plus the nudge that steers it clear
 * of worlds, with room to spare. Pitch can move faster when the nose levels, so only heading
 * counts.
 */
const MAX_TURN = (1.25 + 1.6) * 1.2;
const STOP_COUNT = 5;
/** How far out the run starts from the first stop. */
const START_DISTANCE = 420;
const START_HEIGHT = 6;

/** The UTC day for a time. */
export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** FNV-1a, so a day always seeds the same course. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: small, fast, and the same everywhere. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Worlds a course can use: round the Sun, out to Jupiter's moons. No probes, no Sun. */
const POOL = bodiesIn("sun").filter(
  (body) => body.goal && !body.speck && body.id !== "sun" && orbitRadius(bodyById(body.parent ?? body.id).au) < 1700,
);

const family = (id: string) => bodyById(id).parent ?? id;

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Today's course: five worlds, never two of one family in a row, each picked from the few
 * nearest the last, so the route hops across the system instead of zigzagging over it.
 */
export function courseFor(day: string): Course {
  const next = random(hash(`starward-trial-${day}`));
  const epoch = Math.floor(next() * 3000);
  const at = (id: string) => bodyPosition(bodyById(id), epoch);
  let stops: string[] = [];
  for (let tries = 0; tries < 400; tries++) {
    const picked = [POOL[Math.floor(next() * POOL.length)]!.id];
    while (picked.length < STOP_COUNT) {
      const last = picked.at(-1)!;
      const near = POOL.filter((body) => !picked.includes(body.id) && family(body.id) !== family(last)).sort(
        (a, b) => distance(at(last), at(a.id)) - distance(at(last), at(b.id)),
      );
      picked.push(near[Math.floor(next() * Math.min(4, near.length))]!.id);
    }
    let length = 0;
    for (let i = 1; i < picked.length; i++) length += distance(at(picked[i - 1]!), at(picked[i]!));
    stops = picked;
    if (length > 1300 && length < 3600) break;
  }
  const first = at(stops[0]!);
  const second = at(stops[1]!);
  let dx = first.x - second.x;
  let dz = first.z - second.z;
  const len = Math.hypot(dx, dz) || 1;
  const turn = (next() - 0.5) * 1.2;
  [dx, dz] = [(dx / len) * Math.cos(turn) - (dz / len) * Math.sin(turn), (dx / len) * Math.sin(turn) + (dz / len) * Math.cos(turn)];
  let start = { x: first.x + dx * START_DISTANCE, y: START_HEIGHT, z: first.z + dz * START_DISTANCE };
  // Not inside the Sun's glare: start on the far side of the first stop instead.
  if (Math.hypot(start.x, start.z) < 260) start = { x: first.x - dx * START_DISTANCE, y: START_HEIGHT, z: first.z - dz * START_DISTANCE };
  const fx = first.x - start.x;
  const fz = first.z - start.z;
  const fl = Math.hypot(fx, fz) || 1;
  return { day, epoch, start: round(start), yaw: Math.atan2(-fx / fl, fz / fl), stops };
}

/** Reaching a stop: its survey range, the same "near" the rest of the game uses. */
export function stopRadius(id: string): number {
  return surveyRadius(bodyById(id));
}

/** A sample: game seconds since the start, then position. */
export type Sample = [t: number, x: number, y: number, z: number];

/** Samples are rounded as recorded, so the client and the server score the same numbers. */
export function sample(t: number, at: Vec): Sample {
  return [Math.round(t * 1000) / 1000, round2(at.x), round2(at.y), round2(at.z)];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round = (at: Vec): Vec => ({ x: round2(at.x), y: round2(at.y), z: round2(at.z) });

/**
 * When the ship, flying straight from `a` to `b`, first comes within reach of a stop that is
 * itself moving. Null when it does not.
 */
export function crossing(course: Course, stop: string, a: Sample, b: Sample): number | null {
  const body = bodyById(stop);
  const reach = stopRadius(stop);
  const pa = bodyPosition(body, course.epoch + a[0]);
  const pb = bodyPosition(body, course.epoch + b[0]);
  const rx = a[1] - pa.x;
  const ry = a[2] - pa.y;
  const rz = a[3] - pa.z;
  const dx = b[1] - pb.x - rx;
  const dy = b[2] - pb.y - ry;
  const dz = b[3] - pb.z - rz;
  const c = rx * rx + ry * ry + rz * rz - reach * reach;
  if (c <= 0) return a[0];
  const qa = dx * dx + dy * dy + dz * dz;
  const qb = 2 * (rx * dx + ry * dy + rz * dz);
  const disc = qb * qb - 4 * qa * c;
  if (qa === 0 || disc < 0) return null;
  const s = (-qb - Math.sqrt(disc)) / (2 * qa);
  if (s < 0 || s > 1) return null;
  return a[0] + s * (b[0] - a[0]);
}

export type Score = { ok: true; time: number; splits: number[] } | { ok: false; reason: string };

/**
 * Scores a recorded flight: it must start where the course starts, never fly faster than the
 * ship can, and reach every stop in order. The time is when the last stop was reached.
 */
export function scoreTrace(course: Course, trace: readonly Sample[]): Score {
  if (trace.length < 2 || trace.length > MAX_SAMPLES) return { ok: false, reason: "The flight record is the wrong size." };
  for (const point of trace) {
    if (point.length !== 4 || !point.every(Number.isFinite)) return { ok: false, reason: "The flight record is damaged." };
  }
  const first = trace[0]!;
  if (first[0] !== 0 || distance({ x: first[1], y: first[2], z: first[3] }, course.start) > 0.1) {
    return { ok: false, reason: "The flight does not begin at the start." };
  }
  const splits: number[] = [];
  let heading: { at: number; angle: number } | null = null;
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1]!;
    const b = trace[i]!;
    const dt = b[0] - a[0];
    if (!(dt > 0) || dt > MAX_GAP + 1e-9) return { ok: false, reason: "The flight record skips time." };
    if (Math.abs(b[2]) > 95) return { ok: false, reason: "The flight leaves the system." };
    const moved = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]);
    if (moved > TRIAL_MAX_SPEED * 1.1 * dt + 0.05) return { ok: false, reason: "The flight is faster than the ship." };
    // Heading over each stretch long enough to measure; it can only swing so fast between them.
    if (Math.hypot(b[1] - a[1], b[3] - a[3]) >= 1) {
      const angle = Math.atan2(b[1] - a[1], b[3] - a[3]);
      const at = (a[0] + b[0]) / 2;
      if (heading) {
        let swing = Math.abs(angle - heading.angle);
        if (swing > Math.PI) swing = 2 * Math.PI - swing;
        if (swing > MAX_TURN * (at - heading.at) + 0.15) return { ok: false, reason: "The flight turns faster than the ship." };
      }
      heading = { at, angle };
    }
    if (b[0] > TRIAL_LIMIT) return { ok: false, reason: "The flight runs past the time limit." };
    const stop = course.stops[splits.length];
    if (stop === undefined) return { ok: false, reason: "The flight goes on after the last stop." };
    const hit = crossing(course, stop, a, b);
    if (hit !== null) splits.push(Math.round(hit * 1000) / 1000);
  }
  if (splits.length < course.stops.length) return { ok: false, reason: "The flight misses a stop." };
  return { ok: true, time: splits.at(-1)!, splits };
}

/**
 * Records a run on the client. Feed it every frame; it samples often enough for the server's
 * checks and always at the frame a stop is reached, so both sides find the same crossings.
 */
export class TrialRecorder {
  readonly trace: Sample[];
  readonly splits: number[] = [];
  private readonly course: Course;

  constructor(course: Course) {
    this.course = course;
    this.trace = [sample(0, course.start)];
  }

  /** The stop being flown to, or undefined once all are reached. */
  get stop(): string | undefined {
    return this.course.stops[this.splits.length];
  }

  get done(): boolean {
    return this.splits.length >= this.course.stops.length;
  }

  /** One frame of flight. Returns the split time when this frame reaches a stop. */
  frame(t: number, at: Vec): number | null {
    const stop = this.stop;
    if (stop === undefined) return null;
    const last = this.trace.at(-1)!;
    const now = sample(t, at);
    if (!(now[0] > last[0])) return null;
    const hit = crossing(this.course, stop, last, now);
    if (hit !== null) {
      this.trace.push(now);
      const split = Math.round(hit * 1000) / 1000;
      this.splits.push(split);
      return split;
    }
    if (now[0] - last[0] >= SAMPLE_GAP) this.trace.push(now);
    return null;
  }
}

/** 83.456 → "1:23.46". */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, "0")}`;
}
