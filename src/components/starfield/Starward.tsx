import { useEffect, useRef, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Volume2, VolumeX } from "lucide-react";
import { useStore } from "zustand";
import { StarfieldEngine, type CameraView, type FrameMarker, type PlotBlip, type StarfieldHooks } from "@/components/starfield/engine";
import { startGaze } from "@/components/starfield/gaze";
import { browserStorage, loadSave, writeSave } from "@/components/starfield/saves";
import { createGameStore, keepSaved, paramsOf, saveOf } from "@/components/starfield/store";
import {
  CHAPTERS,
  type BodyDef,
  bodiesIn,
  bodyById,
  chapterById,
  chapterDone,
  chapterOpen,
  goalsIn,
  isChartable,
  navIn,
  nextInNav,
} from "@/components/starfield/system";
import { TASKS } from "@/components/starfield/tasks";
import { GOODS, HOLD_MAX, STATION_COST, STATION_LIMIT, canDock, holdUnits, priceOf } from "@/components/starfield/trade";

const VIEWS: Record<CameraView, { label: string; tip: string }> = {
  cockpit: { label: "Cockpit", tip: "Look out the nose" },
  chase: { label: "Chase", tip: "Camera behind the ship" },
  left: { label: "Left", tip: "Camera off the left wing" },
  right: { label: "Right", tip: "Camera off the right wing" },
  above: { label: "Above", tip: "Overhead. Each press steps left, center, then right." },
};
const LESSONS = [
  {
    title: "Look around",
    body: "Drag the sky to steer, or turn on Gaze in More and look. A click nudges the nose. Double-tap a world to fly there and orbit it. A and D steer, W and S pitch, Space is warp, and Escape pauses.",
  },
  {
    title: "Set your speed",
    body: "Speed is your cruise. Orbit has three heights. Low skims the surface, Mid is the usual circle, and High sits farther out.",
  },
  {
    title: "Chart a place",
    body: "Pick a world, then Go. Finish the places in a chapter and Onward opens the next scale, from the near stars out to the galaxy clusters.",
  },
  {
    title: "Change the camera",
    body: "Cockpit is the nose. Chase sits behind the ship. Left and Right are the wings. Above steps from the left, to the center, then to the right. Full fills the screen.",
  },
  {
    title: "Fly a task",
    body: "Open Log. Soft arrivals, slingshots, the ring cut, and the rest are saved with your time. A faint trail marks where you have flown.",
  },
];

const TOAST_MS = 2600;
const REWARD_MS = 3400;

type BodyNav = BodyDef[];

function navSections(bodies: BodyNav) {
  const sections: { group: string; bodies: BodyNav }[] = [];
  for (const body of bodies) {
    const last = sections[sections.length - 1];
    if (!last || last.group !== body.group) sections.push({ group: body.group, bodies: [body] });
    else last.bodies.push(body);
  }
  return sections;
}

