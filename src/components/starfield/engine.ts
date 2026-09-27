import { DriftAudio } from "@/components/starfield/audio";
import {
  FAR,
  MAX_STARS,
  NEAR,
  clamp,
  cruiseSpeed,
  starBudget,
  warpFactor,
} from "@/components/starfield/math";
import {
  BODIES,
  EARTH_ORBIT,
  type BodyDef,
  bodyById,
  bodyPosition,
  cameraForward,
  surveyRadius,
  visualRadius,
  worldToCamera,
} from "@/components/starfield/system";
import { createTaskState, stepTasks, type TaskMemory } from "@/components/starfield/tasks";

/**
 * Camera space: +X right, +Y up, +Z forward (into the starfield).
 * +yaw looks left (stars slide right). +pitch looks up (stars slide down).
 * Stick +X is right, stick +Y is down. KeyA is stick −X so yaw increases.
 */

export type CameraView = "cockpit" | "chase" | "wing";

export type StarfieldParams = {
  speed: number;
  density: number;
  boost: boolean;
  muted: boolean;
  reducedMotion: boolean;
  targetId: string;
  autopilot: boolean;
  orbit: boolean;
  view: CameraView;
};

export type FrameMarker = {
  id: string;
  name: string;
  x: number;
  y: number;
  primary: boolean;
};

export type StarfieldHooks = {
  getParams: () => StarfieldParams;
  onSpeed: (next: number) => void;
  onToggleBoost: () => void;
  onFrame: (snap: {
    warpText: string;
    stickX: number;
    stickY: number;
    pitch: number;
    leveling: boolean;
    boosting: boolean;
    rangeText: string;
    targetId: string;
    nearId: string;
    alert: string;
    markers: FrameMarker[];
    locked: boolean;
    orbiting: boolean;
  }) => void;
  onError: (message: string) => void;
  onCancelAutopilot: () => void;
  onCancelOrbit: () => void;
  onToggleOrbit: () => void;
  onBeginLap: (id: string) => void;
  onEndLap: () => void;
  onTask: (id: string, seconds: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setSteer?: (v: number) => void;
      setKeys?: (codes: string[]) => void;
      getPitch?: () => number;
      getFps?: () => number;
    };
  }
}

