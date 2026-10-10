import { type Cue, DriftAudio } from "@/components/starfield/audio";
import {
  FAR,
  MAX_STARS,
  NEAR,
  clamp,
  cruiseSpeed,
  starBudget,
  warpFactor,
  wrap01,
} from "@/components/starfield/math";
import {
  type BodyDef,
  bodiesIn,
  bodyById,
  bodyPosition,
  cameraForward,
  surveyRadius,
  visualRadius,
  worldToCamera,
} from "@/components/starfield/system";
import { createTaskState, stepTasks, type TaskMemory } from "@/components/starfield/tasks";
import { captureBand, captureWell, holdRadius, orbitLevelRadius, orbitPace, orbitTangent, skinRadius } from "@/components/starfield/flight";
import { cameraEye } from "@/components/starfield/camera";
import { sighted } from "@/components/starfield/handsfree";
import type { Course } from "@/components/starfield/trial";
import { FlightInput } from "@/components/starfield/input";
import { StarfieldRenderer } from "@/components/starfield/renderer";
import { formatRange, plotSystem } from "@/components/starfield/hud";
import type { FrameMarker, PlotBlip, StarfieldHooks, StarfieldParams } from "@/components/starfield/types";

export type { CameraView, FrameMarker, PlotBlip, StarfieldHooks, StarfieldParams } from "@/components/starfield/types";

/**
 * The simulation: flight, autopilot, orbits, and what the HUD shows. Input and drawing live in
 * input.ts and renderer.ts.
 *
 * Camera space: +X right, +Y up, +Z forward (into the starfield).
 * +yaw looks left (stars slide right). +pitch looks up (stars slide down).
 * Stick +X is right, stick +Y is down. KeyA is stick −X so yaw increases.
 */
export class StarfieldEngine {
  private readonly audio = new DriftAudio();
  private readonly data = new Float32Array(MAX_STARS * 4);
  private readonly abort = new AbortController();

  private raf = 0;
  private running = false;
  private destroyed = false;

  private yaw = 0;
  private pitch = 0;
  private orbitSign = 1;
  private velX = 0;
  private velY = 0;
  private velZ = 0;
  private inserting = false;
  private insertSeeded = false;
  private captureHold = 0;
  private captureRadius = 0;
  private captureText = "";
  private captureAbort = "";
  private alertUntil = 0;
  private orbitId = "";
  private lapFor = "";
  private lapSkip = "";
  private lapSwept = 0;
  private lapTheta = 0;
  private lapArmed = false;
  private lapConfirmed = false;
  private lapRelease = false;
  private lapIgnoreBoost = false;
  private passId = "";
  private passDist = Infinity;
  private speed = 28;
  private boost = 0;
  private rush = 0;
  private fov = (70 * Math.PI) / 180;
  private tanFov = Math.tan((70 * Math.PI) / 180 / 2);
  private aspect = 1;
  private bank = 0;
  private bgX = 0;
  private bgY = 0;
  private time = 0;
  private live = 0;
  private frames = 0;
  private fps = 60;
  private stress = 0;
  private quality = 1;
  private stickX = 0;
  private stickY = 0;
  private picks: { id: string; x: number; y: number; rad: number }[] = [];
  private leveling = false;
  private audioAcc = 0;
  private lastWarp = "";
  private yawLagRate = 0;
  private pitchLagRate = 0;
  private mobile = false;
  private sized = false;
  private shipX = 0;
  private chapter = "sun";
  private shipY = 6;
  private shipZ = 0;
  private placed = false;
  private nearId = "";
  private chartId = "";
  private plot: PlotBlip[] = [];
  private alert = "";
  private readonly planetData = new Float32Array(80 * 12);
  private planetCount = 0;
  private eyeX = 0;
  private eyeY = 0;
  private eyeZ = 0;
  private taskMem: TaskMemory = createTaskState();
  private readonly trail: { x: number; y: number; z: number }[] = [];
  private readonly markers: FrameMarker[] = [];

  private readonly probe = {
    getYaw: () => this.yaw,
    getSpeed: () => this.speed,
    getPitch: () => this.pitch,
    getFps: () => this.fps,
    getAim: () => this.aimStick(this.hooks.current.getParams().targetId, true),
    setSteer: (v: number) => {
      this.input.steerOverride = clamp(v, -1, 1);
    },
    setKeys: (codes: string[]) => {
      this.input.keys.clear();
      for (const code of codes) this.input.keys.add(code);
    },
  };

