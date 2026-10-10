/**
 * The daily trial's leaderboard: callsigns, the rules for posting a run, and the two places a
 * board can live, Cloudflare D1 in production and memory in local development. Server-side;
 * no framework imports, so it runs under the unit tests as is.
 */

import { type Sample, courseFor, dayOf, scoreTrace } from "./trial.ts";

export type BoardEntry = { callsign: string; time: number };
export type BoardView = { available: boolean; day: string; top: BoardEntry[]; total: number; siteKey: string | null };
export type PostResult =
  | { ok: true; time: number; best: number; rank: number; total: number; top: BoardEntry[] }
  | { ok: false; reason: string };

/** Shown on the board. */
export const TOP_COUNT = 10;
/** Posts allowed from one network in RATE_WINDOW. */
const RATE_LIMIT = 20;
const RATE_WINDOW = 10 * 60_000;
/** A run that finishes just after midnight UTC still counts for the day it started. */
const DAY_GRACE = 15 * 60_000;

/** A few words no callsign should carry. Kept short: a moderator can remove the rest. */
const BLOCKED = ["fuck", "shit", "cunt", "nigg", "fag", "rape", "nazi", "hitler"];

/**
 * 3 to 16 letters, digits, spaces, dots, dashes or underscores, starting and ending with a letter
 * or digit. The key ignores case and separators, so "Star Fox" and "starfox" are one pilot.
 */
export function cleanCallsign(raw: string): { ok: true; callsign: string; key: string } | { ok: false; reason: string } {
  const callsign = raw.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9 ._-]{1,14})[A-Za-z0-9]$/.test(callsign)) {
    return { ok: false, reason: "Callsigns are 3 to 16 letters or digits, with spaces, dots or dashes between." };
  }
  const key = callsign.toLowerCase().replace(/[ ._-]/g, "");
  if (key.length < 3) return { ok: false, reason: "Callsigns need at least 3 letters or digits." };
  if (BLOCKED.some((word) => key.includes(word))) return { ok: false, reason: "Pick another callsign." };
  return { ok: true, callsign, key };
}

/** What a board needs from storage. */
export interface BoardStore {
  pilot(key: string): Promise<{ callsign: string; secret: string } | null>;
  claim(key: string, callsign: string, secret: string, now: number): Promise<void>;
  postsSince(ip: string, since: number): Promise<number>;
  notePost(ip: string, now: number): Promise<void>;
  /** Keeps the faster of the stored time and this one. */
  saveRun(day: string, key: string, timeMs: number, now: number): Promise<void>;
  best(day: string, key: string): Promise<number | null>;
  top(day: string, limit: number): Promise<{ callsign: string; timeMs: number }[]>;
  /** Pilots strictly faster than this time, plus one. */
  rank(day: string, timeMs: number): Promise<number>;
  count(day: string): Promise<number>;
}

export type PostInput = { day: string; callsign: string; key: string; trace: Sample[] };

/** SHA-256 hex, the same in Workers and Node. */
export async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const entries = (rows: { callsign: string; timeMs: number }[]): BoardEntry[] =>
  rows.map((row) => ({ callsign: row.callsign, time: row.timeMs / 1000 }));

export async function readBoard(store: BoardStore, day: string): Promise<{ top: BoardEntry[]; total: number }> {
  const [top, total] = await Promise.all([store.top(day, TOP_COUNT), store.count(day)]);
  return { top: entries(top), total };
}

/**
 * Posts a run: today's course (or yesterday's just after midnight), a valid callsign that is
 * this pilot's or nobody's yet, not too many posts from one network, and a flight record that
 * scores. The board keeps each pilot's best time of the day.
 */
export async function submitRun(store: BoardStore, input: PostInput, now: number, ip: string): Promise<PostResult> {
  const today = dayOf(now);
  if (input.day !== today && input.day !== dayOf(now - DAY_GRACE)) {
    return { ok: false, reason: "That course has closed. Today's is waiting." };
  }
  const name = cleanCallsign(input.callsign);
  if (!name.ok) return name;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.key)) return { ok: false, reason: "This browser's pilot key is missing." };
  if ((await store.postsSince(ip, now - RATE_WINDOW)) >= RATE_LIMIT) {
    return { ok: false, reason: "Too many posts from here. Try again in a few minutes." };
  }
  await store.notePost(ip, now);
  const score = scoreTrace(courseFor(input.day), input.trace);
  if (!score.ok) return score;
  const secret = await digest(input.key);
  const owner = await store.pilot(name.key);
  if (owner && owner.secret !== secret) return { ok: false, reason: "That callsign belongs to another pilot. Pick another." };
  if (!owner) await store.claim(name.key, name.callsign, secret, now);
  const timeMs = Math.round(score.time * 1000);
  await store.saveRun(input.day, name.key, timeMs, now);
  const best = (await store.best(input.day, name.key)) ?? timeMs;
  const [rank, board] = await Promise.all([store.rank(input.day, best), readBoard(store, input.day)]);
  return { ok: true, time: timeMs / 1000, best: best / 1000, rank, total: board.total, top: board.top };
}