export function Starward() {
  const [store] = useState(createGameStore);
  const game = useStore(store);
  const {
    speed,
    density,
    muted,
    view,
    aboveSide,
    charted,
    chapterId,
    log,
    credits,
    hold,
    depots,
    boost,
    targetId,
    autopilot,
    orbit,
    orbitLevel,
    paused,
    hint,
    error,
    navOpen,
    moreOpen,
    mapOpen,
    atlasOpen,
    logOpen,
    lesson,
    offerOpen,
    full,
    noseLevel,
    nearId,
    dismissed,
    alert,
    coach,
    gazeOn,
    gazeNote,
    toasts,
  } = game;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const warpRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLElement>(null);
  const spdRef = useRef<HTMLElement>(null);
  const noseRef = useRef<HTMLElement>(null);
  const plotRef = useRef<SVGGElement>(null);
  const atlasRef = useRef<SVGGElement>(null);
  const captureRef = useRef<HTMLParagraphElement>(null);
  const rangeRef = useRef<HTMLElement>(null);
  const markerRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const nearSeen = useRef("");
  const chartSeen = useRef("");
  const alertSeen = useRef("");
  const levelSeen = useRef(false);
  const touchedAt = useRef(0);
  const lockedAt = useRef(0);
  const wasLocked = useRef(false);
  const shipAt = useRef({ x: 0, z: 0 });
  const linkedTarget = useRef<string | null>(null);
  const engineRef = useRef<StarfieldEngine | null>(null);
  const hooksRef = useRef<StarfieldHooks>({
    getParams: () => paramsOf(store.getState()),
    onSpeed: () => {},
    onToggleBoost: () => {},
    onFrame: () => {},
    onError: () => {},
    onCancelAutopilot: () => {},
    onCancelOrbit: () => {},
    onToggleOrbit: () => {},
    onFocus: () => {},
    onCancelFocus: () => {},
    onBeginLap: () => {},
    onEndLap: () => {},
    onTask: () => {},
  });

  hooksRef.current.getParams = () => paramsOf(store.getState());
  hooksRef.current.onSpeed = game.setSpeed;
  hooksRef.current.onToggleBoost = game.toggleBoost;
  hooksRef.current.onCancelAutopilot = () => store.setState({ autopilot: false });
  hooksRef.current.onCancelOrbit = () => store.setState({ orbit: false });
  hooksRef.current.onFocus = game.focusOn;
  hooksRef.current.onCancelFocus = () => store.setState({ focus: false });
  hooksRef.current.onBeginLap = game.orbitAt;
  hooksRef.current.onEndLap = game.endLap;
  hooksRef.current.onToggleOrbit = game.toggleOrbit;
  hooksRef.current.onError = (message) => store.setState({ error: message });
  hooksRef.current.onTask = (id, seconds) => {
    if (!game.logTask(id, seconds)) return;
    const name = TASKS.find((task) => task.id === id)?.name ?? "Task";
    game.notify(name, `Flight log · ${store.getState().log.length} of ${TASKS.length}`, true);
    engineRef.current?.chime("task");
  };
  hooksRef.current.onFrame = (snap) => {
    const warp = warpRef.current;
    if (warp && warp.textContent !== snap.warpText) warp.textContent = snap.warpText;
    const dist = distRef.current;
    if (dist && dist.textContent !== snap.rangeText) dist.textContent = snap.rangeText;
    const spd = spdRef.current;
    if (spd && spd.textContent !== snap.speedText) spd.textContent = snap.speedText;
    shipAt.current = { x: snap.shipX, z: snap.shipZ };
    const nose = noseRef.current;
    const noseText = `${Math.round((snap.pitch * 180) / Math.PI)}°`;
    if (nose && nose.textContent !== noseText) nose.textContent = noseText;
    paintPlot(snap.plot);
    const capture = captureRef.current;
    if (capture && capture.textContent !== snap.captureText) capture.textContent = snap.captureText;
    const range = rangeRef.current;
    if (range && range.textContent !== snap.rangeText) range.textContent = snap.rangeText;
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
    paintMarkers(snap.markers);
    // Nothing counts until the player has touched a control.
    if (snap.engaged && snap.chartId !== chartSeen.current) {
      chartSeen.current = snap.chartId;
      const chartId = snap.chartId;
      if (chartId && bodyById(chartId).goal && !store.getState().charted.includes(chartId)) {
        celebrateChart(chartId);
        game.chart(chartId);
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
  };

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
    return keepSaved(store, storage);
  }, [store]);

  useEffect(() => {
    const timer = window.setInterval(() => store.getState().payStations(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [depots.length, store]);

  const chapterBoot = useRef(true);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (chapterBoot.current) {
      chapterBoot.current = false;
      if (chapterId === "sun") return;
    }
    const linked = linkedTarget.current;
    linkedTarget.current = null;
    const linkedHere = linked && (bodyById(linked).chapter ?? "sun") === chapterId;
    engine.enter(chapterId);
    store.getState().startChapter(linkedHere ? linked : chapterById(chapterId).first);
  }, [chapterId, store]);

  useEffect(() => {
    if (!coach) return;
    const timer = window.setTimeout(() => store.setState({ coach: "" }), 7000);
    return () => window.clearTimeout(timer);
  }, [coach, store]);

  const toast = toasts[0];
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => store.getState().dropToast(), toast.reward ? REWARD_MS : TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, store]);

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

  const toggleFull = () => {
    const node = stageRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void node.requestFullscreen().catch(() => {});
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new StarfieldEngine(canvas, hooksRef);
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!gazeOn) {
      engineRef.current?.setGaze(0, 0, false);
      store.setState({ gazeNote: "" });
      return;
    }
    let stop = () => {};
    let dead = false;
    store.setState({ gazeNote: "Starting gaze" });
    void startGaze({
      onSample: (x, y) => engineRef.current?.setGaze(x, y, true),
      onStatus: (text) => {
        if (!dead) store.setState({ gazeNote: text });
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
  }, [gazeOn, store]);

  useEffect(() => {
    const hide = () => store.setState({ hint: false });
    const timer = window.setTimeout(hide, 6400);
    window.addEventListener("pointerdown", hide, { once: true });
    window.addEventListener("keydown", hide, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", hide);
    };
  }, [store]);

  const markerRefCbs = useRef<Record<string, (node: HTMLSpanElement | null) => void>>({});

  const markerRef = (id: string) => {
    let cb = markerRefCbs.current[id];
    if (!cb) {
      cb = (node: HTMLSpanElement | null) => {
        markerRefs.current[id] = node;
        if (node) node.hidden = true;
      };
      markerRefCbs.current[id] = cb;
    }
    return cb;
  };

  function paintPlot(blips: PlotBlip[]) {
    const draw = (detailed: boolean) => {
      const labels: { x: number; y: number; name: string }[] = [];
      return blips
        .map((blip) => {
          const cx = 50 + blip.x;
          const cy = 50 - blip.y;
          if (blip.ring) {
            return `<circle cx="50" cy="50" r="${blip.r.toFixed(2)}" class="orbit-line" />`;
          }
          if (blip.ship) {
            const deg = ((-(blip.heading ?? 0) * 180) / Math.PI).toFixed(1);
            return `<path class="plot-ship" transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${deg})" d="M0 -3.1 L1.6 2.5 L0 1.15 L-1.6 2.5 Z" />`;
          }
          const cls = blip.target ? "blip is-target" : blip.close ? "blip is-close" : "blip";
          const mark = blip.depot
            ? `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(blip.r + 1.3).toFixed(2)}" class="blip is-station" />`
            : "";
          let text = "";
          if (detailed && blip.name) {
            let ly = cy - blip.r - 1.5;
            const crowded = labels.some((other) => Math.hypot(other.x - cx, other.y - ly) < 3.2);
            if (crowded) ly -= 2.6;
            labels.push({ x: cx, y: ly, name: blip.name });
            text = `<text x="${cx.toFixed(2)}" y="${ly.toFixed(2)}" class="atlas-name">${blip.name}</text>`;
          }
          return `${mark}<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${blip.r.toFixed(2)}" class="${cls}" />${text}`;
        })
        .join("");
    };
    const node = plotRef.current;
    const small = draw(false);
    if (node && node.dataset.draw !== small) {
      node.dataset.draw = small;
      node.innerHTML = small;
    }
    const atlas = atlasRef.current;
    if (!atlas) return;
    const large = draw(true);
    if (atlas.dataset.draw !== large) {
      atlas.dataset.draw = large;
      atlas.innerHTML = large;
    }
  }

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
    engineRef.current?.chime("chart");
    const el = markerRefs.current[id];
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

  function paintMarkers(markers: FrameMarker[]) {
    for (const body of bodiesIn(chapterId)) {
      const el = markerRefs.current[body.id];
      if (!el) continue;
      const marker = markers.find((item) => item.id === body.id);
      if (!marker) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      const label = charted.includes(body.id) ? `${marker.name} ✓` : marker.name;
      if (el.textContent !== label) el.textContent = label;
      el.style.left = `${(marker.x * 100).toFixed(1)}%`;
      el.style.top = `${(marker.y * 100).toFixed(1)}%`;
      el.classList.toggle("is-target", marker.primary);
      el.classList.toggle("is-charted", charted.includes(body.id));
    }
  }

  const chapter = chapterById(chapterId);
  const chapterGoals = goalsIn(chapterId);
  const chapterCharted = chapterGoals.filter((body) => charted.includes(body.id)).length;
  const chapterReady = chapterDone(chapterId, charted);
  const nextChapter = chapter.next ? chapterById(chapter.next) : null;
  const nav = navIn(chapterId);
  const target = bodyById(targetId);
  const nearBody = nearId ? bodyById(nearId) : null;
  const showBrief = Boolean(nearBody) && dismissed !== nearId;
  // Stays up until the player takes it, waves it off, or charts a place.
  const offer = offerOpen && charted.length === 0 && lesson === null && !autopilot;
  const nextStop = nearBody ? nextInNav(chapterId, nearBody.id) : undefined;
  const orbitLevels = (id: string) => (
    <div className="orbit-levels" role="group" aria-label="Orbit height">
      {(["Low", "Mid", "High"] as const).map((name, index) => (
        <button
          key={name}
          type="button"
          data-tip={`${name} orbit. Click the active height to leave.`}
          aria-pressed={orbit && targetId === id && orbitLevel === index}
          onClick={() => game.pickOrbit(id, index)}
        >
          {name}
        </button>
      ))}
    </div>
  );
  const shareChart = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("target", targetId);
    const text = `${chapterCharted} of ${chapterGoals.length} charted in Starward.`;
    const full = `${text} ${url.toString()}`;
    const done = () => game.notify("Link copied");
    if (navigator.share) {
      void navigator.share({ title: "Starward", text, url: url.toString() }).catch(() => {
        void navigator.clipboard?.writeText(full).then(done).catch(() => game.notify(full));
      });
      return;
    }
    void navigator.clipboard?.writeText(full).then(done).catch(() => game.notify(full));
  };
  const aboveName = aboveSide < 0 ? "Above L" : aboveSide > 0 ? "Above R" : "Above";

  return (
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
        {target.name}. {chapterCharted} of {chapterGoals.length} places charted.
      </p>
      <div className="markers" aria-hidden="true">
        {bodiesIn(chapterId).map((body) => (
          <span
            key={body.id}
            className="marker"
            data-id={body.id}
            ref={markerRef(body.id)}
          />
        ))}
      </div>
      <header className="topbar">
        <div>
          <h1 className="wordmark">Starward</h1>
          <p className="kicker">
            <button
              type="button"
              className="chapter-name"
              aria-expanded={mapOpen}
              onClick={() => store.setState({ mapOpen: !mapOpen })}
            >
              {chapter.name}
            </button>
            {" · "}
            {chapterReady && !nextChapter ? (
              "Journey charted"
            ) : chapterReady ? (
              "Charted"
            ) : (
              <>
                <span key={chapterCharted} className="chart is-count">
                  {chapterCharted} of {chapterGoals.length}
                </span>{" "}
                places charted
                {chapterId === "sun" ? (
                  <>
                    {" · "}
                    <span className="chart">{depots.length}</span> {depots.length === 1 ? "station" : "stations"}
                  </>
                ) : null}
              </>
            )}
          </p>
          {mapOpen ? (
            <ul className="chapter-menu">
              {CHAPTERS.map((item) => {
                const open = chapterOpen(item.id, charted);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={!open}
                      aria-current={item.id === chapterId ? "true" : undefined}
                      onClick={() =>
                        store.setState(open && item.id !== chapterId ? { mapOpen: false, chapterId: item.id } : { mapOpen: false })
                      }
                    >
                      {item.name}
                      <span>{!open ? "Locked" : chapterDone(item.id, charted) ? "Charted" : "Open"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="top-actions">
            {nextChapter && chapterReady ? (
              <button type="button" className="onward" onClick={() => store.setState({ chapterId: nextChapter.id })}>
                Onward
              </button>
            ) : null}
            <button type="button" className="help-btn" data-hud onClick={game.openHelp}>
              Help
            </button>
            <button
              type="button"
              className="help-btn"
              data-hud
              aria-pressed={logOpen}
              onClick={game.toggleLog}
            >
              Log
            </button>
          </div>
        </div>
        <div className="readout">
          <span ref={warpRef} className="warp">
            1.58
          </span>
          <p className="warp-unit">
            warp <span className="boost-flag">· boost</span>
            <span className="orbit-flag">· orbit</span>
          </p>
          <p ref={captureRef} className="capture-read" />
          <div className="dash">
            <p>
              <span>Dist</span>
              <b ref={distRef}>—</b>
            </p>
            <p>
              <span>Spd</span>
              <b ref={spdRef}>0</b>
            </p>
            <p>
              <span>Cr</span>
              <b>{credits}</b>
            </p>
            <p>
              <span>Hold</span>
              <b>
                {holdUnits(hold)}/{HOLD_MAX}
              </b>
            </p>
            <p>
              <span>Nose</span>
              <b ref={noseRef}>0°</b>
            </p>
          </div>
        </div>
      </header>
      <button
        type="button"
        className="plot-btn"
        data-hud
        aria-expanded={atlasOpen}
        aria-label="Open the system map"
        onClick={() => store.setState({ atlasOpen: true })}
      >
        <svg className="plot" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="plot-ring" cx="50" cy="50" r="46" />
          <g ref={plotRef} />
        </svg>
      </button>
      {atlasOpen ? (
        <div className="atlas" data-hud role="presentation" onClick={() => store.setState({ atlasOpen: false })}>
          <div
            className="atlas-card"
            role="dialog"
            aria-label="System map"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="brief-close" onClick={() => store.setState({ atlasOpen: false })}>
              Close
            </button>
            <svg className="atlas-map" viewBox="0 0 100 100">
              <circle className="plot-ring" cx="50" cy="50" r="46" />
              <g ref={atlasRef} />
            </svg>
          </div>
        </div>
      ) : null}
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
      {lesson !== null && LESSONS[lesson] ? (
        <article className="lesson" data-hud role="dialog" aria-labelledby="lesson-title">
          <p className="lesson-kicker">
            {lesson + 1} of {LESSONS.length}
          </p>
          <h2 id="lesson-title">{LESSONS[lesson].title}</h2>
          <p>{LESSONS[lesson].body}</p>
          <div className="lesson-actions">
            <button type="button" onClick={game.closeLesson}>
              Skip
            </button>
            {lesson > 0 ? (
              <button type="button" onClick={() => store.setState({ lesson: lesson - 1 })}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (lesson + 1 >= LESSONS.length ? game.closeLesson() : store.setState({ lesson: lesson + 1 }))}
            >
              {lesson + 1 >= LESSONS.length ? "Fly" : "Next"}
            </button>
          </div>
        </article>
      ) : null}
      {logOpen ? (
        <article className="lesson log" data-hud aria-label="Flight log">
          <div className="brief-top">
            <div>
              <p className="lesson-kicker">
                {log.length} of {TASKS.length} logged
              </p>
              <h2>Flight log</h2>
            </div>
            <button type="button" className="brief-close" onClick={() => store.setState({ logOpen: false })}>
              Close
            </button>
          </div>
          <ul className="log-list">
            {TASKS.map((task) => {
              const done = log.find((entry) => entry.id === task.id);
              const seconds = Math.max(0, Math.floor(done?.seconds ?? 0));
              const stamp = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
              return (
                <li key={task.id}>
                  <div>
                    <strong>{task.name}</strong>
                    <span>{done ? stamp : "Open"}</span>
                  </div>
                  <p>{task.how}</p>
                </li>
              );
            })}
          </ul>
        </article>
      ) : null}
      <div className="chrome">
        {offer ? (
          <p className="hint">
            <span>Earth is selected. Press Go.</span>
            <button type="button" className="hint-go" onClick={game.startFirstFlight}>
              First flight
            </button>
            <button type="button" className="hint-skip" onClick={() => store.setState({ offerOpen: false })}>
              Not now
            </button>
          </p>
        ) : (
          <p className={hint && lesson === null && !coach ? "hint" : "hint is-hidden"}>
            <span className="md:hidden">Drag to look. Go flies you there.</span>
            <span className="hidden md:inline">Drag to look. A click nudges the nose. Go flies to the place you pick.</span>
          </p>
        )}
        {coach ? <p className="hint">{coach}</p> : null}
        {gazeNote ? <p className="status">{gazeNote}</p> : null}
        {alert ? <p className="status">{alert}</p> : null}
        <div className="toasts" aria-live="polite">
          {toast ? (
            <p key={toast.id} className={toast.reward ? "toast is-reward" : "toast"}>
              <strong>{toast.title}</strong>
              {toast.detail ? <span>{toast.detail}</span> : null}
            </p>
          ) : null}
        </div>
        {showBrief && nearBody ? (
          <article className="brief" data-hud>
            <div className="brief-top">
              <h2>{nearBody.name}</h2>
              <button type="button" className="brief-close" onClick={() => store.setState({ dismissed: nearBody.id })}>
                Close
              </button>
            </div>
            <p>{nearBody.blurb}</p>
            <dl className="facts">
              <div>
                <dt>Distance</dt>
                <dd>{nearBody.place ?? (nearBody.au === 0 ? "Center" : `${nearBody.au.toFixed(2)} AU`)}</dd>
              </div>
              <div>
                <dt>{nearBody.form ? "Kind" : nearBody.parent ? "Orbit" : "Year"}</dt>
                <dd>{nearBody.year}</dd>
              </div>
              <div>
                <dt>{nearBody.form ? "Note" : nearBody.parent ? "Orbits" : "Moons"}</dt>
                <dd>{nearBody.form ? nearBody.moons : nearBody.parent ? bodyById(nearBody.parent).name : nearBody.moons}</dd>
              </div>
            </dl>
            <div className="brief-actions">
              {orbitLevels(nearBody.id)}
              {orbit && targetId === nearBody.id ? (
                <button type="button" className="brief-orbit" aria-pressed onClick={() => store.setState({ orbit: false })}>
                  Leave
                </button>
              ) : null}
              {nextStop && nextStop.id !== nearBody.id ? (
                <button type="button" className="brief-next" onClick={game.flyNext}>
                  Next · {nextStop.name}
                </button>
              ) : null}
            </div>
            {canDock(nearBody) ? (
              <div className="market">
                {GOODS.map((good) => {
                  const cost = priceOf(nearBody.id, good.id);
                  return (
                    <div key={good.id} className="market-row">
                      <span>{good.name}</span>
                      <b>{cost}</b>
                      <button type="button" disabled={credits < cost || holdUnits(hold) >= HOLD_MAX} onClick={() => game.buy(good.id)}>
                        Buy
                      </button>
                      <button type="button" disabled={hold[good.id] < 1} onClick={() => game.sell(good.id)}>
                        Sell
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <p className="brief-note">
              {canDock(nearBody)
                ? "Buy where a good is cheap, sell where the price is higher. Stations deploy from More, out in open space."
                : "Orbits keep their real order. Travel distances are compressed so you can cross the system."}
            </p>
          </article>
        ) : null}
      </div>
      </div>
      <footer data-hud className="dock">
        <div className="dock-bar">
          {moreOpen ? (
            <div className="more-panel">
              <div className="actions">
                <button type="button" data-tip="Burn harder for a while. Leaves an orbit." aria-pressed={boost} onClick={game.toggleBoost}>
                  Boost
                </button>
                <button
                  type="button"
                  data-tip="Deploy in open space, away from a world. It pays you over time."
                  disabled={chapterId !== "sun" || Boolean(nearId) || credits < STATION_COST || depots.length >= STATION_LIMIT}
                  onClick={() => game.deployStation(shipAt.current, Date.now())}
                >
                  Deploy · {STATION_COST}
                </button>
                {orbitLevels(targetId)}
                <button
                  type="button"
                  data-tip="Level the nose"
                  aria-pressed={noseLevel}
                  aria-label="Level the nose to the horizon"
                  onClick={() => engineRef.current?.level()}
                >
                  Horizon
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  data-tip={muted ? "Turn the engine sound on" : "Turn the engine sound off"}
                  aria-pressed={!muted}
                  aria-label={muted ? "Unmute" : "Mute"}
                  onClick={game.toggleMuted}
                >
                  {muted ? <VolumeX size={16} strokeWidth={1.75} /> : <Volume2 size={16} strokeWidth={1.75} />}
                </button>
                <button
                  type="button"
                  data-tip="Steer by looking. The camera stays on this device."
                  aria-pressed={gazeOn}
                  onClick={() => store.setState({ gazeOn: !gazeOn })}
                >
                  Gaze
                </button>
                <button type="button" data-tip={full ? "Leave full screen" : "Fill the screen"} aria-pressed={full} onClick={toggleFull}>
                  {full ? "Exit" : "Full"}
                </button>
                <button type="button" data-tip="Copy a link to this place and your chart count" onClick={shareChart}>
                  Share
                </button>
              </div>
              <p className="more-note">Sizes and years are real. Distances are compressed so a flight can cross them.</p>
              <div className="slider-row density-row" data-tip="How many stars fill the sky.">
                <span id="density-label" className="slider-label">
                  Stars
                </span>
                <Slider.Root
                  className="slider"
                  aria-labelledby="density-label"
                  min={0}
                  max={1}
                  step={0.005}
                  value={[density]}
                  onValueChange={([value]) => game.setDensity(value ?? 0)}
                >
                  <Slider.Track className="slider-track">
                    <Slider.Range className="slider-range" />
                  </Slider.Track>
                  <Slider.Thumb className="slider-thumb" aria-label="Stars">
                    <span />
                  </Slider.Thumb>
                </Slider.Root>
              </div>
            </div>
          ) : null}
          {navOpen ? (
            <ul className="nav-list">
              {navSections(nav).map((section) => (
                <li key={section.group} className="nav-section">
                  <p className="nav-group">{section.group}</p>
                  <ul>
                    {section.bodies.map((body) => (
                      <li key={body.id}>
                        <button
                          type="button"
                          aria-current={body.id === targetId ? "true" : undefined}
                          onClick={() => game.pickTarget(body.id)}
                        >
                          {body.name}
                          <span>
                            {charted.includes(body.id)
                              ? "Charted"
                              : body.tag
                                ? body.tag
                                : body.place
                                  ? body.place
                                  : body.au === 0
                                    ? "Star"
                                    : `${body.au.toFixed(2)} AU`}
                          </span>
                        </button>
                      </li>
                    ))}
                    {section.group === "Star" ? (
                      <li>
                        <button
                          type="button"
                          className="nav-next"
                          data-tip="Fly to the next place"
                          aria-label={`Next, fly to ${nextInNav(chapterId, targetId)?.name ?? "the next place"}`}
                          onClick={game.stepTour}
                        >
                          Next
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flight-line">
            <div className="nav-row">
              <button
                type="button"
                className="nav-target"
                data-tip="Choose where to fly"
                aria-expanded={navOpen}
                onClick={game.toggleNav}
              >
                {target.name}
                <small ref={rangeRef}>—</small>
              </button>
              <button
                type="button"
                data-tip="Fly to the selected place"
                className="go-btn"
                aria-pressed={autopilot}
                aria-label={autopilot ? `Stop flying to ${target.name}` : `Fly to ${target.name}`}
                onClick={game.toggleAutopilot}
              >
                {autopilot ? "Stop" : "Go"}
              </button>
            </div>
            <div className="throttle speed-row" data-tip="Cruise speed. The warp number follows.">
              <Slider.Root
                className="slider"
                aria-label="Speed"
                min={0}
                max={1}
                step={0.005}
                value={[speed]}
                onValueChange={([value]) => game.setSpeed(value ?? 0)}
              >
                <Slider.Track className="slider-track">
                  <Slider.Range className="slider-range" />
                </Slider.Track>
                <Slider.Thumb className="slider-thumb" aria-label="Speed">
                  <span />
                </Slider.Thumb>
              </Slider.Root>
            </div>
            <button
              type="button"
              className="view-cycle"
              data-tip={view === "above" ? (aboveSide < 0 ? "Overhead, from the left" : aboveSide > 0 ? "Overhead, from the right" : "Overhead, from the center") : VIEWS[view].tip}
              aria-label={`Camera is ${view === "above" ? aboveName : VIEWS[view].label}. Switch camera.`}
              onClick={game.cycleView}
            >
              {view === "above" ? aboveName : VIEWS[view].label}
            </button>
            <button
              type="button"
              className="more-btn"
              data-tip="Boost, orbit, horizon, stars, and full screen"
              aria-pressed={moreOpen}
              aria-expanded={moreOpen}
              aria-label={moreOpen ? "Hide extra controls" : "Show extra controls"}
              onClick={game.toggleMore}
            >
              {moreOpen ? "Less" : "More"}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
