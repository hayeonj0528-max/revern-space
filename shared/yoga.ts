export type YogaPose = {
  bodyY: number; spineX: number; spineZ: number;
  leftArmX: number; leftArmZ: number; rightArmX: number; rightArmZ: number;
  leftLegX: number; leftLegY: number; leftLegZ: number; rightLegX: number; rightLegY: number; rightLegZ: number;
  leftKnee: number; rightKnee: number;
};
const standing: YogaPose = { bodyY: 0, spineX: 0, spineZ: 0, leftArmX: 0, leftArmZ: 0, rightArmX: 0, rightArmZ: 0, leftLegX: 0, leftLegY: 0, leftLegZ: 0, rightLegX: 0, rightLegY: 0, rightLegZ: 0, leftKnee: 0, rightKnee: 0 };
const pose = (name: string, changes: Partial<YogaPose>) => ({ name, pose: { ...standing, ...changes } });
export const YOGA_STEP_SECONDS = 4;
export const YOGA_ROUTINE = [
  pose('앉아서 호흡', { bodyY: -.38, leftArmX: 0.9, leftArmZ: -.25, rightArmX: 0.9, rightArmZ: .25, leftLegX: 1.15, rightLegX: 1.15, leftLegY: -.7, rightLegY: .7, leftLegZ: -.35, rightLegZ: .35, leftKnee: -1.95, rightKnee: -1.95 }),
  pose('팔 위로 늘이기', { leftArmZ: -2.9, rightArmZ: 2.9 }),
  pose('옆구리 늘이기 · 왼쪽', { spineZ: .32, leftArmZ: -2.85, rightArmZ: 2.55 }),
  pose('옆구리 늘이기 · 오른쪽', { spineZ: -.32, leftArmZ: -2.55, rightArmZ: 2.85 }),
  pose('전사 자세 · 왼쪽', { bodyY: -.12, leftArmZ: -Math.PI / 2, rightArmZ: Math.PI / 2, leftLegX: 0.35, leftLegZ: -.5, rightLegZ: .5, leftKnee: -0.8, rightKnee: -0.08 }),
  pose('전사 자세 · 오른쪽', { bodyY: -.12, leftArmZ: -Math.PI / 2, rightArmZ: Math.PI / 2, leftLegZ: -.5, rightLegX: 0.35, rightLegZ: .5, leftKnee: -0.08, rightKnee: -0.8 }),
  pose('나무 자세', { leftArmZ: -2.65, rightArmZ: 2.65, rightLegX: 0.8, rightLegY: .7, rightLegZ: .55, rightKnee: -1.75 }),
  pose('앞으로 접기', { bodyY: -.04, spineX: -1.1, leftArmX: 0.35, rightArmX: 0.35, leftLegX: 0.12, rightLegX: 0.12, leftKnee: -0.25, rightKnee: -0.25 })
];
export const YOGA_DURATION_SECONDS = YOGA_ROUTINE.length * YOGA_STEP_SECONDS;
export function yogaFrame(now: number, startedAt: number) {
  const seconds = Math.max(0, now - startedAt) / 1000 % YOGA_DURATION_SECONDS;
  const index = Math.floor(seconds / YOGA_STEP_SECONDS), within = seconds % YOGA_STEP_SECONDS;
  const current = YOGA_ROUTINE[index], previous = YOGA_ROUTINE[(index + YOGA_ROUTINE.length - 1) % YOGA_ROUTINE.length];
  const t = Math.min(1, within / .9), blend = t * t * (3 - 2 * t);
  const result = { ...standing };
  for (const key of Object.keys(result) as (keyof YogaPose)[]) result[key] = previous.pose[key] + (current.pose[key] - previous.pose[key]) * blend;
  return { index, name: current.name, pose: result };
}
