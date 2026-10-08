import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BODIES, CHAPTERS, goalsIn } from "./system.ts";
import { GOODS, canDock, chapterScale, emptyHold, holdUnits, payRate, priceOf, stationCost, stationPay } from "./trade.ts";

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

  it("leaves a profitable run inside every chapter beyond the Sun", () => {
    for (const chapter of CHAPTERS.slice(1)) {
      const docks = goalsIn(chapter.id).filter(canDock);
      const spreads = GOODS.map((good) => {
        const prices = docks.map((body) => priceOf(body.id, good.id));
        return Math.max(...prices) / Math.min(...prices);
      });
      assert.ok(spreads.filter((spread) => spread >= 2).length >= 2, `${chapter.id}: ${spreads.join(", ")}`);
    }
  });

  it("raises prices chapter by chapter", () => {
    assert.equal(priceOf("barnard", "minerals"), 8 * chapterScale("stars"));
    assert.equal(priceOf("andromeda", "tech"), Math.round(9 * chapterScale("local")));
    assert.ok(priceOf("virgo", "water") > priceOf("pleiades", "water"));
  });

  it("prices a world outside every group at the default rate", () => {
    assert.equal(priceOf("nowhere", "tech"), 36);
    assert.equal(priceOf("nowhere", "water"), 16);
  });
});

describe("canDock", () => {
  it("docks at every place you can chart, but not the Sun or specks", () => {
    assert.equal(canDock({ id: "earth", goal: true }), true);
    assert.equal(canDock({ id: "proxima", goal: true }), true);
    assert.equal(canDock({ id: "sun", goal: true }), false);
    assert.equal(canDock({ id: "voyager", goal: true, speck: true }), false);
    assert.equal(canDock({ id: "sol", goal: false }), false);
  });
});

describe("hold", () => {
  it("starts empty and counts every good", () => {
    assert.equal(holdUnits(emptyHold()), 0);
    assert.equal(holdUnits({ minerals: 2, water: 3, tech: 1 }), 6);
  });
});

describe("stations", () => {
  const now = 1_000_000_000;
  const sun = (count: number) => payRate(Array.from({ length: count }, (_, i) => ({ id: `${i}`, chapter: "sun", x: 0, z: 0 })));

  it("costs more and pays more in later chapters", () => {
    assert.equal(stationCost("sun"), 480);
    assert.equal(stationCost("web"), 480 * 6);
    assert.equal(payRate([{ id: "a", chapter: "galaxy", x: 0, z: 0 }]), sun(3));
  });

  it("pays each Sun station 0.12 credits a second, in whole credits", () => {
    assert.equal(stationPay(sun(2), now - 10_000, now).gain, 2);
    assert.equal(stationPay(sun(3), now - 60_000, now).gain, 21);
  });

  it("keeps the part of a credit not yet paid", () => {
    const first = stationPay(sun(1), now - 5000, now);
    assert.deepEqual(first, { gain: 0, at: now - 5000 });
    const second = stationPay(sun(1), first.at, now + 5000);
    assert.equal(second.gain, 1);
    assert.ok(second.at > now - 5000 && second.at < now + 5000);
  });

  it("pays nothing without stations or when the clock runs backwards", () => {
    assert.deepEqual(stationPay(0, now - 60_000, now), { gain: 0, at: now });
    assert.equal(stationPay(sun(4), now + 60_000, now).gain, 0);
  });

  it("caps time away at six hours", () => {
    const sixHours = stationPay(sun(1), now - 6 * 3_600_000, now).gain;
    assert.equal(sixHours, 2592);
    assert.equal(stationPay(sun(1), now - 48 * 3_600_000, now).gain, sixHours);
  });
});