const BG_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const BG_FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uBg;
uniform float uRoll;
uniform float uBoost;
uniform float uAspect;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float dust(vec2 uv, vec2 shift, vec2 scale, float cutoff) {
  vec2 grid = uv * scale + shift;
  vec2 cell = floor(grid);
  vec2 f = fract(grid);
  float h = hash21(cell);
  vec2 star = vec2(hash21(cell + vec2(1.7)), hash21(cell + vec2(8.2)));
  float d = length(f - star);
  float core = smoothstep(0.045, 0.0, d);
  return step(cutoff, h) * core * (0.35 + 0.65 * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  uv.x *= uAspect;
  float cs = cos(uRoll);
  float sn = sin(uRoll);
  uv = vec2(cs * uv.x - sn * uv.y, sn * uv.x + cs * uv.y);

  vec2 sampleUv = uv + vec2(uBg.x * 6.0, uBg.y * 6.0);
  vec3 col = vec3(0.027, 0.031, 0.043);
  float laneAcross = sampleUv.y + 0.22 * sin(sampleUv.x * 0.42);
  float lane = exp(-laneAcross * laneAcross * 1.35);
  float core = exp(-laneAcross * laneAcross * 6.5);
  float rift = smoothstep(0.015, 0.16, abs(laneAcross + 0.04 * sin(sampleUv.x * 1.6)));
  vec3 milk = vec3(0.11, 0.09, 0.14) * lane + vec3(0.16, 0.11, 0.07) * core;
  col += milk * mix(0.55, 1.0, rift);
  col += vec3(0.02, 0.025, 0.038) * exp(-dot(uv, uv) * 0.35);

  col += vec3(0.62, 0.72, 0.9) * dust(sampleUv, vec2(0.0, 0.0), vec2(70.0, 52.0), 0.985) * 0.55;
  col += vec3(0.78, 0.82, 0.9) * dust(sampleUv, uBg * 2.0, vec2(130.0, 100.0), 0.992) * 0.4;

  float r = length(uv);
  col *= mix(0.62, 1.0, smoothstep(1.35, 0.25, r));
  col += vec3(0.16, 0.2, 0.26) * uBoost * smoothstep(0.55, 1.45, r) * 0.22;

  float n = hash21(gl_FragCoord.xy + fract(uBg.x * 50.0));
  col += (n - 0.5) * 0.01;
  fragColor = vec4(col, 1.0);
}
`;

const STAR_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aStar;
uniform float uFovTan;
uniform float uAspect;
uniform float uStretch;
uniform float uYawLag;
uniform float uPitchLag;
uniform float uRoll;
uniform float uPixel;
uniform float uWidth;
uniform float uNear;
uniform float uFar;
uniform float uBoost;
out float vAlong;
out float vSide;
out float vBright;
out float vColor;
out float vStreak;
out float vPhase;
out float vFade;

void main() {
  float packed = aStar.w;
  float colorId = floor(packed / 4.0 + 0.001);
  float bright = packed - colorId * 4.0;
  vec3 pos = aStar.xyz;
  vAlong = 0.0;
  vSide = 0.0;
  vBright = bright;
  vColor = colorId;
  vStreak = 0.0;
  vPhase = packed;
  vFade = 0.0;

  if (pos.z < uNear * 0.45) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  vec3 prev = vec3(
    pos.x - pos.z * uYawLag,
    pos.y + pos.z * uPitchLag,
    pos.z + uStretch * (0.62 + bright * 0.7)
  );
  float z0 = max(pos.z, 0.08);
  float z1 = max(prev.z, 0.08);
  float s0 = 1.0 / (z0 * uFovTan);
  float s1 = 1.0 / (z1 * uFovTan);
  vec2 head = vec2(pos.x * s0 / uAspect, pos.y * s0);
  vec2 tail = vec2(prev.x * s1 / uAspect, prev.y * s1);

  int id = gl_VertexID;
  float along = (id == 1 || id == 3 || id == 4) ? 1.0 : 0.0;
  float side = (id == 2 || id == 4 || id == 5) ? 1.0 : -1.0;

  vec2 dir = head - tail;
  float len = length(dir);
  vec2 nrm = vec2(1.0, 0.0);
  if (len > 0.0008) nrm = dir / len;
  vec2 perp = vec2(-nrm.y, nrm.x);

  float width = uPixel * uWidth * (1.05 + bright * 2.15);
  width *= clamp(3.4 / max(pos.z, 0.7), 0.5, 2.6);
  float maxLen = 0.5 + uBoost * 0.4;
  if (len > maxLen) {
    tail = head - nrm * maxLen;
    len = maxLen;
    dir = head - tail;
  }
  float minLen = width * 2.0;
  float streak = clamp(len / max(width * 3.0, 0.0001), 0.0, 1.0);
  if (len < minLen) {
    nrm = vec2(1.0, 0.0);
    perp = vec2(0.0, 1.0);
    tail = head - nrm * minLen;
  }

  vec2 p = mix(tail, head, along) + perp * side * width;
  float cs = cos(uRoll);
  float sn = sin(uRoll);
  p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  gl_Position = vec4(p, 0.0, 1.0);

  float nearFade = smoothstep(uNear * 0.55, uNear * 2.4, pos.z);
  float farFade = smoothstep(uFar, uFar * 0.62, pos.z);
  vAlong = along;
  vSide = side;
  vStreak = streak;
  vFade = nearFade * mix(0.22, 1.0, clamp(1.0 - pos.z / uFar, 0.0, 1.0)) * farFade;
}
`;

const STAR_FS = `#version 300 es
precision highp float;
uniform float uGain;
uniform float uBoost;
uniform float uTwinkle;
uniform float uTime;
in float vAlong;
in float vSide;
in float vBright;
in float vColor;
in float vStreak;
in float vPhase;
in float vFade;
out vec4 fragColor;

void main() {
  float across = exp(-vSide * vSide * 2.35);
  float streakShade = smoothstep(0.0, 0.48, vAlong);
  float dAlong = (vAlong - 0.5) * 2.15;
  float pointShade = exp(-(dAlong * dAlong));
  float axial = mix(pointShade, streakShade, vStreak);
  float tw = 0.8 + 0.2 * sin(uTime * 1.6 + vPhase * 12.0);
  float alpha = across * axial * vBright * vFade * uGain;
  alpha *= mix(1.0, tw, uTwinkle);
  if (alpha < 0.004) discard;

  vec3 cool = vec3(0.62, 0.76, 1.0);
  vec3 white = vec3(0.94, 0.96, 1.0);
  vec3 warm = vec3(1.0, 0.9, 0.74);
  vec3 blue = vec3(0.45, 0.66, 1.0);
  vec3 orange = vec3(1.0, 0.58, 0.28);
  vec3 red = vec3(1.0, 0.34, 0.26);
  vec3 base = cool;
  if (vColor < 0.5) base = cool;
  else if (vColor < 1.5) base = white;
  else if (vColor < 2.5) base = warm;
  else if (vColor < 3.5) base = blue;
  else if (vColor < 4.5) base = orange;
  else base = red;
  float wash = vColor < 2.5 ? 0.42 + vAlong * 0.28 : 0.1;
  base = mix(base, vec3(1.0), wash);
  float split = uBoost * vSide * 0.16 * vStreak;
  base.r *= 1.0 + split;
  base.b *= 1.0 - split;
  vec3 tail = vec3(0.45, 0.68, 1.0);
  base = mix(mix(tail, base, vAlong), base, 1.0 - uBoost * 0.75);
  fragColor = vec4(base * alpha, alpha);
}
`;

const PLANET_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aDisc;
layout(location = 1) in vec4 aTint;
layout(location = 2) in vec4 aLight;
uniform float uRoll;
out vec2 vUv;
out vec3 vTint;
out float vKind;
out vec3 vLight;
out float vStyle;
void main() {
  int id = gl_VertexID;
  float ux = -1.0;
  float uy = -1.0;
  if (id == 1 || id == 3 || id == 4) ux = 1.0;
  if (id == 2 || id == 4 || id == 5) uy = 1.0;
  vec2 p = vec2(aDisc.x + ux * aDisc.z, aDisc.y + uy * aDisc.w);
  float cs = cos(uRoll);
  float sn = sin(uRoll);
  p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = vec2(ux, uy);
  vTint = aTint.rgb;
  vKind = aTint.a;
  vLight = aLight.xyz;
  vStyle = aLight.w;
}
`;

const PLANET_FS = `#version 300 es
precision highp float;
uniform float uTime;
in vec2 vUv;
in vec3 vTint;
in float vKind;
in vec3 vLight;
in float vStyle;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float r2 = dot(vUv, vUv);
  float r = sqrt(r2);
  vec3 L = normalize(vLight);
  vec4 color = vec4(0.0);
  if (vKind < 0.04) {
    if (r > 1.0) discard;
    float glow = exp(-r2 * 1.45);
    float ang = atan(vUv.y, vUv.x);
    float ray = pow(max(0.0, 0.62 + 0.28 * sin(ang * 9.0) + 0.16 * sin(ang * 23.0 + 1.4)), 3.0);
    float warmth = smoothstep(0.05, 0.28, vTint.r - vTint.b);
    float corona = glow * (0.92 + ray * warmth * 0.16 * smoothstep(0.28, 0.9, r));
    vec3 col = mix(vTint, vec3(1.0, 0.7, 0.38), warmth * (1.0 - glow) * 0.4);
    color = vec4(col * (0.48 + glow), corona);
  } else if (vKind < 0.12) {
    if (r > 1.0) discard;
    float mu = sqrt(max(0.0, 1.0 - r2));
    float limb = pow(mu, 0.42);
    vec3 edge = vec3(vTint.r, vTint.g * 0.58, vTint.b * 0.22);
    vec3 core = vTint * vec3(1.08, 1.02, 0.9);
    color = vec4(mix(edge, core, limb), 1.0);
  } else if (vKind < 0.5) {
    float shell = exp(-pow((r - 0.78) * 4.4, 2.0));
    vec3 n = normalize(vec3(vUv, 0.18));
    float ndl = dot(n, L);
    float day = 0.08 + 0.92 * clamp(ndl, 0.0, 1.0);
    float fringe = exp(-9.0 * ndl * ndl);
    vec3 air = vTint * (0.45 + 0.55 * day) + vec3(0.95, 0.55, 0.28) * fringe * 0.22;
    color = vec4(air, shell * day * 0.9);
  } else if (vKind > 1.5) {
    float outer = 1.0 - smoothstep(0.9, 1.0, r);
    float inner = smoothstep(0.46, 0.56, r);
    float gapIn = smoothstep(0.64, 0.68, r);
    float gapOut = 1.0 - smoothstep(0.72, 0.76, r);
    float gap = gapIn * gapOut;
    float a = outer * inner * (1.0 - gap * 0.72);
    vec2 light = normalize(L.xy + vec2(0.0001));
    float px = vKind < 2.15 ? 0.426 : (vKind < 2.45 ? 0.617 : 0.676);
    float py = vKind < 2.15 ? 2.17 : (vKind < 2.45 ? 5.0 : 6.25);
    float axis = dot(vUv, light);
    vec2 perp = vUv - light * axis;
    float rad = length(vec2(perp.x / px, perp.y / py));
    float globe = (1.0 - smoothstep(0.82, 1.18, rad)) * smoothstep(0.0, 0.16, -axis);
    float day = 0.2 + 0.8 * clamp(dot(normalize(vUv + vec2(0.001)), light), 0.0, 1.0);
    day *= 1.0 - globe * 0.9;
    color = vec4(vTint * day, a * 0.82);
  } else {
    if (r2 > 1.0) discard;
    float nz = sqrt(max(0.0, 1.0 - r2));
    vec3 n = vec3(vUv.x, vUv.y, nz);
    float ndl = dot(n, L);
    float day = smoothstep(-0.04, 0.42, ndl);
    float fringe = exp(-8.0 * ndl * ndl) * smoothstep(-0.4, 0.08, ndl);
    vec3 night = vec3(0.02, 0.035, 0.065);
    float bands = 0.0;
    vec3 tint = vTint;
    float ocean = 0.0;
    float cities = 0.0;
    float cloud = 0.0;
    if (vStyle > 0.5 && vStyle < 1.5) {
      float belt = sin((vUv.y + 0.12 * sin(vUv.x * 5.0)) * 16.0);
      bands = belt * 0.11;
      tint *= 1.0 + belt * 0.07;
    } else if (vStyle > 1.5 && vStyle < 2.5) {
      float lon = atan(vUv.x, max(nz, 0.22)) * 0.8 + uTime * 0.015;
      float lat = vUv.y * 1.7;
      float n1 = noise(vec2(lon * 0.9, lat));
      float n2 = noise(vec2(lon * 1.8 + 4.2, lat * 1.25));
      float land = smoothstep(0.4, 0.72, n1 * 0.72 + n2 * 0.28);
      ocean = 1.0 - land;
      vec3 sea = vTint * vec3(0.34, 0.55, 0.86);
      vec3 ground = vec3(0.42, 0.58, 0.36);
      tint = mix(sea, ground, land);
      cloud = smoothstep(0.5, 0.78, noise(vec2(lon * 1.15 + 2.0 + uTime * 0.01, lat * 0.85)));
      cities = smoothstep(0.8, 0.95, noise(vec2(lon * 2.8, lat * 2.1))) * land;
    } else if (vStyle > 2.5 && vStyle < 3.5) {
      bands = sin(vUv.y * 10.0) * 0.04;
    }
    vec3 lit = mix(night, tint, day);
    lit += vec3(1.0, 0.86, 0.62) * bands * day;
    lit += vec3(0.95, 0.52, 0.24) * fringe * 0.26;
    if (vStyle > 1.15 && vStyle < 1.5) {
      float band = exp(-pow(vUv.y * 9.0, 2.0));
      lit *= 1.0 - band * (0.28 + 0.5 * abs(L.y));
    }
    float rim = pow(1.0 - nz, 1.7);
    lit += mix(vTint, vec3(0.75, 0.86, 1.0), 0.35) * rim * day * 0.5;
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 46.0) * ocean * day;
    lit += vec3(0.75, 0.88, 1.0) * spec * 0.4;
    lit += vec3(1.0, 0.76, 0.42) * cities * smoothstep(0.42, 0.08, day) * 0.7;
    lit = mix(lit, vec3(0.9, 0.94, 0.97) * (0.22 + 0.78 * day), cloud * 0.42);
    color = vec4(lit, 1.0);
  }
  if (color.a < 0.02) discard;
  fragColor = color;
}
`;

const SHIP_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aGlow;
uniform vec3 uEye;
uniform float uFovTan;
uniform float uAspect;
uniform float uRoll;
out vec3 vColor;
out float vGlow;
void main() {
  vec3 c = aPos - uEye;
  float z = max(c.z, 0.05);
  vec2 p = vec2(c.x / z / uFovTan / uAspect, c.y / z / uFovTan);
  float cs = cos(uRoll);
  float sn = sin(uRoll);
  p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  float depth = c.z < 0.4 ? 2.0 : clamp(c.z / 48.0, 0.0, 0.98);
  gl_Position = vec4(p, depth, 1.0);
  vColor = aColor;
  vGlow = aGlow;
}
`;

