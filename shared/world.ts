import { SPA_BATHS, SAUNA, type BathId } from './spa.js';
import { ONSEN, ONSEN_HAMMOCKS, ONSEN_PATH } from './onsen.js';

export type ZoneId = 'courtyard' | 'yoga' | 'spa' | 'sauna' | 'floating' | 'tea' | 'campfire' | 'onsen';
export type Activity = 'idle' | 'walking' | 'yoga' | 'sitting' | 'lying' | 'drinking' | 'pouring' | 'bathing' | 'sauna' | 'roasting';
export type Appearance = { skin: number; hair: number; outfit: number };
export type Marshmallow = 'none' | 'roasting' | 'ready';
export const TEAS = [
  { id: 'green', name: '녹차', color: '#7d9a52' },
  { id: 'chamomile', name: '캐모마일', color: '#e6d48a' },
  { id: 'rose', name: '장미차', color: '#d4929a' },
  { id: 'jasmine', name: '자스민', color: '#c5d4a0' }
] as const;
export type TeaId = typeof TEAS[number]['id'];
export type DrinkId = TeaId | 'sikhye';
export function isTea(drink: string | null | undefined): drink is TeaId {
  return TEAS.some(t => t.id === drink);
}
export function teaById(id: string | null | undefined) {
  return TEAS.find(t => t.id === id);
}
/** Quiet corner of the tea room — books and a cushion for reading. */
export const TEA_LIBRARY = { x: -10.2, z: 38.4, yaw: Math.PI / 2, reach: 2.55 } as const;
export const TEA_BOOKS = [
  { id: 'wind', title: '바람의 여백', author: '다실 문고', pages: ['서두르지 않아도 좋은 하루가 있습니다.', '창밖의 바람이 먼저 숨을 고르게 합니다.', '차를 식히듯, 마음도 잠시 식혀 두세요.'] },
  { id: 'stone', title: '돌 위의 고요', author: '다실 문고', pages: ['단단한 것은 소리내지 않습니다.', '발밑의 돌이 길을 기억해 둡니다.', '앉아 있으면, 풍경이 먼저 다가옵니다.'] },
  { id: 'leaf', title: '잎이 머무는 시간', author: '다실 문고', pages: ['잎은 떨어지며도 향을 남깁니다.', '한 잔의 차가 하루를 나누어 줍니다.', '읽다가 멈추어도, 그것은 읽기의 일부입니다.'] }
] as const;
export const TEA_QUOTES = [
  '서두르지 않는 마음이 가장 먼 길을 갑니다.',
  '고요는 비어 있음이 아니라, 채워진 여유입니다.',
  '한 모금의 차가 하루의 속도를 늦춥니다.',
  '말은 적어도, 마음은 충분히 따뜻할 수 있습니다.',
  '오늘 남긴 한 줄이, 내일의 쉼이 됩니다.',
  '바람이 스쳐 가도 나무는 제자리를 지킵니다.',
  '천천히 마시는 차처럼, 천천히 나 자신을 만나 보세요.',
  '완벽하지 않아도, 머무를 자리는 충분합니다.',
  '작은 침묵이 큰 소음을 잠재웁니다.',
  '지금 이 숨이, 다시 시작하기에 충분한 이유입니다.'
] as const;
export type Player = {
  id: string;
  nickname: string;
  appearance: Appearance;
  x: number;
  z: number;
  yaw: number;
  zone: ZoneId;
  activity: Activity;
  towel: boolean;
  connected: boolean;
  slot: string | null;
  actionUntil: number;
  drink: DrinkId | null;
  marshmallow: Marshmallow;
};
export type Slot = { id: string; zone: ZoneId; kind: 'mat' | 'tube' | 'seat' | 'sauna-bench' | 'log' | 'hammock'; x: number; z: number; yaw: number; exit: [number, number] };
export type Snapshot = {
  type: 'state';
  now: number;
  yogaStartedAt: number;
  saunaSteamStartedAt: number;
  worryBurnSeq: number;
  players: Player[];
  occupancy: Record<string, string>;
  count: number;
  capacity: number;
  graceMs: number;
};
export type ClientMessage =
  | { type: 'join'; nickname: string; appearance: Appearance; token?: string }
  | { type: 'move'; dx: number; dz: number; yaw: number }
  | { type: 'travel'; zone: ZoneId }
  | { type: 'enter-onsen-path' }
  | { type: 'reserve'; slot: string }
  | { type: 'join-yoga' }
  | { type: 'enter-bath'; bath: BathId }
  | { type: 'exit-bath' }
  | { type: 'join-sauna' }
  | { type: 'sauna-steam' }
  | { type: 'release' }
  | { type: 'towel' }
  | { type: 'drink'; drink: DrinkId }
  | { type: 'pour'; tea: TeaId }
  | { type: 'roast' }
  | { type: 'eat-marshmallow' }
  | { type: 'burn-worry' }
  | { type: 'chat'; text: string }
  | { type: 'leave' };

