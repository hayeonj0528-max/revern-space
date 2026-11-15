import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { Room } from '../server/room.js';
import { createSpaceServer } from '../server/index.js';
import { SLOTS, ZONES, WORLD, YOGA_INTERACTION_RADIUS, nearbyYogaMat, isWalkable, type ClientMessage } from '../shared/world.js';

import { SPA_BATHS, SAUNA, bathAt, groundHeightAt } from '../shared/spa.js';
import { ONSEN, onsenAt } from '../shared/onsen.js';
import { YOGA_DURATION_SECONDS, YOGA_ROUTINE, YOGA_STEP_SECONDS, yogaFrame } from '../shared/yoga.js';

const appearance = { skin: 0, hair: 0, outfit: 0 };
function join(room: Room, name = '방문객', errors: object[] = []) { return room.join({ type: 'join', nickname: name, appearance }, e => errors.push(e), 1000); }
function approachMat(room: Room, session: ReturnType<Room['join']>, index: number) {
  room.handle(session.player.id, { type: 'travel', zone: 'yoga' });
  const mat = SLOTS.find(s => s.id === `mat-${index}`)!;
  session.player.x = mat.x + .8; session.player.z = mat.z + .5;
}

test('all map arrivals and slot exits are walkable', () => {
  for (const slot of SLOTS) assert.ok(isWalkable(...slot.exit), slot.id);
  for (const zone of Object.values(ZONES)) assert.ok(isWalkable(...zone.spawn), zone.name);
  assert.ok(isWalkable(0, -6), 'courtyard bridge is walkable');
});
test('twelve server-side sessions occupy twelve different mats and a thirteenth is rejected', () => {
  const room = new Room(12); const sessions = Array.from({ length: 12 }, (_, i) => join(room, `방문객${i + 1}`));
  for (const [i, session] of sessions.entries()) { approachMat(room, session, i); room.handle(session.player.id, { type: 'join-yoga' }); }
  assert.equal(room.snapshot().count, 12); assert.equal(Object.keys(room.occupancy).length, 12);
  assert.throws(() => join(room, '열세번째'));
  room.remove(sessions[0].player.id); assert.equal(room.snapshot().count, 11);
  join(room, '새 방문객'); assert.equal(room.snapshot().count, 12);
});
test('all zones including the adjoining sauna are connected by walkable routes without teleporting', () => {
  const width = (WORLD.maxX - WORLD.minX) * 2 + 1, depth = (WORLD.maxZ - WORLD.minZ) * 2 + 1; const visited = new Uint8Array(width * depth); const queue: number[] = [];
  const key = (x: number, z: number) => Math.round((z - WORLD.minZ) * 2) * width + Math.round((x - WORLD.minX) * 2);
  const start = key(...ZONES.courtyard.spawn); visited[start] = 1; queue.push(start);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const n = queue[cursor], gx = n % width, gz = Math.floor(n / width);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx, nz = gz + dz; if (nx < 0 || nx >= width || nz < 0 || nz >= depth) continue;
      const next = nz * width + nx; if (visited[next] || !isWalkable(nx / 2 + WORLD.minX, nz / 2 + WORLD.minZ)) continue;
      visited[next] = 1; queue.push(next);
    }
  }
  for (const zone of Object.values(ZONES)) assert.equal(visited[key(...zone.spawn)], 1, zone.name);
});
test('only one user can own a mat or tube; remote reservation is rejected', () => {
  for (const zone of ['yoga', 'floating'] as const) {
    const room = new Room(); const a = join(room, '가'); const b = join(room, '나');
    const slot = SLOTS.find(s => s.zone === zone)!;
    room.handle(a.player.id, { type: 'reserve', slot: slot.id }); assert.equal(a.player.slot, null);
    for (const s of [a, b]) { if (zone === 'yoga') approachMat(room, s, 0); else room.handle(s.player.id, { type: 'travel', zone }); }
    for (const s of [a, b]) room.handle(s.player.id, { type: 'reserve', slot: slot.id });
    assert.equal(room.occupancy[slot.id], a.player.id); assert.equal(b.player.slot, null);
    room.handle(a.player.id, { type: 'release' }); room.handle(b.player.id, { type: 'reserve', slot: slot.id });
    assert.equal(room.occupancy[slot.id], b.player.id);
  }
});
test('movement cannot teleport, exceed speed, cross walls or move while lying', () => {
  const room = new Room(12, 15000, 1000); const a = join(room); const id = a.player.id;
  room.handle(id, { type: 'move', dx: Infinity, dz: 0, yaw: 0 }, 1000); room.tick(.1, 1001); assert.equal(a.player.x, 0);
  room.handle(id, { type: 'move', dx: 99, dz: 0, yaw: 0 }, 1000); room.tick(.1, 1001); assert.equal(a.player.x, 0);
  room.handle(id, { type: 'move', dx: 1, dz: 1, yaw: 0 }, 1000); room.tick(.1, 1001); assert.ok(Math.hypot(a.player.x, a.player.z - ZONES.courtyard.spawn[1]) <= .500001);
  room.handle(id, { type: 'travel', zone: 'yoga' });
  for (let i = 0; i < 120; i++) { room.handle(id, { type: 'move', dx: -1, dz: 0, yaw: 0 }, 2000 + i * 100); room.tick(.1, 2000 + i * 100); }
  assert.ok(a.player.x > -56); assert.ok(isWalkable(a.player.x, a.player.z));
  room.handle(id, { type: 'travel', zone: 'floating' }); room.handle(id, { type: 'reserve', slot: 'tube-0' });
  const x = a.player.x; room.handle(id, { type: 'move', dx: 1, dz: 0, yaw: 0 }); room.tick(.1); assert.equal(a.player.x, x);
});
test('yoga joins require proximity and choose the nearest free mat without a number', () => {
  const room = new Room(), a = join(room), b = join(room);
  room.handle(a.player.id, { type: 'travel', zone: 'yoga' });
  room.handle(a.player.id, { type: 'join-yoga' }); assert.equal(a.player.slot, null);
  room.handle(a.player.id, { type: 'reserve', slot: 'mat-0' }); assert.equal(a.player.slot, null);
  approachMat(room, a, 7); approachMat(room, b, 7);
  room.handle(a.player.id, { type: 'join-yoga' }); room.handle(b.player.id, { type: 'join-yoga' });
  assert.equal(a.player.slot, 'mat-7'); assert.equal(b.player.slot, null);
  assert.equal(nearbyYogaMat(b.player.x, b.player.z, room.occupancy), undefined);
  const mat = SLOTS.find(s => s.id === 'mat-7')!;
  b.player.x = mat.x + YOGA_INTERACTION_RADIUS + .01; b.player.z = mat.z;
  room.handle(a.player.id, { type: 'release' });
  room.handle(b.player.id, { type: 'reserve', slot: mat.id }); assert.equal(b.player.slot, null);
  const stood = [a.player.x, a.player.z]; assert.deepEqual(stood, mat.exit);
  assert.ok(Math.hypot(a.player.x - mat.x, a.player.z - mat.z) < 2.1);
  room.handle(a.player.id, { type: 'join-yoga' }); assert.equal(a.player.slot, mat.id);
});
test('yoga has eight distinct four-second poses with smooth transitions and a seamless shared loop', () => {
  assert.equal(YOGA_ROUTINE.length, 8); assert.equal(YOGA_STEP_SECONDS, 4); assert.equal(YOGA_DURATION_SECONDS, 32);
  const names = new Set<string>(), poses = new Set<string>();
  for (let i = 0; i < YOGA_ROUTINE.length; i++) {
    const frame = yogaFrame(1000 + i * 4000 + 2000, 1000); names.add(frame.name); poses.add(JSON.stringify(frame.pose));
    assert.equal(frame.index, i); assert.ok(Object.values(frame.pose).every(Number.isFinite));
    const before = yogaFrame(1000 + i * 4000 - 1 + 32000, 1000).pose;
    const after = yogaFrame(1000 + i * 4000 + 1 + 32000, 1000).pose;
    assert.ok(Object.keys(before).every(k => Math.abs(before[k as keyof typeof before] - after[k as keyof typeof after]) < .001));
  }
  assert.equal(names.size, 8); assert.equal(poses.size, 8);
  assert.deepEqual(yogaFrame(1000 + 32000 + 2300, 1000), yogaFrame(1000 + 2300, 1000));
});
test('all twelve yoga participants face forward along their mats without turning toward the instructor', () => {
  const room = new Room();
  for (let i = 0; i < 12; i++) {
    const session = join(room, `정면${i + 1}`), mat = SLOTS.find(slot => slot.id === `mat-${i}`)!;
    approachMat(room, session, i); session.player.yaw = (i - 6) * .4;
    room.handle(session.player.id, { type: 'join-yoga' }, 2000);
    assert.equal(session.player.slot, mat.id); assert.equal(session.player.yaw, 0, mat.id);
    room.handle(session.player.id, { type: 'move', dx: 1, dz: 0, yaw: Math.PI / 2 }, 2100);
  }
  room.tick(.1, 2200);
  for (const player of room.snapshot().players) {
    assert.equal(player.yaw, 0); assert.equal(player.activity, 'yoga');
    const mat = SLOTS.find(slot => slot.id === player.slot)!;
    assert.equal(player.x, mat.x); assert.equal(player.z, mat.z);
  }
});
test('disconnect reserves for 15s, reconnect preserves identity, expiry releases seat', () => {
  const room = new Room(12, 15000, 1000); const a = join(room); const id = a.player.id;
  room.handle(id, { type: 'travel', zone: 'floating' }); room.handle(id, { type: 'reserve', slot: 'tube-0' });
  room.disconnect(id, 2000); assert.equal(room.snapshot().count, 0);
  room.expire(16000); assert.equal(room.occupancy['tube-0'], id);
  const again = room.join({ type: 'join', nickname: '가', appearance, token: a.token }, () => {}, 16001);
  assert.equal(again.player.id, id); assert.equal(again.player.activity, 'lying');
  room.disconnect(id, 17000); room.expire(32000); assert.equal(room.sessions.size, 0); assert.equal(room.occupancy['tube-0'], undefined);
});
test('capacity, appearances, payloads and duplicate session are validated', () => {
  const room = new Room(1); const a = join(room);
  assert.throws(() => join(room)); assert.throws(() => room.join({ type: 'join', nickname: 'x', appearance, token: a.token }, () => {}));
  room.remove(a.player.id); assert.throws(() => room.join({ type: 'join', nickname: '', appearance }, () => {}));
  assert.throws(() => room.join({ type: 'join', nickname: 'x', appearance: { ...appearance, skin: 99 } }, () => {}));
});
test('body heading follows actual movement for sideways, backwards and diagonal input', () => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1], [1, 1], [-1, -1]]) {
    const room = new Room(), a = join(room);
    let moved = false;
    for (let frame = 0; frame < 45; frame++) {
      const x = a.player.x, z = a.player.z, now = 1000 + frame * 17;
      room.handle(a.player.id, { type: 'move', dx, dz, yaw: 0 }, now); room.tick(1 / 60, now);
      const vx = a.player.x - x, vz = a.player.z - z, length = Math.hypot(vx, vz);
      if (length > .000001) { moved = true; assert.ok((-Math.sin(a.player.yaw) * vx - Math.cos(a.player.yaw) * vz) / length > .999999, `${dx}, ${dz}, frame ${frame}`); }
    }
    assert.ok(moved, `${dx}, ${dz} never moved`);
    const yaw = a.player.yaw; room.handle(a.player.id, { type: 'move', dx: 0, dz: 0, yaw: 1 }, 1600); room.tick(.1, 1600); assert.equal(a.player.yaw, yaw);
  }
});
test('a reversal turns in place before walking, including collision-resolved wall sliding', () => {
  const room = new Room(), a = join(room), p = a.player;
  room.handle(p.id, { type: 'move', dx: 0, dz: 1, yaw: Math.PI }, 1000); room.tick(1 / 60, 1000);
  assert.equal(p.x, ZONES.courtyard.spawn[0]); assert.equal(p.z, ZONES.courtyard.spawn[1]); assert.equal(p.activity, 'idle');
  assert.ok(Math.abs(p.yaw) > 0 && Math.abs(p.yaw) < Math.PI);
  p.x = -1.26; p.z = -6; p.yaw = Math.PI / 2;
  let moved = false;
  for (let frame = 0; frame < 40; frame++) {
    const x = p.x, z = p.z, now = 1100 + frame * 17;
    room.handle(p.id, { type: 'move', dx: -1, dz: -1, yaw: -Math.PI / 4 }, now); room.tick(1 / 60, now);
    assert.equal(p.x, x, 'the blocked axis must remain blocked');
    if (p.z < z) { moved = true; assert.ok(Math.abs(p.yaw) < .000001, 'face along the wall instead of into it'); }
  }
  assert.ok(moved); assert.ok(p.z < -6.5);
  const yaw = p.yaw, z = p.z;
  room.handle(p.id, { type: 'move', dx: -1, dz: 0, yaw: Math.PI / 2 }, 1600); room.tick(.1, 1600);
  assert.equal(p.x, -1.26); assert.equal(p.z, z); assert.equal(p.yaw, yaw); assert.equal(p.activity, 'idle');
});
test('both baths have walkable stairs, water depth, blocked rims and working exits', () => {
  for (const bath of SPA_BATHS) {
    const room = new Room(), a = join(room), p = a.player;
    room.handle(p.id, { type: 'travel', zone: 'spa' });
    room.handle(p.id, { type: 'enter-bath', bath: bath.id }); assert.equal(bathAt(p.x, p.z), undefined);
    [p.x, p.z] = bath.entry;
    assert.equal(groundHeightAt(p.x, p.z), 0);
    for (let i = 0; i < 28; i++) { room.handle(p.id, { type: 'move', dx: 0, dz: -1, yaw: 0 }, 2000 + i * 50); room.tick(.05, 2000 + i * 50); }
    room.handle(p.id, { type: 'move', dx: 0, dz: 0, yaw: 0 }, 3500); room.tick(.05, 3500);
    assert.equal(bathAt(p.x, p.z)?.id, bath.id); assert.equal(p.activity, 'bathing'); assert.equal(groundHeightAt(p.x, p.z), -.8);
    for (let i = 0; i < 70; i++) { room.handle(p.id, { type: 'move', dx: 1, dz: 0, yaw: 0 }, 3100 + i * 50); room.tick(.05, 3100 + i * 50); }
    assert.ok(p.x < bath.x + bath.w / 2); assert.ok(isWalkable(p.x, p.z));
    room.handle(p.id, { type: 'exit-bath' }); assert.deepEqual([p.x, p.z], bath.entry); assert.equal(groundHeightAt(p.x, p.z), 0);
    room.handle(p.id, { type: 'enter-bath', bath: bath.id }); assert.equal(p.activity, 'bathing');
    for (let i = 0; i < 20; i++) { room.handle(p.id, { type: 'move', dx: 0, dz: 1, yaw: 0 }, 8000 + i * 50); room.tick(.05, 8000 + i * 50); }
    assert.equal(bathAt(p.x, p.z), undefined); assert.equal(groundHeightAt(p.x, p.z), 0);
  }
});
test('sauna has exclusive benches, a shared steam event and server-enforced reach/cooldown', () => {
  const room = new Room(), a = join(room), b = join(room);
  for (const session of [a, b]) room.handle(session.player.id, { type: 'travel', zone: 'sauna' });
  room.handle(a.player.id, { type: 'join-sauna' }); assert.equal(a.player.slot, null);
  room.handle(a.player.id, { type: 'sauna-steam' }, 10000); assert.equal(room.saunaSteamStartedAt, 0);
  for (const session of [a, b]) { session.player.x = 58.2; session.player.z = -8; }
  room.handle(a.player.id, { type: 'join-sauna' }); room.handle(b.player.id, { type: 'join-sauna' });
  assert.equal(a.player.activity, 'sauna'); assert.equal(a.player.slot, 'sauna-0'); assert.equal(b.player.slot, null);
  room.handle(a.player.id, { type: 'release' }); assert.ok(isWalkable(a.player.x, a.player.z));
  for (const session of [a, b]) { session.player.x = SAUNA.heater[0]; session.player.z = SAUNA.heater[1] + 2.5; }
  room.handle(a.player.id, { type: 'sauna-steam' }, 10000); assert.equal(room.snapshot().saunaSteamStartedAt, 10000); assert.equal(a.player.activity, 'pouring');
  room.handle(b.player.id, { type: 'sauna-steam' }, 11000); assert.equal(room.saunaSteamStartedAt, 10000);
  room.tick(.05, 13000); assert.equal(a.player.activity, 'idle');
  room.handle(b.player.id, { type: 'sauna-steam' }, 21000); assert.equal(room.saunaSteamStartedAt, 21000);
});
test('late yoga arrivals share clock; towel and drink states return to sitting', () => {
  const room = new Room(12, 15000, 1000); const a = join(room); const b = join(room);
  for (const [i, s] of [a, b].entries()) { approachMat(room, s, i); room.handle(s.player.id, { type: 'join-yoga' }, 1000 + i * 10000); }
  assert.equal(room.snapshot().yogaStartedAt, 1000); assert.equal(a.player.activity, b.player.activity);
  room.handle(a.player.id, { type: 'travel', zone: 'spa' }); room.handle(a.player.id, { type: 'reserve', slot: 'spa-0' });
  room.handle(a.player.id, { type: 'towel' }); assert.equal(a.player.towel, true);
  room.handle(a.player.id, { type: 'drink', drink: 'sikhye' }, 2000); assert.equal(a.player.activity, 'drinking');
  room.tick(.1, 6000); assert.equal(a.player.activity, 'sitting');
});
test('sheep-towel can be worn and removed inside the Finnish sauna', () => {
  const room = new Room(), a = join(room);
  room.handle(a.player.id, { type: 'towel' }); assert.equal(a.player.towel, false);
  room.handle(a.player.id, { type: 'travel', zone: 'sauna' });
  a.player.x = 58.2; a.player.z = -8;
  room.handle(a.player.id, { type: 'join-sauna' }); assert.equal(a.player.activity, 'sauna');
  room.handle(a.player.id, { type: 'towel' }); assert.equal(a.player.towel, true);
  room.handle(a.player.id, { type: 'towel' }); assert.equal(a.player.towel, false);
  room.handle(a.player.id, { type: 'travel', zone: 'courtyard' });
  room.handle(a.player.id, { type: 'towel' }); assert.equal(a.player.towel, false);
});
test('campfire logs, roast, eat and anonymous burn-worry work without sending text', () => {
  const room = new Room(), a = join(room);
  room.handle(a.player.id, { type: 'travel', zone: 'campfire' });
  assert.ok(isWalkable(...ZONES.campfire.spawn));
  const log = SLOTS.find(s => s.id === 'camp-0')!;
  a.player.x = log.x + .5; a.player.z = log.z + .5;
  room.handle(a.player.id, { type: 'reserve', slot: log.id }, 2000);
  assert.equal(a.player.slot, log.id); assert.equal(a.player.activity, 'sitting');
  room.handle(a.player.id, { type: 'roast' }, 2100);
  assert.equal(a.player.activity, 'roasting'); assert.equal(a.player.marshmallow, 'roasting');
  room.tick(.1, 6000);
  assert.equal(a.player.marshmallow, 'ready'); assert.equal(a.player.activity, 'sitting');
  room.handle(a.player.id, { type: 'eat-marshmallow' }, 6100);
  assert.equal(a.player.marshmallow, 'none'); assert.equal(a.player.activity, 'drinking');
  room.tick(.1, 9000); assert.equal(a.player.activity, 'sitting');
  const before = room.worryBurnSeq;
  room.handle(a.player.id, { type: 'burn-worry' }, 9100);
  assert.equal(room.worryBurnSeq, before + 1);
  assert.equal(room.snapshot(9200).worryBurnSeq, before + 1);
  // Ensure client cannot smuggle text through the message type — payload is signal-only.
  room.handle(a.player.id, { type: 'burn-worry' } as ClientMessage, 9300);
  assert.equal(room.worryBurnSeq, before + 2);
});
test('onsen bath entry, depth and exit work like the spa baths', () => {
  const room = new Room(), a = join(room), p = a.player;
  room.handle(p.id, { type: 'travel', zone: 'onsen' });
  assert.ok(isWalkable(...ZONES.onsen.spawn));
  room.handle(p.id, { type: 'enter-bath', bath: 'onsen' }); assert.notEqual(p.activity, 'bathing');
  [p.x, p.z] = ONSEN.entry;
  room.handle(p.id, { type: 'enter-bath', bath: 'onsen' }, 2000);
  assert.equal(p.activity, 'bathing'); assert.ok(onsenAt(p.x, p.z)); assert.ok(groundHeightAt(p.x, p.z) < 0);
  room.handle(p.id, { type: 'exit-bath' });
  assert.deepEqual([p.x, p.z], ONSEN.entry); assert.equal(p.activity, 'idle'); assert.equal(groundHeightAt(p.x, p.z), 0);
});
test('onsen hammocks can be reserved for lying and release to a walkable exit', () => {
  const room = new Room(), a = join(room), b = join(room);
  const hammock = SLOTS.find(s => s.id === 'hammock-0')!;
  assert.ok(isWalkable(...hammock.exit));
  for (const s of [a, b]) { room.handle(s.player.id, { type: 'travel', zone: 'onsen' }); s.player.x = hammock.x + .6; s.player.z = hammock.z + .4; }
  room.handle(a.player.id, { type: 'reserve', slot: hammock.id });
  assert.equal(a.player.slot, hammock.id); assert.equal(a.player.activity, 'lying');
  room.handle(b.player.id, { type: 'reserve', slot: hammock.id });
  assert.equal(b.player.slot, null);
  room.handle(a.player.id, { type: 'release' });
  assert.equal(a.player.slot, null); assert.ok(isWalkable(a.player.x, a.player.z));
});
test('real WebSocket server broadcasts two clients, movement, occupancy and departure', async () => {
  const app = createSpaceServer({ graceMs: 60 }); await new Promise<void>(r => app.http.listen(0, '127.0.0.1', r));
  const address = app.http.address(); assert.ok(address && typeof address !== 'string');
  const connect = async (nickname: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`); const messages: any[] = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>(r => ws.on('open', r)); ws.send(JSON.stringify({ type: 'join', nickname, appearance }));
    return { ws, messages, send: (data: ClientMessage) => ws.send(JSON.stringify(data)) };
  };
  const until = async (condition: () => boolean) => { const deadline = Date.now() + 3000; while (!condition()) { if (Date.now() > deadline) throw Error('timeout'); await new Promise(r => setTimeout(r, 20)); } };
  try {
    const a = await connect('하나'); const b = await connect('두리');
    await until(() => b.messages.some(m => m.type === 'state' && m.count === 2));
    a.send({ type: 'move', dx: 1, dz: 0, yaw: -Math.PI / 2 });
    await until(() => b.messages.some(m => m.players?.some((p: any) => p.nickname === '하나' && p.x > .2)));
    a.send({ type: 'travel', zone: 'yoga' });
    for (let i = 0; i < 12; i++) { a.send({ type: 'move', dx: -1, dz: 0, yaw: Math.PI / 2 }); await new Promise(r => setTimeout(r, 80)); }
    await until(() => b.messages.some(m => m.players?.some((p: any) => p.nickname === '하나' && p.zone === 'yoga' && p.x < -24)));
    a.send({ type: 'move', dx: 0, dz: 0, yaw: Math.PI / 2 }); a.send({ type: 'join-yoga' });
    await until(() => b.messages.some(m => m.occupancy?.['mat-7']));
    a.ws.close(); await until(() => b.messages.some(m => m.type === 'state' && m.count === 1 && !m.occupancy['mat-7']));
    b.ws.close();
  } finally { await app.close(); }
});
