#version 300 es
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
