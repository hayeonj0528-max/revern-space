import { test, expect, chromium, type Page } from '@playwright/test';
import { chromePath } from '../playwright.config';
import { bathAt, groundHeightAt, SPA_BATHS } from '../shared/spa';

const errors: string[] = [];
const state = (page: Page) => page.evaluate(() => (window as any).__REVERN__.getState());
const self = async (page: Page) => { const s = await state(page); return s.snapshot?.players.find((p: any) => p.id === s.id); };
const viewYaw = (page: Page): Promise<number> => page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').find(r => r.name.includes('/client/controls.ts'))!.name;
  return (await import(/* @vite-ignore */ url)).motion.yaw;
});
async function enter(page: Page, name: string) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text()); });
  await page.goto('/'); await page.getByLabel('닉네임').fill(name);
  await page.getByRole('button', { name: '들어가기', exact: true }).click();
  await expect(page.getByRole('button', { name: '공간 지도', exact: true })).toBeVisible();
  await expect.poll(async () => (await state(page)).connection).toBe('connected');
}
async function travel(page: Page, name: string, zone: string) {
  await page.getByRole('button', { name: '공간 지도', exact: true }).click();
  await page.getByRole('button', { name: `${name} 선택`, exact: true }).click();
  await page.getByRole('button', { name: '이 공간으로 이동', exact: true }).click();
  await expect.poll(async () => (await self(page)).zone).toBe(zone);
}
async function screenshot(page: Page, file: string) { await page.waitForTimeout(400); await page.screenshot({ path: `test-results/screenshots/${file}.png` }); }
async function openHudMenu(page: Page, label: string) {
  const menu = page.locator('.hud-menu').filter({ has: page.locator('summary').filter({ hasText: label }) });
  if (await menu.getAttribute('open') === null) await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
}
async function walkForward(page: Page, duration = 550, mobile = false) {
  if (mobile) {
    const rect = await page.getByRole('group', { name: '터치 이동 조이스틱' }).boundingBox();
    const x = rect!.x + rect!.width / 2, y = rect!.y + rect!.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 30);
    await page.waitForTimeout(duration); await page.mouse.up();
  } else {
    await page.locator('canvas').click({ position: { x: 600, y: 350 } });
    await page.keyboard.down('w'); await page.waitForTimeout(duration); await page.keyboard.up('w');
  }
}

async function walkTo(page: Page, x: number, z: number) {
  await page.locator('canvas').click({ position: { x: 600, y: 350 } });
  for (let attempt = 0; attempt < 64; attempt++) {
    const [p, yaw] = await Promise.all([self(page), viewYaw(page)]), dx = x - p.x, dz = z - p.z;
    const distance = Math.hypot(dx, dz); if (distance < .3) return;
    const forward = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
    const side = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    const keys = [...(Math.abs(forward) > .2 ? [forward > 0 ? 'w' : 's'] : []), ...(Math.abs(side) > .2 ? [side > 0 ? 'd' : 'a'] : [])];
    if (!keys.length) return;
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(170, Math.max(40, distance / 5 * 700)));
    for (const key of keys) await page.keyboard.up(key);
    await page.waitForTimeout(70);
  }
  throw new Error(`Could not walk to ${x}, ${z}: ${JSON.stringify(await self(page))}`);
}

async function measureFrames(page: Page) {
  return page.evaluate(async () => {
    const samples: number[] = []; let last = performance.now(), start = last;
    await new Promise<void>(resolve => { const frame = (now: number) => { samples.push(now - last); last = now; if (now - start >= 3000) resolve(); else requestAnimationFrame(frame); }; requestAnimationFrame(frame); });
    samples.sort((a, b) => a - b);
    const canvas = document.querySelector('canvas')!, gl = canvas.getContext('webgl2')!, debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { fps: Math.round(samples.length / ((last - start) / 1000) * 10) / 10, p95FrameMs: Math.round(samples[Math.floor(samples.length * .95)] * 10) / 10, resolution: [innerWidth, innerHeight], drawingBuffer: [canvas.width, canvas.height], renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'not disclosed' };
  });
}

