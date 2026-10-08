import { useEffect, useRef, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Volume2, VolumeX } from "lucide-react";
import { StarfieldEngine, type CameraView, type FrameMarker, type PlotBlip, type StarfieldHooks, type StarfieldParams } from "@/components/starfield/engine";
import { startGaze } from "@/components/starfield/gaze";
import { clamp01 } from "@/components/starfield/math";
import { carryOldSaves } from "@/components/starfield/saves";
import { CHAPTERS, type BodyDef, bodiesIn, bodyById, chapterById, chapterDone, chapterOpen, goalsIn } from "@/components/starfield/system";
import { TASKS } from "@/components/starfield/tasks";
import {
  GOODS,
  HOLD_MAX,
  START_CREDITS,
  STATION_COST,
  STATION_LIMIT,
  type Depot,
  type GoodId,
  type Hold,
  canDock,
  emptyHold,
  holdUnits,
  priceOf,
  stationPay,
} from "@/components/starfield/trade";

const STORAGE = "starward-settings";
const SURVEY = "starward-survey";
const HELP = "starward-help";
const LOG = "starward-log";
const CHAPTER_KEY = "starward-chapter";
const TRADE_KEY = "starward-trade";
const VIEWS: { id: CameraView; label: string; tip: string }[] = [
  { id: "cockpit", label: "Cockpit", tip: "Look out the nose" },
  { id: "chase", label: "Chase", tip: "Camera behind the ship" },
  { id: "left", label: "Left", tip: "Camera off the left wing" },
  { id: "right", label: "Right", tip: "Camera off the right wing" },
  { id: "above", label: "Above", tip: "Overhead. Each press steps left, center, then right." },
];
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

const FIRST_FLIGHT = ["earth", "moon", "mars"];

type BodyNav = BodyDef[];

