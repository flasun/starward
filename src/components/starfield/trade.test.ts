import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BODIES } from "./system.ts";
import { GOODS, canDock, emptyHold, holdUnits, priceOf, stationPay } from "./trade.ts";

describe("priceOf", () => {
  it("makes each kind of world cheap in its own good", () => {
    assert.ok(priceOf("mars", "minerals") < priceOf("mars", "water"), "rock worlds sell minerals cheap");
    assert.ok(priceOf("europa", "water") < priceOf("europa", "minerals"), "ice worlds sell water cheap");
    assert.ok(priceOf("earth", "water") < priceOf("earth", "tech"), "Earth sells water below tech");
  });

  it("leaves a profitable run for every good across the dockable worlds", () => {
    const docks = BODIES.filter(canDock);
    for (const good of GOODS) {
      const prices = docks.map((body) => priceOf(body.id, good.id));
      assert.ok(Math.max(...prices) > Math.min(...prices), `${good.name} has one price everywhere`);
    }
  });

  it("prices a world outside every group at the default rate", () => {
    assert.equal(priceOf("nowhere", "tech"), 36);
    assert.equal(priceOf("nowhere", "water"), 16);
  });
});

describe("canDock", () => {
  it("docks at charted worlds but not the Sun, specks, or deep-space places", () => {
    assert.equal(canDock({ id: "earth", goal: true }), true);
    assert.equal(canDock({ id: "sun", goal: true }), false);
    assert.equal(canDock({ id: "voyager", goal: true, speck: true }), false);
    assert.equal(canDock({ id: "proxima", goal: true, form: "star" }), false);
    assert.equal(canDock({ id: "earth", goal: false }), false);
  });
});

describe("hold", () => {
  it("starts empty and counts every good", () => {
    assert.equal(holdUnits(emptyHold()), 0);
    assert.equal(holdUnits({ minerals: 2, water: 3, tech: 1 }), 6);
  });
});

describe("stationPay", () => {
  const now = 1_000_000_000;

  it("pays each station 0.12 credits a second, rounded down", () => {
    assert.deepEqual(stationPay(2, now - 10_000, now), { gain: 2, at: now });
    assert.deepEqual(stationPay(3, now - 60_000, now), { gain: 21, at: now });
  });

  it("pays nothing without stations or when the clock runs backwards", () => {
    assert.equal(stationPay(0, now - 60_000, now).gain, 0);
    assert.equal(stationPay(4, now + 60_000, now).gain, 0);
  });

  it("caps time away at six hours", () => {
    const sixHours = stationPay(1, now - 6 * 3_600_000, now).gain;
    assert.equal(sixHours, 2592);
    assert.equal(stationPay(1, now - 48 * 3_600_000, now).gain, sixHours);
  });
});
