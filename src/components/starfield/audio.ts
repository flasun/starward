/** Quiet procedural drone. Unlocks only inside a user gesture. */

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

export class DriftAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
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
  }

  /** Short bell for a reward: a rising fifth for a charted place, a triad for a flight-log entry. */
  chime(kind: "chart" | "task", muted: boolean): void {
    const ctx = this.ctx;
    if (!ctx || muted || ctx.state !== "running") return;
    const notes = kind === "chart" ? [659.25, 987.77] : [523.25, 659.25, 783.99];
    const t0 = ctx.currentTime + 0.01;
    notes.forEach((freq, i) => {
      const at = t0 + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.07, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      // Straight to the output: the drone's low-pass would swallow a bell.
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.95);
    });
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.oscA = null;
    this.oscB = null;
    if (ctx) void ctx.close();
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

    this.master = master;
    this.filter = filter;
    this.oscA = a;
    this.oscB = b;
    this.noiseGain = noiseGain;
    this.noiseFilter = bp;
  }
}
