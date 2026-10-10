import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { StarfieldEngine, type StarfieldHooks } from "@/components/starfield/engine";
import { startGaze } from "@/components/starfield/gaze";
import { Dwell, LongBlink } from "@/components/starfield/handsfree";
import { type FrameSnap, GameContext, createGameKit } from "@/components/starfield/kit";
import { Chrome } from "@/components/starfield/panels/Chrome";
import { Dock } from "@/components/starfield/panels/Dock";
import { FlightLog } from "@/components/starfield/panels/FlightLog";
import { Lesson } from "@/components/starfield/panels/Lesson";
import { Markers } from "@/components/starfield/panels/Markers";
import { Plot } from "@/components/starfield/panels/Plot";
import { TopBar } from "@/components/starfield/panels/TopBar";
import { TrialPanel } from "@/components/starfield/panels/Trial";
import { browserStorage, loadSave, loadTrialPrefs, writeSave, writeTrialPrefs } from "@/components/starfield/saves";
import { keepSaved, paramsOf, racing, saveOf, tradeCue } from "@/components/starfield/store";
import { bodyById, chapterById, chapterOpen, goalsIn, isChartable } from "@/components/starfield/system";
import { TASKS } from "@/components/starfield/tasks";
import { TRIAL_LIMIT } from "@/components/starfield/trial";

/**
 * The game: runs the engine, loads and saves progress, and turns what each frame reports into
 * events (a place charted, a task logged, a world nearby). The panels draw everything else.
 */
