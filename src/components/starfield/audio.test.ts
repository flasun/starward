import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Cue, DriftAudio, PADS } from "./audio.ts";
import { CHAPTERS } from "./system.ts";

/** Just enough Web Audio to see what gets scheduled. */
class Param {
  value = 0;
  setValueAtTime(value: number) {
    this.value = value;
  }
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}
class Node {
  connect<T>(node: T): T {
    return node;
  }
}
class Osc extends Node {
  type = "sine";
  frequency = new Param();
  detune = new Param();
  started: number | null = null;
  stopped: number | null = null;
  start(at = 0) {
    this.started = at;
  }
  stop(at = 0) {
    this.stopped = at;
  }
}
class Gain extends Node {
  gain = new Param();
}
class Filter extends Node {
  type = "lowpass";
  frequency = new Param();
  Q = new Param();
}
class Source extends Node {
  buffer: unknown = null;
  loop = false;
  started = false;
  start() {
    this.started = true;
  }
  stop() {}
}
class FakeContext {
  static last: FakeContext | null = null;
  state = "running";
  currentTime = 10;
  sampleRate = 100;
  destination = new Node();
  oscillators: Osc[] = [];
  sources: Source[] = [];
  constructor() {
    FakeContext.last = this;
  }
  createOscillator() {
    const osc = new Osc();
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    return new Gain();
  }
  createBiquadFilter() {
    return new Filter();
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    const source = new Source();
    this.sources.push(source);
    return source;
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

const ctx = () => FakeContext.last!;
const pitches = (from: number) => ctx().oscillators.slice(from).map((osc) => osc.frequency.value);
/** The pad's notes: the triangles that never stop on their own. */
const padNotes = () =>
  [...new Set(ctx().oscillators.filter((osc) => osc.type === "triangle" && osc.stopped === null).map((osc) => osc.frequency.value))];

describe("DriftAudio", () => {
  beforeEach(() => {
    FakeContext.last = null;
    (globalThis as { window?: unknown }).window = { AudioContext: FakeContext };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("stays silent before the first gesture, and while muted", () => {
    const audio = new DriftAudio();
    audio.cue("chart", false);
    assert.equal(FakeContext.last, null);
    audio.unlock();
    const before = ctx().oscillators.length;
    audio.cue("chart", true);
    assert.equal(ctx().oscillators.length, before);
  });

  it("plays every cue without drawing on Math.random", () => {
    const audio = new DriftAudio();
    audio.unlock();
    const random = Math.random;
    let draws = 0;
    Math.random = () => {
      draws += 1;
      return random();
    };
    try {
      const cues: Cue[] = ["chart", "task", "buy", "sell", "station", "orbit", "lap", "lock", "boost", "unboost", "chapter"];
      for (const cue of cues) {
        const oscillators = ctx().oscillators.length;
        const sources = ctx().sources.length;
        audio.cue(cue, false);
        assert.ok(ctx().oscillators.length + ctx().sources.length > oscillators + sources, `${cue} made no sound`);
      }
      audio.setChapter("web");
    } finally {
      Math.random = random;
    }
    assert.equal(draws, 0);
  });

  it("keeps the chart and flight-log bells", () => {
    const audio = new DriftAudio();
    audio.unlock();
    const from = ctx().oscillators.length;
    audio.cue("chart", false);
    assert.deepEqual(pitches(from), [659.25, 987.77]);
    const next = ctx().oscillators.length;
    audio.cue("task", false);
    assert.deepEqual(pitches(next), [523.25, 659.25, 783.99]);
  });

  it("plays the chapter's chord, and crossfades to the next one", () => {
    const audio = new DriftAudio();
    audio.setChapter("stars");
    audio.unlock();
    assert.deepEqual(padNotes(), [...PADS.stars!]);
    const old = ctx().oscillators.filter((osc) => osc.type === "triangle");
    audio.setChapter("galaxy");
    assert.ok(old.every((osc) => osc.stopped !== null && osc.stopped > ctx().currentTime), "old chord fades out");
    assert.deepEqual(padNotes(), [...PADS.galaxy!]);
  });

  it("has a chord for every chapter", () => {
    for (const chapter of CHAPTERS) assert.ok(PADS[chapter.id]?.length, chapter.id);
  });
});
