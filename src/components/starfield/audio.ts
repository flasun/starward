/**
 * Everything you hear, synthesized: the engine drone, a slow chord under each chapter, and short
 * cues for what you do. Unlocks only inside a user gesture. Nothing here draws on Math.random
 * after unlock, so sound never changes what the game shows.
 */

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

export type Cue =
  | "chart"
  | "task"
  | "buy"
  | "sell"
  | "station"
  | "orbit"
  | "lap"
  | "lock"
  | "boost"
  | "unboost"
  | "chapter";

/** The chord under each chapter: warm round the Sun, brighter in the stars, darker further out. */
export const PADS: Record<string, readonly number[]> = {
  sun: [110, 164.81, 220, 277.18],
  stars: [146.83, 220, 293.66, 369.99],
  galaxy: [98, 146.83, 196, 233.08],
  local: [87.31, 130.81, 174.61, 196],
  web: [73.42, 110, 164.81, 174.61],
};
/** The ambience sits well under the drone and the cues. */
const PAD_LEVEL = 0.05;
const PAD_FADE = 3;

type Pad = { gain: GainNode; sources: OscillatorNode[] };

type Tone = {
  type?: OscillatorType;
  peak: number;
  attack?: number;
  decay: number;
  /** Glide to this pitch over the decay. */
  slideTo?: number;
};

