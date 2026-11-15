import { randomUUID } from 'node:crypto';
import { SLOTS, ZONES, YOGA_INTERACTION_RADIUS, nearbyYogaMat, zoneAt, isTea, type Appearance, type ClientMessage, type Player, type Snapshot, type ZoneId } from '../shared/world.js';
import { SPA_BATHS, SAUNA, bathAt } from '../shared/spa.js';
import { ONSEN, onOnsenWalk, onsenAt } from '../shared/onsen.js';
import { stepLocomotion, stepStrafe } from '../shared/locomotion.js';

type Session = { player: Player; token: string; dx: number; dz: number; inputAt: number; disconnectedAt: number | null; send: ((data: object) => void) | null };
export class Room {
  sessions = new Map<string, Session>();
  occupancy: Record<string, string> = {};
  yogaStartedAt: number;
  saunaSteamStartedAt = 0;
  worryBurnSeq = 0;
  constructor(public capacity = 12, public graceMs = 15000, now = Date.now()) { this.yogaStartedAt = now; }
  join(message: Extract<ClientMessage, { type: 'join' }>, send: (data: object) => void, now = Date.now()) {
    this.expire(now);
    if (message.token) {
      const session = [...this.sessions.values()].find(s => s.token === message.token);
      if (session) {
        if (session.player.connected) throw new Error('이 세션은 다른 연결에서 사용 중입니다.');
        session.send = send; session.player.connected = true; session.disconnectedAt = null;
        return session;
      }
    }
    if (this.sessions.size >= this.capacity) throw new Error('현재 공간이 가득 찼어요. 잠시 후 다시 들어와 주세요.');
    const nickname = typeof message.nickname === 'string' ? message.nickname.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
    if (!nickname || [...nickname].length > 12) throw new Error('닉네임은 1~12자로 입력해 주세요.');
    const a = message.appearance;
    if (!a || !['skin', 'hair', 'outfit'].every(k => Number.isInteger(a[k as keyof Appearance]) && a[k as keyof Appearance] >= 0 && a[k as keyof Appearance] < (k === 'outfit' ? 4 : 3))) throw new Error('캐릭터 선택을 확인해 주세요.');
    const player: Player = { id: randomUUID(), nickname, appearance: { skin: a.skin, hair: a.hair, outfit: a.outfit }, x: ZONES.courtyard.spawn[0], z: ZONES.courtyard.spawn[1], yaw: ZONES.courtyard.yaw, zone: 'courtyard', activity: 'idle', towel: false, connected: true, slot: null, actionUntil: 0, drink: null, marshmallow: 'none' };
    const session: Session = { player, token: randomUUID(), dx: 0, dz: 0, inputAt: now, disconnectedAt: null, send };
    this.sessions.set(player.id, session);
    return session;
  }
  error(s: Session, message: string) { s.send?.({ type: 'error', message }); }
  release(s: Session) {
    if (s.player.slot) {
      const slot = SLOTS.find(slot => slot.id === s.player.slot)!;
      delete this.occupancy[slot.id];
      [s.player.x, s.player.z] = slot.exit;
    }
    s.player.slot = null; s.player.activity = 'idle'; s.player.drink = null; s.player.marshmallow = 'none'; s.player.actionUntil = 0; s.dx = 0; s.dz = 0;
  }
  handle(id: string, data: ClientMessage, now = Date.now()) {
    const s = this.sessions.get(id); if (!s?.player.connected) return;
    const p = s.player;
    switch (data.type) {
      case 'move': {
        if (![data.dx, data.dz, data.yaw].every(v => typeof v === 'number' && Number.isFinite(v)) || Math.abs(data.dx) > 1 || Math.abs(data.dz) > 1 || Math.abs(data.yaw) > Math.PI * 4) return this.error(s, '올바르지 않은 이동 요청입니다.');
        if (p.slot || p.actionUntil > now) return;
        const length = Math.max(1, Math.hypot(data.dx, data.dz)); s.dx = data.dx / length; s.dz = data.dz / length;
        // Facing from the client is authoritative on the bamboo path (strafe mode).
        if (onOnsenWalk(p.x, p.z)) p.yaw = ((data.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        s.inputAt = now; break;
      }
      case 'travel': {
        if (!Object.hasOwn(ZONES, data.zone)) return this.error(s, '존재하지 않는 공간입니다.');
        this.release(s); const zone = ZONES[data.zone as ZoneId]; [p.x, p.z] = zone.spawn; p.yaw = zone.yaw; p.zone = data.zone;
        break;
      }
      case 'enter-bath': {
        if (data.bath === 'onsen') {
          if (p.zone !== 'onsen' || p.slot || p.actionUntil > now || Math.hypot(p.x - ONSEN.entry[0], p.z - ONSEN.entry[1]) > 5) return this.error(s, '노천탕 계단 가까이로 걸어가 주세요.');
          p.x = ONSEN.x; p.z = ONSEN.z - 1.2; p.yaw = 0; p.activity = 'bathing'; s.dx = s.dz = 0;
          break;
        }
        const bath = SPA_BATHS.find(b => b.id === data.bath);
        if (!bath || p.zone !== 'spa' || p.slot || p.actionUntil > now || Math.hypot(p.x - bath.entry[0], p.z - bath.entry[1]) > 3.2) return this.error(s, '탕의 계단 가까이로 걸어가 주세요.');
        p.x = bath.x; p.z = -1.8; p.yaw = 0; p.activity = 'bathing'; s.dx = s.dz = 0;
        break;
      }
      case 'exit-bath': {
        if (onsenAt(p.x, p.z)) {
          [p.x, p.z] = ONSEN.entry; p.yaw = Math.PI; p.activity = 'idle'; p.actionUntil = 0; p.drink = null; s.dx = s.dz = 0;
          break;
        }
        const bath = bathAt(p.x, p.z); if (!bath) return;
        [p.x, p.z] = bath.entry; p.yaw = Math.PI; p.activity = 'idle'; p.actionUntil = 0; p.drink = null; s.dx = s.dz = 0;
        break;
      }
      case 'join-sauna': {
        if (p.zone !== 'sauna' || p.slot || p.actionUntil > now) return;
        const bench = SLOTS.filter(slot => slot.kind === 'sauna-bench' && !this.occupancy[slot.id]).sort((a, b) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(p.x - b.x, p.z - b.z))[0];
        if (!bench || Math.hypot(p.x - bench.x, p.z - bench.z) > 3) return this.error(s, '빈 목재 벤치 가까이로 걸어가 주세요.');
        this.handle(id, { type: 'reserve', slot: bench.id }, now); break;
      }
      case 'sauna-steam': {
        if (p.zone !== 'sauna' || p.slot || p.actionUntil > now || Math.hypot(p.x - SAUNA.heater[0], p.z - SAUNA.heater[1]) > SAUNA.reach) return this.error(s, '돌 히터 가까이로 걸어가 주세요.');
        if (this.saunaSteamStartedAt && now - this.saunaSteamStartedAt < SAUNA.steamCooldown) return this.error(s, '증기가 잔잔히 퍼지는 동안 잠시 쉬어가세요.');
        this.saunaSteamStartedAt = now; p.activity = 'pouring'; p.drink = null; p.actionUntil = now + 2400; s.dx = s.dz = 0; break;
      }
      case 'join-yoga': {
        if (p.slot) return;
        const mat = p.zone === 'yoga' ? nearbyYogaMat(p.x, p.z, this.occupancy) : undefined;
        if (!mat) return this.error(s, '빈 매트 가까이로 걸어가 주세요.');
        this.handle(id, { type: 'reserve', slot: mat.id }, now);
        break;
      }
      case 'reserve': {
        const slot = SLOTS.find(slot => slot.id === data.slot);
        if (!slot || slot.zone !== zoneAt(p.x, p.z)) return this.error(s, '먼저 해당 공간 안으로 들어와 주세요.');
        if (this.occupancy[slot.id] === id) return;
        if (slot.kind === 'mat' && Math.hypot(p.x - slot.x, p.z - slot.z) > YOGA_INTERACTION_RADIUS) return this.error(s, '빈 매트 가까이로 걸어가 주세요.');
        if (slot.kind === 'sauna-bench' && Math.hypot(p.x - slot.x, p.z - slot.z) > 3) return this.error(s, '빈 목재 벤치 가까이로 걸어가 주세요.');
        if (slot.kind === 'log' && Math.hypot(p.x - slot.x, p.z - slot.z) > 3) return this.error(s, '빈 통나무 가까이로 걸어가 주세요.');
        if (slot.kind === 'hammock' && Math.hypot(p.x - slot.x, p.z - slot.z) > 3.2) return this.error(s, '빈 그물침대 가까이로 걸어가 주세요.');
        if (this.occupancy[slot.id]) return this.error(s, '다른 분이 이용 중인 자리예요. 빈자리를 선택해 주세요.');
        this.release(s);
        this.occupancy[slot.id] = id; p.slot = slot.id; p.x = slot.x; p.z = slot.z; p.yaw = slot.yaw;
        p.zone = slot.zone;
        p.activity = slot.kind === 'mat' ? 'yoga' : slot.kind === 'tube' || slot.kind === 'hammock' ? 'lying' : slot.kind === 'sauna-bench' ? 'sauna' : 'sitting';
        break;
      }
      case 'release': this.release(s); break;
      case 'towel': if (p.zone !== 'spa' && p.zone !== 'sauna') return this.error(s, '양머리 수건은 스파와 사우나에서 착용할 수 있어요.'); p.towel = !p.towel; break;
      case 'pour':
        if (p.zone !== 'tea' || p.actionUntil > now || !isTea(data.tea)) return this.error(s, '다실에서 차분히 차를 따라 주세요.');
        p.activity = 'pouring'; p.drink = data.tea; p.actionUntil = now + 2600; s.dx = s.dz = 0; break;
      case 'drink': {
        if (!((isTea(data.drink) && p.zone === 'tea') || (data.drink === 'sikhye' && p.zone === 'spa')) || p.actionUntil > now) return this.error(s, '해당 공간에서 음료를 선택해 주세요.');
        p.activity = 'drinking'; p.drink = data.drink; p.actionUntil = now + 3500; s.dx = s.dz = 0; break;
      }
      case 'roast': {
        const slot = p.slot ? SLOTS.find(slot => slot.id === p.slot) : undefined;
        if (!slot || slot.kind !== 'log' || p.zone !== 'campfire' || p.actionUntil > now) return this.error(s, '통나무에 앉아 마시멜로를 구워 주세요.');
        if (p.marshmallow === 'ready') return this.error(s, '이미 구운 마시멜로가 있어요. 먼저 드셔 보세요.');
        p.activity = 'roasting'; p.marshmallow = 'roasting'; p.drink = null; p.actionUntil = now + 3800; s.dx = s.dz = 0;
        break;
      }
      case 'eat-marshmallow': {
        const slot = p.slot ? SLOTS.find(slot => slot.id === p.slot) : undefined;
        if (!slot || slot.kind !== 'log' || p.marshmallow !== 'ready' || p.actionUntil > now) return this.error(s, '구운 마시멜로를 먼저 준비해 주세요.');
        p.activity = 'drinking'; p.marshmallow = 'none'; p.drink = null; p.actionUntil = now + 2200; s.dx = s.dz = 0;
        break;
      }
      case 'burn-worry': {
        if (p.zone !== 'campfire') return this.error(s, '캠프파이어 곁에서만 고민을 내려놓을 수 있어요.');
        // Privacy: no worry text is accepted or stored — only an anonymous VFX signal.
        this.worryBurnSeq += 1;
        break;
      }
      case 'leave': this.remove(id); break;
    }
  }
  disconnect(id: string, now = Date.now()) {
    const s = this.sessions.get(id); if (!s) return;
    s.player.connected = false; s.send = null; s.disconnectedAt = now; s.dx = s.dz = 0;
    if (s.player.activity === 'walking') s.player.activity = 'idle';
  }
  remove(id: string) { const s = this.sessions.get(id); if (!s) return; if (s.player.slot) delete this.occupancy[s.player.slot]; this.sessions.delete(id); }
  expire(now: number) { for (const [id, s] of this.sessions) if (s.disconnectedAt !== null && now - s.disconnectedAt >= this.graceMs) this.remove(id); }
  tick(dt: number, now = Date.now()) {
    this.expire(now);
    for (const s of this.sessions.values()) {
      const p = s.player; if (!p.connected) continue;
      if (p.actionUntil && now >= p.actionUntil) {
        p.actionUntil = 0; p.drink = null;
        if (p.marshmallow === 'roasting') p.marshmallow = 'ready';
        if (p.slot) {
          const kind = SLOTS.find(slot => slot.id === p.slot)?.kind;
          p.activity = kind === 'sauna-bench' ? 'sauna' : kind === 'tube' || kind === 'hammock' ? 'lying' : kind === 'mat' ? 'yoga' : 'sitting';
        } else p.activity = 'idle';
      }
      if (p.slot || p.actionUntil > now) continue;
      if (now - s.inputAt > 300) s.dx = s.dz = 0;
      const next = onOnsenWalk(p.x, p.z)
        ? stepStrafe(p.x, p.z, p.yaw, s.dx, s.dz, dt)
        : stepLocomotion(p.x, p.z, p.yaw, s.dx, s.dz, dt);
      const inBath = bathAt(next.x, next.z) || onsenAt(next.x, next.z);
      p.activity = next.walking ? 'walking' : inBath ? 'bathing' : 'idle';
      p.x = next.x; p.z = next.z; p.yaw = next.yaw; p.zone = zoneAt(p.x, p.z);
    }
  }
  snapshot(now = Date.now()): Snapshot {
    return {
      type: 'state',
      now,
      yogaStartedAt: this.yogaStartedAt,
      saunaSteamStartedAt: this.saunaSteamStartedAt,
      worryBurnSeq: this.worryBurnSeq,
      players: [...this.sessions.values()].map(s => ({ ...s.player })),
      occupancy: { ...this.occupancy },
      count: [...this.sessions.values()].filter(s => s.player.connected).length,
      capacity: this.capacity,
      graceMs: this.graceMs
    };
  }
}