export const SKINS = ['#e9be9c', '#bc8665', '#81523e'];
export const HAIRS = ['#30251f', '#6b4b32', '#302e2b'];
export const OUTFITS = ['#a7b3a0', '#d5b8a2', '#a6bac3', '#b6a8bd'];
export const SPEED = 5;
export const WORLD = { minX: -64, maxX: 82, minZ: -67, maxZ: 53 };
export const ZONES: Record<ZoneId, { name: string; english: string; subtitle: string; center: [number, number]; size: [number, number]; spawn: [number, number]; yaw: number }> = {
  courtyard: { name: '숲의 중정', english: 'THE COURTYARD', subtitle: '서두르지 않아도 좋은 곳', center: [0, 0], size: [34, 36], spawn: [0, 15], yaw: 0 },
  yoga: { name: '요가 대청', english: 'YOGA PAVILION', subtitle: '같은 호흡으로, 천천히', center: [-32, 0], size: [28, 20], spawn: [-22, 1], yaw: Math.PI / 2 },
  spa: { name: '스파', english: 'SPA', subtitle: '몸의 긴장을 내려놓는 시간', center: [32, 0], size: [28, 24], spawn: [21, 4], yaw: -Math.PI / 2 },
  sauna: { name: '핀란드 사우나', english: 'FINNISH SAUNA', subtitle: '나무의 온기와 부드러운 증기', center: SAUNA.center, size: SAUNA.size, spawn: SAUNA.spawn, yaw: -Math.PI / 2 },
  floating: { name: '플로팅 홀', english: 'FLOATING SANCTUARY', subtitle: '물에 기대어, 온전히 나에게', center: [0, -40], size: [34, 28], spawn: [0, -28], yaw: 0 },
  tea: { name: '숲의 다실', english: 'THE TEA ROOM', subtitle: '비워낸 마음에 차 한 잔', center: [0, 32], size: [26, 18], spawn: [0, 29], yaw: Math.PI },
  // Spawn inside the clearing (not the SE choke) so travel/walk-in don't bounce off the rim.
  campfire: { name: '불멍 캠프', english: 'CAMPFIRE', subtitle: '장작불 곁에서 마음을 내려놓는 자리', center: [-24, 20], size: [18, 16], spawn: [-19.5, 15.8], yaw: Math.atan2(-19.5 - (-24), 15.8 - 20) },
  onsen: { name: '노천탕', english: 'OPEN-AIR BATH', subtitle: '대나무 길 끝, 따뜻한 물', center: [24, 20], size: [16, 14], spawn: [17, 16], yaw: 0 }
};
export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

// Sit just outside the fire ring (~2.55m) so a marshmallow stick can reach the flame.
const CAMP_FIRE: [number, number] = [-24, 20];
const CAMP_LOGS: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + .35;
  return [CAMP_FIRE[0] + Math.sin(a) * 2.55, CAMP_FIRE[1] + Math.cos(a) * 2.55] as [number, number];
});