const SHIP_FS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vGlow;
uniform float uBoost;
out vec4 fragColor;
void main() {
  vec3 col = vColor + vec3(0.40, 0.58, 0.95) * vGlow * (0.4 + uBoost);
  fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`;

const TRAIL_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
out float vAlpha;
void main() {
  vAlpha = aPos.z;
  gl_Position = vec4(aPos.xy, 0.0, 1.0);
}
`;

const TRAIL_FS = `#version 300 es
precision highp float;
in float vAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.74, 0.82, 0.94, vAlpha);
}
`;

function shipMesh(): Float32Array {
  const v: number[] = [];
  const push = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    color: readonly [number, number, number],
    glow = 0,
  ) => {
    for (const p of [a, b, c]) v.push(p[0], p[1], p[2], color[0], color[1], color[2], glow);
  };
  const nose: [number, number, number] = [0, 0.04, 2.55];
  const spine: [number, number, number] = [0, 0.34, 0.25];
  const keel: [number, number, number] = [0, -0.2, 0.15];
  const right: [number, number, number] = [1.85, 0.02, -0.45];
  const left: [number, number, number] = [-1.85, 0.02, -0.45];
  const tailTop: [number, number, number] = [0, 0.18, -1.55];
  const tailBot: [number, number, number] = [0, -0.14, -1.55];
  const top: readonly [number, number, number] = [0.86, 0.89, 0.94];
  const hull: readonly [number, number, number] = [0.62, 0.66, 0.74];
  const shade: readonly [number, number, number] = [0.4, 0.44, 0.52];
  const belly: readonly [number, number, number] = [0.22, 0.24, 0.3];
  const glass: readonly [number, number, number] = [0.78, 0.86, 0.96];
  push(nose, right, spine, top);
  push(nose, spine, left, top);
  push(spine, right, tailTop, hull);
  push(spine, tailTop, left, hull);
  push(nose, keel, right, shade);
  push(nose, left, keel, shade);
  push(keel, tailBot, right, belly);
  push(keel, left, tailBot, belly);
  push(tailTop, [0.42, -0.02, -1.55], tailBot, belly);
  push(tailTop, tailBot, [-0.42, -0.02, -1.55], belly);
  const peak: [number, number, number] = [0, 0.58, 0.22];
  const brow: [number, number, number] = [0, 0.14, 1.15];
  push(brow, [0.26, 0.16, 0.18], peak, glass);
  push(brow, peak, [-0.26, 0.16, 0.18], glass);
  const lamp = (x: number) => {
    const y = 0.02;
    const z = -1.72;
    push([x - 0.2, y + 0.1, z], [x + 0.2, y + 0.1, z], [x, y - 0.12, z], [0.55, 0.7, 0.95], 1);
  };
  lamp(-0.48);
  lamp(0.48);
  return new Float32Array(v);
}

