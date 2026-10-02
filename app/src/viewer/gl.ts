import { Asset } from 'expo-asset';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { Platform } from 'react-native';

type GL = ExpoWebGLRenderingContext;

/** A bundled image (`require('./x.png')`) or a remote URL. */
export type ImageSource = Parameters<typeof Asset.fromModule>[0];

export function createProgram(gl: GL, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${cleanLog(gl.getShaderInfoLog(shader))}`);
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${cleanLog(gl.getProgramInfoLog(program))}`);
  }
  return program;
}

// Driver logs can end in NUL / whitespace.
const cleanLog = (log: string | null) => (log ?? '').replace(/[\s\0]+$/, '');

export type Grid = { uvBuffer: WebGLBuffer; indexBuffer: WebGLBuffer; indexCount: number };

/** A unit square split into `segments` x `segments` quads, as UVs in 0..1. */
export function createGrid(gl: GL, segments: number): Grid {
  const row = segments + 1;
  const uvs = new Float32Array(row * row * 2);
  for (let y = 0; y < row; y++) {
    for (let x = 0; x < row; x++) {
      const i = (y * row + x) * 2;
      uvs[i] = x / segments;
      uvs[i + 1] = y / segments;
    }
  }
  const indices = new Uint16Array(segments * segments * 6);
  let k = 0;
  for (let y = 0; y < segments; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  const uvBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { uvBuffer, indexBuffer, indexCount: indices.length };
}

export type Texture = { texture: WebGLTexture; width: number; height: number };

export async function loadTexture(gl: GL, source: ImageSource): Promise<Texture> {
  // Handles bundled images (a number on native, an object on web) and URLs.
  const asset = Asset.fromModule(source);
  await asset.downloadAsync();
  const image = Platform.OS === 'web' ? await loadHtmlImage(asset.localUri ?? asset.uri) : null;

  // Create and fill the texture in one synchronous block: other textures may
  // have been bound while we were awaiting the download.
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (image) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return { texture, width: image.naturalWidth, height: image.naturalHeight };
  }
  // expo-gl reads the file itself when given an object with a file:// `localUri`.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset as never);
  return { texture, width: asset.width ?? 0, height: asset.height ?? 0 };
}

function loadHtmlImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load image ${uri}`));
    image.src = uri;
  });
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
