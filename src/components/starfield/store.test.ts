import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SAVE_KEY, freshSave, type SaveStorage } from "./saves.ts";
import { LESSONS } from "./lessons.ts";
import { AWAY_MS, FIRST_FLIGHT, PAD_SPEED_STEP, createGameStore, keepSaved, paramsOf, saveOf, tradeCue } from "./store.ts";
import { navIn } from "./system.ts";
import { HOLD_MAX, STATION_LIMIT, priceOf, stationCost } from "./trade.ts";

const NOW = 1_800_000_000_000;

function memory(): SaveStorage & { writes: string[] } {
  const writes: string[] = [];
  return { writes, getItem: () => null, setItem: (key, value) => void (key === SAVE_KEY && writes.push(value)) };
}

describe("load", () => {
  it("takes in a save and round-trips it", () => {
    const store = createGameStore(NOW);
    const save = { ...freshSave(NOW), charted: ["earth"], helpSeen: true };
    store.getState().load(save, NOW);
    assert.deepEqual(saveOf(store.getState()), save);
  });

  it("pays stations for the time away and says so after a minute", () => {
    const store = createGameStore(NOW);
    const save = freshSave(NOW - 10 * 60_000);
    save.trade.depots = [{ id: "d", chapter: "sun", x: 0, z: 0 }];
    store.getState().load(save, NOW);
    const { credits, paid, toasts } = store.getState();
    assert.ok(credits > save.trade.credits);
    assert.equal(paid, NOW);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0]!.title, /Cr$/);
  });

  it("stays quiet about a short absence", () => {
    const store = createGameStore(NOW);
    const save = freshSave(NOW - AWAY_MS / 2);
    save.trade.depots = [{ id: "d", chapter: "sun", x: 0, z: 0 }];
    store.getState().load(save, NOW);
    assert.equal(store.getState().toasts.length, 0);
  });
});

describe("keepSaved", () => {
  it("writes when saved state changes, and not for anything else", () => {
    const store = createGameStore(NOW);
    const storage = memory();
    const stop = keepSaved(store, storage);
    store.setState({ nearId: "earth", alert: "Paused", navOpen: true });
    assert.equal(storage.writes.length, 0);
    store.getState().setSpeed(0.9);
    assert.equal(storage.writes.length, 1);
    assert.equal(JSON.parse(storage.writes[0]!).settings.speed, 0.9);
    stop();
    store.getState().setSpeed(0.1);
    assert.equal(storage.writes.length, 1);
  });
});

describe("flight", () => {
  it("hands the engine the flight params", () => {
    const store = createGameStore(NOW);
    store.getState().flyTo("mars");
    const params = paramsOf(store.getState());
    assert.equal(params.targetId, "mars");
    assert.equal(params.autopilot, true);
    assert.equal(params.focus, true);
    assert.equal(params.orbit, false);
  });

  it("leaves boost and autopilot when an orbit starts", () => {
    const store = createGameStore(NOW);
    store.setState({ boost: true, autopilot: true, focus: true });
    store.getState().toggleOrbit();
    assert.deepEqual(pick(store.getState()), { orbit: true, boost: false, autopilot: false, focus: false });
    store.getState().toggleOrbit();
    assert.equal(store.getState().orbit, false);
  });

  it("toggles an orbit height, and the active height again leaves", () => {
    const store = createGameStore(NOW);
    store.getState().pickOrbit("moon", 2);
    assert.deepEqual([store.getState().targetId, store.getState().orbitLevel, store.getState().orbit], ["moon", 2, true]);
    store.getState().pickOrbit("moon", 2);
    assert.equal(store.getState().orbit, false);
  });

  it("flies in to take a height from wherever the ship is, and leaving stops the approach too", () => {
    const store = createGameStore(NOW);
    store.setState({ boost: true, focus: true });
    store.getState().pickOrbit("earth", 0);
    assert.deepEqual(pick(store.getState()), { orbit: true, boost: false, autopilot: true, focus: false });
    store.getState().pickOrbit("earth", 0);
    assert.deepEqual(pick(store.getState()), { orbit: false, boost: false, autopilot: false, focus: false });
  });

  it("flies to a double-tapped world and orbits it, and lets go on a second tap", () => {
    const store = createGameStore(NOW);
    store.getState().focusOn("jupiter");
    assert.deepEqual(pick(store.getState()), { orbit: true, boost: false, autopilot: true, focus: true });
    store.getState().focusOn("jupiter");
    assert.deepEqual(pick(store.getState()), { orbit: false, boost: false, autopilot: false, focus: false });
  });

  it("drops an orbit when boost or Go is pressed", () => {
    const store = createGameStore(NOW);
    store.getState().orbitAt("earth");
    store.getState().toggleBoost();
    assert.deepEqual([store.getState().boost, store.getState().orbit], [true, false]);
    store.getState().orbitAt("earth");
    store.getState().toggleAutopilot();
    assert.deepEqual([store.getState().autopilot, store.getState().orbit], [true, false]);
  });

  it("steps the camera through every view, and Above through three perches", () => {
    const store = createGameStore(NOW);
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      store.getState().cycleView();
      const { view, aboveSide } = store.getState();
      seen.push(view === "above" ? `above${aboveSide}` : view);
    }
    assert.deepEqual(seen, ["chase", "left", "right", "above-1", "above0", "above1", "cockpit", "chase"]);
  });

  it("moves to the next place in the nav and puts away the brief", () => {
    const store = createGameStore(NOW);
    const nav = navIn("sun");
    store.setState({ nearId: nav[0]!.id, navOpen: true });
    store.getState().flyNext();
    assert.equal(store.getState().targetId, nav[1]!.id);
    assert.equal(store.getState().dismissed, nav[0]!.id);
    store.getState().stepTour();
    assert.equal(store.getState().targetId, nav[2]!.id);
    assert.equal(store.getState().navOpen, false);
  });
});

