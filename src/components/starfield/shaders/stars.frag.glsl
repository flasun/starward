#version 300 es
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
