import { slide, SPEED } from './world.js';

// Gentler in-place turn: ~0.23s for 90° / ~0.45s for 180°.
const TURN_SPEED = Math.PI * 2.2;
export function movementYaw(dx: number, dz: number) { return Math.atan2(-dx, -dz); }
export function angleDelta(from: number, to: number) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }

/** Default walk: turn in place to face the move, then step. */
export function stepLocomotion(x: number, z: number, yaw: number, dx: number, dz: number, dt: number) {
  dt = Math.max(0, Math.min(dt, .1));
  const length = Math.max(1, Math.hypot(dx, dz));
  const [nextX, nextZ] = slide(x, z, dx / length * SPEED * dt, dz / length * SPEED * dt);
  const distance = Math.hypot(nextX - x, nextZ - z);
  if (distance < .000001) return { x, z, yaw, walking: false };
  const wanted = movementYaw(nextX - x, nextZ - z), turn = angleDelta(yaw, wanted);
  const turnTime = Math.abs(turn) / TURN_SPEED;
  if (turnTime >= dt) return { x, z, yaw: yaw + Math.sign(turn) * TURN_SPEED * dt, walking: false };
  const remaining = dt - turnTime;
  const [forwardX, forwardZ] = slide(x, z, (nextX - x) * remaining / dt, (nextZ - z) * remaining / dt);
  const moved = Math.hypot(forwardX - x, forwardZ - z);
  return { x: forwardX, z: forwardZ, yaw: moved > .000001 ? movementYaw(forwardX - x, forwardZ - z) : wanted, walking: moved > .000001 };
}
