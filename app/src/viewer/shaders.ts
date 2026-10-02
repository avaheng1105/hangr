// GLSL ES 1.00 so the same shaders run on WebGL1, WebGL2 and expo-gl.
//
// depth.png stores 16-bit depth: R = high byte, G = low byte (see the
// pipeline's depth.encode_16bit). 8 bits alone cause banding in the lighting.
//
// The garment is a finely subdivided square. The vertex shader pushes each
// vertex towards the camera by the depth map, so tilting the square shows
// real parallax and the outline changes shape. The fragment shader lights
// the surface using normals derived from the depth map.

export const garmentVertex = `
attribute vec2 aUv;
uniform sampler2D uDepth;
uniform mat4 uMvp;
// Shared with the fragment shader, so both must declare the same precision.
uniform mediump float uDepthScale;
varying vec2 vUv;
varying float vDepth;

float depthAt(sampler2D tex, vec2 uv) {
  // (R * 65280 + G * 255) / 65535, with constants small enough for mediump.
  vec2 rg = texture2D(tex, uv).rg;
  return rg.r * 0.99610895 + rg.g * 0.00389105;
}

void main() {
  vUv = aUv;
  vDepth = depthAt(uDepth, aUv);
  // Texture rows start at the top of the image, so v grows downwards.
  vec3 pos = vec3(aUv.x - 0.5, 0.5 - aUv.y, vDepth * uDepthScale);
  gl_Position = uMvp * vec4(pos, 1.0);
}
`;

export const garmentFragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform mat3 uRotation;
uniform mediump float uDepthScale;
uniform vec2 uTexel;
uniform float uShowDepth;
varying vec2 vUv;
varying float vDepth;

float depthAt(sampler2D tex, vec2 uv) {
  // (R * 65280 + G * 255) / 65535, with constants small enough for mediump.
  vec2 rg = texture2D(tex, uv).rg;
  return rg.r * 0.99610895 + rg.g * 0.00389105;
}

void main() {
  vec4 color = texture2D(uColor, vUv);
  if (color.a < 0.02) discard;

  // Surface normal from the depth map's slope (sampled a few texels apart
  // for smoothness), in object space, then rotated with the garment.
  vec2 e = uTexel * 3.0;
  float dx = depthAt(uDepth, vUv + vec2(e.x, 0.0)) - depthAt(uDepth, vUv - vec2(e.x, 0.0));
  float dv = depthAt(uDepth, vUv + vec2(0.0, e.y)) - depthAt(uDepth, vUv - vec2(0.0, e.y));
  float slopeX = dx * uDepthScale / (2.0 * e.x);
  float slopeY = -dv * uDepthScale / (2.0 * e.y);
  vec3 n = normalize(uRotation * vec3(-slopeX, -slopeY, 1.0));

  // Soft key light from the upper left, plus a faint fabric sheen.
  vec3 light = normalize(vec3(-0.45, 0.55, 0.8));
  float diffuse = max(dot(n, light), 0.0);
  vec3 halfVec = normalize(light + vec3(0.0, 0.0, 1.0));
  float sheen = pow(max(dot(n, halfVec), 0.0), 24.0) * 0.10;
  // Slight darkening where the garment curves away at its edges.
  float occlusion = mix(0.86, 1.0, smoothstep(0.0, 0.3, vDepth));
  // Tuned so a surface facing the camera keeps its original colour
  // (diffuse is ~0.73 there).
  float shade = (0.62 + 0.52 * diffuse) * occlusion;

  vec3 rgb = color.rgb * shade + sheen;
  rgb = mix(rgb, vec3(vDepth * shade), uShowDepth);
  gl_FragColor = vec4(rgb, color.a);
}
`;

// The shadow is the garment's blurred silhouette on a flat card a little
// behind it. Because it sits at a different depth it slides against the
// garment as you tilt, which sells the "floating" look.
export const shadowVertex = `
attribute vec2 aUv;
uniform mat4 uMvp;
uniform vec3 uOffset;
varying vec2 vUv;

void main() {
  vUv = aUv;
  vec3 pos = vec3(aUv.x - 0.5, 0.5 - aUv.y, 0.0) + uOffset;
  gl_Position = uMvp * vec4(pos, 1.0);
}
`;

export const shadowFragment = `
precision mediump float;
uniform sampler2D uColor;
uniform float uRadius;
uniform float uOpacity;
varying vec2 vUv;

void main() {
  float a = texture2D(uColor, vUv).a * 0.2;
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 0.5236;
    vec2 dir = vec2(cos(angle), sin(angle));
    a += texture2D(uColor, vUv + dir * uRadius).a * 0.04;
    a += texture2D(uColor, vUv + dir * uRadius * 0.5).a * 0.0267;
  }
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
}
`;