describe("progress", () => {
  it("charts a place once", () => {
    const store = createGameStore(NOW);
    assert.equal(store.getState().chart("earth"), true);
    assert.equal(store.getState().chart("earth"), false);
    assert.deepEqual(store.getState().charted, ["earth"]);
  });

  it("walks the First flight stop by stop, then hands back the controls", () => {
    const store = createGameStore(NOW);
    store.getState().startFirstFlight();
    assert.equal(store.getState().targetId, FIRST_FLIGHT[0]);
    store.getState().chart(FIRST_FLIGHT[0]!);
    assert.equal(store.getState().targetId, FIRST_FLIGHT[1]);
    assert.equal(store.getState().autopilot, true);
    store.getState().chart(FIRST_FLIGHT[1]!);
    store.getState().chart(FIRST_FLIGHT[2]!);
    assert.equal(store.getState().tour, null);
    assert.equal(store.getState().autopilot, false);
    assert.match(store.getState().coach, /done/);
  });

  it("logs a task once, and only a real one", () => {
    const store = createGameStore(NOW);
    assert.equal(store.getState().logTask("soft", 12), true);
    assert.equal(store.getState().logTask("soft", 30), false);
    assert.equal(store.getState().logTask("made-up", 1), false);
    assert.deepEqual(store.getState().log, [{ id: "soft", seconds: 12 }]);
  });
});