function isChartable(id: string): boolean {
  return CHAPTERS.some((chapter) => goalsIn(chapter.id).some((body) => body.id === id));
}

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
    onFocus: () => {},
    onCancelFocus: () => {},
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
    focus: false,
    orbit: false,
    orbitLevel: 1,
    view: "cockpit",
    aboveSide: -1,
    paused: false,
    depots: [],
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
  const [orbitLevel, setOrbitLevel] = useState(1);
  const [focus, setFocus] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [noseLevel, setNoseLevel] = useState(false);
  const [nearId, setNearId] = useState("");
  const [dismissed, setDismissed] = useState("");
  const [alert, setAlert] = useState("");
  const [charted, setCharted] = useState<string[]>([]);
  const [chapterId, setChapterId] = useState("sun");
  const [mapOpen, setMapOpen] = useState(false);
  const [view, setView] = useState<CameraView>("cockpit");
  const [aboveSide, setAboveSide] = useState<-1 | 0 | 1>(-1);
  const [full, setFull] = useState(false);
  const [lesson, setLesson] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<{ id: string; seconds: number }[]>([]);
  const [banner, setBanner] = useState("");
  const [credits, setCredits] = useState(START_CREDITS);
  const [hold, setHold] = useState<Hold>(emptyHold);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [paused, setPaused] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const shipAt = useRef({ x: 0, z: 0 });
  const paidAt = useRef(Date.now());
  const [gazeOn, setGazeOn] = useState(false);
  const [gazeNote, setGazeNote] = useState("");
  const [coach, setCoach] = useState("");
  const tourRef = useRef<string[] | null>(null);
  const linkedTarget = useRef<string | null>(null);

  paramsRef.current = {
    speed,
    density,
    boost,
    muted,
    reducedMotion: reduced,
    targetId,
    autopilot,
    focus,
    orbit,
    orbitLevel,
    view,
    aboveSide,
    paused,
    depots,
  };

  hooksRef.current.getParams = () => paramsRef.current;
  hooksRef.current.onSpeed = (next) => setSpeed(clamp01(next));
  hooksRef.current.onToggleBoost = () => {
    setOrbit(false);
    setBoost((value) => !value);
  };
  hooksRef.current.onCancelAutopilot = () => setAutopilot(false);
  hooksRef.current.onCancelOrbit = () => setOrbit(false);
  hooksRef.current.onFocus = (id) => {
    const same = paramsRef.current.targetId === id && paramsRef.current.orbit;
    if (same) {
      setOrbit(false);
      setFocus(false);
      setAutopilot(false);
      return;
    }
    setTargetId(id);
    setOrbit(true);
    setBoost(false);
    setAutopilot(true);
    setFocus(true);
  };
  hooksRef.current.onCancelFocus = () => setFocus(false);
  hooksRef.current.onBeginLap = (id) => {
    setTargetId(id);
    setOrbit(true);
    setBoost(false);
    setAutopilot(false);
    setFocus(false);
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
        setFocus(false);
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
      setNoseLevel(snap.leveling);
    }
    paintMarkers(snap.markers);
    if (snap.chartId !== chartSeen.current) {
      chartSeen.current = snap.chartId;
      if (snap.chartId && bodyById(snap.chartId).goal) {
        const chartId = snap.chartId;
        setCharted((prev) => {
          if (prev.includes(chartId)) return prev;
          const tour = tourRef.current;
          const index = tour ? tour.indexOf(chartId) : -1;
          const next = index >= 0 ? tour?.[index + 1] : undefined;
          if (next) {
            queueMicrotask(() => {
              setTargetId(next);
              setOrbit(false);
              setBoost(false);
              setAutopilot(true);
              setFocus(true);
              setCoach(`${bodyById(chartId).name} charted. On to ${bodyById(next).name}.`);
            });
          } else if (index >= 0) {
            tourRef.current = null;
            queueMicrotask(() => {
              setAutopilot(false);
              setCoach("Earth, the Moon, and Mars are charted. Pick the next world.");
            });
          }
          try {
            navigator.vibrate?.(16);
          } catch {
            /* no haptics */
          }
          return [...prev, chartId];
        });
      }
    }
    if (snap.nearId !== nearSeen.current) {
      nearSeen.current = snap.nearId;
      setNearId(snap.nearId);
      if (!snap.nearId) setDismissed("");
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

  // Before any load below, so saves from the Slipstream name are found.
  useEffect(() => {
    carryOldSaves();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { speed?: unknown; density?: unknown; muted?: unknown; view?: unknown; aboveSide?: unknown };
      if (typeof parsed.speed === "number") setSpeed(clamp01(parsed.speed));
      if (typeof parsed.density === "number") setDensity(clamp01(parsed.density));
      if (typeof parsed.muted === "boolean") setMuted(parsed.muted);
      if (parsed.view === "wing") setView("left");
      if (parsed.view === "cockpit" || parsed.view === "chase" || parsed.view === "left" || parsed.view === "right" || parsed.view === "above") setView(parsed.view);
      if (parsed.aboveSide === -1 || parsed.aboveSide === 0 || parsed.aboveSide === 1) setAboveSide(parsed.aboveSide);
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
    localStorage.setItem(STORAGE, JSON.stringify({ speed, density, muted, view, aboveSide }));
  }, [speed, density, muted, view, aboveSide]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SURVEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const ids = parsed.filter((id): id is string => typeof id === "string" && isChartable(id));
      setCharted(ids);
      const saved = localStorage.getItem(CHAPTER_KEY);
      if (typeof saved === "string" && CHAPTERS.some((chapter) => chapter.id === saved) && chapterOpen(saved, ids)) {
        setChapterId(saved);
      }
    } catch {
      /* ignore broken storage */
    }
  }, []);

  const skipChapter = useRef(true);
  useEffect(() => {
    if (skipChapter.current) {
      skipChapter.current = false;
      return;
    }
    localStorage.setItem(CHAPTER_KEY, chapterId);
  }, [chapterId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRADE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        credits?: unknown;
        hold?: Partial<Hold>;
        depots?: unknown;
        paid?: unknown;
      };
      const nextHold = emptyHold();
      if (data.hold && typeof data.hold === "object") {
        for (const good of GOODS) {
          const amount = data.hold[good.id];
          if (typeof amount === "number" && amount > 0) nextHold[good.id] = Math.floor(amount);
        }
      }
      const nextDepots = Array.isArray(data.depots)
        ? data.depots.filter(
            (item): item is Depot =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as Depot).id === "string" &&
              typeof (item as Depot).x === "number" &&
              typeof (item as Depot).z === "number",
          )
        : [];
      const paid = typeof data.paid === "number" ? data.paid : Date.now();
      const purse = typeof data.credits === "number" ? data.credits : START_CREDITS;
      const income = stationPay(nextDepots.length, paid, Date.now());
      paidAt.current = income.at;
      setCredits(Math.max(0, Math.floor(purse + income.gain)));
      setHold(nextHold);
      setDepots(nextDepots.slice(0, STATION_LIMIT));
    } catch {
      /* ignore broken storage */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      TRADE_KEY,
      JSON.stringify({ credits, hold, depots, paid: paidAt.current }),
    );
  }, [credits, hold, depots]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (depots.length === 0) {
        paidAt.current = Date.now();
        return;
      }
      const income = stationPay(depots.length, paidAt.current, Date.now());
      paidAt.current = income.at;
      if (income.gain > 0) setCredits((value) => value + income.gain);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [depots.length]);

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
    const first = linkedHere ? linked : chapterById(chapterId).first;
    setTargetId(first);
    setOrbit(false);
    setBoost(false);
    setAutopilot(true);
    setFocus(true);
    setDismissed("");
    setNavOpen(false);
    setMapOpen(false);
  }, [chapterId]);

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
    if (!coach) return;
    const timer = window.setTimeout(() => setCoach(""), 7000);
    return () => window.clearTimeout(timer);
  }, [coach]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(""), 3400);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const closeLesson = () => {
    setLesson(null);
    try {
      localStorage.setItem(HELP, "seen");
    } catch {
      /* the lesson can still close */
    }
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("target");
    if (!id || !isChartable(id)) return;
    let ids: string[] = [];
    try {
      const raw = localStorage.getItem(SURVEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((item): item is string => typeof item === "string");
    } catch {
      /* an unreadable save still allows the solar system */
    }
    const chapter = bodyById(id).chapter ?? "sun";
    if (!chapterOpen(chapter, ids)) return;
    if (chapter !== "sun") {
      linkedTarget.current = id;
      setChapterId(chapter);
    }
    setTargetId(id);
    setFocus(true);
    setAutopilot(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (lesson !== null) {
        closeLesson();
        return;
      }
      if (logOpen) {
        setLogOpen(false);
        return;
      }
      if (moreOpen) {
        setMoreOpen(false);
        return;
      }
      if (navOpen) {
        setNavOpen(false);
        return;
      }
      setPaused((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lesson, logOpen, moreOpen, navOpen]);

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
    if (!gazeOn) {
      engineRef.current?.setGaze(0, 0, false);
      setGazeNote("");
      return;
    }
    let stop = () => {};
    let dead = false;
    setGazeNote("Starting gaze");
    void startGaze({
      onSample: (x, y) => engineRef.current?.setGaze(x, y, true),
      onStatus: (text) => {
        if (!dead) setGazeNote(text);
      },
    })
      .then((dispose) => {
        if (dead) dispose();
        else stop = dispose;
      })
      .catch((err: unknown) => {
        if (dead) return;
        setGazeOn(false);
        setBanner(err instanceof Error ? err.message : "Gaze could not start.");
      });
    return () => {
      dead = true;
      stop();
      engineRef.current?.setGaze(0, 0, false);
    };
  }, [gazeOn]);

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
  const nav = bodiesIn(chapterId).filter((body) => body.nav);
  const target = bodyById(targetId);
  const nearBody = nearId ? bodyById(nearId) : null;
  const showBrief = Boolean(nearBody) && dismissed !== nearId;
  const nextAfter = (id: string) => {
    const index = nav.findIndex((body) => body.id === id);
    return nav[(index + 1 + nav.length) % nav.length];
  };
  const nextStop = nearBody ? nextAfter(nearBody.id) : undefined;
  const engageOrbit = (id: string) => {
    setTargetId(id);
    setOrbit(true);
    setBoost(false);
    setAutopilot(false);
    setFocus(false);
  };
  const pickOrbit = (id: string, level: number) => {
    if (orbit && targetId === id && orbitLevel === level) {
      setOrbit(false);
      return;
    }
    setOrbitLevel(level);
    engageOrbit(id);
  };
  const orbitLevels = (id: string) => (
    <div className="orbit-levels" role="group" aria-label="Orbit height">
      {(["Low", "Mid", "High"] as const).map((name, index) => (
        <button
          key={name}
          type="button"
          data-tip={`${name} orbit. Click the active height to leave.`}
          aria-pressed={orbit && targetId === id && orbitLevel === index}
          onClick={() => pickOrbit(id, index)}
        >
          {name}
        </button>
      ))}
    </div>
  );
  const flyNext = () => {
    if (!nearBody || !nextStop) return;
    setTargetId(nextStop.id);
    setOrbit(false);
    setBoost(false);
    setAutopilot(true);
    setFocus(true);
    setDismissed(nearBody.id);
  };
  const logTask = (id: string) => {
    setLog((prev) => (prev.some((entry) => entry.id === id) ? prev : [...prev, { id, seconds: 0 }]));
  };
  const buyGood = (good: GoodId) => {
    if (!nearBody) return;
    const cost = priceOf(nearBody.id, good);
    if (credits < cost || holdUnits(hold) >= HOLD_MAX) return;
    setCredits((value) => value - cost);
    setHold((value) => ({ ...value, [good]: value[good] + 1 }));
  };
  const sellGood = (good: GoodId) => {
    if (!nearBody || hold[good] < 1) return;
    setCredits((value) => value + priceOf(nearBody.id, good));
    setHold((value) => ({ ...value, [good]: value[good] - 1 }));
  };
  const deployStation = () => {
    if (nearId || chapterId !== "sun" || credits < STATION_COST || depots.length >= STATION_LIMIT) return;
    const at = shipAt.current;
    setCredits((value) => value - STATION_COST);
    setDepots((value) => [...value, { id: `depot-${Date.now()}`, x: at.x, z: at.z }]);
    logTask("haul");
    if (depots.length + 1 >= 3) logTask("lane");
    setBanner(
      depots.length + 1 >= 3
        ? "Three stations are paying you."
        : "Station deployed. It earns while you fly.",
    );
    setMoreOpen(false);
  };
  const stepTour = () => {
    const next = nextAfter(targetId);
    if (!next || next.id === targetId) return;
    setTargetId(next.id);
    setOrbit(false);
    setBoost(false);
    setAutopilot(true);
    setFocus(true);
    if (nearId) setDismissed(nearId);
    setNavOpen(false);
  };
  const startFirstFlight = () => {
    tourRef.current = [...FIRST_FLIGHT];
    setHint(false);
    setLesson(null);
    setTargetId("earth");
    setOrbit(false);
    setBoost(false);
    setAutopilot(true);
    setFocus(true);
    setPaused(false);
    setCoach("First flight: Earth, then the Moon, then Mars.");
  };
  const shareChart = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("target", targetId);
    const text = `${chapterCharted} of ${chapterGoals.length} charted in Starward.`;
    const full = `${text} ${url.toString()}`;
    const done = () => setBanner("Link copied");
    if (navigator.share) {
      void navigator.share({ title: "Starward", text, url: url.toString() }).catch(() => {
        void navigator.clipboard?.writeText(full).then(done).catch(() => setBanner(full));
      });
      return;
    }
    void navigator.clipboard?.writeText(full).then(done).catch(() => setBanner(full));
  };
  const aboveName = aboveSide < 0 ? "Above L" : aboveSide > 0 ? "Above R" : "Above";
  const cycleView = () => {
    if (view === "above") {
      if (aboveSide < 1) {
        setAboveSide((side) => (side < 0 ? 0 : 1));
        return;
      }
      setAboveSide(-1);
      setView("cockpit");
      return;
    }
    const index = VIEWS.findIndex((item) => item.id === view);
    const next = VIEWS[(index + 1) % VIEWS.length].id;
    if (next === "above") setAboveSide(-1);
    setView(next);
  };

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
              onClick={() => setMapOpen((open) => !open)}
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
                <span className="chart">
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
                      onClick={() => {
                        setMapOpen(false);
                        if (open && item.id !== chapterId) setChapterId(item.id);
                      }}
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
              <button type="button" className="onward" onClick={() => setChapterId(nextChapter.id)}>
                Onward
              </button>
            ) : null}
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
        onClick={() => setAtlasOpen(true)}
      >
        <svg className="plot" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="plot-ring" cx="50" cy="50" r="46" />
          <g ref={plotRef} />
        </svg>
      </button>
      {atlasOpen ? (
        <div className="atlas" data-hud role="presentation" onClick={() => setAtlasOpen(false)}>
          <div
            className="atlas-card"
            role="dialog"
            aria-label="System map"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="brief-close" onClick={() => setAtlasOpen(false)}>
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
        <p className={hint && lesson === null && !coach ? "hint" : "hint is-hidden"}>
          {charted.length === 0 ? (
            <>
              <span>Earth is selected. Press Go.</span>
              <button type="button" className="hint-go" onClick={startFirstFlight}>
                First flight
              </button>
            </>
          ) : (
            <>
              <span className="md:hidden">Drag to look. Go flies you there.</span>
              <span className="hidden md:inline">Drag to look. A click nudges the nose. Go flies to the place you pick.</span>
            </>
          )}
        </p>
        {coach ? <p className="hint">{coach}</p> : null}
        {gazeNote ? <p className="status">{gazeNote}</p> : null}
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
                <button type="button" className="brief-orbit" aria-pressed onClick={() => setOrbit(false)}>
                  Leave
                </button>
              ) : null}
              {nextStop && nextStop.id !== nearBody.id ? (
                <button type="button" className="brief-next" onClick={flyNext}>
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
                      <button type="button" disabled={credits < cost || holdUnits(hold) >= HOLD_MAX} onClick={() => buyGood(good.id)}>
                        Buy
                      </button>
                      <button type="button" disabled={hold[good.id] < 1} onClick={() => sellGood(good.id)}>
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
                <button type="button" data-tip="Burn harder for a while. Leaves an orbit." aria-pressed={boost} onClick={() => { setBoost((value) => !value); setOrbit(false); }}>
                  Boost
                </button>
                <button
                  type="button"
                  data-tip="Deploy in open space, away from a world. It pays you over time."
                  disabled={chapterId !== "sun" || Boolean(nearId) || credits < STATION_COST || depots.length >= STATION_LIMIT}
                  onClick={deployStation}
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
                  onClick={() => setMuted((value) => !value)}
                >
                  {muted ? <VolumeX size={16} strokeWidth={1.75} /> : <Volume2 size={16} strokeWidth={1.75} />}
                </button>
                <button
                  type="button"
                  data-tip="Steer by looking. The camera stays on this device."
                  aria-pressed={gazeOn}
                  onClick={() => setGazeOn((on) => !on)}
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
              {navSections(nav).map((section) => (
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
                            setFocus(true);
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
              data-tip={view === "above" ? (aboveSide < 0 ? "Overhead, from the left" : aboveSide > 0 ? "Overhead, from the right" : "Overhead, from the center") : VIEWS.find((item) => item.id === view)?.tip}
              aria-label={`Camera is ${view === "above" ? aboveName : VIEWS.find((item) => item.id === view)?.label}. Switch camera.`}
              onClick={cycleView}
            >
              {view === "above" ? aboveName : VIEWS.find((item) => item.id === view)?.label}
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