export const SLOTS: Slot[] = [
  ...Array.from({ length: 12 }, (_, i): Slot => { const x = -38 + (i % 4) * 4.1, z = -4.8 + Math.floor(i / 4) * 4.8; return { id: `mat-${i}`, zone: 'yoga', kind: 'mat', x, z, yaw: 0, exit: [x + 1, z + 1.7] }; }),
  ...Array.from({ length: 8 }, (_, i): Slot => ({ id: `tube-${i}`, zone: 'floating', kind: 'tube', x: -9 + (i % 4) * 6, z: -35 - Math.floor(i / 4) * 10, yaw: 0, exit: [0, -28] })),
  ...Array.from({ length: 6 }, (_, i): Slot => ({ id: `spa-${i}`, zone: 'spa', kind: 'seat', x: 24 + (i % 3) * 7, z: 7 + Math.floor(i / 3) * 2.5, yaw: 0, exit: [21, 4] })),
  ...Array.from({ length: 6 }, (_, i): Slot => ({ id: `sauna-${i}`, zone: 'sauna', kind: 'sauna-bench', x: 59.75, z: -8 + i * 3.2, yaw: Math.atan2(59.75 - SAUNA.heater[0], -8 + i * 3.2 - SAUNA.heater[1]), exit: [58.2, -8 + i * 3.2] })),
  ...Array.from({ length: 6 }, (_, i): Slot => ({ id: `tea-${i}`, zone: 'tea', kind: 'seat', x: -8 + (i % 3) * 8, z: 31 + Math.floor(i / 3) * 6, yaw: 0, exit: [0, 29] })),
  ...CAMP_LOGS.map(([x, z], i): Slot => {
    const a = (i / 6) * Math.PI * 2 + .35;
    return {
      id: `camp-${i}`,
      zone: 'campfire',
      kind: 'log',
      x,
      z,
      // Face the fire (same convention as sauna benches → heater).
      yaw: Math.atan2(x - CAMP_FIRE[0], z - CAMP_FIRE[1]),
      exit: [x + Math.sin(a) * 1.15, z + Math.cos(a) * 1.15]
    };
  })
  // Hammock slots are appended after onsen colliders (see below).
];
export const YOGA_INTERACTION_RADIUS = 2.3;
export function nearbyYogaMat(x: number, z: number, occupancy: Record<string, string>) {
  let nearest: Slot | undefined; let distance = YOGA_INTERACTION_RADIUS;
  for (const slot of SLOTS) {
    if (slot.kind !== 'mat' || occupancy[slot.id]) continue;
    const d = Math.hypot(x - slot.x, z - slot.z);
    if (d <= distance) { nearest = slot; distance = d; }
  }
  return nearest;
}
export type Collider = { x: number; z: number; w: number; d: number; height: number };
export const COLLIDERS: Collider[] = [];
const PAVILION_ZONES = ZONE_IDS.filter(id => id !== 'courtyard' && id !== 'campfire' && id !== 'onsen');
for (const id of PAVILION_ZONES) {
  const { center: [x, z], size: [w, d] } = ZONES[id];
  const open = id === 'yoga' ? 'east' : id === 'spa' || id === 'sauna' ? 'west' : id === 'floating' ? 'south' : 'north';
  if (open !== 'west') COLLIDERS.push({ x: x - w / 2, z, w: .4, d, height: 5.1 });
  if (open !== 'east') {
    if (id === 'spa') COLLIDERS.push({ x: 46, z: -5.5, w: .4, d: 13, height: 5.1 }, { x: 46, z: 8.5, w: .4, d: 7, height: 5.1 });
    else COLLIDERS.push({ x: x + w / 2, z, w: .4, d, height: 5.1 });
  }
  if (open !== 'north') COLLIDERS.push({ x, z: z - d / 2, w, d: .4, height: 5.1 });
  if (open !== 'south') COLLIDERS.push({ x, z: z + d / 2, w, d: .4, height: 5.1 });
  const alongX = open === 'north' || open === 'south';
  // Tea keeps its open north mouth clear — no porch-post colliders blocking the approach.
  if (id !== 'tea') for (const t of [-.5, -.25, .25, .5]) {
    COLLIDERS.push({ x: alongX ? x + w * t : x + (open === 'east' ? w / 2 : -w / 2), z: alongX ? z + (open === 'south' ? d / 2 : -d / 2) : z + d * t, w: .5, d: .5, height: 5.1 });
  }
}
// Water can only be entered through a server-reserved floating bed.
COLLIDERS.push({ x: 0, z: -41, w: 27, d: 23, height: .1 });
for (const bath of SPA_BATHS) {
  COLLIDERS.push({ x: bath.x - bath.w / 2, z: -5, w: .3, d: 10, height: .35 }, { x: bath.x + bath.w / 2, z: -5, w: .3, d: 10, height: .35 }, { x: bath.x, z: -10, w: bath.w, d: .3, height: .35 });
  const side = (bath.w - 2.6) / 2;
  for (const sign of [-1, 1]) COLLIDERS.push({ x: bath.x + sign * (1.3 + side / 2), z: 0, w: side, d: .3, height: .35 });
}
COLLIDERS.push({ x: 61.5, z: 0, w: 3.8, d: 20, height: .75 }, { x: SAUNA.heater[0], z: SAUNA.heater[1], w: 2, d: 2, height: 1.4 });
COLLIDERS.push({ x: 34.5, z: 5, w: 23, d: .35, height: 4.8 });
COLLIDERS.push({ x: -4.05, z: -6, w: 4.9, d: 8, height: .1 });
COLLIDERS.push({ x: 4.05, z: -6, w: 4.9, d: 8, height: .1 });
// Gate posts / side walls — match EntranceGate at z=17 (courtyard approach, clear of tea doors).
for (const side of [-1, 1]) { COLLIDERS.push({ x: side * 5.5, z: 17, w: .5, d: .5, height: 3.5 }); COLLIDERS.push({ x: side * 10, z: 17, w: 8, d: .5, height: 1 }); }

