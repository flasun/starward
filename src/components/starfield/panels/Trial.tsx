import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardView, PostResult } from "@/components/starfield/board";
import { useActions, useGame, useKit, usePainter } from "@/components/starfield/kit";
import { getBoard, postRun } from "@/components/starfield/leaderboard";
import { browserStorage, loadTrialPrefs, writeTrialPrefs } from "@/components/starfield/saves";
import { racing } from "@/components/starfield/store";
import { bodyById } from "@/components/starfield/system";
import { TrialRecorder, courseFor, dayOf, formatTime } from "@/components/starfield/trial";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

/** Off the line: the store moves to the Sun's chapter, then the engine places the ship. */
function useStartTrial(): () => void {
  const { store, engine, trial } = useKit();
  return () => {
    const course = courseFor(dayOf(Date.now()));
    store.getState().startTrial(course);
    engine.current?.startTrial(course);
    trial.current = new TrialRecorder(course);
  };
}

/** This browser's pilot key, made on its first post. It is what owns the callsign. */
function pilotKey(): string {
  const storage = browserStorage();
  const prefs = loadTrialPrefs(storage);
  if (prefs.key) return prefs.key;
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  writeTrialPrefs(storage, { ...prefs, key });
  return key;
}

const nameOf = (id: string) => bodyById(id).name;

