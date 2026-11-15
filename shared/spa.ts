import { onsenGroundHeight } from './onsen.js';

export type BathId = 'warm' | 'cold' | 'onsen';
export const SPA_BATHS = [
  { id: 'warm' as const, name: '온탕', english: 'WARM BATH', x: 27.5, z: -5, w: 9, d: 10, entry: [27.5, 1.8] as [number, number] },
  { id: 'cold' as const, name: '냉탕', english: 'COLD BATH', x: 39, z: -5, w: 8, d: 10, entry: [39, 1.8] as [number, number] }
];
export const SAUNA = { center: [55, 0] as [number, number], size: [18, 24] as [number, number], spawn: [48.5, 3] as [number, number], heater: [51, -6] as [number, number], reach: 3.2, steamDuration: 8000, steamCooldown: 10000 };
export function bathAt(x: number, z: number) {
  return SPA_BATHS.find(bath => Math.abs(x - bath.x) < bath.w / 2 - .2 && z > -9.8 && z < 0);
}
export function groundHeightAt(x: number, z: number) {
  if (bathAt(x, z)) return -.8 * Math.min(1, -z / 1.8);
  return onsenGroundHeight(x, z);
}
export function nearBathEntry(x: number, z: number) {
  return SPA_BATHS.find(bath => Math.hypot(x - bath.entry[0], z - bath.entry[1]) <= 3.2);
}
