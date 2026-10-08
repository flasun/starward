/** The player's ship: flat-shaded triangles, seven floats a vertex (position, colour, glow). */

function shipMesh(): Float32Array {
  const v: number[] = [];
  const push = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    color: readonly [number, number, number],
    glow = 0,
  ) => {
    for (const p of [a, b, c]) v.push(p[0], p[1], p[2], color[0], color[1], color[2], glow);
  };
  const nose: [number, number, number] = [0, 0.05, 2.75];
  const spine: [number, number, number] = [0, 0.36, 0.15];
  const keel: [number, number, number] = [0, -0.22, 0.08];
  const right: [number, number, number] = [1.55, 0.05, -0.15];
  const left: [number, number, number] = [-1.55, 0.05, -0.15];
  const tipR: [number, number, number] = [2.05, 0.22, -0.72];
  const tipL: [number, number, number] = [-2.05, 0.22, -0.72];
  const tailTop: [number, number, number] = [0, 0.2, -1.6];
  const tailBot: [number, number, number] = [0, -0.16, -1.5];
  const white: readonly [number, number, number] = [0.9, 0.93, 0.97];
  const hull: readonly [number, number, number] = [0.58, 0.64, 0.72];
  const shade: readonly [number, number, number] = [0.34, 0.38, 0.46];
  const belly: readonly [number, number, number] = [0.16, 0.18, 0.24];
  const glass: readonly [number, number, number] = [0.55, 0.84, 1];
  const stripe: readonly [number, number, number] = [0.72, 0.9, 1];
  const engine: readonly [number, number, number] = [0.65, 0.88, 1];
  push(nose, right, spine, white);
  push(nose, spine, left, white);
  push(spine, right, tailTop, hull);
  push(spine, tailTop, left, hull);
  push(right, tipR, tailTop, white);
  push(left, tailTop, tipL, white);
  push(nose, keel, right, shade);
  push(nose, left, keel, shade);
  push(keel, tailBot, right, belly);
  push(keel, left, tailBot, belly);
  push(right, tailBot, tipR, shade);
  push(left, tipL, tailBot, shade);
  push(tailTop, [0.36, 0.02, -1.5], tailBot, belly);
  push(tailTop, tailBot, [-0.36, 0.02, -1.5], belly);
  const peak: [number, number, number] = [0, 0.62, 0.35];
  const brow: [number, number, number] = [0, 0.16, 1.28];
  push(brow, [0.24, 0.18, 0.25], peak, glass, 0.4);
  push(brow, peak, [-0.24, 0.18, 0.25], glass, 0.4);
  push([0, 0.4, 0.95], [0.055, 0.34, -0.55], [0, 0.32, -0.55], stripe, 0.9);
  push([0, 0.4, 0.95], [0, 0.32, -0.55], [-0.055, 0.34, -0.55], stripe, 0.9);
  push([-0.5, 0.08, -1.42], [-0.28, 0.08, -1.42], [-0.39, 0.02, -1.78], engine, 1);
  push([0.28, 0.08, -1.42], [0.5, 0.08, -1.42], [0.39, 0.02, -1.78], engine, 1);
  push([1.92, 0.2, -0.58], tipR, [1.98, 0.16, -0.78], engine, 1);
  push(tipL, [-1.92, 0.2, -0.58], [-1.98, 0.16, -0.78], engine, 1);
  return new Float32Array(v);
}

export const SHIP_DATA = shipMesh();
export const SHIP_STRIDE = 7;
export const SHIP_VERTS = SHIP_DATA.length / SHIP_STRIDE;
