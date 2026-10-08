/** Draws what the engine simulated: WebGL2 when it can, a 2D canvas when it can't. */

import { FAR, NEAR } from "./math.ts";
import { worldToCamera } from "./system.ts";
import { link } from "./gl.ts";
import { SHIP_DATA, SHIP_STRIDE, SHIP_VERTS } from "./ship-mesh.ts";
import BG_VS from "./shaders/background.vert.glsl?raw";
import BG_FS from "./shaders/background.frag.glsl?raw";
import STAR_VS from "./shaders/stars.vert.glsl?raw";
import STAR_FS from "./shaders/stars.frag.glsl?raw";
import PLANET_VS from "./shaders/planet.vert.glsl?raw";
import PLANET_FS from "./shaders/planet.frag.glsl?raw";
import SHIP_VS from "./shaders/ship.vert.glsl?raw";
import SHIP_FS from "./shaders/ship.frag.glsl?raw";
import TRAIL_VS from "./shaders/trail.vert.glsl?raw";
import TRAIL_FS from "./shaders/trail.frag.glsl?raw";

/** Everything the renderer reads from the simulation for one frame. */
export type RenderFrame = {
  /** Star instances, four floats each: camera-space x, y, z, and brightness plus colour. */
  stars: Float32Array;
  live: number;
  /** Planet instances, twelve floats each, as the engine projected them. */
  planets: Float32Array;
  planetCount: number;
  trail: readonly { x: number; y: number; z: number }[];
  shipX: number;
  shipY: number;
  shipZ: number;
  yaw: number;
  pitch: number;
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  bgX: number;
  bgY: number;
  bank: number;
  rush: number;
  boost: number;
  speed: number;
  time: number;
  tanFov: number;
  aspect: number;
  yawLagRate: number;
  pitchLagRate: number;
  reduced: boolean;
};

