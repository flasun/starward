/**
 * The daily trial's leaderboard, as server functions. On the Cloudflare build the board lives in
 * D1 (the STARWARD_DB binding); in local development it lives in memory; elsewhere it is off and
 * the trial still flies, with your best kept on this device.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BoardStore, BoardView, D1Like, PostResult } from "@/components/starfield/board";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Env = {
  STARWARD_DB?: D1Like;
  /** Turnstile: when both are set, a post needs the bot check. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** Salts the network hashes kept for rate limiting. */
  TRIAL_SALT?: string;
};

/** Nitro's Cloudflare entry puts each request's bindings here. */
const env = (): Env => (globalThis as { __env__?: Env }).__env__ ?? {};

const devBoard = globalThis as { __starwardDevBoard__?: BoardStore };

async function boardStore(): Promise<BoardStore | null> {
  const board = await import("@/components/starfield/board");
  const db = env().STARWARD_DB;
  if (db) return board.d1Store(db);
  if (import.meta.env.DEV) return (devBoard.__starwardDevBoard__ ??= board.memoryStore());
  return null;
}

function siteKey(): string | null {
  const { TURNSTILE_SITE_KEY, TURNSTILE_SECRET } = env();
  return TURNSTILE_SITE_KEY && TURNSTILE_SECRET ? TURNSTILE_SITE_KEY : null;
}

export const getBoard = createServerFn({ method: "GET" })
  .validator(z.object({ day: Day }))
  .handler(async ({ data }): Promise<BoardView> => {
    const store = await boardStore();
    if (!store) return { available: false, day: data.day, top: [], total: 0, siteKey: null };
    const { readBoard } = await import("@/components/starfield/board");
    return { available: true, day: data.day, siteKey: siteKey(), ...(await readBoard(store, data.day)) };
  });

const Post = z.object({
  day: Day,
  callsign: z.string().max(40),
  key: z.string().max(128),
  trace: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).max(5000),
  turnstile: z.string().max(4096).optional(),
});

export const postRun = createServerFn({ method: "POST" })
  .validator(Post)
  .handler(async ({ data }): Promise<PostResult> => {
    const store = await boardStore();
    if (!store) return { ok: false, reason: "The leaderboard is not running on this site." };
    const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");
    const ip = getRequestHeader("cf-connecting-ip") ?? getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const { TURNSTILE_SECRET, TRIAL_SALT } = env();
    if (siteKey() && TURNSTILE_SECRET && !(await turnstile(TURNSTILE_SECRET, data.turnstile ?? "", ip))) {
      return { ok: false, reason: "The bot check did not pass. Try again." };
    }
    const { digest, submitRun } = await import("@/components/starfield/board");
    const now = Date.now();
    const network = await digest(`${TRIAL_SALT ?? "starward"}:${new Date(now).toISOString().slice(0, 10)}:${ip}`);
    return submitRun(store, data, now, network);
  });

async function turnstile(secret: string, token: string, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
