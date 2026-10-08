import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRange, plotSystem } from "./hud.ts";
import { EARTH_ORBIT } from "./system.ts";

describe("formatRange", () => {
  const km = (value: number) => (value / 149_597_870) * EARTH_ORBIT;

  it("counts kilometres up close and AU across the solar system", () => {
    assert.equal(formatRange(km(400), "sun"), "400 km");
    assert.equal(formatRange(km(384_400), "sun"), "384k km");
    assert.equal(formatRange(EARTH_ORBIT * 1.52, "sun"), "1.52 AU");
    assert.equal(formatRange(EARTH_ORBIT * 30.1, "sun"), "30.1 AU");
  });

  it("counts hops beyond the Sun and says Here on arrival", () => {
    assert.equal(formatRange(20, "stars"), "Here");
    assert.equal(formatRange(1040, "stars"), "2.00× hop");
    assert.equal(formatRange(520 * 12, "galaxy"), "12.0× hop");
  });
});

describe("plotSystem", () => {
  const contacts = [
    { id: "sun", name: "Sun", wx: 0, wz: 0, orbit: 0, target: false, close: false },
    { id: "earth", name: "Earth", wx: 660, wz: 0, orbit: 660, target: true, close: false },
    { id: "mars", name: "Mars", wx: 0, wz: 860, orbit: 860, target: false, close: true },
  ];

  it("draws a ring per orbit, a blip per place, the stations, and the ship last", () => {
    const marks = plotSystem(contacts, 100, 200, 0.5, [{ x: 400, z: 400 }]);
    assert.equal(marks.filter((mark) => mark.ring).length, 2);
    assert.deepEqual(
      marks.filter((mark) => !mark.ring).map((mark) => mark.id),
      ["sun", "earth", "mars", "depot-0", "ship"],
    );
    const ship = marks.at(-1)!;
    assert.equal(ship.heading, 0.5);
  });

  it("keeps everything inside the plot", () => {
    for (const mark of plotSystem(contacts, 5000, -5000, 0, [])) {
      assert.ok(Math.hypot(mark.x, mark.y) <= 44.0001, mark.id);
    }
  });

  it("marks the target larger than other places", () => {
    const marks = plotSystem(contacts, 0, 0, 0, []);
    const r = (id: string) => marks.find((mark) => mark.id === id)!.r;
    assert.ok(r("earth") > r("mars"));
  });
});
