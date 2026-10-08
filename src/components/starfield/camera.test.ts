import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type CameraShip, cameraEye, passFrame } from "./camera.ts";
import { BODIES, bodyById, bodyPosition } from "./system.ts";

const ship = (extra: Partial<CameraShip> = {}): CameraShip => ({
  x: 0,
  y: 0,
  z: -5000,
  yaw: 0,
  pitch: 0,
  boost: 0,
  orbitSign: 1,
  time: 0,
  aboveSide: 0,
  bodies: BODIES,
  ...extra,
});

describe("cameraEye", () => {
  it("puts the cockpit at the nose and the chase camera behind and above", () => {
    const [, , cockpitZ] = cameraEye("cockpit", false, false, 0, ship());
    const [chaseX, chaseY, chaseZ] = cameraEye("chase", false, false, 0, ship());
    assert.ok(Math.abs(cockpitZ) < 1);
    assert.equal(chaseX, 0);
    assert.ok(chaseY > 1 && chaseZ < -10);
  });

  it("mirrors the wing cameras", () => {
    const [leftX, leftY, leftZ] = cameraEye("left", false, false, 0, ship());
    const [rightX, rightY, rightZ] = cameraEye("right", false, false, 0, ship());
    assert.ok(leftX < 0);
    assert.deepEqual([rightX, rightY, rightZ], [-leftX, leftY, leftZ]);
  });

  it("pulls the chase camera back under boost, less with reduced motion", () => {
    const calm = cameraEye("chase", false, false, 0, ship())[2];
    const boosted = cameraEye("chase", false, false, 0, ship({ boost: 1 }))[2];
    const gentle = cameraEye("chase", false, true, 0, ship({ boost: 1 }))[2];
    assert.ok(boosted < gentle && gentle < calm);
  });

  it("keeps the overhead perch inside its box whatever the stick does", () => {
    for (const aboveSide of [-1, 0, 1]) {
      for (const stickX of [-1, 0, 1]) {
        const [x, y, z] = cameraEye("above", false, false, stickX, ship({ aboveSide, boost: 1, pitch: 1 }));
        assert.ok(x >= -11 && x <= 11 && y >= 2.15 && y <= 5.2 && z >= -14 && z <= -6.4, `${aboveSide}/${stickX}`);
      }
    }
  });
});

describe("passFrame", () => {
  it("reports nothing in deep space", () => {
    assert.deepEqual(passFrame(ship({ x: 1e6, z: 1e6 })), { side: 0, weight: 0 });
  });

  it("weights a close planet ahead, on the side it sits", () => {
    const earth = bodyPosition(bodyById("earth"), 0);
    // Facing +z with Earth ahead and to the right (+x in camera space).
    const close = passFrame(ship({ x: earth.x - 20, y: earth.y, z: earth.z - 60, bodies: [bodyById("earth")] }));
    assert.ok(close.weight > 0);
    assert.ok(close.side > 0);
  });
});