describe("trade", () => {
  it("buys while there is money and room, and sells what is held", () => {
    const store = createGameStore(NOW);
    const cost = priceOf("mars", "water");
    store.setState({ nearId: "mars", credits: cost * 2 });
    store.getState().buy("water");
    store.getState().buy("water");
    store.getState().buy("water");
    assert.equal(store.getState().hold.water, 2);
    assert.equal(store.getState().credits, 0);
    store.getState().sell("water");
    assert.equal(store.getState().hold.water, 1);
    assert.equal(store.getState().credits, cost);
    store.setState({ credits: 1e6, hold: { minerals: HOLD_MAX, water: 0, tech: 0 } });
    store.getState().buy("tech");
    assert.equal(store.getState().hold.tech, 0);
  });

  it("does not trade away from a world", () => {
    const store = createGameStore(NOW);
    store.getState().buy("water");
    assert.equal(store.getState().hold.water, 0);
  });

  it("deploys stations in open space, logs the haul and the lane, and stops at the limit", () => {
    const store = createGameStore(NOW);
    const cost = stationCost("sun");
    store.setState({ credits: cost * (STATION_LIMIT + 1), moreOpen: true });
    for (let i = 0; i < STATION_LIMIT + 1; i++) store.getState().deployStation({ x: i, z: 0 }, NOW + i);
    const { depots, log, moreOpen, credits } = store.getState();
    assert.equal(depots.length, STATION_LIMIT);
    assert.equal(credits, cost);
    assert.deepEqual(log.map((entry) => entry.id), ["haul", "lane"]);
    assert.equal(moreOpen, false);
  });

  it("will not deploy near a world", () => {
    const store = createGameStore(NOW);
    store.setState({ credits: stationCost("sun") * 3, nearId: "earth" });
    store.getState().deployStation({ x: 0, z: 0 }, NOW);
    assert.equal(store.getState().depots.length, 0);
  });

  it("deploys beyond the Sun at that chapter's price, and keeps each chapter's stations on its own map", () => {
    const store = createGameStore(NOW);
    store.setState({ credits: stationCost("sun") + stationCost("web"), chapterId: "web" });
    store.getState().deployStation({ x: 5, z: 5 }, NOW);
    assert.equal(store.getState().credits, stationCost("sun"));
    store.setState({ chapterId: "sun" });
    store.getState().deployStation({ x: 1, z: 1 }, NOW + 1);
    assert.deepEqual(store.getState().depots.map((depot) => depot.chapter), ["web", "sun"]);
    assert.deepEqual(paramsOf(store.getState()).depots.map((depot) => depot.x), [1]);
    store.setState({ chapterId: "web" });
    assert.deepEqual(paramsOf(store.getState()).depots.map((depot) => depot.x), [5]);
  });

  it("limits stations per chapter, not in total", () => {
    const store = createGameStore(NOW);
    const full = Array.from({ length: STATION_LIMIT }, (_, i) => ({ id: `s${i}`, chapter: "sun", x: i, z: 0 }));
    store.setState({ depots: full, credits: 1e6, chapterId: "stars" });
    store.getState().deployStation({ x: 0, z: 0 }, NOW);
    assert.equal(store.getState().depots.length, STATION_LIMIT + 1);
    store.setState({ chapterId: "sun" });
    store.getState().deployStation({ x: 0, z: 0 }, NOW);
    assert.equal(store.getState().depots.length, STATION_LIMIT + 1);
  });

  it("adds up short payouts instead of rounding each one away", () => {
    const store = createGameStore(NOW);
    store.setState({ depots: [{ id: "d", chapter: "sun", x: 0, z: 0 }], paid: NOW, credits: 0 });
    for (let tick = 1; tick <= 12; tick++) store.getState().payStations(NOW + tick * 5000);
    // 60 seconds at 0.12 a second is 7.2 credits.
    assert.equal(store.getState().credits, 7);
  });

  it("pays stations as time passes", () => {
    const store = createGameStore(NOW);
    store.setState({ depots: [{ id: "d", chapter: "sun", x: 0, z: 0 }], paid: NOW, credits: 0 });
    store.getState().payStations(NOW + 100_000);
    assert.ok(store.getState().credits > 0);
    assert.equal(store.getState().paid, NOW + 100_000);
  });
});

describe("panels", () => {
  it("closes the top panel on Escape, and pauses when none is open", () => {
    const store = createGameStore(NOW);
    store.setState({ lesson: 2, logOpen: true, moreOpen: true, navOpen: true });
    const steps: string[] = [];
    for (let i = 0; i < 6; i++) {
      store.getState().back();
      const { lesson, logOpen, moreOpen, navOpen, paused } = store.getState();
      steps.push(`${lesson}${+logOpen}${+moreOpen}${+navOpen}${+paused}`);
    }
    assert.deepEqual(steps, ["null1110", "null0110", "null0010", "null0000", "null0001", "null0000"]);
    assert.equal(store.getState().helpSeen, true);
  });

  it("keeps nav and More apart, and Help and Log apart", () => {
    const store = createGameStore(NOW);
    store.getState().toggleNav();
    store.getState().toggleMore();
    assert.deepEqual([store.getState().navOpen, store.getState().moreOpen], [false, true]);
    store.getState().openHelp();
    store.getState().toggleLog();
    assert.deepEqual([store.getState().lesson, store.getState().logOpen], [null, true]);
  });

  it("queues notes and drops them in order", () => {
    const store = createGameStore(NOW);
    store.getState().notify("One");
    store.getState().notify("Two", "detail", true);
    assert.deepEqual(store.getState().toasts.map((toast) => toast.title), ["One", "Two"]);
    store.getState().dropToast();
    assert.deepEqual(store.getState().toasts.map((toast) => [toast.title, toast.reward]), [["Two", true]]);
  });
});

describe("gaze", () => {
  it("picks the place in the sights without holding the view, so the eyes keep steering", () => {
    const store = createGameStore(NOW);
    store.setState({ focus: true, navOpen: true });
    store.getState().sight("mars");
    assert.equal(store.getState().targetId, "mars");
    assert.deepEqual(pick(store.getState()), { orbit: false, boost: false, autopilot: false, focus: false });
    assert.equal(store.getState().navOpen, false);
  });
});

