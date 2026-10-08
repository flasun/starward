#version 300 es
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