/** In memory, for local development and tests. Gone on restart. */
export function memoryStore(): BoardStore {
  const pilots = new Map<string, { callsign: string; secret: string }>();
  const runs = new Map<string, Map<string, number>>();
  const posts: { ip: string; at: number }[] = [];
  const day = (id: string) => runs.get(id) ?? new Map<string, number>();
  return {
    pilot: async (key) => pilots.get(key) ?? null,
    claim: async (key, callsign, secret) => void pilots.set(key, { callsign, secret }),
    postsSince: async (ip, since) => posts.filter((post) => post.ip === ip && post.at >= since).length,
    notePost: async (ip, now) => void posts.push({ ip, at: now }),
    saveRun: async (id, key, timeMs) => {
      const board = day(id);
      board.set(key, Math.min(board.get(key) ?? Infinity, timeMs));
      runs.set(id, board);
    },
    best: async (id, key) => day(id).get(key) ?? null,
    top: async (id, limit) =>
      [...day(id)]
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([key, timeMs]) => ({ callsign: pilots.get(key)?.callsign ?? key, timeMs })),
    rank: async (id, timeMs) => [...day(id).values()].filter((time) => time < timeMs).length + 1,
    count: async (id) => day(id).size,
  };
}

/** Just enough of Cloudflare's D1 binding. */
export type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
  };
};

/** Cloudflare D1. The schema is in d1/migrations. */
export function d1Store(db: D1Like): BoardStore {
  const run = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values);
  return {
    pilot: (key) => run("SELECT callsign, secret FROM pilots WHERE key = ?", key).first(),
    claim: async (key, callsign, secret, now) => {
      await run("INSERT OR IGNORE INTO pilots (key, callsign, secret, created_at) VALUES (?, ?, ?, ?)", key, callsign, secret, now).run();
    },
    postsSince: async (ip, since) =>
      (await run("SELECT COUNT(*) AS n FROM posts WHERE ip = ? AND at >= ?", ip, since).first<{ n: number }>())?.n ?? 0,
    notePost: async (ip, now) => {
      await run("DELETE FROM posts WHERE at < ?", now - 86_400_000).run();
      await run("INSERT INTO posts (ip, at) VALUES (?, ?)", ip, now).run();
    },
    saveRun: async (day, key, timeMs, now) => {
      await run(
        `INSERT INTO runs (day, key, time_ms, posted_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (day, key) DO UPDATE SET
           posted_at = CASE WHEN excluded.time_ms < runs.time_ms THEN excluded.posted_at ELSE runs.posted_at END,
           time_ms = MIN(runs.time_ms, excluded.time_ms)`,
        day,
        key,
        timeMs,
        now,
      ).run();
    },
    best: async (day, key) =>
      (await run("SELECT time_ms AS t FROM runs WHERE day = ? AND key = ?", day, key).first<{ t: number }>())?.t ?? null,
    top: async (day, limit) =>
      (
        await run(
          `SELECT pilots.callsign AS callsign, runs.time_ms AS timeMs FROM runs
           JOIN pilots ON pilots.key = runs.key
           WHERE runs.day = ? ORDER BY runs.time_ms, runs.posted_at LIMIT ?`,
          day,
          limit,
        ).all<{ callsign: string; timeMs: number }>()
      ).results,
    rank: async (day, timeMs) =>
      ((await run("SELECT COUNT(*) AS n FROM runs WHERE day = ? AND time_ms < ?", day, timeMs).first<{ n: number }>())?.n ?? 0) + 1,
    count: async (day) => (await run("SELECT COUNT(*) AS n FROM runs WHERE day = ?", day).first<{ n: number }>())?.n ?? 0,
  };
}