// Read the actual rendered transforms, rather than only checking the network yaw.
async function captureWalk(page: Page, id: string, frames = 45) {
  return page.evaluate(async ({ id, frames }) => {
    const url = performance.getEntriesByType('resource').find(r => r.name.includes('/@react-three_fiber.js'))!.name;
    const { _roots } = await import(/* @vite-ignore */ url);
    const { scene, camera } = _roots.get(document.querySelector('canvas')).store.getState();
    const samples: { x: number; z: number; fx: number; fz: number; cx: number; cz: number; arm: number; leg: number }[] = [];
    await new Promise<void>(resolve => {
      const frame = () => {
        const avatar = scene.getObjectByName(`avatar:${id}`), m = avatar.matrixWorld.elements;
        const look = camera.getWorldDirection(camera.position.clone()), length = Math.hypot(look.x, look.z);
        samples.push({ x: m[12], z: m[14], fx: -m[8], fz: -m[10], cx: look.x / length, cz: look.z / length, arm: avatar.getObjectByName('left-arm').rotation.x, leg: avatar.getObjectByName('left-leg').rotation.x });
        if (samples.length >= frames) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    return samples;
  }, { id, frames });
}
function assertForwardWalking(samples: Awaited<ReturnType<typeof captureWalk>>, label: string, minimumMovingFrames = 8) {
  let moving = 0, worst = 1;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
    if (distance < .002) continue;
    moving++; const alignment = (dx * b.fx + dz * b.fz) / distance; worst = Math.min(worst, alignment);
    expect(alignment, `${label}, frame ${i}: ${JSON.stringify({ a, b })}`).toBeGreaterThan(.98);
    expect(b.arm * b.leg, `${label}: arm and leg must swing in opposite directions`).toBeLessThanOrEqual(.000001);
  }
  expect(moving, `${label}: should actually walk`).toBeGreaterThan(minimumMovingFrames);
  console.log('Rendered forward walking', label, JSON.stringify({ movingFrames: moving, minimumAlignment: worst }));
}

test('walking turns before moving and faces the rendered travel direction in two independent browsers', async ({ browser, baseURL }) => {
  errors.length = 0;
  const browserB = await chromium.launch({ executablePath: chromePath });
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
  const contextB = await browserB.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
  const a = await contextA.newPage(), b = await contextB.newPage();
  try {
    await enter(a, '걷는 이용자'); await enter(b, '바라보는 이용자');
    await expect.poll(async () => (await state(b)).snapshot.count).toBe(2);
    const id = (await state(a)).id;
    await a.locator('canvas').click({ position: { x: 600, y: 350 } });
    for (const keys of [['d'], ['a'], ['s'], ['w'], ['w', 'd'], ['s', 'a'], ['s', 'd'], ['w', 'a']]) {
      for (const key of keys) await a.keyboard.down(key);
      const [local, remote] = await Promise.all([captureWalk(a, id), captureWalk(b, id)]);
      for (const key of keys) await a.keyboard.up(key);
      assertForwardWalking(local, `local ${keys.join('+')}`); assertForwardWalking(remote, `remote ${keys.join('+')}`);
      await a.waitForTimeout(250);
    }
    await travel(a, '숲의 중정', 'courtyard'); await travel(b, '숲의 중정', 'courtyard');
    await a.waitForTimeout(250);
    await a.locator('canvas').click({ position: { x: 600, y: 350 } });
    await a.keyboard.down('d'); await a.waitForTimeout(350);
    await Promise.all([a.screenshot({ path: 'test-results/screenshots/walking-forward-local.png' }), b.screenshot({ path: 'test-results/screenshots/walking-forward-observer.png' })]);
    await a.keyboard.up('d');
    // Enter the narrow bridge through its center before testing its edge.
    await walkTo(a, 0, -4);
    await walkTo(a, -1.1, -6);
    await a.keyboard.down('a'); await a.keyboard.down('w');
    const [localWall, remoteWall] = await Promise.all([captureWalk(a, id, 60), captureWalk(b, id, 60)]);
    await a.keyboard.up('a'); await a.keyboard.up('w');
    assertForwardWalking(localWall, 'local wall slide'); assertForwardWalking(remoteWall, 'remote wall slide');
    assertForwardWalking(localWall.slice(24), 'local continuous wall slide', 26);
    assertForwardWalking(remoteWall.slice(24), 'remote continuous wall slide', 26);
    await screenshot(a, 'walking-along-wall');
    await a.getByRole('button', { name: '1인칭', exact: true }).click();
    await walkForward(a, 500);
    await expect(a.getByRole('button', { name: '1인칭', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(b.getByRole('button', { name: '3인칭', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  } finally { await contextA.close(); await contextB.close(); await browserB.close(); }
});

test('reversing turns the view with the body without circling, in both views and on mobile', async ({ browser, baseURL }) => {
  errors.length = 0;
  const secondBrowser = await chromium.launch({ executablePath: chromePath });
  try {
    for (const mobile of [false, true]) for (const firstPerson of [false, true]) {
      const ca = await browser.newContext({ baseURL, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
      const cb = await secondBrowser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
      const a = await ca.newPage(), b = await cb.newPage();
      const start = async (reverse: boolean) => {
        if (mobile) {
          const rect = (await a.getByRole('group', { name: '터치 이동 조이스틱' }).boundingBox())!;
          const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
          await a.mouse.move(x, y); await a.mouse.down(); await a.mouse.move(x, y + (reverse ? 30 : -30));
        } else await a.keyboard.down(reverse ? 's' : 'w');
      };
      const stop = async (reverse: boolean) => { if (mobile) await a.mouse.up(); else await a.keyboard.up(reverse ? 's' : 'w'); };
      try {
        await enter(a, '시선 전환'); await enter(b, '독립된 시선');
        await expect.poll(async () => (await state(b)).snapshot.count).toBe(2);
        const id = (await state(a)).id;
        if (firstPerson) await a.getByRole('button', { name: '1인칭', exact: true }).click();
        if (!mobile) await a.locator('canvas').click({ position: { x: 600, y: 350 } });
        await start(false); await a.waitForTimeout(700); await stop(false); await a.waitForTimeout(180);
        const before = (await captureWalk(a, id, 2)).at(-1)!;
        const observer = (await captureWalk(b, id, 2)).at(-1)!;
        await start(true); await a.waitForTimeout(700);
        const [local, remote] = await Promise.all([captureWalk(a, id, 45), captureWalk(b, id, 45)]);
        await stop(true);
        const label = `${mobile ? 'mobile' : 'desktop'} ${firstPerson ? 'first' : 'third'} person`;
        assertForwardWalking(local, label); assertForwardWalking(remote, `${label} seen remotely`);
        for (let i = 1; i < local.length; i++) {
          const p = local[i], previous = local[i - 1], dx = p.x - previous.x, dz = p.z - previous.z, distance = Math.hypot(dx, dz);
          expect(p.cx * p.fx + p.cz * p.fz, `${label}: view must look forward with the body`).toBeGreaterThan(.98);
          expect(p.cx * before.cx + p.cz * before.cz, `${label}: view must reverse`).toBeLessThan(-.98);
          if (distance > .002) expect((-before.cx * dx - before.cz * dz) / distance, `${label}: holding reverse must keep a straight path`).toBeGreaterThan(.98);
        }
        for (const p of remote) expect(p.cx * observer.cx + p.cz * observer.cz, 'another user keeps their own view').toBeGreaterThan(.999);
        await screenshot(a, `14-${mobile ? 'mobile' : 'desktop'}-${firstPerson ? 'first' : 'third'}-reverse-view`);
        if (!mobile) {
          const beforeLook = (await captureWalk(a, id, 2)).at(-1)!;
          await a.mouse.move(850, 350); await a.mouse.down(); await a.mouse.move(970, 350, { steps: 8 }); await a.mouse.up(); await a.waitForTimeout(1000);
          const afterLook = (await captureWalk(a, id, 2)).at(-1)!;
          expect(afterLook.cx * beforeLook.cx + afterLook.cz * beforeLook.cz, 'manual look remains available at rest').toBeLessThan(.96);
        }
      } finally { await ca.close(); await cb.close(); }
    }
    expect(errors).toEqual([]);
  } finally { await secondBrowser.close(); }
});

test('yoga faces straight along the mat on both browsers while the instructor remains visible', async ({ browser, baseURL }) => {
  errors.length = 0;
  const secondBrowser = await chromium.launch({ executablePath: chromePath });
  const ca = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const cb = await secondBrowser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const a = await ca.newPage(), b = await cb.newPage();
  const view = (page: Page, ids: string[]) => page.evaluate(async ids => {
    const url = performance.getEntriesByType('resource').find(r => r.name.includes('/@react-three_fiber.js'))!.name;
    const { _roots } = await import(/* @vite-ignore */ url);
    const { scene, camera } = _roots.get(document.querySelector('canvas')).store.getState();
    const instructor = scene.getObjectByName('avatar:guide');
    const point = instructor.position.clone().add({ x: 0, y: 1.2, z: 0 }).project(camera);
    const direction = camera.getWorldDirection(camera.position.clone());
    return { instructor: { x: point.x, y: point.y, z: point.z }, look: { x: direction.x, z: direction.z }, players: ids.map(id => { const avatar = scene.getObjectByName(`avatar:${id}`), m = avatar.matrixWorld.elements; return { id, fx: -m[8], fz: -m[10], visible: avatar.visible }; }) };
  }, ids);
  const assertFacing = async (page: Page, ids: string[]) => {
    await expect.poll(async () => (await view(page, ids)).players.every(p => Math.abs(p.fx) < .00001 && Math.abs(p.fz + 1) < .00001)).toBe(true);
  };
  const assertInstructor = async (page: Page, ids: string[]) => {
    await expect.poll(async () => { const p = (await view(page, ids)).instructor; return Math.abs(p.x) < .9 && Math.abs(p.y) < .9 && p.z > -1 && p.z < 1; }).toBe(true);
  };
  try {
    await enter(a, '정면 요가 하나'); await enter(b, '정면 요가 두리');
    const ids = [(await state(a)).id, (await state(b)).id];
    for (const [left, right] of [[0, 3], [8, 11]]) {
      await travel(a, '요가 대청', 'yoga'); await travel(b, '요가 대청', 'yoga');
      const mats = [left, right].map(index => ({ index, x: -38 + index % 4 * 4.1, z: -4.8 + Math.floor(index / 4) * 4.8 }));
      await Promise.all([walkTo(a, mats[0].x + .6, mats[0].z + 1.3), walkTo(b, mats[1].x + .6, mats[1].z + 1.3)]);
      await Promise.all([a.getByRole('button', { name: '앉기', exact: true }).click(), b.getByRole('button', { name: '앉기', exact: true }).click()]);
      await expect.poll(async () => (await self(a)).slot).toBe(`mat-${left}`); await expect.poll(async () => (await self(b)).slot).toBe(`mat-${right}`);
      await assertFacing(a, ids); await assertFacing(b, ids);
      expect((await state(a)).snapshot.players.every((p: any) => p.yaw === 0)).toBe(true);
      await assertInstructor(a, ids); await assertInstructor(b, ids);
      await screenshot(a, `13-yoga-mat-${left}-forward`); await screenshot(b, `13-yoga-mat-${right}-forward`);
      await a.getByRole('button', { name: '1인칭', exact: true }).click();
      await assertFacing(a, ids); await assertFacing(b, ids); await assertInstructor(a, ids);
      expect((await view(a, ids)).players.find(p => p.id === ids[0])!.visible).toBe(false);
      await screenshot(a, `13-yoga-mat-${left}-first-person`);
      const before = (await view(a, ids)).look;
      await a.mouse.move(850, 350); await a.mouse.down(); await a.mouse.move(980, 350, { steps: 8 }); await a.mouse.up();
      await expect.poll(async () => { const after = (await view(a, ids)).look; return Math.hypot(after.x - before.x, after.z - before.z); }).toBeGreaterThan(.1);
      await assertFacing(a, ids); await assertFacing(b, ids);
      await a.getByRole('button', { name: '3인칭', exact: true }).click();
    }
    await a.keyboard.press('e'); await b.keyboard.press('e');
    await expect.poll(async () => (await self(a)).slot).toBe(null); await expect.poll(async () => (await self(b)).slot).toBe(null);
    expect(errors).toEqual([]);
  } finally { await ca.close(); await cb.close(); await secondBrowser.close(); }
});

test('two independent browsers: mutual movement, yoga race, props, floating, private view, disconnect and reconnect', async ({ browser, baseURL }) => {
  errors.length = 0;
  const browserB = await chromium.launch({ executablePath: chromePath });
  const contextB = await browserB.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
  for (const context of [ctxA, contextB]) await context.addInitScript(() => {
    const calls: string[] = []; (window as any).__narrationCalls = calls;
    if (window.speechSynthesis) { const original = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => { calls.push(utterance.text); original(utterance); }; }
  });
  const b = await contextB.newPage(), alpha = await ctxA.newPage();
  try {
    await alpha.goto('/'); await expect(alpha.getByRole('heading', { name: '잠시, 나에게 돌아오는 시간' })).toBeVisible();
    await screenshot(alpha, '00-entrance');
    await enter(alpha, '하나'); await enter(b, '두리');
    await expect.poll(async () => (await state(alpha)).snapshot.count).toBe(2);
    await expect.poll(async () => (await state(b)).snapshot.count).toBe(2);
    expect(await alpha.evaluate(() => (window as any).__narrationCalls)).toEqual([]);
    expect(await alpha.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
    await expect(alpha.getByText('사랑해, 아가야', { exact: false })).toHaveCount(0);
    await alpha.keyboard.press('Escape'); await alpha.locator('canvas').click({ position: { x: 600, y: 350 } });
    await alpha.keyboard.down('w'); await alpha.waitForTimeout(900); await alpha.keyboard.up('w');
    await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.nickname === '하나').z).toBeLessThan(15);
    await b.locator('canvas').click({ position: { x: 600, y: 350 } }); await b.keyboard.down('d'); await b.waitForTimeout(750); await b.keyboard.up('d');
    await expect.poll(async () => (await state(alpha)).snapshot.players.find((p: any) => p.nickname === '두리').x).toBeGreaterThan(1);
    expect((await state(alpha)).snapshot.players.find((p: any) => p.nickname === '두리').yaw).toBeCloseTo(-Math.PI / 2, 1);
    await screenshot(alpha, '01-courtyard-browser-a'); await screenshot(b, '01-courtyard-browser-b');
    console.log('Desktop courtyard · 2 users', JSON.stringify(await measureFrames(alpha)));
    await alpha.getByRole('button', { name: '1인칭', exact: true }).click();
    await expect(alpha.getByRole('button', { name: '1인칭', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(b.getByRole('button', { name: '3인칭', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await screenshot(alpha, '02-first-person'); await alpha.keyboard.press('v');
    await travel(alpha, '요가 대청', 'yoga'); await travel(b, '요가 대청', 'yoga');
    await expect(alpha.getByRole('button', { name: '앉기', exact: true })).toHaveCount(0);
    await expect(alpha.locator('[data-slot^="mat-"]')).toHaveCount(0);
    await walkForward(alpha);
    await expect(alpha.getByRole('button', { name: '앉기', exact: true })).toBeVisible();
    await screenshot(alpha, '03-yoga-nearby');
    const nearMat = await self(alpha);
    await alpha.keyboard.down('s'); await alpha.waitForTimeout(550); await alpha.keyboard.up('s');
    await expect(alpha.getByRole('button', { name: '앉기', exact: true })).toHaveCount(0);
    await walkTo(alpha, nearMat.x, nearMat.z); await walkForward(b);
    await expect(alpha.getByRole('button', { name: '앉기', exact: true })).toBeVisible();
    await expect(b.getByRole('button', { name: '앉기', exact: true })).toBeVisible();
    await Promise.all([alpha.keyboard.press('e'), b.keyboard.press('e')]);
    await expect.poll(async () => (await state(alpha)).snapshot.players.filter((p: any) => p.activity === 'yoga').length).toBe(1);
    const winner = (await self(alpha)).slot ? alpha : b, loser = winner === alpha ? b : alpha;
    await expect(winner.getByRole('complementary', { name: '요가 참여 중' })).toBeVisible();
    await expect(winner.locator('.action-panel')).toHaveCount(0);
    await expect(winner.getByRole('button', { name: '앉기', exact: true })).toHaveCount(0);
    await expect(loser.getByRole('button', { name: '앉기', exact: true })).toHaveCount(0);
    const compact = await winner.locator('.yoga-session').boundingBox();
    expect(compact!.height).toBeLessThan(85); expect(compact!.x).toBeGreaterThan(900);
    await walkForward(loser, 850);
    await loser.getByRole('button', { name: '앉기', exact: true }).click();
    await expect.poll(async () => (await state(b)).snapshot.players.filter((p: any) => p.activity === 'yoga').length).toBe(2);
    expect((await state(alpha)).snapshot.yogaStartedAt).toBe((await state(b)).snapshot.yogaStartedAt);
    await expect.poll(async () => await alpha.locator('[data-yoga-pose]').getAttribute('data-yoga-pose') === await b.locator('[data-yoga-pose]').getAttribute('data-yoga-pose')).toBe(true);
    const firstPose = await alpha.locator('[data-yoga-pose]').getAttribute('data-yoga-pose');
    await screenshot(alpha, '03-yoga-browser-a'); await screenshot(b, '03-yoga-browser-b');
    await expect(alpha.locator('[data-yoga-pose]')).not.toHaveAttribute('data-yoga-pose', firstPose!, { timeout: 5500 });
    await screenshot(alpha, '03-yoga-next-pose');
    const originalMat = (await self(winner)).slot;
    await winner.keyboard.press('e'); await expect.poll(async () => (await self(winner)).slot).toBe(null);
    await expect(winner.getByRole('button', { name: '앉기', exact: true })).toBeVisible();
    await winner.keyboard.press('e'); await expect.poll(async () => (await self(winner)).slot).toBe(originalMat);
    await travel(alpha, '스파', 'spa'); await travel(b, '스파', 'spa');
    await openHudMenu(alpha, '휴식 도구'); await alpha.getByRole('button', { name: '양머리 착용' }).click();
    await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.nickname === '하나').towel).toBe(true);
    await openHudMenu(alpha, '휴식 도구'); await alpha.getByRole('button', { name: '앉아 쉬기' }).click();
    await expect.poll(async () => (await self(alpha)).activity).toBe('sitting');
    const seat = (await self(alpha)).slot;
    await alpha.getByRole('button', { name: '1인칭', exact: true }).click(); expect((await self(alpha)).slot).toBe(seat);
    await alpha.getByRole('button', { name: '3인칭', exact: true }).click();
    await openHudMenu(alpha, '휴식 도구'); await alpha.getByRole('button', { name: '식혜 마시기' }).click();
    await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.nickname === '하나').activity).toBe('drinking');
    await screenshot(alpha, '04-spa');
    await travel(alpha, '플로팅 홀', 'floating'); await travel(b, '플로팅 홀', 'floating');
    await openHudMenu(alpha, '자리 선택'); await alpha.locator('[data-slot="tube-0"]').click(); await openHudMenu(b, '자리 선택'); await b.locator('[data-slot="tube-0"]').click();
    await Promise.all([alpha.getByRole('button', { name: '튜브 위에 눕기' }).click(), b.getByRole('button', { name: '튜브 위에 눕기' }).click()]);
    await expect.poll(async () => (await state(alpha)).snapshot.players.filter((p: any) => p.slot === 'tube-0').length).toBe(1);
    const floatingWinner = (await self(alpha)).slot ? alpha : b, floatingLoser = floatingWinner === alpha ? b : alpha;
    await openHudMenu(floatingLoser, '자리 선택'); await floatingLoser.locator('[data-slot="tube-1"]').click(); await floatingLoser.getByRole('button', { name: '튜브 위에 눕기' }).click();
    await expect.poll(async () => (await self(alpha)).activity).toBe('lying');
    await alpha.getByRole('button', { name: '클래식 듣기', exact: true }).click();
    await expect(alpha.getByRole('button', { name: '일시정지', exact: true })).toBeVisible();
    await expect(b.getByRole('button', { name: '클래식 듣기', exact: true })).toBeVisible();
    await expect.poll(() => alpha.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(.2);
    expect(await alpha.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.duration)).toBeGreaterThan(180);
    expect(await b.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
    expect(await alpha.evaluate(() => (window as any).__narrationCalls)).toEqual([]);
    expect(await b.evaluate(() => (window as any).__narrationCalls)).toEqual([]);
    const tube = (await self(alpha)).slot;
    await alpha.getByRole('button', { name: '1인칭', exact: true }).click();
    await expect(alpha.getByRole('button', { name: '일시정지', exact: true })).toBeVisible(); expect((await self(alpha)).slot).toBe(tube);
    await screenshot(alpha, '05-floating-first-person');
    await alpha.getByRole('button', { name: '3인칭', exact: true }).click(); await screenshot(alpha, '05-floating-third-person');
    console.log('Desktop floating · 2 users · reflection enabled', JSON.stringify(await measureFrames(alpha)));
    await alpha.getByRole('button', { name: '일시정지', exact: true }).click();
    await expect.poll(() => alpha.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
    const musicTime = await alpha.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.currentTime);
    const progress = await alpha.getByRole('progressbar').getAttribute('aria-valuenow'); await alpha.waitForTimeout(1100);
    expect(await alpha.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(progress);
    expect(await alpha.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.currentTime)).toBeCloseTo(musicTime, 1);
    await alpha.getByRole('button', { name: '음악 이어듣기' }).click();
    await expect.poll(() => alpha.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(musicTime + .1);
    const before = await self(alpha);
    await ctxA.setOffline(true);
    await expect(alpha.getByRole('alert').filter({ hasText: '재연결' })).toBeVisible({ timeout: 20000 });
    await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.id === before.id).connected).toBe(false);
    expect((await state(b)).snapshot.occupancy[before.slot]).toBe(before.id);
    await ctxA.setOffline(false); await expect.poll(async () => (await state(alpha)).connection, { timeout: 20000 }).toBe('connected');
    expect((await self(alpha)).id).toBe(before.id); expect((await self(alpha)).slot).toBe(before.slot);
    await alpha.getByRole('button', { name: '음악 종료' }).click(); await alpha.getByRole('button', { name: '내려오기' }).click();
    await expect.poll(async () => (await self(alpha)).slot).toBe(null);
    expect(await alpha.locator('audio[data-revern-music]').evaluate((node: HTMLAudioElement) => node.paused && node.currentTime === 0)).toBe(true);
    await travel(alpha, '숲의 다실', 'tea'); await travel(b, '숲의 다실', 'tea');
    await alpha.getByRole('button', { name: '앉기', exact: true }).click(); await alpha.getByRole('button', { name: '캐모마일', exact: true }).click();
    await alpha.getByRole('button', { name: '캐모마일 따르기' }).click();
    await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.nickname === '하나').activity).toBe('pouring');
    await expect(alpha.getByRole('button', { name: '차 마시기', exact: true })).toBeEnabled(); await alpha.getByRole('button', { name: '차 마시기', exact: true }).click();
    await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.nickname === '하나').drink).toBe('chamomile');
    await screenshot(alpha, '06-tea-room');
    await alpha.getByRole('button', { name: '소리와 화면 설정' }).click(); await alpha.getByLabel('전체 음소거').check(); await alpha.getByLabel('움직임 줄이기').check(); await alpha.getByRole('button', { name: '닫기', exact: true }).click();
    await b.close();
    await expect.poll(async () => (await state(alpha)).snapshot.count).toBe(1);
    await expect.poll(async () => (await state(alpha)).snapshot.players.length, { timeout: 20000 }).toBe(1);
    expect(errors).toEqual([]);
    const diagnostics = await alpha.evaluate(() => ({ userAgent: navigator.userAgent, resolution: [innerWidth, innerHeight], renderer: document.querySelector('canvas')?.getContext('webgl2')?.getParameter(7937), music: document.querySelector<HTMLAudioElement>('audio[data-revern-music]')?.currentSrc }));
    console.log('Browser diagnostics', JSON.stringify(diagnostics));
  } finally { await ctxA.close(); await contextB.close(); await browserB.close(); }
});

test('390px mobile: joystick, look drag, map, all room actions and exit remain accessible', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await enter(page, '모바일');
    const initial = (await self(page)).x;
    const stick = page.getByRole('group', { name: '터치 이동 조이스틱' }); await expect(stick).toBeVisible();
    const rect = await stick.boundingBox(); expect(rect).not.toBeNull();
    const x = rect!.x + rect!.width / 2, y = rect!.y + rect!.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 28, y); await page.waitForTimeout(600); await page.mouse.up();
    await expect.poll(async () => (await self(page)).x).toBeGreaterThan(initial + .3);
    await page.getByRole('button', { name: '1인칭', exact: true }).click();
    await page.mouse.move(330, 250); await page.mouse.down(); await page.mouse.move(270, 270, { steps: 5 }); await page.mouse.up();
    await page.getByRole('button', { name: '3인칭', exact: true }).click();
    await screenshot(page, '07-mobile-courtyard');
    console.log('Mobile emulation · 1 user · low quality', JSON.stringify(await measureFrames(page)));
    for (const [name, id, action] of [['요가 대청', 'yoga', '앉기'], ['스파', 'spa', '양머리 착용'], ['핀란드 사우나', 'sauna', '앉아 찜질하기'], ['플로팅 홀', 'floating', '튜브 위에 눕기'], ['숲의 다실', 'tea', '앉기']]) {
      await travel(page, name, id); if (id === 'yoga') await walkForward(page, 550, true); if (id === 'sauna') await walkForward(page, 2000, true); if (id === 'spa') await openHudMenu(page, '휴식 도구'); const button = page.getByRole('button', { name: action, exact: true }); await expect(button).toBeInViewport(); await button.click();
      if (id === 'yoga') { await expect(page.locator('.action-panel')).toHaveCount(0); await expect(page.getByRole('button', { name: '일어나기', exact: false })).toBeInViewport(); await screenshot(page, '07-mobile-yoga'); }
      if (id === 'spa') {
        await expect.poll(() => page.locator('audio[data-revern-spa-music]').evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(.1);
        await walkForward(page, 1050, true); await page.getByRole('button', { name: '온탕 들어가기', exact: true }).click();
        await expect(page.getByRole('button', { name: '탕에서 나오기', exact: true })).toBeInViewport(); await screenshot(page, '10-mobile-warm-bath');
        await page.getByRole('button', { name: '탕에서 나오기', exact: true }).click();
      }
      if (id === 'sauna') { await expect(page.getByRole('button', { name: '찜질 끝내기' })).toBeInViewport(); await screenshot(page, '11-mobile-sauna'); }

      if (id === 'floating') { await page.getByRole('button', { name: '클래식 듣기', exact: true }).click(); await expect(page.getByRole('button', { name: '음악 종료', exact: true })).toBeInViewport(); await expect(page.getByRole('button', { name: '내려오기', exact: true })).toBeInViewport(); await screenshot(page, '08-mobile-floating'); }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshot(page, '09-mobile-tea');
  } finally { await context.close(); }
});

test('warm/cold baths, adjoining Finnish sauna, shared steam and automatic private spa music', async ({ browser, baseURL }) => {
  const secondBrowser = await chromium.launch({ executablePath: chromePath });
  const ca = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const cb = await secondBrowser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    await enter(a, '스파하나'); await enter(b, '스파두리');
    await travel(a, '스파', 'spa');
    await expect.poll(() => a.locator('audio[data-revern-spa-music]').evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(.2);
    expect(await b.locator('audio[data-revern-spa-music]').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
    await travel(b, '스파', 'spa'); await screenshot(a, '10-spa-two-baths');
    for (const bath of SPA_BATHS) {
      if (bath.id === 'cold') await travel(a, '스파', 'spa');
      await walkTo(a, bath.entry[0], 2.6);
      await expect(a.getByRole('button', { name: `${bath.name} 들어가기`, exact: true })).toBeVisible();
      // Walk down the actual stairs rather than using the entry shortcut.
      await walkTo(a, bath.x, -3.2);
      await expect.poll(async () => bathAt((await self(a)).x, (await self(a)).z)?.id).toBe(bath.id);
      expect(groundHeightAt((await self(a)).x, (await self(a)).z)).toBe(-.8);
      await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.nickname === '스파하나').activity).toBe('bathing');
      await expect(a.getByRole('complementary', { name: `${bath.name} 이용 중` })).toBeVisible();
      await a.getByRole('button', { name: '1인칭', exact: true }).click(); await screenshot(a, `10-${bath.id}-bath-first-person`);
      await a.getByRole('button', { name: '3인칭', exact: true }).click(); await screenshot(a, `10-${bath.id}-bath-third-person`);
      await a.getByRole('button', { name: '탕에서 나오기', exact: true }).click();
      await expect.poll(async () => bathAt((await self(a)).x, (await self(a)).z)).toBe(undefined);
    }
    await travel(a, '스파', 'spa');
    const playingAt = await a.locator('audio[data-revern-spa-music]').evaluate((el: HTMLAudioElement) => el.currentTime);
    // The east doorway connects the two rooms without a map teleport.
    await walkTo(a, 48.5, 4);
    await expect.poll(async () => (await self(a)).zone).toBe('sauna');
    expect(await a.locator('audio[data-revern-spa-music]').evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(playingAt);
    await travel(b, '핀란드 사우나', 'sauna');
    await walkTo(a, 51, -3.5);
    await a.getByRole('button', { name: '물 한 국자 붓기', exact: true }).click();
    await expect.poll(async () => (await state(b)).snapshot.saunaSteamStartedAt).toBeGreaterThan(0);
    await expect.poll(async () => (await state(a)).snapshot.saunaSteamStartedAt === (await state(b)).snapshot.saunaSteamStartedAt).toBe(true);
    await screenshot(a, '11-sauna-stones-and-steam');
    await expect(a.getByRole('button', { name: '증기가 퍼지는 중' })).toBeDisabled();
    await expect.poll(async () => (await self(a)).activity).toBe('idle');
    await walkTo(a, 57.9, -3.5);
    await a.getByRole('button', { name: '앉아 찜질하기', exact: true }).click();
    await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.nickname === '스파하나').activity).toBe('sauna');
    await expect.poll(async () => (await self(a)).slot).not.toBeNull();
    const seat = (await self(a)).slot;
    await a.getByRole('button', { name: '양머리 착용', exact: true }).click();
    await expect.poll(async () => (await state(b)).snapshot.players.find((p: any) => p.nickname === '스파하나').towel).toBe(true);
    await a.getByRole('button', { name: '1인칭', exact: true }).click(); expect((await self(a)).slot).toBe(seat);
    await screenshot(a, '11-sauna-first-person');
    await a.getByRole('button', { name: '3인칭', exact: true }).click(); await screenshot(a, '11-sauna-third-person');
    await a.getByRole('button', { name: '찜질 끝내기', exact: true }).click(); await expect.poll(async () => (await self(a)).slot).toBe(null);
    await travel(a, '숲의 중정', 'courtyard');
    await expect.poll(() => a.locator('audio[data-revern-spa-music]').evaluate((el: HTMLAudioElement) => el.paused && el.currentTime === 0)).toBe(true);
    expect(await b.locator('audio[data-revern-spa-music]').evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);
  } finally { await ca.close(); await cb.close(); await secondBrowser.close(); }
});

test('room controls keep the view clear on desktop and mobile, before and during activities', async ({ browser, baseURL }) => {
  errors.length = 0;
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    const context = await browser.newContext({ baseURL, viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const clearView = async () => {
      // Compare UI and model coordinates after the same new 3D frame is painted.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.locator('.action-panel,.spa-panel,.zone-poem')).toHaveCount(0);
      await expect(page.locator('.hud-menu[open]')).toHaveCount(0);
      const panels = await page.locator('.room-hud,.yoga-nearby,.yoga-session').evaluateAll(nodes => nodes.filter(node => node.isConnected && node.getClientRects().length > 0).map(node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, height: r.height }; }));
      for (const panel of panels) {
        expect(panel.x, 'controls must stay beside the center view').toBeGreaterThan(viewport.width / 2 + 20);
        expect(panel.right).toBeLessThanOrEqual(viewport.width - 8); expect(panel.y).toBeGreaterThan(120);
        expect(panel.bottom).toBeLessThan(viewport.height - 40); expect(panel.height).toBeLessThanOrEqual(195);
      }
      expect(await page.evaluate(() => [.4, .6, .75].every(y => document.elementFromPoint(innerWidth / 2, innerHeight * y)?.tagName === 'CANVAS'))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const overlaps = await page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').find(r => r.name.includes('/@react-three_fiber.js'))!.name;
        const { _roots } = await import(/* @vite-ignore */ url);
        const { scene, camera } = _roots.get(document.querySelector('canvas')).store.getState();
        const avatar = scene.getObjectByName(`avatar:${(window as any).__REVERN__.getState().id}`);
        if (!avatar?.visible) return [];
        const panels = [...document.querySelectorAll('.room-hud,.yoga-nearby,.yoga-session')].map(node => node.getBoundingClientRect());
        const overlaps: { x: number; y: number; width: number; height: number }[] = [];
        avatar.traverse((mesh: any) => {
          if (!mesh.isMesh) return;
          for (let node = mesh; node && node !== avatar.parent; node = node.parent) if (!node.visible) return;
          mesh.geometry.computeBoundingBox(); const bounds = mesh.geometry.boundingBox;
          const points = [];
          for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(mesh.position.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld).project(camera));
          if (points.every(v => v.z < -1 || v.z > 1)) return;
          const left = Math.min(...points.map(v => (v.x + 1) * innerWidth / 2)), right = Math.max(...points.map(v => (v.x + 1) * innerWidth / 2));
          const top = Math.min(...points.map(v => (1 - v.y) * innerHeight / 2)), bottom = Math.max(...points.map(v => (1 - v.y) * innerHeight / 2));
          for (const panel of panels) {
            const width = Math.min(right, panel.right) - Math.max(left, panel.left), height = Math.min(bottom, panel.bottom) - Math.max(top, panel.top);
            if (width > 2 && height > 2) overlaps.push({ x: left, y: top, width, height });
          }
        });
        return overlaps;
      });
      expect(overlaps, 'controls must not cover the visible avatar body').toEqual([]);
    };
    try {
      await enter(page, mobile ? '모바일 시야' : '데스크톱 시야'); await clearView();
      for (const [name, zone] of [['요가 대청', 'yoga'], ['스파', 'spa'], ['핀란드 사우나', 'sauna'], ['플로팅 홀', 'floating'], ['숲의 다실', 'tea']]) {
        await travel(page, name, zone); await clearView();
        await screenshot(page, `12-${mobile ? 'mobile' : 'desktop'}-${zone}-clear-entry`);
        if (zone === 'yoga') { await walkForward(page, 550, mobile); await page.getByRole('button', { name: '앉기', exact: true }).click(); }
        if (zone === 'spa') { await openHudMenu(page, '휴식 도구'); await page.getByRole('button', { name: '앉아 쉬기', exact: true }).click(); }
        if (zone === 'sauna') { await walkForward(page, 2000, mobile); await page.getByRole('button', { name: '앉아 찜질하기', exact: true }).click(); }
        if (zone === 'floating') {
          await openHudMenu(page, '자리 선택'); await page.locator('[data-slot="tube-0"]').click();
          await expect(page.locator('.hud-menu[open]')).toHaveCount(0);
          await page.getByRole('button', { name: '튜브 위에 눕기', exact: true }).click();
          await page.getByRole('button', { name: '클래식 듣기', exact: true }).click();
          await expect(page.getByRole('button', { name: '음악 종료', exact: true })).toBeInViewport();
          await openHudMenu(page, '휴식 안내'); await expect(page.locator('.hud-menu-content').filter({ hasText: '짐노페디' })).toBeVisible();
          await page.keyboard.press('Escape'); await expect(page.locator('.hud-menu[open]')).toHaveCount(0);
        }
        if (zone === 'tea') {
          await page.getByRole('button', { name: '앉기', exact: true }).click();
          await page.getByRole('button', { name: '장미차', exact: true }).click();
          await page.getByRole('button', { name: '장미차 따르기', exact: true }).click();
          await expect.poll(async () => (await self(page)).activity).toBe('pouring');
        }
        await expect.poll(async () => !!(await self(page)).slot).toBe(true);
        await expect(page.locator('.room-hud,.yoga-session')).toBeVisible();
        await clearView();
        await screenshot(page, `12-${mobile ? 'mobile' : 'desktop'}-${zone}-clear-active`);
        await page.getByRole('button', { name: '1인칭', exact: true }).click(); await clearView();
        await page.getByRole('button', { name: '3인칭', exact: true }).click();
      }
    } finally { await context.close(); }
  }
  expect(errors).toEqual([]);
});

test('sound settings control the actual WebAudio output and dialog traps keyboard focus', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    const outputs: AudioNode[] = []; (window as any).__audioOutputs = outputs;
    const original = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args: any[]) { if (args[0] instanceof AudioDestinationNode) outputs.push(this); return (original as any).apply(this, args); };
  });
  const page = await context.newPage();
  try {
    await enter(page, '소리확인');
    await expect.poll(() => page.evaluate(() => (window as any).__audioOutputs[0]?.context.state)).toBe('running');
    await page.getByRole('button', { name: '소리와 화면 설정' }).click();
    await page.getByLabel('전체 음소거').check();
    await expect.poll(() => page.evaluate(() => (window as any).__audioOutputs[0].gain.value)).toBeLessThan(.001);
    await page.getByLabel('전체 음소거').uncheck();
    await page.getByLabel('음량').focus(); await page.keyboard.press('End');
    await expect.poll(() => page.evaluate(() => (window as any).__audioOutputs[0].gain.value)).toBeGreaterThan(.44);
    await page.getByLabel('환경음과 음악').uncheck();
    await expect.poll(() => page.evaluate(() => (window as any).__audioOutputs[0].gain.value)).toBeLessThan(.001);
    await page.getByRole('button', { name: '닫기', exact: true }).focus(); await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: '소리 활성화', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { await context.close(); }
});

test('WebGL unavailable shows a useful recovery message', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: any[]) { if (type.startsWith('webgl')) return null; return (original as any).call(this, type, ...args); } as typeof original;
  });
  const page = await context.newPage();
  try { await page.goto('/'); await expect(page.getByRole('heading', { name: '3D 공간을 열 수 없어요' })).toBeVisible(); await expect(page.getByRole('button', { name: '다시 열기' })).toBeVisible(); }
  finally { await context.close(); }
});