const SHIP_DATA = shipMesh();
const SHIP_STRIDE = 7;
const SHIP_VERTS = SHIP_DATA.length / SHIP_STRIDE;

function holdRadius(body: BodyDef): number {
  const vis = visualRadius(body);
  if (body.id === "sun") return 210;
  if (body.speck) return 24;
  if (body.parent) return Math.max(16, vis * 3.2 + 8);
  return Math.max(30, vis * 3.6 + 12);
}

function orbitTangent(rx: number, ry: number, rz: number): { x: number; y: number; z: number } {
  let x = -rz;
  let y = 0;
  let z = rx;
  let len = Math.hypot(x, y, z);
  if (len < 1) {
    x = ry;
    y = -rx;
    z = 0;
    len = Math.hypot(x, y, z) || 1;
  }
  return { x: x / len, y: y / len, z: z / len };
}

function shape(v: number): number {
  const dz = 0.07;
  const a = Math.abs(v);
  if (a < dz) return 0;
  const s = (a - dz) / (1 - dz);
  return Math.sign(v) * Math.pow(s, 1.2);
}

function wrap01(v: number): number {
  const x = v % 1;
  return x < 0 ? x + 1 : x;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "shader compile failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create a program.");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "program link failed";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

export class StarfieldEngine {
  private readonly audio = new DriftAudio();
  private readonly data = new Float32Array(MAX_STARS * 4);
  private readonly keys = new Set<string>();
  private readonly abort = new AbortController();

  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private bg: WebGLProgram | null = null;
  private stars: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private bgLocs: Record<string, WebGLUniformLocation | null> = {};
  private starLocs: Record<string, WebGLUniformLocation | null> = {};

  private raf = 0;
  private running = false;
  private destroyed = false;
  private mode: "webgl" | "2d" | "none" = "none";
  private reported = false;