// Campfire: rim open wide toward courtyard (SE) so approach doesn't chicane/bounce.
{
  const { center: [x, z], size: [w, d] } = ZONES.campfire;
  COLLIDERS.push({ x: x - w / 2, z, w: .35, d, height: .55 });
  COLLIDERS.push({ x, z: z + d / 2, w, d: .35, height: .55 });
  // East rim starts farther north — keep SE mouth clear.
  COLLIDERS.push({ x: x + w / 2, z: z + 4, w: .35, d: d - 8, height: .55 });
  // South rim stops farther west — wide SE entrance from the courtyard path.
  COLLIDERS.push({ x: x - 4, z: z - d / 2, w: w - 8, d: .35, height: .55 });
  COLLIDERS.push({ x: -24, z: 20, w: 1.7, d: 1.7, height: .9 });
}
// Onsen clearing: open bath with low rim — no side walls so hammocks stay reachable.
{
  const { center: [x, z], size: [w, d] } = ZONES.onsen;
  const southOpen = 9;
  const pathZ = ONSEN_PATH.to[1];
  // Keep the east–west path (z≈16) and the north apron to the stairs fully clear.
  const gapLo = pathZ - 2.6, gapHi = pathZ + 4.2;
  const westX = x - w / 2, zoneLo = z - d / 2, zoneHi = z + d / 2;
  // Soft outer edges only on north / south corners — leave east–west open for hammocks.
  COLLIDERS.push({ x, z: zoneHi, w: w * .55, d: .35, height: .55 });
  if (gapLo > zoneLo + .4) COLLIDERS.push({ x: westX, z: (zoneLo + gapLo) / 2, w: .35, d: gapLo - zoneLo, height: .55 });
  if (zoneHi > gapHi + .4) COLLIDERS.push({ x: westX, z: (gapHi + zoneHi) / 2, w: .35, d: zoneHi - gapHi, height: .55 });
  COLLIDERS.push({ x: x - (w + southOpen) / 4, z: zoneLo, w: (w - southOpen) / 2, d: .35, height: .55 });
  COLLIDERS.push({ x: x + (w + southOpen) / 4, z: zoneLo, w: (w - southOpen) / 2, d: .35, height: .55 });
  // Low bath lip only — no tall wall blocking the water.
  COLLIDERS.push({ x: ONSEN.x - ONSEN.w / 2, z: ONSEN.z, w: .3, d: ONSEN.d, height: .22 });
  COLLIDERS.push({ x: ONSEN.x + ONSEN.w / 2, z: ONSEN.z, w: .3, d: ONSEN.d, height: .22 });
  COLLIDERS.push({ x: ONSEN.x, z: ONSEN.z + ONSEN.d / 2, w: ONSEN.w, d: .3, height: .22 });
  const stairW = 4.2;
  const side = (ONSEN.w - stairW) / 2;
  for (const sign of [-1, 1]) COLLIDERS.push({ x: ONSEN.x + sign * (stairW / 2 + side / 2), z: ONSEN.z - ONSEN.d / 2, w: side, d: .3, height: .22 });
}

