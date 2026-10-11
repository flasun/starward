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
  isChartable,
  navIn,
  nextInNav,
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

  it("puts every place on the later maps where the ship can reach it", () => {
    // The ship flies within 90 units of the plane; a place has to be charted from inside that band.
    for (const body of JOURNEY) {
      const above = Math.max(0, Math.abs(body.at!.y) - 90);
      assert.ok(above < surveyRadius(body) * 0.6, `${body.id} sits ${above} units above the ship's reach`);
    }
  });

  it("keeps each place's arrival range clear of its neighbours'", () => {
    for (const chapter of CHAPTERS.slice(1)) {
      const places = bodiesIn(chapter.id);
      for (const a of places) {
        for (const b of places) {
          if (a.id >= b.id) continue;
          const apart = Math.hypot(a.at!.x - b.at!.x, a.at!.y - b.at!.y, a.at!.z - b.at!.z);
          assert.ok(apart > surveyRadius(a) + surveyRadius(b), `${a.id} and ${b.id} overlap`);
        }
      }
    }
  });

  it("lists each chapter's places with every nav group in one run", () => {
    for (const chapter of CHAPTERS) {
      const groups = navIn(chapter.id).map((body) => body.group);
      const runs = groups.filter((group, i) => group !== groups[i - 1]);
      assert.equal(new Set(runs).size, runs.length, `${chapter.id}: ${runs.join(", ")}`);
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

  it("never counts an unknown chapter as done, or open", () => {
    assert.equal(chapterDone("nowhere", allSun), false);
    assert.equal(chapterOpen("nowhere", allSun), false);
  });

  it("keeps a chapter open once something in it or past it is charted, even after new places", () => {
    // A pilot who reached the galaxy before the stars gained a place keeps the galaxy and the stars.
    const allStars = goalsIn("stars").map((body) => body.id);
    const reached = [...allSun, ...allStars.slice(1), "orion-arm"];
    assert.equal(chapterDone("stars", reached), false);
    assert.equal(chapterOpen("stars", reached), true);
    assert.equal(chapterOpen("galaxy", reached), true);
    assert.equal(chapterOpen("local", reached), false);
  });

  it("ends with The Edge of Sight, after The Web", () => {
    assert.equal(CHAPTERS.find((chapter) => chapter.id === "web")!.next, "deep");
    assert.equal(CHAPTERS.at(-1)!.id, "deep");
    assert.equal(CHAPTERS.at(-1)!.next, null);
  });
});

describe("isChartable", () => {
  it("counts every chapter goal and nothing else", () => {
    for (const chapter of CHAPTERS) for (const body of goalsIn(chapter.id)) assert.ok(isChartable(body.id), body.id);
    assert.equal(isChartable("atlantis"), false);
  });
});

describe("nextInNav", () => {
  it("steps through the nav in order and wraps round", () => {
    const nav = navIn("sun");
    assert.equal(nextInNav("sun", nav[0]!.id), nav[1]);
    assert.equal(nextInNav("sun", nav.at(-1)!.id), nav[0]);
  });

  it("starts from the top for a place the nav does not list, or the bottom going back", () => {
    assert.equal(nextInNav("sun", "atlantis"), navIn("sun")[0]);
    assert.equal(nextInNav("sun", "atlantis", -1), navIn("sun").at(-1));
  });

  it("steps back, wrapping round the other way", () => {
    const nav = navIn("stars");
    assert.equal(nextInNav("stars", nav[1]!.id, -1), nav[0]);
    assert.equal(nextInNav("stars", nav[0]!.id, -1), nav.at(-1));
    for (const body of nav) assert.equal(nextInNav("stars", nextInNav("stars", body.id)!.id, -1), body);
  });
});
