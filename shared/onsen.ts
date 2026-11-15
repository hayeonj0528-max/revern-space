export const ONSEN = {
  id: 'onsen' as const,
  name: '노천탕',
  english: 'OPEN-AIR BATH',
  x: 24,
  z: 22,
  w: 8,
  d: 7,
  entry: [24, 17.8] as [number, number]
};

/** Hammocks hang off the clearing edge — never across the south entrance path. */
export const ONSEN_HAMMOCKS = [
  { id: 'hammock-0', a: [19.2, 25.4] as [number, number], b: [23.6, 27.8] as [number, number] },
  { id: 'hammock-1', a: [28.2, 25.8] as [number, number], b: [32.2, 23.2] as [number, number] },
  { id: 'hammock-2', a: [29.5, 20.5] as [number, number], b: [32.8, 24.0] as [number, number] },
  { id: 'hammock-3', a: [18.2, 23.6] as [number, number], b: [21.4, 26.5] as [number, number] }
];

function distToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}

/** East–west walk corridor — center lane only; side rails keep you on the path. */
export const ONSEN_PATH = {
  from: [10.5, 16] as [number, number],
  to: [24, 16] as [number, number],
  /** Visual path half-width (curb to center). */
  halfW: 1.35,
  /** Walkable half-width — narrower so you stay in the middle. */
  walkHalf: 1.0
} as const;

export function onsenPathLength() {
  const [ax, az] = ONSEN_PATH.from, [bx, bz] = ONSEN_PATH.to;
  return Math.hypot(bx - ax, bz - az);
}

export function onsenPathYaw() {
  const [ax, az] = ONSEN_PATH.from, [bx, bz] = ONSEN_PATH.to;
  return Math.atan2(bx - ax, bz - az);
}

export function onOnsenWalk(x: number, z: number) {
  const { from, to, walkHalf } = ONSEN_PATH;
  if (distToSegment(x, z, from[0], from[1], to[0], to[1]) < walkHalf) return true;
  // Narrow apron from path end up to the bath stairs.
  if (Math.abs(x - ONSEN.x) < walkHalf + .35 && z >= 14.5 && z <= 20.5) return true;
  return false;
}

export function onBambooPath(x: number, z: number) {
  if (onOnsenWalk(x, z)) return true;
  if (x > 9.5 && x < 16 && z > 8.5 && z < 12.8) return true;
  if (x > 14 && x < 50 && z < 13.2 && z > -15.5) return true;
  if (Math.abs(x - ONSEN.x) < 9 && Math.abs(z - ONSEN.z) < 8) return true;
  for (const h of ONSEN_HAMMOCKS) {
    if (distToSegment(x, z, h.a[0], h.a[1], h.b[0], h.b[1]) < 2.4) return true;
  }
  return false;
}

export function onsenAt(x: number, z: number) {
  return Math.abs(x - ONSEN.x) < ONSEN.w / 2 - .25 && z > ONSEN.z - ONSEN.d / 2 + .2 && z < ONSEN.z + ONSEN.d / 2 - .2 ? ONSEN : undefined;
}

export function nearOnsenEntry(x: number, z: number) {
  return Math.hypot(x - ONSEN.entry[0], z - ONSEN.entry[1]) <= 5 ? ONSEN : undefined;
}

export function onsenGroundHeight(x: number, z: number) {
  if (!onsenAt(x, z)) return 0;
  const south = ONSEN.z - ONSEN.d / 2;
  return -.65 * Math.min(1, Math.max(0, (z - south) / 2.2));
}
