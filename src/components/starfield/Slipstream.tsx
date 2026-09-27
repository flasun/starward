import { useEffect, useRef, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Volume2, VolumeX } from "lucide-react";
import { StarfieldEngine, type CameraView, type FrameMarker, type StarfieldHooks, type StarfieldParams } from "@/components/starfield/engine";
import { clamp01 } from "@/components/starfield/math";
import { BODIES, GOAL_COUNT, bodyById } from "@/components/starfield/system";
import { TASKS } from "@/components/starfield/tasks";

const STORAGE = "slipstream-settings";
const SURVEY = "slipstream-survey";
const HELP = "slipstream-help";
const LOG = "slipstream-log";
const NAV = BODIES.filter((body) => body.nav);
const VIEWS: { id: CameraView; label: string; tip: string }[] = [
  { id: "cockpit", label: "Cockpit", tip: "Look out the nose" },
  { id: "chase", label: "Chase", tip: "Camera behind the ship" },
  { id: "wing", label: "Wing", tip: "Camera off the left side" },
];
const LESSONS = [
  {
    title: "Look around",
    body: "Drag the sky to steer. A and D turn. W and S pitch the nose.",
  },
  {
    title: "Set your speed",
    body: "Speed is your cruise. Boost burns harder, and a close pass flies one loop around that world, then boosts on. Orbit on the place card, or under More, holds the circle. O toggles it.",
  },
  {
    title: "Chart a place",
    body: "Pick a world, then Go. On its card, Next flies you to the following place. Orbit holds you there until you leave, boost, or choose another.",
  },
  {
    title: "Change the camera",
    body: "Cockpit is the nose. Chase sits behind the ship. Wing looks from the side. Full fills the screen.",
  },
  {
    title: "Fly a task",
    body: "Open Log. Soft arrivals, slingshots, the ring cut, and the rest are saved with your time. A faint trail marks where you have flown.",
  },
];

function navSections(bodies: typeof NAV) {
  const sections: { group: string; bodies: typeof NAV }[] = [];
  for (const body of bodies) {
    const last = sections[sections.length - 1];
    if (!last || last.group !== body.group) sections.push({ group: body.group, bodies: [body] });
    else last.bodies.push(body);
  }
  return sections;
}

