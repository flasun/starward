#version 300 es
precision highp float;
in vec3 vColor;
in float vGlow;
uniform float uBoost;
out vec4 fragColor;
void main() {
  vec3 col = vColor + vec3(0.55, 0.82, 1.0) * vGlow * (0.65 + uBoost * 1.35);
  fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
