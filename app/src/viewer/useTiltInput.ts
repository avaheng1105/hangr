import { DeviceMotion } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { PanResponder, Platform } from 'react-native';

export type Tilt = { pitch: number; yaw: number };

// How fast "level" re-centres on the way you're holding the phone.
const RECENTER_PER_SAMPLE = 0.015;
// Phone tilt -> garment tilt.
const SENSOR_GAIN = 1.2;

const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
const LEVEL: Tilt = { pitch: 0, yaw: 0 };

/**
 * Combines the phone's motion sensor and touch drags into one tilt target.
 * Dragging wins while a finger is down; on release the garment returns to
 * the sensor angle (or to centre when there's no sensor).
 *
 * Mutable on purpose: the render loop reads it every frame, outside React.
 */
export class TiltController {
  /** Where the garment should be turned to right now, in radians. */
  target: Tilt = LEVEL;
  /** True once the motion sensor has sent data (false on web / simulators). */
  hasSensor = false;
  dragging = false;

  private sensorTilt: Tilt = LEVEL;
  private baseline: { beta: number; gamma: number } | null = null;
  private dragStart: Tilt = LEVEL;
  private width = 300;
  private height = 300;

  constructor(public maxTilt: number) {}

  readonly panHandlers = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      this.dragging = true;
      this.dragStart = this.target;
    },
    onPanResponderMove: (_, g) => {
      const max = this.maxTilt;
      this.target = {
        yaw: clamp(this.dragStart.yaw + (g.dx / this.width) * max * 2.5, max),
        pitch: clamp(this.dragStart.pitch + (g.dy / this.height) * max * 2.5, max),
      };
    },
    onPanResponderRelease: () => this.endDrag(),
    onPanResponderTerminate: () => this.endDrag(),
  }).panHandlers;

  setMaxTilt(maxTilt: number) {
    this.maxTilt = maxTilt;
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /** Feed a DeviceMotion rotation sample (radians). */
  onSensor(beta: number, gamma: number) {
    this.hasSensor = true;
    if (!this.baseline) this.baseline = { beta, gamma };
    this.baseline.beta += (beta - this.baseline.beta) * RECENTER_PER_SAMPLE;
    this.baseline.gamma += (gamma - this.baseline.gamma) * RECENTER_PER_SAMPLE;
    this.sensorTilt = {
      pitch: clamp((beta - this.baseline.beta) * SENSOR_GAIN, this.maxTilt),
      yaw: clamp((gamma - this.baseline.gamma) * SENSOR_GAIN, this.maxTilt),
    };
    if (!this.dragging) this.target = this.sensorTilt;
  }

  resetSensor() {
    this.hasSensor = false;
    this.baseline = null;
    this.sensorTilt = LEVEL;
    if (!this.dragging) this.target = LEVEL;
  }

  private endDrag() {
    this.dragging = false;
    this.target = this.hasSensor ? this.sensorTilt : LEVEL;
  }
}

export function useTiltInput(maxTilt: number, useSensor: boolean): TiltController {
  const [controller] = useState(() => new TiltController(maxTilt));

  useEffect(() => {
    controller.setMaxTilt(maxTilt);
  }, [controller, maxTilt]);

  useEffect(() => {
    if (!useSensor || Platform.OS === 'web') return;
    let subscription: { remove(): void } | undefined;
    let cancelled = false;

    DeviceMotion.isAvailableAsync().then((available) => {
      if (!available || cancelled) return;
      DeviceMotion.setUpdateInterval(16);
      subscription = DeviceMotion.addListener(({ rotation }) => {
        if (rotation) controller.onSensor(rotation.beta, rotation.gamma);
      });
    });
    return () => {
      cancelled = true;
      subscription?.remove();
      controller.resetSensor();
    };
  }, [controller, useSensor]);

  return controller;
}