export function Starward() {
  const [kit] = useState(createGameKit);
  const { store, engine: engineRef, stage: stageRef, shipAt, painters, trial: recorderRef } = kit;
  const chapterId = useStore(store, (game) => game.chapterId);
  const stations = useStore(store, (game) => game.depots.length);
  const gazeOn = useStore(store, (game) => game.gazeOn);
  const lesson = useStore(store, (game) => game.lesson);
  const paused = useStore(store, (game) => game.paused);
  const targetName = useStore(store, (game) => bodyById(game.targetId).name);
  const chartedHere = useStore(store, (game) => goalsIn(game.chapterId).filter((body) => game.charted.includes(body.id)).length);
  const error = useStore(store, (game) => game.error);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nearSeen = useRef("");
  const chartSeen = useRef("");
  const alertSeen = useRef("");
  const levelSeen = useRef(false);
  const touchedAt = useRef(0);
  const lockedAt = useRef(0);
  const wasLocked = useRef(false);
  const linkedTarget = useRef<string | null>(null);
  const [dwell] = useState(() => new Dwell());

  /** The payoff for a new place: a card, a bell, a ring on its label, and a tap on phones. */
  function celebrateChart(id: string) {
    const { chapterId, charted, notify } = store.getState();
    const goals = goalsIn(chapterId);
    const done = goals.filter((body) => body.id === id || charted.includes(body.id)).length;
    const here = chapterById(chapterId);
    const detail =
      done < goals.length
        ? `${done} of ${goals.length} · ${here.name}`
        : here.next
          ? `All ${goals.length} charted. Onward is open.`
          : `All ${goals.length} charted. The journey is complete.`;
    notify(`${bodyById(id).name} charted`, detail, true);
    engineRef.current?.cue("chart");
    const el = stageRef.current?.querySelector<HTMLElement>(`.marker[data-id="${id}"]`);
    if (el) {
      el.classList.remove("is-new");
      void el.offsetWidth;
      el.classList.add("is-new");
      window.setTimeout(() => el.classList.remove("is-new"), 1400);
    }
    try {
      navigator.vibrate?.(16);
    } catch {
      /* no haptics */
    }
  }

  function onTask(id: string, seconds: number) {
    const { logTask, notify } = store.getState();
    if (!logTask(id, seconds)) return;
    const name = TASKS.find((task) => task.id === id)?.name ?? "Task";
    notify(name, `Flight log · ${store.getState().log.length} of ${TASKS.length}`, true);
    engineRef.current?.cue("task");
  }

  function onFrame(snap: FrameSnap) {
    shipAt.current = { x: snap.shipX, z: snap.shipZ };
    for (const paint of painters) paint(snap);
    const stage = stageRef.current;
    if (stage) {
      stage.style.setProperty("--stick-x", snap.stickX.toFixed(3));
      stage.style.setProperty("--stick-y", snap.stickY.toFixed(3));
      stage.style.setProperty("--pitch", snap.pitch.toFixed(3));
      const flag = snap.boosting ? "true" : "false";
      if (stage.dataset.boosting !== flag) stage.dataset.boosting = flag;
      const locked = snap.locked ? "true" : "false";
      if (stage.dataset.locked !== locked) stage.dataset.locked = locked;
      const now = performance.now();
      if (snap.locked && !wasLocked.current) lockedAt.current = now;
      wasLocked.current = snap.locked;
      const note =
        snap.locked && now - Math.max(touchedAt.current, lockedAt.current) < 2200 ? "true" : "false";
      if (stage.dataset.locknote !== note) stage.dataset.locknote = note;
      const orbiting = snap.orbiting ? "true" : "false";
      if (stage.dataset.orbiting !== orbiting) stage.dataset.orbiting = orbiting;
    }
    if (snap.leveling !== levelSeen.current) {
      levelSeen.current = snap.leveling;
      store.setState({ noseLevel: snap.leveling });
    }
    // Nothing counts until the player has touched a control.
    if (snap.engaged && snap.chartId !== chartSeen.current) {
      chartSeen.current = snap.chartId;
      const chartId = snap.chartId;
      if (chartId && bodyById(chartId).goal && !store.getState().charted.includes(chartId)) {
        celebrateChart(chartId);
        store.getState().chart(chartId);
      }
    }
    if (snap.nearId !== nearSeen.current) {
      nearSeen.current = snap.nearId;
      store.setState(snap.nearId ? { nearId: snap.nearId } : { nearId: "", dismissed: "" });
    }
    if (snap.alert !== alertSeen.current) {
      alertSeen.current = snap.alert;
      store.setState({ alert: snap.alert });
    }
    if (stage) holdSights(stage, snap.sightId);
    flyTrial(snap);
  }

  /** The daily trial: record the flight, and call each stop as the ship reaches it. */
  function flyTrial(snap: FrameSnap) {
    const run = store.getState().trial;
    const recorder = recorderRef.current;
    if (!run || run.finished !== null || !recorder) return;
    const t = snap.time - run.course.epoch;
    if (t > TRIAL_LIMIT) {
      store.getState().quitTrial();
      store.getState().notify("Trial over", "Past 15 minutes. Today's course is still open.");
      return;
    }
    const split = recorder.frame(t, { x: snap.shipX, y: snap.shipY, z: snap.shipZ });
    if (split === null) return;
    store.getState().reachStop(split);
    engineRef.current?.cue(recorder.done ? "task" : "chart");
  }

  /**
   * Hands-free: a world held in the sights fills a ring round the reticle, then becomes the target.
   * Only while the eyes are steering: not on autopilot, in an orbit, or held on a target.
   */
  function holdSights(stage: HTMLElement, sightId: string) {
    const { autopilot, orbit, focus, paused, lesson, targetId, sight, notify } = store.getState();
    const open = sightId !== targetId && !autopilot && !orbit && !focus && !paused && lesson === null;
    const { progress, picked } = dwell.update(open ? sightId : "", performance.now());
    if (progress > 0) {
      stage.dataset.dwell = "true";
      stage.style.setProperty("--dwell", progress.toFixed(3));
    } else if (stage.dataset.dwell) {
      delete stage.dataset.dwell;
      stage.style.removeProperty("--dwell");
    }
    if (!picked) return;
    sight(picked);
    notify(`${bodyById(picked).name} picked`, "Close your eyes for a moment to fly there.");
  }

  // Everything these read is a ref or the store, so the first render's functions stay current.
  const [hooks] = useState<{ current: StarfieldHooks }>(() => {
    const game = store.getState();
    return {
      current: {
        getParams: () => paramsOf(store.getState()),
        onSpeed: game.setSpeed,
        onToggleBoost: game.toggleBoost,
        onCancelAutopilot: () => store.setState({ autopilot: false }),
        onCancelOrbit: () => store.setState({ orbit: false }),
        onToggleOrbit: game.toggleOrbit,
        onFocus: game.focusOn,
        onCancelFocus: () => store.setState({ focus: false }),
        onBeginLap: game.orbitAt,
        onEndLap: game.endLap,
        onError: (message) => store.setState({ error: message }),
        onTask,
        onFrame,
        onPad: game.press,
        onGamepad: (connected) =>
          game.notify(
            connected ? "Gamepad ready" : "Gamepad disconnected",
            connected ? "Left stick steers. A is Go, RT warps, Y changes the camera." : undefined,
          ),
      },
    };
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => store.setState({ reducedMotion: mq.matches });
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [store]);

  useEffect(() => {
    const bump = () => {
      touchedAt.current = performance.now();
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("pointerup", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("pointerup", bump);
      window.removeEventListener("keydown", bump);
    };
  }, []);

  // Load after mount, so the server render and the first client render match. Nothing is
  // written until the save has been read.
  useEffect(() => {
    const storage = browserStorage();
    const now = Date.now();
    store.getState().load(loadSave(storage, now), now);
    // A shared link flies to its place, if the save has opened that place's chapter.
    const id = new URLSearchParams(window.location.search).get("target");
    const chapter = id && isChartable(id) ? (bodyById(id).chapter ?? "sun") : null;
    if (id && chapter && chapterOpen(chapter, store.getState().charted)) {
      if (chapter !== "sun") {
        linkedTarget.current = id;
        store.setState({ chapterId: chapter });
      }
      store.setState({ targetId: id, focus: true, autopilot: true });
    }
    writeSave(storage, saveOf(store.getState()));
    // The trial's own key: written only once the player races or names themselves.
    const prefs = loadTrialPrefs(storage);
    store.setState({ callsign: prefs.callsign, trialBest: prefs.best });
    const stopTrialPrefs = store.subscribe((next, prev) => {
      if (next.callsign === prev.callsign && next.trialBest === prev.trialBest) return;
      writeTrialPrefs(storage, { ...loadTrialPrefs(storage), callsign: next.callsign, best: next.trialBest });
    });
    const stopSaving = keepSaved(store, storage);
    return () => {
      stopTrialPrefs();
      stopSaving();
    };
  }, [store]);

  // After the load above, so loading a save makes no sound.
  useEffect(
    () =>
      store.subscribe((next, prev) => {
        const cue = tradeCue(prev, next);
        if (cue) engineRef.current?.cue(cue);
      }),
    [engineRef, store],
  );

  useEffect(() => {
    const timer = window.setInterval(() => store.getState().payStations(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [stations, store]);

  const chapterBoot = useRef(true);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (chapterBoot.current) {
      chapterBoot.current = false;
      if (chapterId === "sun") return;
    }
    // A trial places the ship itself.
    if (racing(store.getState())) return;
    const linked = linkedTarget.current;
    linkedTarget.current = null;
    const linkedHere = linked && (bodyById(linked).chapter ?? "sun") === chapterId;
    engine.enter(chapterId);
    store.getState().startChapter(linkedHere ? linked : chapterById(chapterId).first);
  }, [chapterId, engineRef, store]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") store.getState().back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  useEffect(() => {
    const onChange = () => store.setState({ full: Boolean(document.fullscreenElement) });
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [store]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new StarfieldEngine(canvas, hooks);
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineRef, hooks]);

  useEffect(() => {
    if (!gazeOn) {
      engineRef.current?.setGaze(0, 0, false);
      store.setState({ gazeNote: "" });
      return;
    }
    let stop = () => {};
    let dead = false;
    const blink = new LongBlink();
    store.setState({ gazeNote: "Starting gaze" });
    void startGaze({
      onSample: (x, y) => engineRef.current?.setGaze(x, y, true),
      onStatus: (text) => {
        if (!dead) store.setState({ gazeNote: text });
      },
      // A long blink is the Go button, or Next on a help card, or the way out of a pause.
      onEyes: (closed) => {
        if (!dead && blink.update(closed, performance.now())) store.getState().press("go");
      },
      onReady: () => {
        if (dead) return;
        store.setState({
          coach: "Hands-free: hold a world in the sights to pick it. Close your eyes for a moment to Go or Stop. Look well aside to take the controls.",
        });
      },
    })
      .then((dispose) => {
        if (dead) dispose();
        else stop = dispose;
      })
      .catch((err: unknown) => {
        if (dead) return;
        store.setState({ gazeOn: false });
        store.getState().notify(err instanceof Error ? err.message : "Gaze could not start.");
      });
    return () => {
      dead = true;
      stop();
      engineRef.current?.setGaze(0, 0, false);
    };
  }, [gazeOn, engineRef, store]);

  return (
    <GameContext.Provider value={kit}>
      <main ref={stageRef} className="stage" data-lesson={lesson === null ? undefined : lesson} aria-label="Starward">
        <div className="viewport">
          <canvas ref={canvasRef} className="field" aria-hidden="true" />
          <p className="sr-only">
            Fly from the Sun to the near stars, the Milky Way, and the galaxy clusters beyond.
            Switch between cockpit, chase, either wing, and above. Full screen fills the display.
            A and D steer. W and S pitch. Space warps. Escape pauses.
          </p>
          <p className="sr-only" aria-live="polite">
            {paused ? "Paused. " : ""}
            {targetName}. {chartedHere} of {goalsIn(chapterId).length} places charted.
          </p>
          <Markers />
          <TopBar />
          <Plot />
          <div className="reticle" aria-hidden="true">
            <span className="horizon" />
            <svg viewBox="0 0 36 36" width="36" height="36">
              <path
                d="M18 5v7M18 24v7M5 18h7M24 18h7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
            <span className="pip" />
            <span className="lock-note">On target</span>
          </div>
          {error ? <p className="field-error">{error}</p> : null}
          <Lesson />
          <FlightLog />
          <TrialPanel />
          <Chrome />
        </div>
        <Dock />
      </main>
    </GameContext.Provider>
  );
}
