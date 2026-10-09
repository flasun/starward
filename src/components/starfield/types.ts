/** The engine's public surface: what the UI passes in and what each frame reports back. */

import type { GameCommand } from "./gamepad.ts";

export type CameraView = "cockpit" | "chase" | "left" | "right" | "above";

export type StarfieldParams = {
  speed: number;
  density: number;
  boost: boolean;
  muted: boolean;
  reducedMotion: boolean;
  targetId: string;
  autopilot: boolean;
  focus: boolean;
  orbit: boolean;
  orbitLevel: number;
  view: CameraView;
  aboveSide: -1 | 0 | 1;
  paused: boolean;
  depots: { x: number; z: number }[];
};

export type PlotBlip = {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  target: boolean;
  close: boolean;
  ship?: boolean;
  heading?: number;
  ring?: boolean;
  depot?: boolean;
};

export type FrameMarker = {
  id: string;
  name: string;
  x: number;
  y: number;
  primary: boolean;
};

export type StarfieldHooks = {
  getParams: () => StarfieldParams;
  onSpeed: (next: number) => void;
  onToggleBoost: () => void;
  onFrame: (snap: {
    warpText: string;
    stickX: number;
    stickY: number;
    pitch: number;
    leveling: boolean;
    boosting: boolean;
    rangeText: string;
    speedText: string;
    targetId: string;
    nearId: string;
    chartId: string;
    /** The player has touched a control. Nothing is charted or logged before this. */
    engaged: boolean;
    alert: string;
    markers: FrameMarker[];
    plot: PlotBlip[];
    locked: boolean;
    orbiting: boolean;
    captureText: string;
    shipX: number;
    shipZ: number;
  }) => void;
  onError: (message: string) => void;
  onCancelAutopilot: () => void;
  onCancelOrbit: () => void;
  onToggleOrbit: () => void;
  onFocus: (id: string) => void;
  onCancelFocus: () => void;
  onBeginLap: (id: string) => void;
  onEndLap: () => void;
  onTask: (id: string, seconds: number) => void;
  /** A gamepad button the game handles. */
  onPad: (command: GameCommand) => void;
  onGamepad: (connected: boolean) => void;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setSteer?: (v: number) => void;
      setKeys?: (codes: string[]) => void;
      getPitch?: () => number;
      getFps?: () => number;
    };
  }
}
