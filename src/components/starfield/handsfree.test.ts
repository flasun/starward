import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BLINK_MAX_MS, BLINK_MIN_MS, DWELL_MS, Dwell, LongBlink, sighted } from "./handsfree.ts";
import { FlightInput, type InputIntents } from "./input.ts";

const any = () => true;

describe("sighted", () => {
  it("finds the world under the center of the screen", () => {
    const picks = [
      { id: "mars", x: 0.2, y: 0.5, rad: 0.01 },
      { id: "earth", x: 0.51, y: 0.49, rad: 0.01 },
    ];
    assert.equal(sighted(picks, 16 / 9, any), "earth");
  });

  it("reaches a little round a small world, and covers a big one edge to edge", () => {
    assert.equal(sighted([{ id: "moon", x: 0.5, y: 0.53, rad: 0.004 }], 1, any), "moon");
    assert.equal(sighted([{ id: "moon", x: 0.5, y: 0.6, rad: 0.004 }], 1, any), "");
    assert.equal(sighted([{ id: "jupiter", x: 0.5, y: 0.8, rad: 0.35 }], 1, any), "jupiter");
  });

  it("measures across in screen heights, so a wide screen does not stretch the sights", () => {
    const pick = { id: "venus", x: 0.53, y: 0.5, rad: 0.01 };
    assert.equal(sighted([pick], 1, any), "venus");
    assert.equal(sighted([pick], 2.2, any), "");
  });

  it("prefers the nearer of two overlapping worlds, and skips what may not be picked", () => {
    const picks = [
      { id: "earth", x: 0.5, y: 0.52, rad: 0.05 },
      { id: "moon", x: 0.5, y: 0.5, rad: 0.01 },
    ];
    assert.equal(sighted(picks, 1, any), "moon");
    assert.equal(sighted(picks, 1, (id) => id !== "moon"), "earth");
  });
});

describe("Dwell", () => {
  it("fills while a world is held, picks it once, and starts over for the next", () => {
    const dwell = new Dwell();
    assert.deepEqual(dwell.update("mars", 0), { progress: 0, picked: "" });
    assert.equal(dwell.update("mars", DWELL_MS / 2).progress, 0.5);
    assert.deepEqual(dwell.update("mars", DWELL_MS), { progress: 0, picked: "mars" });
    assert.deepEqual(dwell.update("mars", DWELL_MS * 3), { progress: 0, picked: "" });
    dwell.update("venus", DWELL_MS * 3);
    assert.equal(dwell.update("venus", DWELL_MS * 4).picked, "venus");
  });

  it("starts over when the sights slip off", () => {
    const dwell = new Dwell();
    dwell.update("mars", 0);
    dwell.update("", DWELL_MS * 0.9);
    dwell.update("mars", DWELL_MS);
    assert.equal(dwell.update("mars", DWELL_MS * 1.5).picked, "");
    assert.equal(dwell.update("mars", DWELL_MS * 2).picked, "mars");
  });
});

/** Feeds eyes open, then closed for `ms`, then open again, at 30 frames a second. */
function blinkFor(blink: LongBlink, ms: number, open = 0.05, closed = 0.85): boolean {
  let fired = false;
  let t = 0;
  for (; t < 1000; t += 33) fired = blink.update(open, t) || fired;
  const shutAt = t;
  for (; t < shutAt + ms; t += 33) fired = blink.update(closed, t) || fired;
  for (const end = t + 300; t < end; t += 33) fired = blink.update(open, t) || fired;
  return fired;
}

describe("LongBlink", () => {
  it("lands a deliberate blink when the eyes open", () => {
    assert.equal(blinkFor(new LongBlink(), BLINK_MIN_MS + 200), true);
  });

  it("ignores a natural blink, and resting the eyes", () => {
    assert.equal(blinkFor(new LongBlink(), 250), false);
    assert.equal(blinkFor(new LongBlink(), BLINK_MAX_MS + 500), false);
  });

  it("does not fire until the eyes open", () => {
    const blink = new LongBlink();
    for (let t = 0; t < 1000; t += 33) blink.update(0.05, t);
    for (let t = 1000; t < 3000; t += 33) assert.equal(blink.update(0.9, t), false);
  });

  it("follows heavy lids, so looking down is not a blink", () => {
    const blink = new LongBlink();
    for (let t = 0; t < 4000; t += 33) assert.equal(blink.update(0.45, t), false);
    assert.equal(blinkFor(blink, BLINK_MIN_MS + 200, 0.45, 0.95), true);
  });

  it("drops a blink when the face leaves the camera", () => {
    const blink = new LongBlink();
    for (let t = 0; t < 1000; t += 33) blink.update(0.05, t);
    for (let t = 1000; t < 1800; t += 33) blink.update(0.9, t);
    blink.update(null, 1800);
    assert.equal(blink.update(0.05, 1833), false);
  });
});

describe("gaze takeover", () => {
  const intents: InputIntents = {
    unlockAudio() {},
    resumeAudio() {},
    toggleBoost() {},
    toggleOrbit() {},
    wheel() {},
    doubleTap() {},
    pad() {},
    gamepad() {},
  };
  const input = () => new FlightInput({} as HTMLCanvasElement, intents);
  let clock = 0;
  /** Gaze samples at 30 a second for `seconds`. */
  const hold = (flight: FlightInput, x: number, seconds: number) => {
    for (const end = clock + seconds * 1000; clock < end; clock += 33) flight.setGaze(x, 0, true, clock);
  };

  it("leaves a glance alone", () => {
    const flight = input();
    hold(flight, 0.9, 0.5);
    assert.equal(flight.manual(), false);
    hold(flight, 0.3, 3);
    assert.equal(flight.manual(), false);
  });

  it("takes the controls after a moment looking well aside, and lets go near the center", () => {
    const flight = input();
    hold(flight, -0.8, 1);
    assert.equal(flight.manual(), true);
    hold(flight, -0.5, 0.5);
    assert.equal(flight.manual(), true);
    hold(flight, 0.2, 0.1);
    assert.equal(flight.manual(), false);
  });

  it("lets go when gaze turns off", () => {
    const flight = input();
    hold(flight, 0.9, 1);
    flight.setGaze(0, 0, false, clock);
    assert.equal(flight.manual(), false);
  });
});
