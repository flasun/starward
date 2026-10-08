import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JOURNEY } from "./journey.ts";
import {
  BODIES,
  CHAPTERS,
  bodiesIn,
  bodyById,
  chapterDone,
  chapterOpen,
  goalsIn,
  orbitRadius,
  surveyRadius,
  visualRadius,
} from "./system.ts";

const ALL = [...BODIES, ...JOURNEY];

describe("place data", () => {
  it("gives every place a unique id", () => {
    const ids = ALL.map((body) => body.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("only orbits parents that exist", () => {
    for (const body of ALL) {
      if (body.parent) assert.ok(ALL.some((other) => other.id === body.parent), `${body.id} orbits ${body.parent}`);
    }
  });

  it("starts every chapter on one of its own places, with places left to chart", () => {
    for (const chapter of CHAPTERS) {
      assert.ok(
        bodiesIn(chapter.id).some((body) => body.id === chapter.first),
        `${chapter.id} starts on ${chapter.first}`,
      );
      assert.ok(goalsIn(chapter.id).length > 0, `${chapter.id} has nothing to chart`);
    }
  });

  it("lets every place be charted before the ship reaches its surface", () => {
    for (const body of ALL) {
      assert.ok(surveyRadius(body) > visualRadius(body), `${body.id} charts only on contact`);
    }
  });

  it("falls back to Earth for an unknown id", () => {
    assert.equal(bodyById("nowhere").id, "earth");
  });
});

describe("orbitRadius", () => {
  it("puts the Sun at the centre and keeps the planets in order", () => {
    assert.equal(orbitRadius(0), 0);
    const planets = BODIES.filter((body) => body.au > 0 && !body.parent && !body.periAu)
      .map((body) => body.au)
      .sort((a, b) => a - b);
    for (let i = 1; i < planets.length; i++) {
      assert.ok(orbitRadius(planets[i]!) >= orbitRadius(planets[i - 1]!));
    }
  });
});

describe("chapters", () => {
  const [sun, stars] = CHAPTERS;
  const allSun = goalsIn(sun.id).map((body) => body.id);

  it("opens the first chapter from the start and the next only once it is charted", () => {
    assert.equal(chapterOpen(sun.id, []), true);
    assert.equal(chapterOpen(stars.id, []), false);
    assert.equal(chapterOpen(stars.id, allSun.slice(1)), false);
    assert.equal(chapterOpen(stars.id, allSun), true);
  });

  it("counts a chapter as done only when every place in it is charted", () => {
    assert.equal(chapterDone(sun.id, []), false);
    assert.equal(chapterDone(sun.id, allSun.slice(0, -1)), false);
    assert.equal(chapterDone(sun.id, allSun), true);
  });

  it("never counts an unknown chapter as done", () => {
    assert.equal(chapterDone("nowhere", allSun), false);
  });
});