// Courtyard snack stall — south of onsen approach (yaw 0 → counter along X)
COLLIDERS.push({ x: 12.4, z: 11.15, w: 2.85, d: 1.15, height: 1.15 });

export function isWalkable(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return false;
  return !COLLIDERS.some(c => Math.abs(x - c.x) < c.w / 2 + .34 && Math.abs(z - c.z) < c.d / 2 + .34);
}

// Hammock exits need the onsen colliders above to pick a walkable step-off.
for (const h of ONSEN_HAMMOCKS) {
  const x = (h.a[0] + h.b[0]) / 2, z = (h.a[1] + h.b[1]) / 2;
  const yaw = Math.atan2(h.b[0] - h.a[0], h.b[1] - h.a[1]);
  const targets: [number, number][] = [[ONSEN.x, ONSEN.z], [24, 19], [22, 18], [20, 17], [24, 16]];
  let exit: [number, number] = [x, z - 2.2];
  outer: for (const [tx, tz] of targets) {
    const dx = tx - x, dz = tz - z, len = Math.hypot(dx, dz) || 1;
    for (const dist of [1.5, 2, 2.4, 2.8, 3.2]) {
      const ex = x + dx / len * dist, ez = z + dz / len * dist;
      if (isWalkable(ex, ez)) { exit = [ex, ez]; break outer; }
    }
  }
  SLOTS.push({ id: h.id, zone: 'onsen', kind: 'hammock', x, z, yaw, exit });
}
export function slide(x: number, z: number, dx: number, dz: number): [number, number] {
  const nx = isWalkable(x + dx, z) ? x + dx : x;
  return [nx, isWalkable(nx, z + dz) ? z + dz : z];
}
export function zoneAt(x: number, z: number): ZoneId {
  return ZONE_IDS.find(id => { if (id === 'courtyard') return false; const r = ZONES[id]; return Math.abs(x - r.center[0]) <= r.size[0] / 2 + .5 && Math.abs(z - r.center[1]) <= r.size[1] / 2 + .5; }) ?? 'courtyard';
}
export const MEDITATION = [
  { title: '고요한 시작', text: '물 위에 기대어 피아노를 들으며, 천천히 나에게 묻는 질문에 머물러 보세요.' },
  { title: '느린 호흡', text: '숨을 고르며 질문을 읽어도 좋아요. 답은 마음속에만 두어도, 짧게 적어도 괜찮아요.' },
  { title: '긴장 내려놓기', text: '어깨의 힘을 풀고, 떠오르는 대로 솔직하게 답해 보세요. 틀린 답은 없어요.' },
  { title: '편안한 머무름', text: '질문이 바뀌어도 서두르지 마세요. 음악이 흐르는 동안 나만의 100문 100답입니다.' },
  { title: '천천히 돌아오기', text: '빛과 물소리를 느끼며 돌아옵니다. 남긴 마음은 누구에게도 보이지 않아요.' }
];
