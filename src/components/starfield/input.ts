/** Pointer, keys, wheel, and gaze, turned into a steering stick and a few intents for the engine. */

import { clamp, shape } from "./math.ts";

/** What input asks of the engine. */
export type InputIntents = {
  unlockAudio: () => void;
  resumeAudio: () => void;
  toggleBoost: () => void;
  toggleOrbit: () => void;
  /** Wheel notches as a speed step; positive slows down. */
  wheel: (step: number) => void;
  /** A second tap in the same spot: try to focus whatever is under it. */
  doubleTap: (clientX: number, clientY: number) => void;
};

export class FlightInput {
  readonly keys = new Set<string>();
  /** The player has touched a control. Nothing is charted or logged before this. */
  engaged = false;
  steerOverride = 0;
  private smoothPX = 0;
  private smoothPY = 0;
  private pointerX = 0;
  private pointerY = 0;
  private hasPointer = false;
  private hudPointer = -1;
  private holdLook = false;
  private holdX = 0;
  private holdY = 0;
  private wasFocus = false;
  private tapAt = 0;
  private tapX = 0;
  private tapY = 0;
  private downX = 0;
  private downY = 0;
  private downMoved = false;
  private dragging = false;
  private dragX = 0;
  private dragY = 0;
  private guide = false;
  private guideX = 0;
  private guideY = 0;
  private pendingGuide: { x: number; y: number; at: number } | null = null;
  private gazeOn = false;
  private gazeX = 0;
  private gazeY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly intents: InputIntents,
  ) {}

  bind(signal: AbortSignal): void {
    window.addEventListener("pointermove", this.onPointerMove, { signal });
    window.addEventListener("pointerdown", this.onPointerDown, { signal });
    window.addEventListener("pointerup", this.onPointerUp, { signal });
    window.addEventListener("pointercancel", this.onPointerUp, { signal });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave, { signal });
    window.addEventListener("keydown", this.onKeyDown, { signal });
    window.addEventListener("keyup", this.onKeyUp, { signal });
    window.addEventListener("blur", this.clearKeys, { signal });
    window.addEventListener("wheel", this.onWheel, { passive: false, signal });
    document.addEventListener("visibilitychange", this.onVis, { signal });
  }

  /** Smoothed look from the webcam. Does not count as a steer that leaves an orbit. */
  setGaze(x: number, y: number, on: boolean): void {
    this.gazeOn = on;
    this.gazeX = clamp(x, -1, 1);
    this.gazeY = clamp(y, -1, 1);
  }

  /** Once a frame, before the stick: focus starting or ending, and a tap's steer coming due. */
  sync(focus: boolean): void {
    if (focus && !this.wasFocus) {
      this.holdLook = true;
      this.hasPointer = false;
      this.pointerX = 0;
      this.pointerY = 0;
      this.smoothPX = 0;
      this.smoothPY = 0;
    }
    if (!focus && this.wasFocus) this.holdLook = false;
    this.wasFocus = focus;
    if (this.pendingGuide && performance.now() - this.pendingGuide.at > 360) {
      this.guideX = this.pendingGuide.x;
      this.guideY = this.pendingGuide.y;
      this.guide = true;
      this.pendingGuide = null;
    }
  }

  /** Steering by hand: a pointer dragged past the dead zone, or a flight key held. */
  manual(): boolean {
    return (
      (this.hasPointer && Math.abs(this.smoothPX) + Math.abs(this.smoothPY) > 0.55) ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyD") ||
      this.keys.has("ArrowLeft") ||
      this.keys.has("ArrowRight") ||
      this.keys.has("KeyW") ||
      this.keys.has("KeyS") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("ArrowDown")
    );
  }

  /** Hold the look still after a tap picks a place, until the pointer moves away. */
  armFocus(clientX: number, clientY: number): void {
    this.holdLook = true;
    this.holdX = clientX;
    this.holdY = clientY;
    this.hasPointer = false;
    this.pointerX = 0;
    this.pointerY = 0;
    this.smoothPX = 0;
    this.smoothPY = 0;
  }

  private armGuide(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((clientY - rect.top) / rect.height) * 2 - 1;
    if (Math.hypot(x, y) < 0.12) return;
    this.pendingGuide = {
      x: clamp(x * 0.38, -0.42, 0.42),
      y: clamp(y * 0.32, -0.36, 0.36),
      at: performance.now(),
    };
  }

  /** The stick this frame: pointer, tap-to-steer, or gaze, then keys on top. */
  readStick(dt: number, reduced: boolean): { x: number; y: number } {
    if (this.guide) {
      const fade = Math.exp(-1.8 * dt);
      this.guideX *= fade;
      this.guideY *= fade;
      if (Math.hypot(this.guideX, this.guideY) < 0.02) this.guide = false;
    }
    const gazeScale = reduced ? 0.34 : 0.58;
    const tx = this.hasPointer ? shape(this.pointerX) * 0.62 : this.guide ? this.guideX : this.gazeOn ? this.gazeX * gazeScale : 0;
    const ty = this.hasPointer ? shape(this.pointerY) * 0.62 : this.guide ? this.guideY : this.gazeOn ? this.gazeY * gazeScale : 0;
    const k = 1 - Math.exp(-12 * dt);
    this.smoothPX += (tx - this.smoothPX) * k;
    this.smoothPY += (ty - this.smoothPY) * k;
    let x = this.smoothPX;
    let y = this.smoothPY;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y += 1;
    x -= this.steerOverride;
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  private isHud(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest("[data-hud]"));
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 36) this.downMoved = true;
    if (this.holdLook) {
      if (Math.hypot(e.clientX - this.holdX, e.clientY - this.holdY) < 36) return;
      this.holdLook = false;
    }
    if (e.pointerId === this.hudPointer || !this.dragging) return;
    if (e.pointerType === "touch" && e.buttons === 0) return;
    const dx = e.clientX - this.dragX;
    const dy = e.clientY - this.dragY;
    if (Math.hypot(dx, dy) < 36) return;
    this.pendingGuide = null;
    this.guide = false;
    const rect = this.canvas.getBoundingClientRect();
    const radius = Math.max(180, Math.min(rect.width, rect.height) * 0.55);
    this.hasPointer = true;
    this.pointerX = clamp(dx / radius, -1, 1);
    this.pointerY = clamp(dy / radius, -1, 1);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.intents.unlockAudio();
    this.engaged = true;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.downMoved = false;
    if (this.isHud(e.target)) {
      this.hudPointer = e.pointerId;
      this.dragging = false;
      this.hasPointer = false;
      this.pointerX = 0;
      this.pointerY = 0;
      this.smoothPX = 0;
      this.smoothPY = 0;
      this.guide = false;
      this.pendingGuide = null;
      return;
    }
    this.dragging = true;
    this.dragX = e.clientX;
    this.dragY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.hudPointer) this.hudPointer = -1;
    this.dragging = false;
    this.hasPointer = false;
    this.pointerX = 0;
    this.pointerY = 0;
    if (this.isHud(e.target) || this.downMoved) {
      this.tapAt = 0;
      this.pendingGuide = null;
      return;
    }
    const now = performance.now();
    const repeat =
      now - this.tapAt < 340 && Math.hypot(e.clientX - this.tapX, e.clientY - this.tapY) < 28;
    this.tapAt = now;
    this.tapX = e.clientX;
    this.tapY = e.clientY;
    if (repeat) {
      this.pendingGuide = null;
      this.intents.doubleTap(e.clientX, e.clientY);
      return;
    }
    this.armGuide(e.clientX, e.clientY);
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return;
    this.hasPointer = false;
    this.pointerX = 0;
    this.pointerY = 0;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.intents.unlockAudio();
    this.engaged = true;
    const hud = this.isHud(e.target);
    if (!hud && (e.code === "Space" || e.code.startsWith("Arrow"))) e.preventDefault();
    if (e.code === "Space" && !e.repeat && !hud) this.intents.toggleBoost();
    if (e.code === "KeyO" && !e.repeat && !hud) this.intents.toggleOrbit();
    if (!hud) this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private clearKeys = (): void => {
    this.keys.clear();
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.isHud(e.target)) return;
    e.preventDefault();
    this.engaged = true;
    this.intents.wheel(clamp(e.deltaY / 1400, -0.06, 0.06));
  };

  private onVis = (): void => {
    if (document.hidden) this.keys.clear();
    else this.intents.resumeAudio();
  };
}