  private yaw = 0;
  private pitch = 0;
  private orbitSign = 1;
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
  private steerOverride = 0;
  private smoothPX = 0;
  private smoothPY = 0;
  private stickX = 0;
  private stickY = 0;
  private pointerX = 0;
  private pointerY = 0;
  private hasPointer = false;
  private hudPointer = -1;
  private leveling = false;
  private audioAcc = 0;
  private lastWarp = "";
  private yawLagRate = 0;
  private pitchLagRate = 0;
  private mobile = false;
  private sized = false;
  private shipX = 0;
  private shipY = 6;
  private shipZ = 0;
  private placed = false;
  private nearId = "";
  private alert = "";
  private planets: WebGLProgram | null = null;
  private planetVao: WebGLVertexArrayObject | null = null;
  private planetBuf: WebGLBuffer | null = null;
  private planetLocs: Record<string, WebGLUniformLocation | null> = {};
  private readonly planetData = new Float32Array(80 * 12);
  private planetCount = 0;
  private shipProg: WebGLProgram | null = null;
  private shipVao: WebGLVertexArrayObject | null = null;
  private shipBuf: WebGLBuffer | null = null;
  private shipLocs: Record<string, WebGLUniformLocation | null> = {};
  private eyeX = 0;
  private eyeY = 0;
  private eyeZ = 0;
  private taskMem: TaskMemory = createTaskState();
  private readonly trail: { x: number; y: number; z: number }[] = [];
  private trailProg: WebGLProgram | null = null;
  private trailVao: WebGLVertexArrayObject | null = null;
  private trailBuf: WebGLBuffer | null = null;
  private readonly trailDraw = new Float32Array(96 * 3);
  private readonly markers: FrameMarker[] = [];

  private readonly probe = {
    getYaw: () => this.yaw,
    getSpeed: () => this.speed,
    getPitch: () => this.pitch,
    getFps: () => this.fps,
    setSteer: (v: number) => {
      this.steerOverride = clamp(v, -1, 1);
    },
    setKeys: (codes: string[]) => {
      this.keys.clear();
      for (const code of codes) this.keys.add(code);
    },
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: { current: StarfieldHooks },
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.mobile = window.matchMedia("(pointer: coarse)").matches;
    this.placeShip();
    this.initRenderer();
    this.resize();
    this.spawnAll();
    this.bindInput();
    window.__controlsTest = this.probe;
    this.raf = requestAnimationFrame(this.frame);
  }

  level(): void {
    this.leveling = true;
  }

  destroy(): void {
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.audio.dispose();
    if (window.__controlsTest === this.probe) delete window.__controlsTest;
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

  private initRenderer(): void {
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
        gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.bindVertexArray(null);
        this.initPlanets(gl);
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

  private initPlanets(gl: WebGL2RenderingContext): void {
    try {
      this.planets = link(gl, PLANET_VS, PLANET_FS);
      this.planetLocs.uRoll = gl.getUniformLocation(this.planets, "uRoll");
      this.planetLocs.uTime = gl.getUniformLocation(this.planets, "uTime");
      this.planetVao = gl.createVertexArray();
      this.planetBuf = gl.createBuffer();
      gl.bindVertexArray(this.planetVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.planetBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.planetData.byteLength, gl.DYNAMIC_DRAW);
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

  private placeShip(): void {
    if (this.placed) return;
    this.placed = true;
    const earth = bodyPosition(bodyById("earth"), 0);
    const len = Math.hypot(earth.x, earth.z) || 1;
    const ox = earth.x / len;
    const oz = earth.z / len;
    const tx = -oz;
    const tz = ox;
    this.shipX = earth.x + ox * 78 + tx * 96;
    this.shipY = 4;
    this.shipZ = earth.z + oz * 78 + tz * 96;
    const dx = earth.x - this.shipX;
    const dz = earth.z - this.shipZ;
    const fl = Math.hypot(dx, dz) || 1;
    this.yaw = Math.atan2(-dx / fl, dz / fl);
    this.pitch = -0.04;
  }

  private fail(message: string): void {
    if (this.reported) return;
    this.reported = true;
    this.mode = "none";
    this.hooks.current.onError(message);
  }

  private bindInput(): void {
    const { signal } = this.abort;
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
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.canvas);
    signal.addEventListener("abort", () => ro.disconnect());
  }

  private isHud(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest("[data-hud]"));
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId === this.hudPointer) return;
    if (e.pointerType === "touch" && e.buttons === 0) return;
    if (this.isHud(e.target)) {
      this.hasPointer = false;
      this.pointerX = 0;
      this.pointerY = 0;
      return;
    }
    this.hasPointer = true;
    this.readPointer(e);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.audio.unlock();
    if (this.isHud(e.target)) {
      this.hudPointer = e.pointerId;
      this.hasPointer = false;
      this.pointerX = 0;
      this.pointerY = 0;
      return;
    }
    if (e.pointerType === "touch") {
      this.hasPointer = true;
      this.readPointer(e);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.hudPointer) this.hudPointer = -1;
    if (e.pointerType !== "touch") return;
    this.hasPointer = false;
    this.pointerX = 0;
    this.pointerY = 0;
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return;
    this.hasPointer = false;
    this.pointerX = 0;
    this.pointerY = 0;
  };

  private readPointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.pointerX = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    this.pointerY = clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.audio.unlock();
    const hud = this.isHud(e.target);
    if (!hud && (e.code === "Space" || e.code.startsWith("Arrow"))) e.preventDefault();
    if (e.code === "Space" && !e.repeat && !hud) this.hooks.current.onToggleBoost();
    if (e.code === "KeyO" && !e.repeat && !hud) this.hooks.current.onToggleOrbit();
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
    const params = this.hooks.current.getParams();
    const step = clamp(e.deltaY / 1400, -0.06, 0.06);
    this.hooks.current.onSpeed(clamp(params.speed - step, 0, 1));
  };

  private onVis = (): void => {
    if (document.hidden) this.keys.clear();
    else this.audio.resume();
  };