export class StarfieldRenderer {
  mode: "webgl" | "2d" | "none" = "none";
  /** Star budget the device starts at: lower on software GPUs and the 2D fallback. */
  quality = 1;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private bg: WebGLProgram | null = null;
  private stars: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private bgLocs: Record<string, WebGLUniformLocation | null> = {};
  private starLocs: Record<string, WebGLUniformLocation | null> = {};
  private planets: WebGLProgram | null = null;
  private planetVao: WebGLVertexArrayObject | null = null;
  private planetBuf: WebGLBuffer | null = null;
  private planetLocs: Record<string, WebGLUniformLocation | null> = {};
  private shipProg: WebGLProgram | null = null;
  private shipVao: WebGLVertexArrayObject | null = null;
  private shipBuf: WebGLBuffer | null = null;
  private shipLocs: Record<string, WebGLUniformLocation | null> = {};
  private trailProg: WebGLProgram | null = null;
  private trailVao: WebGLVertexArrayObject | null = null;
  private trailBuf: WebGLBuffer | null = null;
  private readonly trailDraw = new Float32Array(96 * 3);
  private reported = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onError: (message: string) => void,
  ) {}

  destroy(): void {
    const gl = this.gl;
    if (gl) {
      if (this.bg) gl.deleteProgram(this.bg);
      if (this.stars) gl.deleteProgram(this.stars);
      if (this.buf) gl.deleteBuffer(this.buf);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.planets) gl.deleteProgram(this.planets);
      if (this.planetBuf) gl.deleteBuffer(this.planetBuf);
      if (this.planetVao) gl.deleteVertexArray(this.planetVao);
      if (this.shipProg) gl.deleteProgram(this.shipProg);
      if (this.shipBuf) gl.deleteBuffer(this.shipBuf);
      if (this.shipVao) gl.deleteVertexArray(this.shipVao);
      if (this.trailProg) gl.deleteProgram(this.trailProg);
      if (this.trailBuf) gl.deleteBuffer(this.trailBuf);
      if (this.trailVao) gl.deleteVertexArray(this.trailVao);
    }
    this.gl = null;
  }

  /** WebGL2 first, then a 2D canvas; reports through onError if neither works. */
  init(stars: Float32Array, planets: Float32Array, signal: AbortSignal): void {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
    if (gl) {
      try {
        this.gl = gl;
        this.bg = link(gl, BG_VS, BG_FS);
        this.stars = link(gl, STAR_VS, STAR_FS);
        for (const name of ["uRes", "uBg", "uRoll", "uBoost", "uAspect"]) {
          this.bgLocs[name] = gl.getUniformLocation(this.bg, name);
        }
        for (const name of [
          "uFovTan",
          "uAspect",
          "uStretch",
          "uYawLag",
          "uPitchLag",
          "uRoll",
          "uPixel",
          "uWidth",
          "uNear",
          "uFar",
          "uBoost",
          "uGain",
          "uTwinkle",
          "uTime",
        ]) {
          this.starLocs[name] = gl.getUniformLocation(this.stars, name);
        }
        this.vao = gl.createVertexArray();
        this.buf = gl.createBuffer();
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferData(gl.ARRAY_BUFFER, stars.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.bindVertexArray(null);
        this.initPlanets(gl, planets);
        this.initShip(gl);
        this.initTrail(gl);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        if (dbg) {
          const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "");
          if (/swiftshader|llvmpipe|software/i.test(renderer)) this.quality = 0.45;
        }
        this.mode = "webgl";
        this.canvas.addEventListener(
          "webglcontextlost",
          (event) => {
            event.preventDefault();
            this.fail("The picture stalled. Refresh to draw again.");
          },
          { signal },
        );
        return;
      } catch (err) {
        this.fail(err instanceof Error ? err.message : "WebGL failed to start.");
      }
    }
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (ctx) {
      this.ctx2d = ctx;
      this.mode = "2d";
      this.quality = 0.55;
      return;
    }
    this.fail("This browser cannot draw the starfield.");
  }

  private initPlanets(gl: WebGL2RenderingContext, planets: Float32Array): void {
    try {
      this.planets = link(gl, PLANET_VS, PLANET_FS);
      this.planetLocs.uRoll = gl.getUniformLocation(this.planets, "uRoll");
      this.planetLocs.uTime = gl.getUniformLocation(this.planets, "uTime");
      this.planetVao = gl.createVertexArray();
      this.planetBuf = gl.createBuffer();
      gl.bindVertexArray(this.planetVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.planetBuf);
      gl.bufferData(gl.ARRAY_BUFFER, planets.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 48, 0);
      gl.vertexAttribDivisor(0, 1);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 48, 16);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 48, 32);
      gl.vertexAttribDivisor(2, 1);
      gl.bindVertexArray(null);
    } catch (err) {
      this.planets = null;
      console.error(err instanceof Error ? err.message : "planet shader failed");
    }
  }

  private initShip(gl: WebGL2RenderingContext): void {
    try {
      this.shipProg = link(gl, SHIP_VS, SHIP_FS);
      for (const name of ["uEye", "uFovTan", "uAspect", "uRoll", "uBoost"]) {
        this.shipLocs[name] = gl.getUniformLocation(this.shipProg, name);
      }
      this.shipVao = gl.createVertexArray();
      this.shipBuf = gl.createBuffer();
      gl.bindVertexArray(this.shipVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shipBuf);
      gl.bufferData(gl.ARRAY_BUFFER, SHIP_DATA, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, SHIP_STRIDE * 4, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, SHIP_STRIDE * 4, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, SHIP_STRIDE * 4, 24);
      gl.bindVertexArray(null);
    } catch (err) {
      this.shipProg = null;
      console.error(err instanceof Error ? err.message : "ship shader failed");
    }
  }

  private initTrail(gl: WebGL2RenderingContext): void {
    try {
      this.trailProg = link(gl, TRAIL_VS, TRAIL_FS);
      this.trailVao = gl.createVertexArray();
      this.trailBuf = gl.createBuffer();
      gl.bindVertexArray(this.trailVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.trailDraw.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      gl.bindVertexArray(null);
    } catch (err) {
      this.trailProg = null;
      console.error(err instanceof Error ? err.message : "trail shader failed");
    }
  }

  private fail(message: string): void {
    if (this.reported) return;
    this.reported = true;
    this.mode = "none";
    this.onError(message);
  }

  draw(frame: RenderFrame): void {
    if (this.mode === "webgl") this.drawGL(frame);
    else if (this.mode === "2d") this.draw2D(frame);
  }

  private drawGL(frame: RenderFrame): void {
    const gl = this.gl;
    const bg = this.bg;
    const stars = this.stars;
    if (!gl || !bg || !stars || !this.vao || !this.buf) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    gl.viewport(0, 0, w, h);

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.useProgram(bg);
    gl.uniform2f(this.bgLocs.uRes ?? null, w, h);
    gl.uniform2f(this.bgLocs.uBg ?? null, frame.bgX, frame.bgY);
    gl.uniform1f(this.bgLocs.uRoll ?? null, -frame.bank);
    gl.uniform1f(this.bgLocs.uBoost ?? null, frame.rush);
    gl.uniform1f(this.bgLocs.uAspect ?? null, frame.aspect);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, frame.stars);

    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(stars);

    const reduced = frame.reduced;
    const streakTime = (0.058 + frame.boost * 0.09) * (reduced ? 0.35 : 1);
    const stretch = Math.min(frame.speed * streakTime, 26);
    const twinkle = Math.max(0, 1 - frame.speed / 34) * (reduced ? 0 : 1);
    const pixel = 2 / Math.max(1, h);

    const setCommon = (): void => {
      gl.uniform1f(this.starLocs.uFovTan ?? null, frame.tanFov);
      gl.uniform1f(this.starLocs.uAspect ?? null, frame.aspect);
      gl.uniform1f(this.starLocs.uYawLag ?? null, frame.yawLagRate * streakTime);
      gl.uniform1f(this.starLocs.uPitchLag ?? null, frame.pitchLagRate * streakTime);
      gl.uniform1f(this.starLocs.uRoll ?? null, -frame.bank);
      gl.uniform1f(this.starLocs.uPixel ?? null, pixel);
      gl.uniform1f(this.starLocs.uNear ?? null, NEAR);
      gl.uniform1f(this.starLocs.uFar ?? null, FAR);
      gl.uniform1f(this.starLocs.uBoost ?? null, frame.rush);
      gl.uniform1f(this.starLocs.uTwinkle ?? null, twinkle);
      gl.uniform1f(this.starLocs.uTime ?? null, frame.time);
    };
    setCommon();
    gl.uniform1f(this.starLocs.uStretch ?? null, stretch * 1.85);
    gl.uniform1f(this.starLocs.uWidth ?? null, 2.15);
    gl.uniform1f(this.starLocs.uGain ?? null, 0.26);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, frame.live);

    gl.uniform1f(this.starLocs.uStretch ?? null, stretch);
    gl.uniform1f(this.starLocs.uWidth ?? null, 1);
    gl.uniform1f(this.starLocs.uGain ?? null, 0.95);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, frame.live);
    this.drawPlanets(gl, frame);
    this.drawTrail(gl, frame);
    this.drawShip(gl, frame);
  }

  private drawTrail(gl: WebGL2RenderingContext, frame: RenderFrame): void {
    if (!this.trailProg || !this.trailVao || !this.trailBuf || frame.trail.length < 2) return;
    const tan = frame.tanFov || 0.7;
    const aspect = frame.aspect || 1;
    const cs = Math.cos(-frame.bank);
    const sn = Math.sin(-frame.bank);
    let count = 0;
    const flush = (): void => {
      if (count < 2 || !this.trailProg || !this.trailVao || !this.trailBuf) {
        count = 0;
        return;
      }
      gl.useProgram(this.trailProg);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.trailVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.trailDraw.subarray(0, count * 3));
      gl.drawArrays(gl.LINE_STRIP, 0, count);
      count = 0;
    };
    const n = frame.trail.length;
    for (let i = 0; i < n; i++) {
      const point = frame.trail[i];
      if (!point) continue;
      const cam0 = worldToCamera(
        point.x - frame.shipX,
        point.y - frame.shipY,
        point.z - frame.shipZ,
        frame.yaw,
        frame.pitch,
      );
      const z = cam0.z - frame.eyeZ;
      if (z < 0.8) {
        flush();
        continue;
      }
      const ndcX = (cam0.x - frame.eyeX) / z / tan / aspect;
      const ndcY = (cam0.y - frame.eyeY) / z / tan;
      const x = ndcX * cs - ndcY * sn;
      const y = ndcX * sn + ndcY * cs;
      if (count > 0) {
        const px = this.trailDraw[(count - 1) * 3] ?? 0;
        const py = this.trailDraw[(count - 1) * 3 + 1] ?? 0;
        if (Math.hypot(x - px, y - py) > 0.85) flush();
      }
      if (count >= 90) flush();
      const o = count * 3;
      this.trailDraw[o] = x;
      this.trailDraw[o + 1] = y;
      this.trailDraw[o + 2] = ((i + 1) / n) * 0.55;
      count += 1;
    }
    flush();
    gl.bindVertexArray(null);
  }

  private drawShip(gl: WebGL2RenderingContext, frame: RenderFrame): void {
    if (!this.shipProg || !this.shipVao || frame.eyeZ > -3) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.shipProg);
    gl.uniform3f(this.shipLocs.uEye ?? null, frame.eyeX, frame.eyeY, frame.eyeZ);
    gl.uniform1f(this.shipLocs.uFovTan ?? null, frame.tanFov);
    gl.uniform1f(this.shipLocs.uAspect ?? null, frame.aspect);
    gl.uniform1f(this.shipLocs.uRoll ?? null, -frame.bank);
    gl.uniform1f(this.shipLocs.uBoost ?? null, frame.boost);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.bindVertexArray(this.shipVao);
    gl.drawArrays(gl.TRIANGLES, 0, SHIP_VERTS);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  private drawPlanets(gl: WebGL2RenderingContext, frame: RenderFrame): void {
    if (!this.planets || !this.planetVao || !this.planetBuf || frame.planetCount < 1) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.planets);
    gl.uniform1f(this.planetLocs.uRoll ?? null, -frame.bank);
    const reduced = frame.reduced;
    gl.uniform1f(this.planetLocs.uTime ?? null, frame.time * (reduced ? 0.2 : 1));
    gl.bindVertexArray(this.planetVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.planetBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, frame.planets.subarray(0, frame.planetCount * 12));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, frame.planetCount);
    gl.bindVertexArray(null);
  }

  private draw2D(frame: RenderFrame): void {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "#07080b";
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const f = h * 0.5 / frame.tanFov;
    const roll = -frame.bank;
    const cs = Math.cos(roll);
    const sn = Math.sin(roll);
    const reduced = frame.reduced;
    const streakTime = (0.058 + frame.boost * 0.09) * (reduced ? 0.35 : 1);
    const stretch = Math.min(frame.speed * streakTime, 26);
    const yawLag = frame.yawLagRate * streakTime;
    const pitchLag = frame.pitchLagRate * streakTime;
    const rot = (px: number, py: number): [number, number] => {
      const dx = px - cx;
      const dy = py - cy;
      return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
    };
    ctx.lineCap = "round";
    const data = frame.stars;
    for (let i = 0; i < frame.live; i++) {
      const o = i * 4;
      const x = data[o] ?? 0;
      const y = data[o + 1] ?? 0;
      const z = data[o + 2] ?? 1;
      if (z < NEAR) continue;
      const packed = data[o + 3] ?? 0.5;
      const colorId = Math.floor(packed / 4 + 0.001);
      const bright = packed - colorId * 4;
      const hx = cx + (x / z) * f;
      const hy = cy - (y / z) * f;
      const pz = z + stretch * (0.62 + bright * 0.7);
      const tx = cx + ((x - z * yawLag) / pz) * f;
      const ty = cy - ((y + z * pitchLag) / pz) * f;
      const [x0, y0] = rot(tx, ty);
      const [x1, y1] = rot(hx, hy);
      const alpha = Math.min(0.9, 0.15 + bright * 0.65);
      ctx.strokeStyle =
        colorId < 0.5
          ? `rgba(168, 198, 255, ${alpha})`
          : colorId < 1.5
            ? `rgba(236, 240, 248, ${alpha})`
            : colorId < 2.5
              ? `rgba(255, 228, 190, ${alpha})`
              : colorId < 3.5
                ? `rgba(120, 168, 255, ${alpha})`
                : colorId < 4.5
                  ? `rgba(255, 148, 72, ${alpha})`
                  : `rgba(255, 96, 72, ${alpha})`;
      ctx.lineWidth = 1 + bright * 1.4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    for (let i = 0; i < frame.planetCount; i++) {
      const o = i * 12;
      const ndcX = frame.planets[o] ?? 0;
      const ndcY = frame.planets[o + 1] ?? 0;
      const rx = frame.planets[o + 2] ?? 0;
      const ry = frame.planets[o + 3] ?? 0;
      const red = Math.round((frame.planets[o + 4] ?? 1) * 255);
      const green = Math.round((frame.planets[o + 5] ?? 1) * 255);
      const blue = Math.round((frame.planets[o + 6] ?? 1) * 255);
      const kind = frame.planets[o + 7] ?? 1;
      const px = (ndcX * cs - ndcY * sn) * 0.5 + 0.5;
      const py = 1 - ((ndcX * sn + ndcY * cs) * 0.5 + 0.5);
      const radius = Math.max(2, ry * h * 0.5);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${kind < 0.5 ? 0.55 : 0.95})`;
      ctx.ellipse(px * w, py * h, Math.max(2, rx * w * 0.5), radius, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (frame.eyeZ < -3) this.drawShip2D(ctx, w, h, cs, sn, f, frame);
  }

  private drawShip2D(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cs: number,
    sn: number,
    f: number,
    frame: RenderFrame,
  ): void {
    const project = (x: number, y: number, z: number): [number, number, number] | null => {
      const cz = z - frame.eyeZ;
      if (cz < 0.4) return null;
      const cx = (x - frame.eyeX) / cz;
      const cy = (y - frame.eyeY) / cz;
      const px = w * 0.5 + cx * f;
      const py = h * 0.5 - cy * f;
      const dx = px - w * 0.5;
      const dy = py - h * 0.5;
      return [w * 0.5 + dx * cs - dy * sn, h * 0.5 + dx * sn + dy * cs, cz];
    };
    const faces: { z: number; pts: [number, number, number][]; color: string }[] = [];
    for (let i = 0; i < SHIP_VERTS; i += 3) {
      const at = (n: number) => {
        const o = (i + n) * SHIP_STRIDE;
        return project(SHIP_DATA[o] ?? 0, SHIP_DATA[o + 1] ?? 0, SHIP_DATA[o + 2] ?? 0);
      };
      const a = at(0);
      const b = at(1);
      const c = at(2);
      if (!a || !b || !c) continue;
      const o = i * SHIP_STRIDE;
      const glow = SHIP_DATA[o + 6] ?? 0;
      const lift = glow * (0.4 + frame.boost);
      const red = Math.min(255, Math.round(((SHIP_DATA[o + 3] ?? 1) + 0.4 * lift) * 255));
      const green = Math.min(255, Math.round(((SHIP_DATA[o + 4] ?? 1) + 0.58 * lift) * 255));
      const blue = Math.min(255, Math.round(((SHIP_DATA[o + 5] ?? 1) + 0.95 * lift) * 255));
      faces.push({
        z: (a[2] + b[2] + c[2]) / 3,
        pts: [a, b, c],
        color: `rgb(${red}, ${green}, ${blue})`,
      });
    }
    faces.sort((p, q) => q.z - p.z);
    for (const face of faces) {
      ctx.fillStyle = face.color;
      ctx.beginPath();
      ctx.moveTo(face.pts[0][0], face.pts[0][1]);
      ctx.lineTo(face.pts[1][0], face.pts[1][1]);
      ctx.lineTo(face.pts[2][0], face.pts[2][1]);
      ctx.closePath();
      ctx.fill();
    }
  }
}