describe("gamepad", () => {
  it("A takes the First flight, then is Go and Stop", () => {
    const store = createGameStore(NOW);
    store.getState().press("go");
    assert.equal(store.getState().tour?.[0], FIRST_FLIGHT[0]);
    assert.equal(store.getState().autopilot, true);
    store.getState().press("go");
    assert.equal(store.getState().autopilot, false);
    store.getState().press("go");
    assert.equal(store.getState().autopilot, true);
  });

  it("A pages through help and flies off the last card; B skips it", () => {
    const store = createGameStore(NOW);
    store.getState().openHelp();
    for (let i = 1; i < LESSONS.length; i++) {
      store.getState().press("go");
      assert.equal(store.getState().lesson, i);
    }
    store.getState().press("go");
    assert.deepEqual([store.getState().lesson, store.getState().helpSeen, store.getState().autopilot], [null, true, false]);
    store.getState().openHelp();
    store.getState().press("back");
    assert.equal(store.getState().lesson, null);
  });

  it("B closes panels and resumes, but never pauses; Start is Escape", () => {
    const store = createGameStore(NOW);
    store.setState({ offerOpen: false, logOpen: true, navOpen: true });
    store.getState().press("back");
    store.getState().press("back");
    store.getState().press("back");
    assert.deepEqual([store.getState().logOpen, store.getState().navOpen, store.getState().paused], [false, false, false]);
    store.getState().press("pause");
    assert.equal(store.getState().paused, true);
    store.getState().press("back");
    assert.equal(store.getState().paused, false);
    store.getState().press("pause");
    store.getState().press("go");
    assert.deepEqual([store.getState().paused, store.getState().autopilot], [false, false]);
  });

  it("B waves off the First flight offer", () => {
    const store = createGameStore(NOW);
    store.getState().press("back");
    assert.deepEqual([store.getState().offerOpen, store.getState().paused], [false, false]);
  });

  it("the bumpers step through the nav both ways without flying", () => {
    const store = createGameStore(NOW);
    const nav = navIn("sun");
    const at = nav.findIndex((body) => body.id === store.getState().targetId);
    store.getState().press("next");
    assert.equal(store.getState().targetId, nav[(at + 1) % nav.length]!.id);
    assert.deepEqual(pick(store.getState()), { orbit: false, boost: false, autopilot: false, focus: true });
    store.getState().press("prev");
    store.getState().press("prev");
    assert.equal(store.getState().targetId, nav[(at - 1 + nav.length) % nav.length]!.id);
  });

  it("steps the cruise, the camera, warp, orbit, and the log", () => {
    const store = createGameStore(NOW);
    store.setState({ speed: 0.5 });
    store.getState().press("faster");
    assert.equal(store.getState().speed, 0.5 + PAD_SPEED_STEP);
    store.getState().press("slower");
    store.getState().press("slower");
    assert.equal(store.getState().speed, 0.5 - PAD_SPEED_STEP);
    store.setState({ speed: 1 });
    store.getState().press("faster");
    assert.equal(store.getState().speed, 1);
    store.getState().press("view");
    assert.equal(store.getState().view, "chase");
    store.getState().press("boost");
    assert.equal(store.getState().boost, true);
    store.getState().press("orbit");
    assert.deepEqual([store.getState().orbit, store.getState().boost], [true, false]);
    store.getState().press("log");
    assert.equal(store.getState().logOpen, true);
  });
});

function pick(state: { orbit: boolean; boost: boolean; autopilot: boolean; focus: boolean }) {
  return { orbit: state.orbit, boost: state.boost, autopilot: state.autopilot, focus: state.focus };
}

describe("tradeCue", () => {
  it("hears a buy, a sale, and a deploy, and nothing for station pay", () => {
    const store = createGameStore(NOW);
    const states = [store.getState()];
    const step = (change: () => void) => {
      change();
      states.push(store.getState());
      return tradeCue(states.at(-2)!, states.at(-1)!);
    };
    store.setState({ nearId: "mars", credits: 1000 });
    states.push(store.getState());
    assert.equal(step(() => store.getState().buy("water")), "buy");
    assert.equal(step(() => store.getState().sell("water")), "sell");
    store.setState({ nearId: "" });
    states.push(store.getState());
    assert.equal(step(() => store.getState().deployStation({ x: 1, z: 1 }, NOW)), "station");
    assert.equal(step(() => store.getState().payStations(NOW + 60_000)), null);
  });
});
