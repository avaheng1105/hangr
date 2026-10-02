import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useEffect, useRef, useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { createGrid, createProgram, hexToRgb, ImageSource, loadTexture } from './gl';
import { mat3From, multiply, perspective, rotationX, rotationY, translation } from './math';
import { garmentFragment, garmentVertex, shadowFragment, shadowVertex } from './shaders';
import { Tilt, useTiltInput } from './useTiltInput';

export type TiltViewerProps = {
  // cutout / depth are loaded once when the GL view starts; give the viewer a
  // new `key` to show a different item.
  /** Transparent cutout (pipeline output `cutout.png`). */
  cutout: ImageSource;
  /** Depth map (pipeline output `depth.png`). */
  depth: ImageSource;
  /** How far the garment bulges towards you, relative to its width. */
  depthScale?: number;
  /** Maximum tilt in degrees. */
  maxTiltDeg?: number;
  /** Follow the phone's motion sensor (in addition to dragging). */
  useSensor?: boolean;
  /** Gentle automatic sway when there's no sensor and no finger down. */
  idleSway?: boolean;
  /** Render the depth map instead of the colours (for tuning). */
  showDepth?: boolean;
  background?: string;
  style?: StyleProp<ViewStyle>;
};

const GRID_SEGMENTS = 160;
const FOV = (28 * Math.PI) / 180;
const SHADOW_OFFSET: [number, number, number] = [0.03, -0.045, -0.08];

// Spring that eases the garment towards the target tilt.
const STIFFNESS = 70;
const DAMPING = 2 * Math.sqrt(STIFFNESS);

export function TiltViewer({
  cutout,
  depth,
  depthScale = 0.14,
  maxTiltDeg = 22,
  useSensor = true,
  idleSway = true,
  showDepth = false,
  background = '#F4F1EA',
  style,
}: TiltViewerProps) {
  const maxTilt = (maxTiltDeg * Math.PI) / 180;
  const input = useTiltInput(maxTilt, useSensor);
  const [error, setError] = useState<string | null>(null);

  // Props read by the render loop without restarting it.
  const live = useRef({ depthScale, showDepth, idleSway, background });
  useEffect(() => {
    live.current = { depthScale, showDepth, idleSway, background };
  }, [depthScale, showDepth, idleSway, background]);

  const frameHandle = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frameHandle.current !== null) cancelAnimationFrame(frameHandle.current);
      frameHandle.current = null;
    },
    [],
  );

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    try {
      const garment = createProgram(gl, garmentVertex, garmentFragment);
      const shadow = createProgram(gl, shadowVertex, shadowFragment);
      const grid = createGrid(gl, GRID_SEGMENTS);

      const draw = (tilt: Tilt, tex: Textures) => {
        const { drawingBufferWidth: w, drawingBufferHeight: h } = gl;
        const [r, g, b] = hexToRgb(live.current.background);
        gl.viewport(0, 0, w, h);
        gl.clearColor(r, g, b, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (!tex.color || !tex.depth) return;

        // Fit the unit square (plus margin) in the view, whatever its aspect.
        const aspect = w / h;
        const distance = 0.6 / (Math.tan(FOV / 2) * Math.min(1, aspect));
        const model = multiply(rotationY(tilt.yaw), rotationX(tilt.pitch));
        const view = translation(0, 0, -distance);
        const mvp = multiply(perspective(FOV, aspect, 0.1, 10), multiply(view, model));

        gl.enable(gl.BLEND);
        // Keep the canvas alpha at 1 (matters on web).
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindBuffer(gl.ARRAY_BUFFER, grid.uvBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, grid.indexBuffer);

        // 1. Shadow card, behind the garment.
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(shadow);
        bindUv(gl, shadow);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex.color);
        gl.uniform1i(gl.getUniformLocation(shadow, 'uColor'), 0);
        gl.uniformMatrix4fv(gl.getUniformLocation(shadow, 'uMvp'), false, mvp);
        gl.uniform3fv(gl.getUniformLocation(shadow, 'uOffset'), SHADOW_OFFSET);
        gl.uniform1f(gl.getUniformLocation(shadow, 'uRadius'), 0.025);
        gl.uniform1f(gl.getUniformLocation(shadow, 'uOpacity'), 0.32);
        gl.drawElements(gl.TRIANGLES, grid.indexCount, gl.UNSIGNED_SHORT, 0);

        // 2. The garment itself.
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(garment);
        bindUv(gl, garment);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex.color);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tex.depth);
        gl.uniform1i(gl.getUniformLocation(garment, 'uColor'), 0);
        gl.uniform1i(gl.getUniformLocation(garment, 'uDepth'), 1);
        gl.uniformMatrix4fv(gl.getUniformLocation(garment, 'uMvp'), false, mvp);
        gl.uniformMatrix3fv(gl.getUniformLocation(garment, 'uRotation'), false, mat3From(model));
        gl.uniform1f(gl.getUniformLocation(garment, 'uDepthScale'), live.current.depthScale);
        gl.uniform2f(gl.getUniformLocation(garment, 'uTexel'), tex.texel, tex.texel);
        gl.uniform1f(gl.getUniformLocation(garment, 'uShowDepth'), live.current.showDepth ? 1 : 0);
        gl.drawElements(gl.TRIANGLES, grid.indexCount, gl.UNSIGNED_SHORT, 0);
      };

      // Draw the background straight away, then the garment once loaded.
      const textures: Textures = { color: null, depth: null, texel: 1 / 1024 };
      Promise.all([loadTexture(gl, cutout), loadTexture(gl, depth)])
        .then(([c, d]) => {
          textures.color = c.texture;
          textures.depth = d.texture;
          if (d.width) textures.texel = 1 / d.width;
        })
        .catch((e: Error) => setError(e.message));

      const tilt: Tilt = { pitch: 0, yaw: 0 };
      const velocity: Tilt = { pitch: 0, yaw: 0 };
      let last = Date.now();
      const start = last;

      const frame = () => {
        const now = Date.now();
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;

        let target = input.target;
        if (live.current.idleSway && !input.hasSensor && !input.dragging) {
          const t = (now - start) / 1000;
          target = { yaw: 0.16 * Math.sin(t * 0.9), pitch: 0.08 * Math.sin(t * 0.63) };
        }
        for (const axis of ['pitch', 'yaw'] as const) {
          velocity[axis] +=
            ((target[axis] - tilt[axis]) * STIFFNESS - velocity[axis] * DAMPING) * dt;
          tilt[axis] += velocity[axis] * dt;
        }

        draw(tilt, textures);
        gl.flush();
        gl.endFrameEXP();
        frameHandle.current = requestAnimationFrame(frame);
      };
      frame();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: background }, style]}
      onLayout={(e) => input.setSize(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
      {...input.panHandlers}
    >
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      {error ? <Text style={styles.error}>Viewer error: {error}</Text> : null}
    </View>
  );
}

type Textures = { color: WebGLTexture | null; depth: WebGLTexture | null; texel: number };

function bindUv(gl: ExpoWebGLRenderingContext, program: WebGLProgram) {
  const loc = gl.getAttribLocation(program, 'aUv');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  error: { position: 'absolute', bottom: 8, left: 8, right: 8, color: '#B00020' },
});
