import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Point = { x: number; y: number };

export type GazeHandlers = {
  onSample: (x: number, y: number) => void;
  onStatus: (text: string) => void;
  /** After calibration, once a frame: how closed both eyes are, 0 to 1, or null with no face. */
  onEyes?: (closed: number | null) => void;
  /** Calibration is done and steering has begun. */
  onReady?: () => void;
};

type Category = { categoryName: string; score: number };

declare global {
  interface Window {
    /** Browser tests stand in for the camera: they get the handlers and feed them by hand. */
    __fakeGaze?: (handlers: GazeHandlers) => Promise<() => void>;
  }
}

/** Webcam iris tracking. Frames stay in the browser. Returns a stop function. */
export async function startGaze(handlers: GazeHandlers): Promise<() => void> {
  if (window.__fakeGaze) return window.__fakeGaze(handlers);
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Gaze needs a camera.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch {
    throw new Error("Camera blocked. Gaze stays off.");
  }

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play();
    const vision = await FilesetResolver.forVisionTasks(WASM);
    let landmarker: FaceLandmarker;
    try {
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    } catch {
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    }
    return runGaze(video, stream, landmarker, handlers);
  } catch (err) {
    video.pause();
    video.srcObject = null;
    for (const track of stream.getTracks()) track.stop();
    throw err instanceof Error ? err : new Error("Gaze could not start.");
  }
}

function runGaze(
  video: HTMLVideoElement,
  stream: MediaStream,
  landmarker: FaceLandmarker,
  handlers: GazeHandlers,
): () => void {
  let stopped = false;
  let raf = 0;
  let stamp = 0;
  let smoothX = 0;
  let smoothY = 0;
  let baseX = 0;
  let baseY = 0;
  let taken = 0;
  const need = 18;
  handlers.onStatus("Look at the center");

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    landmarker.close();
    video.pause();
    video.srcObject = null;
    for (const track of stream.getTracks()) track.stop();
    handlers.onSample(0, 0);
    handlers.onStatus("");
  };

  const frame = () => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (video.readyState < 2) return;
    stamp = Math.max(stamp + 33, Math.round(performance.now()));
    let marks: Point[] | undefined;
    let shapes: Category[] | undefined;
    try {
      const result = landmarker.detectForVideo(video, stamp);
      marks = result.faceLandmarks[0] as Point[] | undefined;
      shapes = result.faceBlendshapes?.[0]?.categories;
    } catch {
      return;
    }
    if (taken >= need) handlers.onEyes?.(marks ? eyesClosed(shapes) : null);
    const sample = marks ? measure(marks) : null;
    if (!sample) {
      smoothX *= 0.85;
      smoothY *= 0.85;
      if (taken >= need) handlers.onSample(smoothX, smoothY);
      return;
    }
    if (taken < need) {
      baseX += sample.x;
      baseY += sample.y;
      taken += 1;
      if (taken === need) {
        baseX /= need;
        baseY /= need;
        handlers.onStatus("");
        handlers.onReady?.();
      }
      return;
    }
    const rawX = clamp(-(sample.x - baseX) / 0.11, -1, 1);
    const rawY = clamp((sample.y - baseY) / 0.09, -1, 1);
    smoothX += (dead(rawX) - smoothX) * 0.22;
    smoothY += (dead(rawY) - smoothY) * 0.22;
    handlers.onSample(smoothX, smoothY);
  };
  raf = requestAnimationFrame(frame);
  return stop;
}

function measure(marks: Point[]): { x: number; y: number } | null {
  if (marks.length >= 478) {
    const open =
      Math.abs(at(marks, 159).y - at(marks, 145).y) + Math.abs(at(marks, 386).y - at(marks, 374).y);
    if (open < 0.012) return null;
    const leftX = span(at(marks, 33).x, at(marks, 133).x, at(marks, 468).x);
    const rightX = span(at(marks, 263).x, at(marks, 362).x, at(marks, 473).x);
    const leftY = span(at(marks, 159).y, at(marks, 145).y, at(marks, 468).y);
    const rightY = span(at(marks, 386).y, at(marks, 374).y, at(marks, 473).y);
    return { x: (leftX + rightX) / 2, y: (leftY + rightY) / 2 };
  }
  if (marks.length < 454) return null;
  const nose = at(marks, 1);
  return {
    x: span(at(marks, 234).x, at(marks, 454).x, nose.x),
    y: span(at(marks, 10).y, at(marks, 152).y, nose.y),
  };
}

/** The less closed of the two eyes, so a squint or a wink does not count. */
function eyesClosed(shapes: Category[] | undefined): number | null {
  const left = shapes?.find((shape) => shape.categoryName === "eyeBlinkLeft")?.score;
  const right = shapes?.find((shape) => shape.categoryName === "eyeBlinkRight")?.score;
  if (left === undefined || right === undefined) return null;
  return Math.min(left, right);
}

function at(marks: Point[], index: number): Point {
  return marks[index] ?? { x: 0.5, y: 0.5 };
}

function span(a: number, b: number, point: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return (point - lo) / (hi - lo || 1);
}

function dead(value: number): number {
  const amount = Math.abs(value);
  if (amount < 0.16) return 0;
  return Math.sign(value) * Math.min(1, (amount - 0.16) / 0.84);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
