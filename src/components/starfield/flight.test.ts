import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { captureBand, captureWell, holdRadius, orbitLevelRadius, orbitPace, orbitTangent, skinRadius } from "./flight.ts";
import { clamp } from "./math.ts";
import { BODIES } from "./system.ts";

describe("orbit heights", () => {
  it("stacks low, mid, and high outside the surface of every body", () => {
    for (const body of BODIES) {
      const [low, mid, high] = [0, 1, 2].map((level) => orbitLevelRadius(body, level));
      assert.ok(skinRadius(body) < low!, `${body.id}: low orbit inside the surface`);
      assert.ok(low! < mid! && mid! < high!, `${body.id}: heights out of order`);
    }
  });

  it("holds well clear of the surface", () => {
    for (const body of BODIES) assert.ok(holdRadius(body) > skinRadius(body), body.id);
  });
});

describe("captureBand", () => {
  it("names the band from the inside out", () => {
    const well = captureWell(BODIES.find((body) => body.id === "earth")!);
    assert.equal(captureBand(well.low1 - 1, well), "low");
    assert.equal(captureBand(well.mid1 - 1, well), "mid");
    assert.equal(captureBand(well.high1, well), "high");
    assert.equal(captureBand(well.high1 + 1, well), "edge");
  });
});

describe("orbitTangent", () => {
  const dot = (a: { x: number; y: number; z: number }, b: number[]) => a.x * b[0]! + a.y * b[1]! + a.z * b[2]!;

  it("is a unit vector at right angles to the radius", () => {
    for (const r of [[30, 0, 40], [-12, 5, 3], [0, 2, -9]]) {
      const t = orbitTangent(r[0]!, r[1]!, r[2]!);
      assert.ok(Math.abs(Math.hypot(t.x, t.y, t.z) - 1) < 1e-9);
      assert.ok(Math.abs(dot(t, r)) < 1e-9);
    }
  });

  it("still gives a direction straight above the body", () => {
    const t = orbitTangent(0.1, 50, 0.1);
    assert.ok(Math.abs(Math.hypot(t.x, t.y, t.z) - 1) < 1e-9);
  });
});

describe("orbitPace", () => {
  const lap = (want: number, reduced = false) => (Math.PI * 2 * want) / orbitPace(want, want, reduced).along;
  const before = (want: number, dist: number, reduced: boolean) => ({
    along: clamp(want * (reduced ? 0.16 : 0.28), reduced ? 6 : 8, reduced ? 12 : 16),
    toward: clamp((dist - want) * 0.9, -14, reduced ? 16 : 26),
  });

  it("keeps the old pace for every orbit up to Saturn's mid orbit", () => {
    for (const reduced of [false, true]) {
      for (let want = 2; want <= 110; want += 4) {
        for (const dist of [want * 0.5, want, want * 1.5, want + 200]) {
          assert.deepEqual(orbitPace(want, dist, reduced), before(want, dist, reduced), `${want} ${dist} ${reduced}`);
        }
      }
    }
  });

  it("takes no longer to lap a galaxy than Saturn", () => {
    const saturn = lap(110);
    for (const want of [200, 473, 876, 1927]) assert.ok(Math.abs(lap(want) - saturn) < 1e-9, `${want}`);
    assert.ok(saturn < 45);
    assert.ok(Math.abs(lap(876, true) - lap(110, true)) < 1e-9);
  });

  it("closes on a big orbit's height in proportion to its size", () => {
    assert.equal(orbitPace(880, 2000, false).toward, 26 * 8);
    assert.equal(orbitPace(880, 0, false).toward, -14 * 8);
  });
});
