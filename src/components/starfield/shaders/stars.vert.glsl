#version 300 es
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