  private resize(): void {
    const dprCap = this.mode === "2d" ? 1 : this.mobile ? 1.25 : 1.5;
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
    const dt = Math.min(0.05, Math.max(0.001, (now - (this.prevNow || now)) / 1000));
    this.prevNow = now;
    this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private prevNow = 0;

  private step(dt: number): void {
    const params = this.hooks.current.getParams();
    const stick = this.readStick(dt);
    let sx = stick.x;
    let sy = stick.y;
    const manual =
      Math.abs(this.smoothPX) + Math.abs(this.smoothPY) > 0.42 ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyD") ||
      this.keys.has("ArrowLeft") ||
      this.keys.has("ArrowRight") ||
      this.keys.has("KeyW") ||
      this.keys.has("KeyS") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("ArrowDown");
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
    if (!manual && !params.orbit && !this.lapFor && params.boost) {
      const pass = this.nearestPass(4);
      if (pass) {
        const dist = this.rangeTo(pass.id);
        const gate = holdRadius(pass) * 2.2;
        const crossed = this.passId === pass.id && this.passDist > gate && dist <= gate;
        if (crossed && pass.id !== this.lapSkip) {
          this.lapFor = pass.id;
          this.lapSwept = 0;
          this.lapArmed = false;
          this.lapConfirmed = false;
          this.lapTheta = 0;
          this.lapIgnoreBoost = true;
          this.hooks.current.onBeginLap(pass.id);
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
    const burningOut = params.boost && !this.lapIgnoreBoost;
    const orbitOn = (params.orbit || this.lapFor !== "") && !manual && !this.lapRelease && !burningOut;
    if ((params.orbit || this.lapFor) && manual) {
      this.clearLap(true);
      this.hooks.current.onCancelOrbit();
    } else if (params.autopilot && manual) {
      this.hooks.current.onCancelAutopilot();
    } else if (orbitOn || params.autopilot) {
      const aim = this.aimStick(orbitBody);
      if (aim) {
        sx = clamp(aim.x, -1, 1);
        sy = clamp(aim.y, -1, 1);
      }
    }
    this.stickX = sx;
    this.stickY = sy;

    const yawSpeed = params.reducedMotion ? 0.55 : 1.25;
    const pitchSpeed = params.reducedMotion ? 0.4 : 0.85;
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
    const dYaw = this.yaw - prevYaw;
    const dPitch = this.pitch - prevPitch;

    const approach = this.rangeTo(params.targetId);
    const bubble = surveyRadius(bodyById(params.targetId));
    const autoBoost = params.autopilot && !orbitOn && approach > bubble * 3.2;
    const boostTarget = orbitOn ? 0 : params.boost || autoBoost ? 1 : 0;
    const bk = boostTarget > this.boost ? 5 : 2.5;
    this.boost += (boostTarget - this.boost) * (1 - Math.exp(-bk * dt));

    const cruise = cruiseSpeed(params.speed, params.reducedMotion);
    let targetSpeed = cruise * (1 + this.boost * 3.8);
    let orbitDir: { x: number; y: number; z: number } | null = null;
    if (orbitOn) {
      const body = bodyById(orbitBody);
      const pos = bodyPosition(body, this.time);
      const rx = this.shipX - pos.x;
      const ry = this.shipY - pos.y;
      const rz = this.shipZ - pos.z;
      const dist = Math.hypot(rx, ry, rz) || 1;
      const nx = rx / dist;
      const ny = ry / dist;
      const nz = rz / dist;
      const want = holdRadius(body);
      if (this.orbitId !== body.id) {
        this.orbitId = body.id;
        const seeded = orbitTangent(rx, ry, rz);
        const facing = cameraForward(this.yaw, this.pitch);
        const along = facing.x * seeded.x + facing.y * seeded.y + facing.z * seeded.z;
        this.orbitSign = along >= 0 ? 1 : -1;
      }
      const tangent = orbitTangent(rx, ry, rz);
      const vTan = clamp(want * (params.reducedMotion ? 0.16 : 0.28), params.reducedMotion ? 6 : 8, params.reducedMotion ? 12 : 16);
      const vRad = clamp((dist - want) * 0.9, -14, params.reducedMotion ? 16 : 26);
      const vx = tangent.x * this.orbitSign * vTan - nx * vRad;
      const vy = tangent.y * this.orbitSign * vTan - ny * vRad;
      const vz = tangent.z * this.orbitSign * vTan - nz * vRad;
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
      if (params.autopilot && approach < bubble * 3) {
        targetSpeed *= clamp(approach / (bubble * 3), 0.45, 1);
      }
    }
    const respond = targetSpeed > this.speed ? 9 : 5.5;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-respond * dt));
    if (!orbitOn && params.autopilot && approach < bubble * 1.2) this.hooks.current.onCancelAutopilot();

    const forward = orbitDir ?? cameraForward(this.yaw, this.pitch);
    this.shipX += forward.x * this.speed * dt;
    this.shipY = clamp(this.shipY + forward.y * this.speed * dt, -90, 90);
    this.shipZ += forward.z * this.speed * dt;
    const sunDist = Math.hypot(this.shipX, this.shipY, this.shipZ);
    if (sunDist < 128) {
      const push = ((128 - sunDist) / 128) * this.speed * dt * 1.8;
      const inv = 1 / Math.max(sunDist, 1);
      this.shipX += this.shipX * inv * push;
      this.shipZ += this.shipZ * inv * push;
      this.alert = "Too close to the Sun";
    } else if (this.lapFor) {
      this.alert = `One loop around ${bodyById(this.lapFor).name}`;
    } else {
      this.alert = "";
    }

    const baseFov = params.view === "chase" ? 62 : params.view === "wing" ? 66 : 70;
    const pace = clamp((this.speed - 16) / 110, 0, 1);
    const fovTarget = (((params.reducedMotion ? baseFov - 6 : baseFov) + this.boost * 12 + pace * 11) * Math.PI) / 180;
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-4 * dt));
    this.tanFov = Math.tan(this.fov * 0.5);
    this.rush = clamp(this.boost * 0.72 + pace * 0.85, 0, 1);
    const eye =
      params.view === "chase" ? [0, 1.7, -11] : params.view === "wing" ? [5.4, 1.5, -11] : [0, 0.15, 0.15];
    const ease = 1 - Math.exp(-3.4 * dt);
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
    if (this.mode === "2d") budget = Math.min(budget, 2000);
    const active = Math.max(180, Math.round(budget * this.quality));
    if (active > this.live) {
      for (let i = this.live; i < active; i++) this.respawn(i, false);
    }
    this.live = active;
    this.integrateStars(dt, dYaw, dPitch);
    const rangeText = this.projectSystem(params.targetId);
    this.rememberTrail();
    const taskId = stepTasks(this.taskMem, {
      dt,
      speed: this.speed,
      autopilot: params.autopilot,
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
    });
    if (taskId) this.hooks.current.onTask(taskId, this.time);

    this.frames += 1;
    this.fps += (1 / dt - this.fps) * 0.08;
    if (this.frames > 40 && this.mode === "webgl") {
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
    const locked = !!aimNow && Math.hypot(aimNow.x, aimNow.y) < 0.16;
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
        targetId: params.targetId,
        nearId: this.nearId,
        alert: this.alert,
        markers: this.markers,
        locked,
        orbiting: orbitOn,
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
    for (const body of BODIES) {
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

  private aimStick(id: string): { x: number; y: number } | null {
    const pos = bodyPosition(bodyById(id), this.time);
    const cam = worldToCamera(pos.x - this.shipX, pos.y - this.shipY, pos.z - this.shipZ, this.yaw, this.pitch);
    if (cam.z < 1) return { x: cam.x >= 0 ? 0.85 : -0.85, y: clamp(-cam.y / 48, -0.55, 0.55) };
    return {
      x: clamp((cam.x / cam.z) * 1.7, -1, 1),
      y: clamp((-cam.y / cam.z) * 1.7, -1, 1),
    };
  }

  private rangeTo(id: string): number {
    const pos = bodyPosition(bodyById(id), this.time);
    return Math.hypot(pos.x - this.shipX, pos.y - this.shipY, pos.z - this.shipZ);
  }

  private projectSystem(targetId: string): string {
    const aspect = this.aspect || 1;
    const tan = this.tanFov || 0.7;
    const cs = Math.cos(-this.bank);
    const sn = Math.sin(-this.bank);
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
    let nearDist = Infinity;
    let rangeText = "—";
    for (const body of BODIES) {
      const pos = bodyPosition(body, this.time);
      const dx = pos.x - this.shipX;
      const dy = pos.y - this.shipY;
      const dz = pos.z - this.shipZ;
      const dist = Math.hypot(dx, dy, dz);
      if (body.id === targetId) {
        const ratio = dist / EARTH_ORBIT;
        rangeText = ratio < 0.08 ? "Here" : `${ratio.toFixed(ratio < 10 ? 2 : 1)}× orbit`;
      }
      if (!body.quiet && dist < surveyRadius(body) && dist < nearDist) {
        near = body.id;
        nearDist = dist;
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
                : 0;
      const cam0 = worldToCamera(dx, dy, dz, this.yaw, this.pitch);
      const cam = { x: cam0.x - this.eyeX, y: cam0.y - this.eyeY, z: cam0.z - this.eyeZ };
      if (cam.z < 0.5) {
        rows.push({ body, dist, camX: cam.x, camZ: cam.z, ndcX: 0, ndcY: 0, radX: 0, radY: 0, lx, ly, lz, style });
        continue;
      }
      const floor = body.speck ? 0.0035 : body.id === "sun" ? 0.02 : 0.011;
      const radY = clamp(visualRadius(body) / cam.z / tan, floor, 1.35);
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
    if (near) this.nearId = near;
    else if (this.nearId) {
      const held = bodyById(this.nearId);
      if (this.rangeTo(held.id) > surveyRadius(held) * 2.8) this.nearId = "";
    }
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
      if (row.body.id === "sun") {
        push(row, 3.7, 3.7, 0);
        push(row, 1, 1, 0.08);
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
      let x = behind ? 0.5 + Math.sign(row.camX || 1) * 0.4 : x1 * 0.5 + 0.5;
      let y = behind ? 0.46 : 1 - (y1 * 0.5 + 0.5);
      const primary = row.body.id === targetId;
      if (!primary && (behind || x < 0 || x > 1 || y < 0.02 || y > 0.92)) continue;
      const halo = row.body.id === "sun" ? 4 : row.body.id === "halley" ? 2.6 : 1.22;
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

  private readStick(dt: number): { x: number; y: number } {
    const tx = this.hasPointer ? shape(this.pointerX) : 0;
    const ty = this.hasPointer ? shape(this.pointerY) : 0;
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

  private draw(): void {
    if (this.mode === "webgl") this.drawGL();
    else if (this.mode === "2d") this.draw2D();
  }

  private drawGL(): void {
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
    gl.uniform2f(this.bgLocs.uBg ?? null, this.bgX, this.bgY);
    gl.uniform1f(this.bgLocs.uRoll ?? null, -this.bank);
    gl.uniform1f(this.bgLocs.uBoost ?? null, this.rush);
    gl.uniform1f(this.bgLocs.uAspect ?? null, this.aspect);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data);

    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(stars);

    const reduced = this.hooks.current.getParams().reducedMotion;
    const streakTime = (0.058 + this.boost * 0.09) * (reduced ? 0.35 : 1);
    const stretch = Math.min(this.speed * streakTime, 26);
    const twinkle = Math.max(0, 1 - this.speed / 34) * (reduced ? 0 : 1);
    const pixel = 2 / Math.max(1, h);

    const setCommon = (): void => {
      gl.uniform1f(this.starLocs.uFovTan ?? null, this.tanFov);
      gl.uniform1f(this.starLocs.uAspect ?? null, this.aspect);
      gl.uniform1f(this.starLocs.uYawLag ?? null, this.yawLagRate * streakTime);
      gl.uniform1f(this.starLocs.uPitchLag ?? null, this.pitchLagRate * streakTime);
      gl.uniform1f(this.starLocs.uRoll ?? null, -this.bank);
      gl.uniform1f(this.starLocs.uPixel ?? null, pixel);
      gl.uniform1f(this.starLocs.uNear ?? null, NEAR);
      gl.uniform1f(this.starLocs.uFar ?? null, FAR);
      gl.uniform1f(this.starLocs.uBoost ?? null, this.rush);
      gl.uniform1f(this.starLocs.uTwinkle ?? null, twinkle);
      gl.uniform1f(this.starLocs.uTime ?? null, this.time);
    };
    setCommon();
    gl.uniform1f(this.starLocs.uStretch ?? null, stretch * 1.85);
    gl.uniform1f(this.starLocs.uWidth ?? null, 2.15);
    gl.uniform1f(this.starLocs.uGain ?? null, 0.26);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.live);

    gl.uniform1f(this.starLocs.uStretch ?? null, stretch);
    gl.uniform1f(this.starLocs.uWidth ?? null, 1);
    gl.uniform1f(this.starLocs.uGain ?? null, 0.95);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.live);
    this.drawPlanets(gl);
    this.drawTrail(gl);
    this.drawShip(gl);
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

  private drawTrail(gl: WebGL2RenderingContext): void {
    if (!this.trailProg || !this.trailVao || !this.trailBuf || this.trail.length < 2) return;
    const tan = this.tanFov || 0.7;
    const aspect = this.aspect || 1;
    const cs = Math.cos(-this.bank);
    const sn = Math.sin(-this.bank);
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
    const n = this.trail.length;
    for (let i = 0; i < n; i++) {
      const point = this.trail[i];
      if (!point) continue;
      const cam0 = worldToCamera(
        point.x - this.shipX,
        point.y - this.shipY,
        point.z - this.shipZ,
        this.yaw,
        this.pitch,
      );
      const z = cam0.z - this.eyeZ;
      if (z < 0.8) {
        flush();
        continue;
      }
      const ndcX = (cam0.x - this.eyeX) / z / tan / aspect;
      const ndcY = (cam0.y - this.eyeY) / z / tan;
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

  private drawShip(gl: WebGL2RenderingContext): void {
    if (!this.shipProg || !this.shipVao || this.eyeZ > -3) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.shipProg);
    gl.uniform3f(this.shipLocs.uEye ?? null, this.eyeX, this.eyeY, this.eyeZ);
    gl.uniform1f(this.shipLocs.uFovTan ?? null, this.tanFov);
    gl.uniform1f(this.shipLocs.uAspect ?? null, this.aspect);
    gl.uniform1f(this.shipLocs.uRoll ?? null, -this.bank);
    gl.uniform1f(this.shipLocs.uBoost ?? null, this.boost);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.bindVertexArray(this.shipVao);
    gl.drawArrays(gl.TRIANGLES, 0, SHIP_VERTS);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  private drawPlanets(gl: WebGL2RenderingContext): void {
    if (!this.planets || !this.planetVao || !this.planetBuf || this.planetCount < 1) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.planets);
    gl.uniform1f(this.planetLocs.uRoll ?? null, -this.bank);
    const reduced = this.hooks.current.getParams().reducedMotion;
    gl.uniform1f(this.planetLocs.uTime ?? null, this.time * (reduced ? 0.2 : 1));
    gl.bindVertexArray(this.planetVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.planetBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.planetData.subarray(0, this.planetCount * 12));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.planetCount);
    gl.bindVertexArray(null);
  }

  private draw2D(): void {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "#07080b";
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const f = h * 0.5 / this.tanFov;
    const roll = -this.bank;
    const cs = Math.cos(roll);
    const sn = Math.sin(roll);
    const reduced = this.hooks.current.getParams().reducedMotion;
    const streakTime = (0.058 + this.boost * 0.09) * (reduced ? 0.35 : 1);
    const stretch = Math.min(this.speed * streakTime, 26);
    const yawLag = this.yawLagRate * streakTime;
    const pitchLag = this.pitchLagRate * streakTime;
    const rot = (px: number, py: number): [number, number] => {
      const dx = px - cx;
      const dy = py - cy;
      return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
    };
    ctx.lineCap = "round";
    const data = this.data;
    for (let i = 0; i < this.live; i++) {
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
    for (let i = 0; i < this.planetCount; i++) {
      const o = i * 12;
      const ndcX = this.planetData[o] ?? 0;
      const ndcY = this.planetData[o + 1] ?? 0;
      const rx = this.planetData[o + 2] ?? 0;
      const ry = this.planetData[o + 3] ?? 0;
      const red = Math.round((this.planetData[o + 4] ?? 1) * 255);
      const green = Math.round((this.planetData[o + 5] ?? 1) * 255);
      const blue = Math.round((this.planetData[o + 6] ?? 1) * 255);
      const kind = this.planetData[o + 7] ?? 1;
      const px = (ndcX * cs - ndcY * sn) * 0.5 + 0.5;
      const py = 1 - ((ndcX * sn + ndcY * cs) * 0.5 + 0.5);
      const radius = Math.max(2, ry * h * 0.5);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${kind < 0.5 ? 0.55 : 0.95})`;
      ctx.ellipse(px * w, py * h, Math.max(2, rx * w * 0.5), radius, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.eyeZ < -3) this.drawShip2D(ctx, w, h, cs, sn, f);
  }

  private drawShip2D(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cs: number,
    sn: number,
    f: number,
  ): void {
    const project = (x: number, y: number, z: number): [number, number, number] | null => {
      const cz = z - this.eyeZ;
      if (cz < 0.4) return null;
      const cx = (x - this.eyeX) / cz;
      const cy = (y - this.eyeY) / cz;
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
      const lift = glow * (0.4 + this.boost);
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
