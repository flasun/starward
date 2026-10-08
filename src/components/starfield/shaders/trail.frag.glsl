#version 300 es
precision highp float;
in float vAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.74, 0.82, 0.94, vAlpha);
}