export function Slipstream() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const warpRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLElement>(null);
  const markerRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const nearSeen = useRef("");
  const alertSeen = useRef("");
  const levelSeen = useRef(false);
  const touchedAt = useRef(0);
  const lockedAt = useRef(0);
  const wasLocked = useRef(false);
  const engineRef = useRef<StarfieldEngine | null>(null);
  const hooksRef = useRef<StarfieldHooks>({
    getParams: () => paramsRef.current,
    onSpeed: () => {},
    onToggleBoost: () => {},
    onFrame: () => {},
    onError: () => {},
    onCancelAutopilot: () => {},
    onCancelOrbit: () => {},
    onToggleOrbit: () => {},
    onBeginLap: () => {},
    onEndLap: () => {},
    onTask: () => {},
  });
  const paramsRef = useRef<StarfieldParams>({
    speed: 0.42,
    density: 0.52,
    boost: false,
    muted: false,
    reducedMotion: false,
    targetId: "earth",
    autopilot: false,
    orbit: false,
    view: "cockpit",
  });

  const [speed, setSpeed] = useState(0.42);
  const [density, setDensity] = useState(0.52);
  const [boost, setBoost] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hint, setHint] = useState(true);
  const [error, setError] = useState("");
  const [targetId, setTargetId] = useState("earth");
  const [autopilot, setAutopilot] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [noseLevel, setNoseLevel] = useState(false);
  const [nearId, setNearId] = useState("");
  const [dismissed, setDismissed] = useState("");
  const [alert, setAlert] = useState("");
  const [charted, setCharted] = useState<string[]>([]);
  const [view, setView] = useState<CameraView>("cockpit");
  const [full, setFull] = useState(false);
  const [lesson, setLesson] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<{ id: string; seconds: number }[]>([]);
  const [banner, setBanner] = useState("");

  paramsRef.current = {
    speed,
    density,
    boost,
    muted,
    reducedMotion: reduced,
    targetId,
    autopilot,
    orbit,
    view,
  };

  hooksRef.current.getParams = () => paramsRef.current;
  hooksRef.current.onSpeed = (next) => setSpeed(clamp01(next));
  hooksRef.current.onToggleBoost = () => {
    setOrbit(false);
    setBoost((value) => !value);
  };
  hooksRef.current.onCancelAutopilot = () => setAutopilot(false);
  hooksRef.current.onCancelOrbit = () => setOrbit(false);
  hooksRef.current.onBeginLap = (id) => {
    setTargetId(id);
    setOrbit(true);
    setBoost(false);
    setAutopilot(false);
  };
  hooksRef.current.onEndLap = () => {
    setOrbit(false);
    setBoost(true);
    setAutopilot(false);
  };
  hooksRef.current.onToggleOrbit = () => {
    setOrbit((value) => {
      const next = !value;
      if (next) {
        setBoost(false);
        setAutopilot(false);
      }
      return next;
    });
  };
  hooksRef.current.onError = (message) => setError(message);
  hooksRef.current.onTask = (id, seconds) => {
    setLog((prev) => (prev.some((entry) => entry.id === id) ? prev : [...prev, { id, seconds }]));
    const name = TASKS.find((task) => task.id === id)?.name ?? "Task";
    setBanner(`${name} logged`);
  };
  hooksRef.current.onFrame = (snap) => {
    const warp = warpRef.current;
    if (warp && warp.textContent !== snap.warpText) warp.textContent = snap.warpText;
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
      setNoseLevel(snap.leveling);
    }
    paintMarkers(snap.markers);
    if (snap.nearId !== nearSeen.current) {
      nearSeen.current = snap.nearId;
      setNearId(snap.nearId);
      if (!snap.nearId) setDismissed("");
      if (snap.nearId && bodyById(snap.nearId).goal) {
        setCharted((prev) => (prev.includes(snap.nearId) ? prev : [...prev, snap.nearId]));
      }
    }
    if (snap.alert !== alertSeen.current) {
      alertSeen.current = snap.alert;
      setAlert(snap.alert);
    }
  };

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { speed?: unknown; density?: unknown; muted?: unknown; view?: unknown };
      if (typeof parsed.speed === "number") setSpeed(clamp01(parsed.speed));
      if (typeof parsed.density === "number") setDensity(clamp01(parsed.density));
      if (typeof parsed.muted === "boolean") setMuted(parsed.muted);
      if (parsed.view === "cockpit" || parsed.view === "chase" || parsed.view === "wing") setView(parsed.view);
    } catch {
      /* ignore broken storage */
    }
  }, []);

  const skipSave = useRef(true);
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    localStorage.setItem(STORAGE, JSON.stringify({ speed, density, muted, view }));
  }, [speed, density, muted, view]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SURVEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setCharted(
        parsed.filter((id): id is string => typeof id === "string" && BODIES.some((body) => body.id === id && body.goal)),
      );
    } catch {
      /* ignore broken storage */
    }
  }, []);

  const skipSurvey = useRef(true);
  useEffect(() => {
    if (skipSurvey.current) {
      skipSurvey.current = false;
      return;
    }
    localStorage.setItem(SURVEY, JSON.stringify(charted));
  }, [charted]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOG);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setLog(
        parsed.filter(
          (entry): entry is { id: string; seconds: number } =>
            !!entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: unknown }).id === "string" &&
            typeof (entry as { seconds?: unknown }).seconds === "number" &&
            TASKS.some((task) => task.id === (entry as { id: string }).id),
        ),
      );
    } catch {
      /* ignore broken storage */
    }
  }, []);

  const skipLog = useRef(true);
  useEffect(() => {
    if (skipLog.current) {
      skipLog.current = false;
      return;
    }
    localStorage.setItem(LOG, JSON.stringify(log));
  }, [log]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(""), 3400);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    try {
      if (localStorage.getItem(HELP) === "seen") return;
    } catch {
      /* show the lesson if storage is blocked */
    }
    setLesson(0);
  }, []);

  const closeLesson = () => {
    setLesson(null);
    try {
      localStorage.setItem(HELP, "seen");
    } catch {
      /* the lesson can still close */
    }
  };

  useEffect(() => {
    if (lesson === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLesson(null);
      try {
        localStorage.setItem(HELP, "seen");
      } catch {
        /* the lesson can still close */
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lesson]);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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
    const hide = () => setHint(false);
    const timer = window.setTimeout(hide, 6400);
    window.addEventListener("pointerdown", hide, { once: true });
    window.addEventListener("keydown", hide, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", hide);
    };
  }, []);

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

  function paintMarkers(markers: FrameMarker[]) {
    for (const body of BODIES) {
      const el = markerRefs.current[body.id];
      if (!el) continue;
      const marker = markers.find((item) => item.id === body.id);
      if (!marker) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      if (el.textContent !== marker.name) el.textContent = marker.name;
      el.style.left = `${(marker.x * 100).toFixed(1)}%`;
      el.style.top = `${(marker.y * 100).toFixed(1)}%`;
      el.classList.toggle("is-target", marker.primary);
    }
  }

  const target = bodyById(targetId);
  const nearBody = nearId ? bodyById(nearId) : null;
  const showBrief = Boolean(nearBody) && dismissed !== nearId;
  const nextAfter = (id: string) => {
    const index = NAV.findIndex((body) => body.id === id);
    return NAV[(index + 1 + NAV.length) % NAV.length];
  };
  const nextStop = nearBody ? nextAfter(nearBody.id) : undefined;
  const engageOrbit = (id: string) => {
    setTargetId(id);
    setOrbit(true);
    setBoost(false);
    setAutopilot(false);
  };
  const flyNext = () => {
    if (!nearBody || !nextStop) return;
    setTargetId(nextStop.id);
    setOrbit(false);
    setBoost(false);
    setAutopilot(true);
    setDismissed(nearBody.id);
  };
  const stepTour = () => {
    const next = nextAfter(targetId);
    if (!next || next.id === targetId) return;
    setTargetId(next.id);
    setOrbit(false);
    setBoost(false);
    setAutopilot(true);
    if (nearId) setDismissed(nearId);
    setNavOpen(false);
  };
  const cycleView = () => {
    const index = VIEWS.findIndex((item) => item.id === view);
    setView(VIEWS[(index + 1) % VIEWS.length].id);
  };

  return (
    <main ref={stageRef} className="stage" data-lesson={lesson === null ? undefined : lesson} aria-label="Slipstream">
      <div className="viewport">
      <canvas ref={canvasRef} className="field" aria-hidden="true" />
      <p className="sr-only">
        Fly the solar system. Drag the view to look. Horizon levels the nose. Go flies to the place you pick.
        Switch between cockpit, chase, and wing. Full screen fills the display.
        A and D steer. W and S pitch.
      </p>
      <div className="markers" aria-hidden="true">
        {BODIES.map((body) => (
          <span
            key={body.id}
            className="marker"
            ref={markerRef(body.id)}
          />
        ))}
      </div>
      <header className="topbar">
        <div>
          <h1 className="wordmark">Slipstream</h1>
          <p className="kicker">
            {charted.length >= GOAL_COUNT ? (
              "System charted"
            ) : (
              <>
                <span className="chart">
                  {charted.length} of {GOAL_COUNT}
                </span>{" "}
                places charted
              </>
            )}
          </p>
          <div className="top-actions">
            <button type="button" className="help-btn" data-hud onClick={() => { setLesson(0); setLogOpen(false); }}>
              Help
            </button>
            <button
              type="button"
              className="help-btn"
              data-hud
              aria-pressed={logOpen}
              onClick={() => {
                setLogOpen((open) => !open);
                setLesson(null);
              }}
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
        </div>
      </header>
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
            <button type="button" onClick={closeLesson}>
              Skip
            </button>
            {lesson > 0 ? (
              <button type="button" onClick={() => setLesson(lesson - 1)}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (lesson + 1 >= LESSONS.length ? closeLesson() : setLesson(lesson + 1))}
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
            <button type="button" className="brief-close" onClick={() => setLogOpen(false)}>
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
        <p className={hint && lesson === null ? "hint" : "hint is-hidden"}>
          <span className="md:hidden">Drag to look. Go flies you there.</span>
          <span className="hidden md:inline">Move to look. Horizon levels the nose. Go flies to the place you pick.</span>
        </p>
        {alert ? <p className="status">{alert}</p> : null}
        {banner ? <p className="status">{banner}</p> : null}
        {showBrief && nearBody ? (
          <article className="brief" data-hud>
            <div className="brief-top">
              <h2>{nearBody.name}</h2>
              <button type="button" className="brief-close" onClick={() => setDismissed(nearBody.id)}>
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
                <dt>{nearBody.parent ? "Orbit" : "Year"}</dt>
                <dd>{nearBody.year}</dd>
              </div>
              <div>
                <dt>{nearBody.parent ? "Orbits" : "Moons"}</dt>
                <dd>{nearBody.parent ? bodyById(nearBody.parent).name : nearBody.moons}</dd>
              </div>
            </dl>
            <div className="brief-actions">
              <button
                type="button"
                className="brief-orbit"
                aria-pressed={orbit && targetId === nearBody.id}
                onClick={() => {
                  if (orbit && targetId === nearBody.id) setOrbit(false);
                  else engageOrbit(nearBody.id);
                }}
              >
                {orbit && targetId === nearBody.id ? "Leave orbit" : "Orbit"}
              </button>
              {nextStop && nextStop.id !== nearBody.id ? (
                <button type="button" className="brief-next" onClick={flyNext}>
                  Next · {nextStop.name}
                </button>
              ) : null}
            </div>
            <p className="brief-note">Orbits keep their real order. Travel distances are compressed so you can cross the system.</p>
          </article>
        ) : null}
      </div>
      </div>
      <footer data-hud className="dock">
        <div className="dock-bar">
          {moreOpen ? (
            <div className="more-panel">
              <div className="actions">
                <button type="button" data-tip="Burn harder for a while. Leaves an orbit." aria-pressed={boost} onClick={() => { setBoost((value) => !value); setOrbit(false); }}>
                  Boost
                </button>
                <button
                  type="button"
                  data-tip="Circle the place you picked. Replaces the previous orbit."
                  aria-pressed={orbit}
                  onClick={() => {
                    if (orbit) setOrbit(false);
                    else engageOrbit(targetId);
                  }}
                >
                  Orbit
                </button>
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
                  onClick={() => setMuted((value) => !value)}
                >
                  {muted ? <VolumeX size={16} strokeWidth={1.75} /> : <Volume2 size={16} strokeWidth={1.75} />}
                </button>
                <button type="button" data-tip={full ? "Leave full screen" : "Fill the screen"} aria-pressed={full} onClick={toggleFull}>
                  {full ? "Exit" : "Full"}
                </button>
              </div>
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
                  onValueChange={([value]) => setDensity(clamp01(value ?? 0))}
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
              {navSections(NAV).map((section) => (
                <li key={section.group} className="nav-section">
                  <p className="nav-group">{section.group}</p>
                  <ul>
                    {section.bodies.map((body) => (
                      <li key={body.id}>
                        <button
                          type="button"
                          aria-current={body.id === targetId ? "true" : undefined}
                          onClick={() => {
                            setTargetId(body.id);
                            setOrbit(false);
                            setAutopilot(false);
                            setNavOpen(false);
                          }}
                        >
                          {body.name}
                          <span>
                            {charted.includes(body.id)
                              ? "Charted"
                              : body.tag
                                ? body.tag
                                : body.place
                                  ? "Moon"
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
                          aria-label={`Next, fly to ${nextAfter(targetId)?.name ?? "the next place"}`}
                          onClick={stepTour}
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
                onClick={() => {
                  setNavOpen((open) => !open);
                  setMoreOpen(false);
                }}
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
                onClick={() => {
                  setAutopilot((value) => !value);
                  setOrbit(false);
                }}
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
                onValueChange={([value]) => setSpeed(clamp01(value ?? 0))}
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
              data-tip={VIEWS.find((item) => item.id === view)?.tip}
              aria-label={`Camera is ${VIEWS.find((item) => item.id === view)?.label}. Switch camera.`}
              onClick={cycleView}
            >
              {VIEWS.find((item) => item.id === view)?.label}
            </button>
            <button
              type="button"
              className="more-btn"
              data-tip="Boost, orbit, horizon, stars, and full screen"
              aria-pressed={moreOpen}
              aria-expanded={moreOpen}
              aria-label={moreOpen ? "Hide extra controls" : "Show extra controls"}
              onClick={() => {
                setMoreOpen((open) => !open);
                setNavOpen(false);
              }}
            >
              {moreOpen ? "Less" : "More"}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
