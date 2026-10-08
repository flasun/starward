#version 300 es
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
    } else if (vStyle > 3.5 && vStyle < 4.5) {
      float lon = atan(vUv.x, max(nz, 0.2));
      float lat = vUv.y * 2.2;
      float grain = noise(vec2(lon * 2.2, lat * 1.6));
      float crater = smoothstep(0.62, 0.86, noise(vec2(lon * 4.6 + 1.7, lat * 3.4)));
      tint *= 0.76 + grain * 0.38;
      tint *= 1.0 - crater * 0.42;
    } else if (vStyle > 4.5 && vStyle < 5.5) {
      float lon = atan(vUv.x, max(nz, 0.2));
      float lat = vUv.y * 1.8;
      float dark = smoothstep(0.46, 0.76, noise(vec2(lon * 1.35 + 0.6, lat)));
      tint = mix(tint, tint * vec3(0.4, 0.2, 0.14), dark * 0.7);
    }
    vec3 lit = mix(night, tint, day);
    lit += vec3(1.0, 0.86, 0.62) * bands * day;
    lit += vec3(0.95, 0.52, 0.24) * fringe * 0.26;
    if (vStyle > 1.15 && vStyle < 1.5) {
      float band = exp(-pow(vUv.y * 9.0, 2.0));
      lit *= 1.0 - band * (0.28 + 0.5 * abs(L.y));
    }
    float rim = pow(1.0 - nz, 1.7);
    lit += mix(vTint, vec3(0.8, 0.9, 1.0), 0.4) * rim * day * 0.62;
    if (vStyle > 0.9 && vStyle < 1.15) {
      float spot = exp(-pow((vUv.x - 0.32) * 3.4, 2.0) - pow((vUv.y + 0.18) * 6.2, 2.0));
      lit = mix(lit, vec3(0.78, 0.3, 0.16), spot * day * 0.82);
    }
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