  private readonly input: FlightInput;
  private readonly renderer: StarfieldRenderer;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: { current: StarfieldHooks },
  ) {
    this.renderer = new StarfieldRenderer(canvas, (message) => this.hooks.current.onError(message));
    this.input = new FlightInput(canvas, {
      unlockAudio: () => this.audio.unlock(),
      resumeAudio: () => this.audio.resume(),
      toggleBoost: () => this.hooks.current.onToggleBoost(),
      toggleOrbit: () => this.hooks.current.onToggleOrbit(),
      wheel: (step) => {
        const params = this.hooks.current.getParams();
        this.hooks.current.onSpeed(clamp(params.speed - step, 0, 1));
      },
      doubleTap: (clientX, clientY) => this.tryFocus(clientX, clientY),
      pad: (command) => {
        if (command === "level") this.level();
        else this.hooks.current.onPad(command);
      },
      gamepad: (connected) => this.hooks.current.onGamepad(connected),
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.mobile = window.matchMedia("(pointer: coarse)").matches;
    this.placeShip();
    this.renderer.init(this.data, this.planetData, this.abort.signal);
    this.quality = this.renderer.quality;
    this.resize();
    this.spawnAll();
    this.bindInput();
    window.__controlsTest = this.probe;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** A short sound for something that happened. Silent while muted or before the first gesture. */
  cue(kind: Cue): void {
    this.audio.cue(kind, this.hooks.current.getParams().muted);
  }

  level(): void {
    this.leveling = true;
  }

  /** Smoothed look from the webcam. Does not count as a steer that leaves an orbit. */
  setGaze(x: number, y: number, on: boolean): void {
    this.input.setGaze(x, y, on);
  }

  destroy(): void {
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.audio.dispose();
    if (window.__controlsTest === this.probe) delete window.__controlsTest;
    this.renderer.destroy();
  }

  enter(chapter: string): void {
    this.chapter = chapter;
    this.audio.setChapter(chapter);
    this.cue("chapter");
    const first = bodiesIn(chapter).find((body) => body.goal) ?? bodiesIn(chapter)[0];
    if (!first) return;
    const pos = bodyPosition(first, this.time);
    let dx = pos.x;
    let dz = pos.z;
    let len = Math.hypot(dx, dz);
    if (len < 1) {
      dx = 0;
      dz = 1;
      len = 1;
    }
    const back = Math.max(visualRadius(first) * 4.5, 200);
    this.shipX = pos.x - (dx / len) * back;
    this.shipY = 18;
    this.shipZ = pos.z - (dz / len) * back;
    const fx = pos.x - this.shipX;
    const fz = pos.z - this.shipZ;
    const fl = Math.hypot(fx, fz) || 1;
    this.yaw = Math.atan2(-fx / fl, fz / fl);
    this.pitch = -0.04;
    this.speed = 56;
    this.boost = 1;
    this.clearFlight();
  }

  /**
   * The daily trial: the system set to the course's moment, the ship at its start, still and
   * facing the first stop.
   */
  startTrial(course: Course): void {
    if (this.chapter !== "sun") {
      this.chapter = "sun";
      this.audio.setChapter("sun");
    }
    this.time = course.epoch;
    this.shipX = course.start.x;
    this.shipY = course.start.y;
    this.shipZ = course.start.z;
    this.yaw = course.yaw;
    this.pitch = 0;
    this.speed = 0;
    this.boost = 0;
    this.leveling = false;
    this.lapSkip = "";
    this.input.engaged = true;
    this.clearFlight();
  }

  /** Forget the flight so far: trail, orbit, capture, and any lap. */
  private clearFlight(): void {
    this.velX = 0;
    this.velY = 0;
    this.velZ = 0;
    this.trail.length = 0;
    this.nearId = "";
    this.orbitId = "";
    this.inserting = false;
    this.insertSeeded = false;
    this.captureHold = 0;
    this.captureRadius = 0;
    this.captureText = "";
    this.captureAbort = "";
    this.clearLap(false);
    this.placed = true;
  }

  private roster(): BodyDef[] {
    return bodiesIn(this.chapter);
  }

  private placeShip(): void {
    if (this.placed) return;
    this.placed = true;
    const earth = bodyPosition(bodyById("earth"), 0);
    const len = Math.hypot(earth.x, earth.z) || 1;
    const ox = earth.x / len;
    const oz = earth.z / len;
    const tx = -oz;
    const tz = ox;
    // About 2.5 times Earth's survey range, so the first approach takes a few
    // seconds instead of finishing before the player has looked around. On the
    // sunward side: Earth's day face is in view, and Shadow pass (arriving from
    // beyond a planet) takes a deliberate loop instead of a straight drift.
    this.shipX = earth.x - ox * 195 + tx * 240;
    this.shipY = 4;
    this.shipZ = earth.z - oz * 195 + tz * 240;
    const dx = earth.x - this.shipX;
    const dz = earth.z - this.shipZ;
    const fl = Math.hypot(dx, dz) || 1;
    this.yaw = Math.atan2(-dx / fl, dz / fl);
    this.pitch = -0.04;
  }

  private bindInput(): void {
    const { signal } = this.abort;
    this.input.bind(signal);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.canvas);
    signal.addEventListener("abort", () => ro.disconnect());
  }

  private resize(): void {
    const dprCap = this.renderer.mode === "2d" ? 1 : this.mobile ? 1.25 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.aspect = w / Math.max(1, h);
    if (!this.sized && this.canvas.clientWidth > 2) {
      this.sized = true;
      this.mobile = this.mobile || this.canvas.clientWidth < 700;
      this.live = 0;
    }
  }

  private spawnAll(): void {
    for (let i = 0; i < MAX_STARS; i++) this.respawn(i, false, true);
  }

  private respawn(i: number, farSlab: boolean, fresh = false): void {
    const o = i * 4;
    const z = farSlab ? FAR * (0.88 + Math.random() * 0.12) : NEAR + Math.random() * (FAR - NEAR);
    const hy = z * this.tanFov * 1.35;
    const hx = hy * this.aspect * 1.35;
    let packed = this.data[o + 3] ?? 0;
    if (fresh || packed <= 0) {
      const bright = 0.32 + Math.pow(Math.random(), 1.55) * 0.68;
      const roll = Math.random();
      let colorId = roll < 0.16 ? 2 : roll < 0.52 ? 0 : 1;
      if (bright > 0.84) {
        const rare = Math.random();
        if (rare < 0.16) colorId = 3;
        else if (rare < 0.3) colorId = 4;
        else if (rare < 0.4) colorId = 5;
      }
      packed = bright + colorId * 4;
    }
    this.data[o] = (Math.random() * 2 - 1) * hx;
    this.data[o + 1] = (Math.random() * 2 - 1) * hy;
    this.data[o + 2] = z;
    this.data[o + 3] = packed;
  }

  private frame = (now: number): void => {
    if (!this.running || this.destroyed) return;
    if (document.hidden) {
      this.prevNow = 0;
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - (this.prevNow || now)) / 1000));
    this.prevNow = now;
    // Before the params, so a button press counts this frame.
    this.input.pollPads(now);
    // Read once, so a hook that changes the params mid-frame takes effect from the next frame.
    const params = this.hooks.current.getParams();
    this.step(dt, params);
    this.renderer.draw({
      stars: this.data,
      live: this.live,
      planets: this.planetData,
      planetCount: this.planetCount,
      trail: this.trail,
      shipX: this.shipX,
      shipY: this.shipY,
      shipZ: this.shipZ,
      yaw: this.yaw,
      pitch: this.pitch,
      eyeX: this.eyeX,
      eyeY: this.eyeY,
      eyeZ: this.eyeZ,
      bgX: this.bgX,
      bgY: this.bgY,
      bank: this.bank,
      rush: this.rush,
      boost: this.boost,
      speed: this.speed,
      time: this.time,
      tanFov: this.tanFov,
      aspect: this.aspect,
      yawLagRate: this.yawLagRate,
      pitchLagRate: this.pitchLagRate,
      reduced: params.reducedMotion,
    });
    this.raf = requestAnimationFrame(this.frame);
  };

  private prevNow = 0;
  /** What the last cues heard, so each one sounds once per change. */
  private heard = { boost: false, orbit: false, locked: false, lockAt: -Infinity };

  /** Boost on and off, settling into an orbit, and the target lock. Called once a frame. */
  private cueChanges(boosting: boolean, orbiting: boolean, locked: boolean): void {
    const heard = this.heard;
    // A gap between on and off, so a boost hovering at the line does not stutter.
    if (!heard.boost && boosting) {
      heard.boost = true;
      this.cue("boost");
    } else if (heard.boost && this.boost < 0.2 && !boosting) {
      heard.boost = false;
      this.cue("unboost");
    }
    if (orbiting && !heard.orbit) this.cue("orbit");
    heard.orbit = orbiting;
    // The lock comes and goes as you steer near the target; one tick every few seconds at most.
    if (locked && !heard.locked && !orbiting && this.time - heard.lockAt > 2.5) {
      heard.lockAt = this.time;
      this.cue("lock");
    }
    heard.locked = locked;
  }

  private step(dt: number, params: StarfieldParams): void {
    if (params.paused) {
      this.alert = "Paused";
      this.alertUntil = this.time + 10;
      return;
    }
    if (this.alert === "Paused") {
      this.alert = "";
      this.alertUntil = 0;
    }
    this.input.sync(params.focus);
    const stick = this.input.readStick(dt, params.reducedMotion);
    let sx = stick.x;
    let sy = stick.y;
    const manual = this.input.manual();
    if (!params.boost) this.lapIgnoreBoost = false;
    if (params.boost && !this.lapIgnoreBoost && (this.orbitId || this.lapFor)) {
      this.lapSkip = this.lapFor || this.orbitId;
      this.clearLap(false);
      this.orbitId = "";
      this.lapRelease = false;
      if (params.orbit) this.hooks.current.onCancelOrbit();
    }
    if (params.orbit && this.lapFor && this.lapFor !== params.targetId) {
      this.clearLap(false);
      this.orbitId = "";
    }
    if (this.lapSkip) {
      const skipped = bodyById(this.lapSkip);
      if (this.rangeTo(skipped.id) > holdRadius(skipped) * 3.2) this.lapSkip = "";
    }
    if (this.lapFor && params.orbit && params.targetId === this.lapFor) this.lapConfirmed = true;
    if (!params.orbit) this.lapRelease = false;
    const lapCancelled = this.lapFor !== "" && this.lapConfirmed && !params.orbit;
    if (lapCancelled) this.clearLap(true);
    if (!manual && !params.orbit && !this.lapFor && params.boost && !params.trial) {
      const pass = this.nearestPass(4);
      if (pass) {
        const dist = this.rangeTo(pass.id);
        const gate = holdRadius(pass) * 2.2;
        const crossed = this.passId === pass.id && this.passDist > gate && dist <= gate;
        const inbound = this.closingOn(pass.id);
        if (crossed && !inbound && pass.id !== this.lapSkip) {
          this.lapFor = pass.id;
          this.lapSwept = 0;
          this.lapArmed = false;
          this.lapConfirmed = false;
          this.lapTheta = 0;
          this.lapIgnoreBoost = true;
          this.hooks.current.onBeginLap(pass.id);
          this.cue("lap");
        }
        this.passId = pass.id;
        this.passDist = dist;
      }
    } else if (!this.lapFor) {
      const pass = this.nearestPass(4);
      if (pass) {
        this.passId = pass.id;
        this.passDist = this.rangeTo(pass.id);
      }
    }
    const orbitBody = params.orbit ? params.targetId : this.lapFor || params.targetId;
    const orbitNear =
      this.lapFor !== "" || this.rangeTo(orbitBody) < this.clearOrbitRadius(bodyById(orbitBody), params.orbitLevel) * 1.5;
    const burningOut = params.boost && !this.lapIgnoreBoost;
    const orbitOn =
      (params.orbit || this.lapFor !== "") && orbitNear && !manual && !this.lapRelease && !burningOut;
    if (params.orbit && orbitOn && params.autopilot && !this.lapFor) this.hooks.current.onCancelAutopilot();
    if (!params.orbit && !this.lapFor) this.captureAbort = "";
    if (!orbitOn) {
      this.inserting = false;
      this.insertSeeded = false;
      this.captureHold = 0;
      this.captureRadius = 0;
      this.captureText = "";
    }
    if ((params.orbit || this.lapFor) && manual) {
      this.clearLap(true);
      this.hooks.current.onCancelOrbit();
    } else if (params.focus && manual) {
      this.hooks.current.onCancelFocus();
    } else if (params.autopilot && manual) {
      this.hooks.current.onCancelAutopilot();
    } else if ((orbitOn && !this.inserting) || params.autopilot || params.focus) {
      const aim = this.aimStick(orbitOn ? orbitBody : params.targetId, orbitOn);
      if (aim) {
        const pull = params.focus && !orbitOn ? 1.35 : 1;
        sx = clamp(aim.x * pull, -1, 1);
        sy = clamp(aim.y * pull, -1, 1);
      }
    }
    this.stickX = sx;
    this.stickY = sy;

    // A trial is a race, so everyone flies the same ship; reduced motion keeps its calmer camera.
    const flightReduced = params.reducedMotion && !params.trial;
    const yawSpeed = flightReduced ? 0.55 : 1.25;
    const pitchSpeed = flightReduced ? 0.4 : 0.85;
    const yawRate = -sx * yawSpeed;
    const pitchRate = -sy * pitchSpeed;

    const prevYaw = this.yaw;
    const prevPitch = this.pitch;
    this.yaw += yawRate * dt;
    if (this.leveling && Math.abs(stick.y) > 0.4) this.leveling = false;
    if (this.leveling) {
      this.pitch += (0 - this.pitch) * (1 - Math.exp(-8 * dt));
      if (Math.abs(this.pitch) < 0.004) {
        this.pitch = 0;
        this.leveling = false;
      }
    } else {
      this.pitch = clamp(this.pitch + pitchRate * dt, -1.05, 1.05);
    }
    if (!orbitOn) this.steerClear(dt, params.targetId);
    const dYaw = this.yaw - prevYaw;
    const dPitch = this.pitch - prevPitch;

    const approach = this.rangeTo(params.targetId);
    const targetBody = bodyById(params.targetId);
    const arrive = skinRadius(targetBody) * 1.22;
    const autoBoost = params.autopilot && !orbitOn && approach > arrive * 6;
    const boostTarget = orbitOn ? 0 : params.boost || autoBoost ? 1 : 0;
    const bk = boostTarget > this.boost ? 5 : 2.5;
    this.boost += (boostTarget - this.boost) * (1 - Math.exp(-bk * dt));

    const cruise = cruiseSpeed(params.speed, params.reducedMotion && !params.trial);
    let targetSpeed = cruise * (1 + this.boost * 3.8);
    let orbitDir: { x: number; y: number; z: number } | null = null;
    let coasted = false;
    if (orbitOn && this.inserting) {
      coasted = this.flyCapture(dt, bodyById(orbitBody), params.speed, params.reducedMotion);
    } else if (orbitOn) {
      const body = bodyById(orbitBody);
      const pos = bodyPosition(body, this.time);
      const rx = this.shipX - pos.x;
      const ry = this.shipY - pos.y;
      const rz = this.shipZ - pos.z;
      const dist = Math.hypot(rx, ry, rz) || 1;
      const nx = rx / dist;
      const ny = ry / dist;
      const nz = rz / dist;
      const want =
        this.lapFor === body.id ? this.clearOrbitRadius(body, 1) : this.clearOrbitRadius(body, params.orbitLevel);
      if (params.orbit && this.lapFor !== body.id) {
        this.captureText = params.orbitLevel <= 0 ? "Low orbit" : params.orbitLevel >= 2 ? "High orbit" : "Mid orbit";
      }
      if (this.orbitId !== body.id) {
        this.orbitId = body.id;
        const seeded = orbitTangent(rx, ry, rz);
        const facing = cameraForward(this.yaw, this.pitch);
        const along = facing.x * seeded.x + facing.y * seeded.y + facing.z * seeded.z;
        this.orbitSign = along >= 0 ? 1 : -1;
      }
      const tangent = orbitTangent(rx, ry, rz);
      const { along: vTan, toward: vRad } = orbitPace(want, dist, params.reducedMotion);
      let hop = 0;
      for (const other of this.roster()) {
        if (other.id === body.id || other.quiet) continue;
        const op = bodyPosition(other, this.time);
        const ox = this.shipX - op.x;
        const oy = this.shipY - op.y;
        const oz = this.shipZ - op.z;
        const od = Math.hypot(ox, oy, oz);
        const skin = skinRadius(other);
        const warn = skin * 2.3;
        if (od >= warn) continue;
        const urgency = clamp((warn - od) / Math.max(1, warn - skin), 0, 1);
        const flat = Math.hypot(ox, oz);
        const rise = Math.sqrt(Math.max(0, (skin + 4) * (skin + 4) - Math.min(flat, skin + 4) ** 2)) + 1.4;
        hop = Math.max(hop, rise * urgency);
      }
      const vx = tangent.x * this.orbitSign * vTan - nx * vRad;
      let vy = tangent.y * this.orbitSign * vTan - ny * vRad;
      const vz = tangent.z * this.orbitSign * vTan - nz * vRad;
      vy += clamp((pos.y + hop - this.shipY) * 3.4, -20, 20);
      const mag = Math.hypot(vx, vy, vz) || 1;
      orbitDir = { x: vx / mag, y: vy / mag, z: vz / mag };
      targetSpeed = mag;
      if (this.lapFor === body.id) {
        const theta = Math.atan2(rz, rx);
        if (!this.lapArmed) {
          this.lapTheta = theta;
          if (dist < want * 1.25) this.lapArmed = true;
        } else {
          let turn = theta - this.lapTheta;
          if (turn > Math.PI) turn -= Math.PI * 2;
          if (turn < -Math.PI) turn += Math.PI * 2;
          this.lapTheta = theta;
          this.lapSwept += turn * this.orbitSign;
          if (this.lapSwept >= Math.PI * 2) {
            const tx = tangent.x * this.orbitSign;
            const ty = tangent.y * this.orbitSign;
            const tz = tangent.z * this.orbitSign;
            this.pitch = Math.asin(clamp(ty, -1, 1));
            const cp = Math.cos(this.pitch) || 1;
            this.yaw = Math.atan2(-tx / cp, tz / cp);
            this.lapRelease = true;
            this.clearLap(true);
            this.hooks.current.onEndLap();
          }
        }
      }
    } else {
      this.orbitId = "";
      if (params.autopilot && approach < arrive * 8) {
        targetSpeed *= clamp(approach / (arrive * 8), 0.16, 1);
      }
    }
    const respond = targetSpeed > this.speed ? 9 : 5.5;
    if (!coasted && params.autopilot && !orbitOn) {
      targetSpeed = Math.min(targetSpeed, Math.max(arrive * 0.45, approach * 0.35));
    }
    if (!coasted) this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-respond * dt));
    if (!orbitOn && params.autopilot && approach < arrive && this.closingOn(params.targetId)) {
      this.speed = Math.min(this.speed, 1.2);
      this.hooks.current.onCancelAutopilot();
    }

    if (!coasted) {
      const forward = orbitDir ?? cameraForward(this.yaw, this.pitch);
      this.shipX += forward.x * this.speed * dt;
      this.shipY = clamp(this.shipY + forward.y * this.speed * dt, -90, 90);
      this.shipZ += forward.z * this.speed * dt;
    }
    this.keepOutside();
    if (this.lapFor) {
      this.alert = `One loop around ${bodyById(this.lapFor).name}`;
    } else if (this.time >= this.alertUntil) {
      this.alert = "";
    }

    const baseFov = params.view === "cockpit" ? 70 : params.view === "above" ? 64 : params.view === "chase" ? 62 : 66;
    const pace = clamp((this.speed - 16) / 110, 0, 1);
    const orbitFov = orbitOn ? (params.reducedMotion ? -3 : -7) : 0;
    const boostFov = this.boost * (params.reducedMotion ? 6 : 16);
    const fovTarget = (((params.reducedMotion ? baseFov - 6 : baseFov) + boostFov + pace * 8 + orbitFov) * Math.PI) / 180;
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-4 * dt));
    this.tanFov = Math.tan(this.fov * 0.5);
    this.rush = clamp(this.boost * 0.72 + pace * 0.85, 0, 1);
    const eye = cameraEye(params.view, orbitOn, params.reducedMotion, sx, {
      x: this.shipX,
      y: this.shipY,
      z: this.shipZ,
      yaw: this.yaw,
      pitch: this.pitch,
      boost: this.boost,
      orbitSign: this.orbitSign,
      time: this.time,
      aboveSide: params.aboveSide,
      bodies: this.roster(),
    });
    const ease = 1 - Math.exp((orbitOn || this.boost > 0.15 ? -5.2 : -3.4) * dt);
    this.eyeX += ((eye[0] ?? 0) - this.eyeX) * ease;
    this.eyeY += ((eye[1] ?? 0) - this.eyeY) * ease;
    this.eyeZ += ((eye[2] ?? 0) - this.eyeZ) * ease;

    const bankTarget = orbitOn
      ? -this.orbitSign * (params.reducedMotion ? 0.06 : 0.16)
      : clamp(-stick.x, -1, 1) * (params.reducedMotion ? 0.05 : 0.14);
    this.bank += (bankTarget - this.bank) * (1 - Math.exp(-6 * dt));

    this.bgX = wrap01(this.bgX - dYaw * 0.12);
    this.bgY = wrap01(this.bgY + dPitch * 0.12);
    this.time += dt;

    const lagK = 1 - Math.exp(-12 * dt);
    this.yawLagRate += (dYaw / dt - this.yawLagRate) * lagK;
    this.pitchLagRate += (dPitch / dt - this.pitchLagRate) * lagK;

    let budget = starBudget(params.density, this.mobile);
    if (this.renderer.mode === "2d") budget = Math.min(budget, 2000);
    const active = Math.max(180, Math.round(budget * this.quality));
    if (active > this.live) {
      for (let i = this.live; i < active; i++) this.respawn(i, false);
    }
    this.live = active;
    this.integrateStars(dt, dYaw, dPitch);
    const rangeText = this.projectSystem(params);
    this.rememberTrail();
    const taskId = stepTasks(this.taskMem, {
      dt,
      speed: this.speed,
      autopilot: params.autopilot,
      earned: this.input.engaged && !params.autopilot,
      view: params.view,
      yaw: this.yaw,
      pitch: this.pitch,
      eyeX: this.eyeX,
      eyeY: this.eyeY,
      eyeZ: this.eyeZ,
      tan: this.tanFov,
      aspect: this.aspect,
      shipX: this.shipX,
      shipY: this.shipY,
      shipZ: this.shipZ,
      time: this.time,
      chapter: this.chapter,
      focus: params.focus,
      orbiting: orbitOn,
    });
    if (taskId) this.hooks.current.onTask(taskId, this.time);

    this.frames += 1;
    this.fps += (1 / dt - this.fps) * 0.08;
    if (this.frames > 40 && this.renderer.mode === "webgl") {
      if (dt > 0.022 && dt < 0.08) this.stress += dt > 0.03 ? 2 : 1;
      else this.stress = Math.max(0, this.stress - 1);
      if (this.stress > 36 && this.quality > 0.42) {
        this.quality = Math.max(0.42, this.quality - 0.08);
        this.stress = 0;
      }
    }

    this.audioAcc += dt;
    if (this.audioAcc > 0.12) {
      this.audioAcc = 0;
      this.audio.update(this.speed, this.boost, params.muted);
    }

    const warpText = warpFactor(this.speed).toFixed(2);
    const aimNow = this.aimStick(params.targetId);
    const aimErr = aimNow ? Math.hypot(aimNow.x, aimNow.y) : 1;
    const locked = aimErr < (params.focus ? 0.22 : 0.16);
    this.cueChanges(this.boost > 0.4 || autoBoost, orbitOn && !this.lapFor && params.orbit, locked);
    if (warpText !== this.lastWarp || this.frames % 2 === 0) {
      this.lastWarp = warpText;
      this.hooks.current.onFrame({
        warpText,
        stickX: this.stickX,
        stickY: this.stickY,
        pitch: this.pitch,
        leveling: this.leveling,
        boosting: this.boost > 0.35 || autoBoost,
        rangeText,
        speedText: Math.round(this.speed).toString(),
        targetId: params.targetId,
        nearId: this.nearId,
        chartId: this.chartId,
        engaged: this.input.engaged,
        alert: this.alert,
        markers: this.markers,
        plot: this.plot,
        locked,
        orbiting: orbitOn,
        captureText: this.captureText,
        shipX: this.shipX,
        shipZ: this.shipZ,
        sightId: this.input.gazing ? sighted(this.picks, this.aspect, (id) => bodyById(id).nav) : "",
        time: this.time,
        shipY: this.shipY,
      });
    }
  }

  private clearLap(skip: boolean): void {
    if (skip && this.lapFor) this.lapSkip = this.lapFor;
    this.lapFor = "";
    this.lapSwept = 0;
    this.lapArmed = false;
    this.lapConfirmed = false;
  }

  private nearestPass(maxFactor: number): BodyDef | null {
    let best: BodyDef | null = null;
    let bestScore = maxFactor;
    for (const body of this.roster()) {
      if (body.id === "sun" || body.quiet || body.speck || (!body.goal && !body.parent)) continue;
      const dist = this.rangeTo(body.id);
      const score = dist / holdRadius(body);
      if (score < bestScore) {
        bestScore = score;
        best = body;
      }
    }
    return best;
  }

  private aimStick(id: string, direct = false): { x: number; y: number } | null {
    const pos = direct ? bodyPosition(bodyById(id), this.time) : this.guidePoint(id);
    const cam = worldToCamera(pos.x - this.shipX, pos.y - this.shipY, pos.z - this.shipZ, this.yaw, this.pitch);
    if (cam.z < 1) return { x: cam.x >= 0 ? 0.85 : -0.85, y: clamp(-cam.y / 48, -0.55, 0.55) };
    return {
      x: clamp((cam.x / cam.z) * 1.7, -1, 1),
      y: clamp((-cam.y / cam.z) * 1.7, -1, 1),
    };
  }

  /** A point past whatever is blocking the line, so the ship goes around it instead of stopping on it. */
  private guidePoint(id: string): { x: number; y: number; z: number } {
    const goal = bodyPosition(bodyById(id), this.time);
    const sx = this.shipX;
    const sy = this.shipY;
    const sz = this.shipZ;
    const vx = goal.x - sx;
    const vy = goal.y - sy;
    const vz = goal.z - sz;
    const span = Math.hypot(vx, vy, vz) || 1;
    const ux = vx / span;
    const uy = vy / span;
    const uz = vz / span;
    let best: {
      x: number;
      y: number;
      z: number;
      along: number;
      pad: number;
      rank: number;
    } | null = null;
    for (const body of this.roster()) {
      if (body.quiet || body.id === id) continue;
      const pos = bodyPosition(body, this.time);
      const pad = skinRadius(body) * (body.id === "sun" ? 1.45 : 1.15) + (body.id === "sun" ? 16 : 4);
      const wx = pos.x - sx;
      const wy = pos.y - sy;
      const wz = pos.z - sz;
      const along = wx * ux + wy * uy + wz * uz;
      const lateral = Math.hypot(wx - ux * along, wy - uy * along, wz - uz * along);
      const dist = Math.hypot(wx, wy, wz);
      const stuck = dist < pad * 1.35 && along > -pad;
      const blocking = along > pad * 0.25 && along < span - 4 && lateral < pad;
      if (!stuck && !blocking) continue;
      const rank = stuck ? dist : along + 10000;
      if (!best || rank < best.rank) best = { x: pos.x, y: pos.y, z: pos.z, along, pad, rank };
    }
    if (!best) return goal;
    let ox = sx - best.x;
    let oy = sy - best.y;
    let oz = sz - best.z;
    const om = Math.hypot(ox, oy, oz);
    if (om < 0.4) {
      ox = -uz;
      oy = 0;
      oz = ux;
    } else {
      ox /= om;
      oy /= om;
      oz /= om;
    }
    const radial = ux * ox + uy * oy + uz * oz;
    let tx = ux - ox * radial;
    let ty = uy - oy * radial;
    let tz = uz - oz * radial;
    let tm = Math.hypot(tx, ty, tz);
    if (tm < 0.2) {
      tx = -oz;
      ty = 0;
      tz = ox;
      tm = Math.hypot(tx, ty, tz) || 1;
    }
    tx /= tm;
    ty /= tm;
    tz /= tm;
    const out = best.pad + 5;
    const around = best.pad + 18;
    return {
      x: best.x + ox * out + tx * around,
      y: best.y + oy * out + ty * around,
      z: best.z + oz * out + tz * around,
    };
  }

  /** Turn aside before a body that is not the one you chose. */
  private steerClear(dt: number, targetId: string): void {
    const forward = cameraForward(this.yaw, this.pitch);
    let yawNudge = 0;
    let pitchNudge = 0;
    for (const body of this.roster()) {
      if (body.quiet || body.id === targetId) continue;
      const pos = bodyPosition(body, this.time);
      const dx = pos.x - this.shipX;
      const dy = pos.y - this.shipY;
      const dz = pos.z - this.shipZ;
      const dist = Math.hypot(dx, dy, dz);
      const skin = skinRadius(body);
      const bubble = body.id === "sun" ? skin * 1.7 : skin * 1.25;
      if (dist >= bubble || dist < 0.05) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      const closing = forward.x * nx + forward.y * ny + forward.z * nz;
      if (closing < 0.05 && dist > skin * 1.1 && body.id !== "sun") continue;
      const urgency = clamp((bubble - dist) / (bubble - skin), 0, 1) * (body.id === "sun" ? 1 : Math.max(closing, 0.35));
      const gain = body.id === "sun" ? 2.4 : dist < skin * 1.08 ? 3.2 : 0.9;
      const side = nx * forward.z + nz * -forward.x;
      yawNudge += (side === 0 ? 1 : Math.sign(side)) * urgency * gain;
      pitchNudge += -ny * urgency * (body.id === "sun" ? 1.2 : 0.45);
    }
    this.yaw += clamp(yawNudge, -1.6, 1.6) * dt;
    if (!this.leveling) this.pitch = clamp(this.pitch + clamp(pitchNudge, -0.8, 0.8) * dt, -1.05, 1.05);
  }

  private rangeTo(id: string): number {
    const pos = bodyPosition(bodyById(id), this.time);
    return Math.hypot(pos.x - this.shipX, pos.y - this.shipY, pos.z - this.shipZ);
  }

  private projectSystem(params: StarfieldParams): string {
    const targetId = params.targetId;
    const aspect = this.aspect || 1;
    const tan = this.tanFov || 0.7;
    const cs = Math.cos(-this.bank);
    const sn = Math.sin(-this.bank);
    this.picks = [];
    const rows: {
      body: BodyDef;
      dist: number;
      camX: number;
      camZ: number;
      ndcX: number;
      ndcY: number;
      radX: number;
      radY: number;
      lx: number;
      ly: number;
      lz: number;
      style: number;
    }[] = [];
    let near = "";
    let chart = "";
    let rangeText = "—";
    const contacts: {
      id: string;
      name: string;
      wx: number;
      wz: number;
      orbit: number;
      target: boolean;
      close: boolean;
    }[] = [];
    for (const body of this.roster()) {
      const pos = bodyPosition(body, this.time);
      const dx = pos.x - this.shipX;
      const dy = pos.y - this.shipY;
      const dz = pos.z - this.shipZ;
      const dist = Math.hypot(dx, dy, dz);
      if (body.id === targetId) {
        rangeText = formatRange(dist, this.chapter);
        const flying = params.autopilot;
        const seconds = this.speed > 0.8 ? dist / this.speed : 0;
        if (flying && rangeText !== "Here" && seconds > 2 && seconds < 3600) {
          rangeText += seconds < 90 ? ` · ${Math.ceil(seconds)}s` : ` · ${Math.ceil(seconds / 60)}m`;
        }
        if (dist < surveyRadius(body)) {
          near = body.id;
          if (body.goal) chart = body.id;
        }
      }
      if (!body.quiet) {
        contacts.push({
          id: body.id,
          name: body.name,
          wx: pos.x,
          wz: pos.z,
          orbit: body.parent || body.id === "sun" ? 0 : Math.hypot(pos.x, pos.z),
          target: body.id === targetId,
          close: dist < skinRadius(body) * 2.6,
        });
      }
      const toSun = worldToCamera(-pos.x, -pos.y, -pos.z, this.yaw, this.pitch);
      let lx = toSun.x;
      let ly = toSun.y;
      let lz = -toSun.z;
      const lm = Math.hypot(lx, ly, lz) || 1;
      lx /= lm;
      ly /= lm;
      lz /= lm;
      const style =
        body.id === "jupiter"
          ? 1
          : body.id === "saturn"
            ? 1.25
            : body.id === "earth"
              ? 2
              : body.id === "uranus" || body.id === "neptune"
                ? 3
                : body.id === "mars"
                  ? 5
                  : body.parent && !body.speck
                    ? 4
                    : 0;
      const cam0 = worldToCamera(dx, dy, dz, this.yaw, this.pitch);
      const cam = { x: cam0.x - this.eyeX, y: cam0.y - this.eyeY, z: cam0.z - this.eyeZ };
      if (cam.z < 0.5) {
        rows.push({ body, dist, camX: cam.x, camZ: cam.z, ndcX: 0, ndcY: 0, radX: 0, radY: 0, lx, ly, lz, style });
        continue;
      }
      const floor = body.speck ? 0.0035 : body.id === "sun" ? 0.02 : 0.011;
      const radY = clamp(visualRadius(body) / cam.z / tan, floor, 1.35);
      if (!body.quiet) {
        const px = (cam.x / cam.z / tan / aspect) * cs - (cam.y / cam.z / tan) * sn;
        const py = (cam.x / cam.z / tan / aspect) * sn + (cam.y / cam.z / tan) * cs;
        this.picks.push({
          id: body.id,
          x: px * 0.5 + 0.5,
          y: 1 - (py * 0.5 + 0.5),
          rad: radY * 0.5,
        });
      }
      rows.push({
        body,
        dist,
        camX: cam.x,
        camZ: cam.z,
        ndcX: cam.x / cam.z / tan / aspect,
        ndcY: cam.y / cam.z / tan,
        radX: radY / aspect,
        radY,
        lx,
        ly,
        lz,
        style,
      });
    }
    this.chartId = chart;
    if (near) this.nearId = near;
    else if (this.nearId) {
      const held = bodyById(this.nearId);
      if (held.id !== targetId || this.rangeTo(held.id) > surveyRadius(held) * 1.35) this.nearId = "";
    }
    this.plot = plotSystem(contacts, this.shipX, this.shipZ, this.yaw, params.depots);
    rows.sort((a, b) => b.camZ - a.camZ);
    let count = 0;
    const push = (
      row: (typeof rows)[number],
      scaleX: number,
      scaleY: number,
      kind: number,
    ): void => {
      if (count >= 80 || row.camZ < 0.5) return;
      const o = count * 12;
      this.planetData[o] = row.ndcX;
      this.planetData[o + 1] = row.ndcY;
      this.planetData[o + 2] = row.radX * scaleX;
      this.planetData[o + 3] = row.radY * scaleY;
      this.planetData[o + 4] = row.body.color[0];
      this.planetData[o + 5] = row.body.color[1];
      this.planetData[o + 6] = row.body.color[2];
      this.planetData[o + 7] = kind;
      this.planetData[o + 8] = row.lx;
      this.planetData[o + 9] = row.ly;
      this.planetData[o + 10] = row.lz;
      this.planetData[o + 11] = row.style;
      count += 1;
    };
    const dimLast = (scale: number): void => {
      if (count < 1) return;
      const o = (count - 1) * 12;
      this.planetData[o + 4] = (this.planetData[o + 4] ?? 1) * scale;
      this.planetData[o + 5] = (this.planetData[o + 5] ?? 1) * scale;
      this.planetData[o + 6] = (this.planetData[o + 6] ?? 1) * scale;
    };
    const air: Record<string, [number, number, number]> = {
      venus: [0.95, 0.74, 0.42],
      earth: [0.42, 0.68, 0.95],
      mars: [0.86, 0.42, 0.3],
      titan: [0.92, 0.52, 0.26],
      jupiter: [0.9, 0.72, 0.5],
      saturn: [0.92, 0.82, 0.62],
      uranus: [0.62, 0.86, 0.9],
      neptune: [0.35, 0.52, 0.9],
    };
    for (const row of rows) {
      if (row.radY <= 0) continue;
      const form = row.body.form;
      if (row.body.id === "sun" || form === "star") {
        push(row, row.body.id === "sun" ? 3.7 : 2.8, row.body.id === "sun" ? 3.7 : 2.8, 0);
        push(row, 1, 1, 0.08);
        continue;
      }
      if (form === "galaxy") {
        push(row, 2.55, 0.58, 0);
        push(row, 0.36, 0.36, 0.08);
        continue;
      }
      if (form === "cluster" || form === "cloud") {
        push(row, form === "cloud" ? 1.65 : 2.15, form === "cloud" ? 1.65 : 2.15, 0);
        push(row, 0.42, 0.42, 0.08);
        continue;
      }
      if (row.body.id === "halley") push(row, 2.6, 2.6, 0);
      if (row.body.id === "saturn") push(row, 2.35, 0.46, 2);
      if (row.body.id === "jupiter") {
        push(row, 1.62, 0.2, 2.3);
        dimLast(0.55);
      }
      if (row.body.id === "uranus") {
        push(row, 1.48, 0.16, 2.6);
        dimLast(0.45);
      }
      const tint = air[row.body.id];
      if (tint) {
        push(row, 1.2, 1.2, 0.28);
        const o = (count - 1) * 12;
        this.planetData[o + 4] = tint[0];
        this.planetData[o + 5] = tint[1];
        this.planetData[o + 6] = tint[2];
      }
      if (row.body.id !== "sun") push(row, 1, 1, 1);
    }
    this.planetCount = count;

    this.markers.length = 0;
    const labeled = rows.filter(
      (row) =>
        !row.body.quiet &&
        (row.body.id === targetId || (row.camZ > 0.5 && (row.radY > 0.02 || row.dist < 540))),
    );
    for (const row of labeled) {
      if (this.markers.length > 5 && row.body.id !== targetId) continue;
      const x1 = row.ndcX * cs - row.ndcY * sn;
      const y1 = row.ndcX * sn + row.ndcY * cs;
      const behind = row.camZ < 0.5;
      const x = behind ? 0.5 + Math.sign(row.camX || 1) * 0.4 : x1 * 0.5 + 0.5;
      const y = behind ? 0.46 : 1 - (y1 * 0.5 + 0.5);
      const primary = row.body.id === targetId;
      if (!primary && (behind || x < 0 || x > 1 || y < 0.02 || y > 0.92)) continue;
      const halo =
        row.body.id === "sun" || row.body.form === "star"
          ? 3.6
          : row.body.form === "galaxy"
            ? 1.5
            : row.body.form === "cloud" || row.body.form === "cluster"
              ? 2.1
              : row.body.id === "halley"
                ? 2.6
                : 1.22;
      const lift = behind ? 0 : Math.min(Math.max(row.radY, 0) * 0.5 * halo, 0.48);
      this.markers.push({
        id: row.body.id,
        name: behind ? `${row.body.name} · behind` : row.body.name,
        x: clamp(x, 0.06, 0.94),
        y: clamp(y - lift, 0.05, 0.72),
        primary,
      });
    }
    const kept: FrameMarker[] = [];
    const ordered = [...this.markers].sort((a, b) => Number(b.primary) - Number(a.primary));
    for (const marker of ordered) {
      const crowded =
        !marker.primary &&
        kept.some((other) => Math.hypot(other.x - marker.x, other.y - marker.y) < 0.035);
      if (crowded) continue;
      kept.push(marker);
    }
    this.markers.length = 0;
    this.markers.push(...kept);
    return rangeText;
  }

  private tryFocus(clientX: number, clientY: number): void {
    const marker = document.elementFromPoint(clientX, clientY);
    const named = marker instanceof Element ? marker.closest(".marker") : null;
    const namedId = named instanceof HTMLElement ? named.dataset.id : "";
    if (namedId) {
      this.input.armFocus(clientX, clientY);
      this.hooks.current.onFocus(namedId);
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    let bestId = "";
    let best = Infinity;
    for (const pick of this.picks) {
      const dx = (pick.x - (clientX - rect.left) / rect.width) * rect.width;
      const dy = (pick.y - (clientY - rect.top) / rect.height) * rect.height;
      const dist = Math.hypot(dx, dy);
      const size = Math.max(pick.rad * rect.height, 18);
      if (dist > size * 1.05) continue;
      const score = dist / size;
      if (score < best) {
        best = score;
        bestId = pick.id;
      }
    }
    if (!bestId) return;
    this.input.armFocus(clientX, clientY);
    this.hooks.current.onFocus(bestId);
  }

  private closingOn(id: string): boolean {
    const pos = bodyPosition(bodyById(id), this.time);
    const dx = pos.x - this.shipX;
    const dy = pos.y - this.shipY;
    const dz = pos.z - this.shipZ;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const nose = cameraForward(this.yaw, this.pitch);
    return (nose.x * dx + nose.y * dy + nose.z * dz) / dist > 0.55;
  }

  /** Chosen orbit, pushed outside any moon ring or parent that the circle would cross. */
  private clearOrbitRadius(body: BodyDef, level: number): number {
    let want = orbitLevelRadius(body, level);
    const rings: { ring: number; pad: number }[] = [];
    for (const other of this.roster()) {
      if (other.id === body.id || other.quiet) continue;
      if (other.parent === body.id) rings.push({ ring: other.localR ?? 30, pad: skinRadius(other) + 5.5 });
      else if (body.parent && other.id === body.parent) rings.push({ ring: body.localR ?? 30, pad: skinRadius(other) + 7 });
    }
    for (let pass = 0; pass < 6; pass++) {
      let bumped = false;
      for (const item of rings) {
        if (Math.abs(want - item.ring) < item.pad) {
          want = item.ring + item.pad;
          bumped = true;
        }
      }
      if (!bumped) break;
    }
    return want;
  }

  private keepOutside(): void {
    for (const body of this.roster()) {
      const pos = bodyPosition(body, this.time);
      const dx = this.shipX - pos.x;
      const dy = this.shipY - pos.y;
      const dz = this.shipZ - pos.z;
      const dist = Math.hypot(dx, dy, dz);
      const skin = skinRadius(body);
      if (dist >= skin || dist < 0.001) continue;
      const scale = skin / dist;
      this.shipX = pos.x + dx * scale;
      this.shipY = clamp(pos.y + dy * scale, -90, 90);
      this.shipZ = pos.z + dz * scale;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      const inward = this.velX * nx + this.velY * ny + this.velZ * nz;
      if (inward < 0) {
        this.velX -= nx * inward;
        this.velY -= ny * inward;
        this.velZ -= nz * inward;
      }
    }
  }

  private flyCapture(dt: number, body: BodyDef, throttle: number, reduced: boolean): boolean {
    const pos = bodyPosition(body, this.time);
    const rx = this.shipX - pos.x;
    const ry = this.shipY - pos.y;
    const rz = this.shipZ - pos.z;
    const dist = Math.hypot(rx, ry, rz) || 1;
    const nx = rx / dist;
    const ny = ry / dist;
    const nz = rz / dist;
    const well = captureWell(body);
    if (!this.insertSeeded) {
      const facing = cameraForward(this.yaw, this.pitch);
      const inbound = facing.x * nx + facing.y * ny + facing.z * nz;
      let dx = facing.x;
      let dy = facing.y;
      let dz = facing.z;
      if (inbound < -0.25) {
        const tangent = orbitTangent(rx, ry, rz);
        dx = tangent.x;
        dy = tangent.y;
        dz = tangent.z;
        this.pitch = Math.asin(clamp(dy, -1, 1));
        const cp = Math.cos(this.pitch) || 1;
        this.yaw = Math.atan2(-dx / cp, dz / cp);
        this.orbitSign = 1;
      }
      this.velX = dx * this.speed;
      this.velY = dy * this.speed;
      this.velZ = dz * this.speed;
      this.insertSeeded = true;
    }
    const g = well.gm / (dist * dist);
    this.velX -= nx * g * dt;
    this.velY -= ny * g * dt;
    this.velZ -= nz * g * dt;
    const nose = cameraForward(this.yaw, this.pitch);
    const along = this.velX * nose.x + this.velY * nose.y + this.velZ * nose.z;
    const cruise = 4 + clamp(throttle, 0, 1) * (reduced ? 22 : 46);
    const thrust = clamp(cruise - along, -22, 24);
    this.velX += nose.x * thrust * dt;
    this.velY += nose.y * thrust * dt;
    this.velZ += nose.z * thrust * dt;
    this.shipX += this.velX * dt;
    this.shipY = clamp(this.shipY + this.velY * dt, -90, 90);
    this.shipZ += this.velZ * dt;
    this.speed = Math.hypot(this.velX, this.velY, this.velZ);

    const vRad = this.velX * nx + this.velY * ny + this.velZ * nz;
    const vTan = Math.hypot(this.velX - nx * vRad, this.velY - ny * vRad, this.velZ - nz * vRad);
    const vCirc = Math.sqrt(well.gm / Math.max(dist, 1));
    const band = captureBand(dist, well);
    const label = band === "low" ? "Low" : band === "mid" ? "Mid" : band === "high" ? "High" : "Edge";
    const tol = reduced ? 0.28 : 0.16;
    const speedErr = (vTan - vCirc) / Math.max(vCirc, 0.001);
    const escape = Math.sqrt((2 * well.gm) / dist);
    const drop = (message: string) => {
      this.captureText = "";
      this.alert = message;
      this.alertUntil = this.time + 3.4;
      this.inserting = false;
      this.insertSeeded = false;
      this.captureHold = 0;
      this.captureAbort = body.id;
      this.hooks.current.onCancelOrbit();
    };
    if (dist < well.floor) {
      this.shipX += nx * 8;
      this.shipZ += nz * 8;
      this.velX = nx * 16;
      this.velY = 0;
      this.velZ = nz * 16;
      this.speed = 16;
      drop("Too low. Burning in.");
      return true;
    }
    if (dist > well.soi || (band === "edge" && vTan > escape)) {
      drop("Too fast. Skipped the capture.");
      return true;
    }
    if (band !== "edge" && Math.abs(speedErr) < tol && Math.abs(vRad) < vCirc * 0.3) {
      this.captureHold += dt;
      this.captureText = `${label} · hold`;
      if (this.captureHold > (reduced ? 0.55 : 1.15)) {
        this.inserting = false;
        this.insertSeeded = false;
        this.captureRadius = dist;
        this.captureText = `${label} orbit`;
        this.captureHold = 0;
        this.orbitId = "";
      }
    } else {
      this.captureHold = Math.max(0, this.captureHold - dt * 0.35);
      const note =
        vRad < -vCirc * 0.3 ? "falling" : vRad > vCirc * 0.3 ? "climbing" : speedErr > 0 ? "fast" : "slow";
      this.captureText = `${label} · ${note}`;
    }
    return true;
  }

  private integrateStars(dt: number, dYaw: number, dPitch: number): void {
    const cy = Math.cos(dYaw);
    const sy = Math.sin(dYaw);
    const cp = Math.cos(dPitch);
    const sp = Math.sin(dPitch);
    const advance = this.speed * dt;
    const data = this.data;
    const tan = this.tanFov;
    const aspect = this.aspect;
    const n = this.live;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const x = data[o] ?? 0;
      const y = data[o + 1] ?? 0;
      const z = data[o + 2] ?? 1;
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp - advance;
      const lim = z2 * tan * 4.2 + 12;
      if (z2 < NEAR || z2 > FAR || Math.abs(x1) > lim * aspect || Math.abs(y2) > lim) {
        this.respawn(i, true);
      } else {
        data[o] = x1;
        data[o + 1] = y2;
        data[o + 2] = z2;
      }
    }
  }

  private rememberTrail(): void {
    const last = this.trail[this.trail.length - 1];
    const moved = last
      ? Math.hypot(this.shipX - last.x, this.shipY - last.y, this.shipZ - last.z)
      : 99;
    if (moved < 7) return;
    this.trail.push({ x: this.shipX, y: this.shipY, z: this.shipZ });
    if (this.trail.length > 90) this.trail.shift();
  }

}