/** The daily trial: today's stops and board, then the result and a place to post it. */
export function TrialPanel() {
  const { trial: recorder } = useKit();
  const { quitTrial, closeTrial, setCallsign } = useActions();
  const start = useStartTrial();
  const open = useGame((game) => game.trialOpen);
  const run = useGame((game) => game.trial);
  const best = useGame((game) => game.trialBest);
  const callsign = useGame((game) => game.callsign);
  const [today, setToday] = useState(() => dayOf(Date.now()));
  const day = run?.course.day ?? today;
  const course = useMemo(() => run?.course ?? courseFor(day), [run, day]);
  const [board, setBoard] = useState<BoardView | null>(null);
  const [posted, setPosted] = useState<PostResult | null>(null);
  const [posting, setPosting] = useState(false);
  const [token, setToken] = useState("");
  const finished = run?.finished ?? null;

  useEffect(() => {
    if (open && !run) setToday(dayOf(Date.now()));
  }, [open, run]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    getBoard({ data: { day } })
      .then((view) => live && setBoard(view))
      .catch(() => live && setBoard({ available: false, day, top: [], total: 0, siteKey: null }));
    return () => {
      live = false;
    };
  }, [open, day]);

  // A new run clears the last post.
  useEffect(() => {
    if (finished === null) {
      setPosted(null);
      setToken("");
    }
  }, [finished]);

  if (!open) return null;
  const bestToday = best && best.day === day ? best.time : null;
  const needsCheck = Boolean(board?.siteKey);

  async function post() {
    const trace = recorder.current?.trace;
    if (!trace || finished === null || posting) return;
    setPosting(true);
    try {
      const result = await postRun({ data: { day, callsign, key: pilotKey(), trace, turnstile: token || undefined } });
      setPosted(result);
      if (result.ok) setBoard((view) => view && { ...view, top: result.top, total: result.total });
    } catch {
      setPosted({ ok: false, reason: "Could not reach the board. Try again." });
    } finally {
      setPosting(false);
      setToken("");
    }
  }

  return (
    <article className="lesson log trial" data-hud aria-label="Daily trial">
      <div className="brief-top">
        <div>
          <p className="lesson-kicker">Daily trial · {day}</p>
          <h2>{finished === null ? "Five worlds, by hand" : formatTime(finished)}</h2>
        </div>
        <button type="button" className="brief-close" onClick={finished === null ? closeTrial : quitTrial}>
          Close
        </button>
      </div>
      <div className="log-list">
        {finished === null ? (
          <>
            <ol className="trial-stops">
              {course.stops.map((id) => (
                <li key={id}>{nameOf(id)}</li>
              ))}
            </ol>
            <p className="more-note">
              Reach each world in order. Go and orbits wait until the finish; Space boosts. The same course for everyone, all day (UTC).
            </p>
          </>
        ) : (
          <>
            <ol className="trial-stops">
              {course.stops.map((id, i) => (
                <li key={id}>
                  <span>{nameOf(id)}</span>
                  <span>{formatTime(run?.splits[i] ?? 0)}</span>
                </li>
              ))}
            </ol>
            {bestToday === finished ? <p className="trial-note">New best today</p> : null}
          </>
        )}
        {bestToday !== null ? <p className="more-note">Your best today: {formatTime(bestToday)}</p> : null}

        {finished !== null && board?.available && !(posted?.ok ?? false) ? (
          <form
            className="trial-post"
            onSubmit={(event) => {
              event.preventDefault();
              void post();
            }}
          >
            <label htmlFor="trial-callsign">Callsign</label>
            <div>
              <input
                id="trial-callsign"
                value={callsign}
                maxLength={16}
                autoComplete="nickname"
                spellCheck={false}
                placeholder="3 to 16 letters"
                onChange={(event) => setCallsign(event.target.value)}
              />
              <button type="submit" disabled={posting || callsign.trim().length < 3 || (needsCheck && !token)}>
                {posting ? "Posting" : "Post"}
              </button>
            </div>
            {needsCheck && board?.siteKey ? <Turnstile siteKey={board.siteKey} onToken={setToken} /> : null}
          </form>
        ) : null}
        {posted && !posted.ok ? (
          <p className="trial-note" role="alert">
            {posted.reason}
          </p>
        ) : null}
        {posted?.ok ? (
          <p className="trial-note">
            #{posted.rank} of {posted.total} today{posted.best < posted.time ? `, with your best of ${formatTime(posted.best)}` : ""}
          </p>
        ) : null}

        <p className="log-chapter board-kicker">
          Today&apos;s board
          <span>{board?.available ? `${board.total} ${board.total === 1 ? "pilot" : "pilots"}` : ""}</span>
        </p>
        {board === null ? (
          <p className="board-empty">Loading</p>
        ) : !board.available ? (
          <p className="board-empty">The board runs on the Cloudflare build. Your best stays on this device.</p>
        ) : board.top.length === 0 ? (
          <p className="board-empty">No times yet. Be the first.</p>
        ) : (
          <ol className="board">
            {board.top.map((entry, i) => (
              <li key={`${entry.callsign}-${i}`}>
                <span>
                  {i + 1}. {entry.callsign}
                </span>
                <span>{formatTime(entry.time)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="lesson-actions">
        {finished === null ? (
          <button type="button" onClick={start}>
            Start
          </button>
        ) : (
          <>
            <button type="button" onClick={quitTrial}>
              Done
            </button>
            <button type="button" onClick={start}>
              Fly again
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/** While racing: the stop being flown to, the clock, and a way out. */
export function TrialStrip() {
  const { store } = useKit();
  const { quitTrial } = useActions();
  const live = useGame((game) => racing(game));
  const stop = useGame((game) => game.trial?.splits.length ?? 0);
  const course = useGame((game) => game.trial?.course ?? null);
  const clockRef = useRef<HTMLSpanElement>(null);

  usePainter((snap) => {
    const run = store.getState().trial;
    const node = clockRef.current;
    if (!run || run.finished !== null || !node) return;
    const text = formatTime(snap.time - run.course.epoch);
    if (node.textContent !== text) node.textContent = text;
  });

  if (!live || !course) return null;
  const id = course.stops[stop];
  return (
    <p className="hint trial-strip" data-hud>
      <span>
        {stop + 1} of {course.stops.length} · {id ? nameOf(id) : ""}
      </span>
      <span ref={clockRef} className="trial-clock">
        0:00.00
      </span>
      <button type="button" onClick={quitTrial}>
        Quit
      </button>
    </p>
  );
}

/** Cloudflare Turnstile, loaded only when the board asks for it. */
function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;

  useEffect(() => {
    let id: string | undefined;
    let dead = false;
    const render = () => {
      if (dead || !ref.current || !window.turnstile || id) return;
      id = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: "dark",
        size: "flexible",
        callback: (token: string) => tokenRef.current(token),
        "expired-callback": () => tokenRef.current(""),
      });
    };
    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.turnstile = "";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render, { once: true });
    }
    return () => {
      dead = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey]);

  return <div ref={ref} className="turnstile" />;
}
