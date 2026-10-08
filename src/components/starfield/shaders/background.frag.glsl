#version 300 es
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
