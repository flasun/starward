import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEAD_ZONE, PAD_BUTTONS, type PadLike, PadReader, deadZone } from "./gamepad.ts";

/** A standard pad with `held` buttons down and the left stick at (x, y). */
function pad(held: Record<number, number> = {}, x = 0, y = 0, index = 0, mapping = "standard"): PadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: (held[i] ?? 0) > 0.5, value: held[i] ?? 0 }));
  return { index, mapping, axes: [x, y, 0, 0], buttons };
}

describe("deadZone", () => {
  it("rests at zero inside the zone and reaches one at the edge", () => {
    assert.deepEqual(deadZone(DEAD_ZONE * 0.9, 0), { x: 0, y: 0 });
    assert.deepEqual(deadZone(0.08, -0.08), { x: 0, y: 0 });
    const full = deadZone(-1, 0);
    assert.equal(full.x, -1);
    assert.equal(Math.abs(full.y), 0);
  });

  it("keeps the direction and grows smoothly from the zone's edge", () => {
    const d = deadZone(0.4, 0.3);
    assert.ok(Math.abs(Math.atan2(d.y, d.x) - Math.atan2(0.3, 0.4)) < 1e-9);
    const small = Math.hypot(...Object.values(deadZone(DEAD_ZONE + 0.01, 0)));
    assert.ok(small > 0 && small < 0.01);
    assert.ok(Math.hypot(d.x, d.y) < 0.5);
  });

  it("ignores a stick that reports nothing", () => {
    assert.deepEqual(deadZone(Number.NaN, 0), { x: 0, y: 0 });
  });
});

describe("PadReader", () => {
  it("swallows the press that wakes a pad", () => {
    const reader = new PadReader();
    const read = reader.read([pad({ 0: 1 })], 0);
    assert.deepEqual(read.presses, []);
    assert.equal(read.active, true);
    assert.deepEqual(reader.read([pad({ 0: 1 })], 16).presses, []);
    reader.read([pad()], 32);
    assert.deepEqual(reader.read([pad({ 0: 1 })], 48).presses, ["go"]);
  });

  it("fires once per press, on the way down", () => {
    const reader = new PadReader();
    reader.read([pad()], 0);
    assert.deepEqual(reader.read([pad({ 3: 1 })], 16).presses, ["view"]);
    assert.deepEqual(reader.read([pad({ 3: 1 })], 32).presses, []);
    assert.deepEqual(reader.read([pad()], 48).presses, []);
    assert.deepEqual(reader.read([pad({ 3: 1, 1: 1 })], 64).presses, ["back", "view"]);
  });

  it("maps the standard layout", () => {
    const reader = new PadReader();
    reader.read([pad()], 0);
    const all: Record<number, number> = {};
    for (const i of Object.keys(PAD_BUTTONS)) all[Number(i)] = 1;
    const presses = reader.read([pad(all)], 16).presses;
    assert.deepEqual(presses, ["go", "back", "orbit", "view", "prev", "next", "level", "boost", "log", "pause", "faster", "slower", "prev", "next"]);
  });

  it("takes a trigger past halfway, and lets go below a third", () => {
    const reader = new PadReader();
    reader.read([pad()], 0);
    assert.deepEqual(reader.read([pad({ 7: 0.4 })], 16).presses, []);
    assert.deepEqual(reader.read([pad({ 7: 0.6 })], 32).presses, ["boost"]);
    assert.deepEqual(reader.read([pad({ 7: 0.35 })], 48).presses, []);
    assert.deepEqual(reader.read([pad({ 7: 0.6 })], 64).presses, []);
    reader.read([pad({ 7: 0.2 })], 80);
    assert.deepEqual(reader.read([pad({ 7: 0.6 })], 96).presses, ["boost"]);
  });

  it("repeats a held speed step, and nothing else", () => {
    const reader = new PadReader();
    reader.read([pad()], 0);
    const presses: string[] = [];
    for (let t = 16; t <= 1000; t += 16) presses.push(...reader.read([pad({ 12: 1, 0: 1 })], t).presses);
    const faster = presses.filter((p) => p === "faster").length;
    assert.ok(faster >= 6 && faster <= 8, `${faster} steps`);
    assert.equal(presses.filter((p) => p === "go").length, 1);
  });

  it("steers with the stick pushed furthest, across pads", () => {
    const reader = new PadReader();
    const read = reader.read([pad({}, 0.3, 0, 0), null, pad({}, 0, -1, 2)], 0);
    assert.deepEqual([read.x, read.y], [0, -1]);
    assert.equal(read.active, true);
    const rest = reader.read([pad({}, 0.05, 0.05, 0)], 16);
    assert.deepEqual([rest.x, rest.y, rest.active], [0, 0, false]);
  });

  it("forgets a pad that goes away, so its return wakes it again", () => {
    const reader = new PadReader();
    reader.read([pad({}, 0, 0, 1)], 0);
    reader.read([], 16);
    assert.deepEqual(reader.read([pad({ 0: 1 }, 0, 0, 1)], 32).presses, []);
  });

  it("uses only the face buttons on a pad the browser does not map", () => {
    const reader = new PadReader();
    reader.read([pad({}, 0, 0, 0, "")], 0);
    const presses = reader.read([pad({ 0: 1, 7: 1, 9: 1, 12: 1 }, 0, 0, 0, "")], 16).presses;
    assert.deepEqual(presses, ["go"]);
  });
});