export class DriftAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private noise: AudioBuffer | null = null;
  private cues: GainNode | null = null;
  private pad: Pad | null = null;
  private chapter = "sun";
  private muted = false;
  /** Whether the pad's level was last set for muted, so a crossfade is not overwritten each frame. */
  private padMuted = false;
  private dead = false;

  /** Call synchronously from pointerdown / keydown. */
  unlock(): void {
    if (this.dead) return;
    const Ctor = audioCtor();
    if (!Ctor) return;
    try {
      if (!this.ctx) {
        this.ctx = new Ctor({ latencyHint: "interactive" });
        this.build(this.ctx);
        this.pad = this.makePad(this.ctx, this.chapter);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.dead = true;
    }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  update(speed: number, boost: number, muted: boolean): void {
    this.muted = muted;
    if (!this.ctx || !this.master || !this.filter || !this.oscA || !this.oscB || !this.noiseGain || !this.noiseFilter) {
      return;
    }
    const t = this.ctx.currentTime;
    const vol = muted ? 0 : Math.min(0.26, 0.055 + (speed / 80) * 0.11) * (0.85 + boost * 0.3);
    this.master.gain.setTargetAtTime(vol, t, 0.08);
    this.oscA.frequency.setTargetAtTime(32 + speed * 0.16 + boost * 8, t, 0.1);
    this.oscB.frequency.setTargetAtTime(18 + speed * 0.08 + boost * 4, t, 0.12);
    this.filter.frequency.setTargetAtTime(120 + speed * 2.4 + boost * 420, t, 0.12);
    this.noiseGain.gain.setTargetAtTime(muted ? 0 : 0.02 + (speed / 100) * 0.035 + boost * boost * 0.045, t, 0.1);
    this.noiseFilter.frequency.setTargetAtTime(90 + speed * 1.2 + boost * 280, t, 0.12);
    if (this.pad && muted !== this.padMuted) {
      this.padMuted = muted;
      this.pad.gain.gain.cancelScheduledValues(t);
      this.pad.gain.gain.setTargetAtTime(muted ? 0 : PAD_LEVEL, t, 0.4);
    }
  }

  /** Crossfade to another chapter's chord. Before unlock, just remembers it. */
  setChapter(chapter: string): void {
    if (chapter === this.chapter) return;
    this.chapter = chapter;
    const ctx = this.ctx;
    if (!ctx) return;
    const old = this.pad;
    const t = ctx.currentTime;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + PAD_FADE);
      for (const source of old.sources) source.stop(t + PAD_FADE + 0.1);
    }
    this.pad = this.makePad(ctx, chapter);
  }

  /** A short sound for something that happened. Silent while muted or before the first gesture. */
  cue(kind: Cue, muted: boolean): void {
    const ctx = this.ctx;
    if (!ctx || muted || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.01;
    switch (kind) {
      case "chart":
        // A rising fifth for a charted place.
        this.tone(659.25, t, { peak: 0.07, decay: 0.9 });
        this.tone(987.77, t + 0.11, { peak: 0.07, decay: 0.9 });
        break;
      case "task":
        // A triad for a flight-log entry.
        [523.25, 659.25, 783.99].forEach((freq, i) => this.tone(freq, t + i * 0.11, { peak: 0.07, decay: 0.9 }));
        break;
      case "buy":
        this.tone(880, t, { type: "triangle", peak: 0.045, decay: 0.16, slideTo: 1320 });
        break;
      case "sell":
        // Two coins.
        this.tone(1318.5, t, { type: "triangle", peak: 0.04, decay: 0.22 });
        this.tone(1975.5, t + 0.06, { type: "triangle", peak: 0.04, decay: 0.3 });
        break;
      case "station":
        // A low thunk as it locks into place, then a rising arpeggio as it comes on line.
        this.tone(110, t, { peak: 0.09, decay: 0.3, slideTo: 55 });
        [392, 523.25, 659.25].forEach((freq, i) =>
          this.tone(freq, t + 0.14 + i * 0.09, { type: "triangle", peak: 0.035, decay: 0.5 }),
        );
        break;
      case "orbit":
        this.tone(440, t, { peak: 0.035, attack: 0.18, decay: 0.9 });
        this.tone(660, t + 0.04, { peak: 0.03, attack: 0.18, decay: 0.9 });
        break;
      case "lap":
        this.whoosh(t, 200, 1200, 1, 0.05);
        break;
      case "lock":
        this.tone(1760, t, { peak: 0.018, attack: 0.004, decay: 0.05 });
        break;
      case "boost":
        this.whoosh(t, 300, 2400, 0.7, 0.06);
        break;
      case "unboost":
        this.whoosh(t, 1800, 300, 0.6, 0.035);
        break;
      case "chapter":
        this.tone(220, t, { peak: 0.03, attack: 0.3, decay: 1.4, slideTo: 880 });
        break;
    }
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.oscA = null;
    this.oscB = null;
    this.cues = null;
    this.pad = null;
    if (ctx) void ctx.close();
  }

  private tone(freq: number, at: number, shape: Tone): void {
    const ctx = this.ctx;
    if (!ctx || !this.cues) return;
    const attack = shape.attack ?? 0.015;
    const osc = ctx.createOscillator();
    osc.type = shape.type ?? "sine";
    osc.frequency.setValueAtTime(freq, at);
    if (shape.slideTo) osc.frequency.exponentialRampToValueAtTime(shape.slideTo, at + attack + shape.decay);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(shape.peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + shape.decay);
    osc.connect(gain).connect(this.cues);
    osc.start(at);
    osc.stop(at + attack + shape.decay + 0.05);
  }

  /** Air rushing past: the drone's noise through a band that sweeps from one pitch to another. */
  private whoosh(at: number, from: number, to: number, seconds: number, peak: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.cues || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + seconds * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band).connect(gain).connect(this.cues);
    source.start(at);
    source.stop(at + seconds + 0.05);
  }

  /** Two detuned triangles per note, under a slowly breathing low-pass, faded in. */
  private makePad(ctx: AudioContext, chapter: string): Pad {
    const notes = PADS[chapter] ?? PADS.sun!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(this.muted ? 0 : PAD_LEVEL, ctx.currentTime + PAD_FADE);
    this.padMuted = this.muted;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.4;
    const mix = ctx.createGain();
    mix.gain.value = 1 / (notes.length * 2);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const depth = ctx.createGain();
    depth.gain.value = 160;
    lfo.connect(depth).connect(filter.frequency);
    const sources = [lfo];
    for (const freq of notes) {
      for (const cents of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        osc.detune.value = cents;
        osc.connect(mix);
        sources.push(osc);
      }
    }
    mix.connect(filter).connect(gain).connect(ctx.destination);
    for (const source of sources) source.start();
    return { gain, sources };
  }

  private build(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    filter.Q.value = 0.65;

    const a = ctx.createOscillator();
    a.type = "sine";
    a.frequency.value = 52;
    const b = ctx.createOscillator();
    b.type = "sine";
    b.frequency.value = 28;
    const quiet = ctx.createGain();
    quiet.gain.value = 0.55;

    a.connect(filter);
    b.connect(quiet);
    quiet.connect(filter);
    filter.connect(master);
    master.connect(ctx.destination);
    a.start();
    b.start();

    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = 140;
    bp.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();

    // Cues skip the drone's low-pass, which would swallow a bell.
    const cues = ctx.createGain();
    cues.gain.value = 1;
    cues.connect(ctx.destination);

    this.master = master;
    this.filter = filter;
    this.oscA = a;
    this.oscB = b;
    this.noiseGain = noiseGain;
    this.noiseFilter = bp;
    this.noise = buffer;
    this.cues = cues;
  }
}
