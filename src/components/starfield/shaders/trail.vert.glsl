#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
out float vAlpha;
void main() {
  vAlpha = aPos.z;
  gl_Position = vec4(aPos.xy, 0.0, 1.0);
}
