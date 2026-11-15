import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { COLLIDERS, slide, type Player } from '../shared/world';
import { groundHeightAt } from '../shared/spa';
import { angleDelta, movementYaw, stepLocomotion } from '../shared/locomotion';
import { network, useSpace } from './network';
import { Avatar } from './Avatar';
import { motion, touchInput } from './controls';
import { World } from './World';
import type { DayCycle } from './dayCycle';

const guide: Player = { id: 'guide', nickname: '요가 가이드', appearance: { skin: 0, hair: 0, outfit: 1 }, x: -32, z: -7.5, yaw: Math.PI, zone: 'yoga', activity: 'yoga', towel: false, connected: true, slot: null, actionUntil: 0, drink: null, marshmallow: 'none' };
// Following the instructor changes the view, while the body stays parallel to its mat.
function initialViewYaw(player: Player) { return player.activity === 'yoga' ? Math.atan2(player.x - guide.x, player.z - guide.z) : player.yaw; }
class SceneBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { if (this.state.error) return <div className="webgl-error" role="alert"><h2>3D 공간을 열 수 없어요</h2><p>브라우저의 하드웨어 가속과 WebGL 지원을 확인해 주세요.</p><button onClick={() => location.reload()}>다시 열기</button><details><summary>오류 정보</summary>{this.state.error}</details></div>; return this.props.children; }
}
function Controller({ firstPerson, reducedMotion, joined, day, onReady, onStats }: { firstPerson: boolean; reducedMotion: boolean; joined: boolean; day: DayCycle; onReady: () => void; onStats: (fps: number) => void }) {
  const { gl, camera, scene } = useThree();
  const keys = useRef(new Set<string>()); const lastSnapshot = useRef<object | null>(null); const lastId = useRef<string | null>(null);
  const lastSend = useRef(0), lastInput = useRef(''), frames = useRef(0), elapsed = useRef(0), lastSlot = useRef<string | null>(null);
  const target = useRef(new THREE.Vector3()), desired = useRef(new THREE.Vector3()), ray = useMemoRay();
  const correction = useRef(new THREE.Vector2());
  const boxes = useRef([...COLLIDERS.filter(c => c.height > 1).map(c => new THREE.Box3(new THREE.Vector3(c.x - c.w / 2 - .18, 0, c.z - c.d / 2 - .18), new THREE.Vector3(c.x + c.w / 2 + .18, c.height, c.z + c.d / 2 + .18))), new THREE.Box3(new THREE.Vector3(-7.3, 3.28, 22.7), new THREE.Vector3(7.3, 5.8, 29.3))]);
  const ready = useRef(false);
  const lastView = useRef(firstPerson);
  const steering = useRef({ active: false, yaw: 0 });
  const autoLook = useRef(false), looking = useRef(false), manualLookUntil = useRef(0);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => { if ((e.target as HTMLElement).matches('input,select,textarea,button') || document.querySelector('[role="dialog"]')) return; if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); keys.current.add(e.code); } };
    const keyup = (e: KeyboardEvent) => { keys.current.delete(e.code); if (!keys.current.size && !touchInput.x && !touchInput.z) steering.current.active = false; };
    const clear = () => { keys.current.clear(); touchInput.x = touchInput.z = 0; steering.current.active = autoLook.current = looking.current = false; manualLookUntil.current = 0; network.send({ type: 'move', dx: 0, dz: 0, yaw: motion.facingYaw }); };
    let active = false, px = 0, py = 0;
    const down = (e: PointerEvent) => { if (e.button !== 0 || e.pointerType === 'touch' && e.clientX < innerWidth * .4) return; active = looking.current = true; px = e.clientX; py = e.clientY; };
    const up = () => { active = looking.current = false; };
    const move = (e: PointerEvent) => {
      if (!active && document.pointerLockElement !== gl.domElement) return;
      const dx = document.pointerLockElement ? e.movementX : e.clientX - px, dy = document.pointerLockElement ? e.movementY : e.clientY - py;
      const turn = -dx * .0035;
      motion.yaw = THREE.MathUtils.euclideanModulo(motion.yaw + turn + Math.PI, Math.PI * 2) - Math.PI;
      if (steering.current.active) steering.current.yaw += turn;
      motion.pitch = THREE.MathUtils.clamp(motion.pitch + dy * .003, -.95, .9);
      if (dx || dy) { manualLookUntil.current = performance.now() + 750; autoLook.current = false; }
      px = e.clientX; py = e.clientY;
    };
    const lock = () => { if (joined && matchMedia('(pointer:fine)').matches) void gl.domElement.requestPointerLock?.(); };
    const visibility = () => { if (document.hidden) clear(); };
    const releaseForUI = () => { if (document.pointerLockElement) document.exitPointerLock(); clear(); };
    document.addEventListener('keydown', keydown); document.addEventListener('keyup', keyup); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility);
    gl.domElement.addEventListener('pointerdown', down); gl.domElement.addEventListener('dblclick', lock); window.addEventListener('pointerup', up); window.addEventListener('pointermove', move);
    document.addEventListener('revern:ui', releaseForUI);
    return () => { document.removeEventListener('keydown', keydown); document.removeEventListener('keyup', keyup); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility); gl.domElement.removeEventListener('pointerdown', down); gl.domElement.removeEventListener('dblclick', lock); window.removeEventListener('pointerup', up); window.removeEventListener('pointermove', move); document.removeEventListener('revern:ui', releaseForUI); clear(); };
  }, [gl, joined]);
  useFrame((_, dt) => {
    const frameDt = dt;
    dt = Math.min(dt, .08);
    let resetCamera = firstPerson !== lastView.current;
    lastView.current = firstPerson;
    const state = network.getState(); const p = state.snapshot?.players.find(p => p.id === state.id);
    const hasInput = keys.current.size > 0 || Math.hypot(touchInput.x, touchInput.z) > .001;
    if (p && (lastId.current !== p.id || !motion.initialized)) { motion.position.set(p.x, groundHeightAt(p.x, p.z), p.z); motion.yaw = initialViewYaw(p); motion.facingYaw = p.yaw; motion.initialized = true; lastId.current = p.id; resetCamera = true; steering.current.active = autoLook.current = false; manualLookUntil.current = 0; }
    if (state.snapshot !== lastSnapshot.current && p) {
      const distance = Math.hypot(p.x - motion.position.x, p.z - motion.position.z);
      if (distance > 3 || p.slot || p.slot !== lastSlot.current || !hasInput && p.activity !== 'walking') {
        motion.position.set(p.x, groundHeightAt(p.x, p.z), p.z); correction.current.set(0, 0);
        if (distance > 3 || p.slot !== lastSlot.current) { motion.yaw = initialViewYaw(p); motion.facingYaw = p.yaw; resetCamera = true; steering.current.active = autoLook.current = false; manualLookUntil.current = 0; }
      } else correction.current.set((p.x - motion.position.x) * .25, (p.z - motion.position.z) * .25);
      lastSnapshot.current = state.snapshot; lastSlot.current = p.slot;
    }
    const uiOpen = !!document.querySelector('[role="dialog"]');
    let dx = 0, dz = 0;
    motion.walking = false;
    if (joined && p && !p.slot && !uiOpen && state.connection === 'connected' && !['drinking', 'pouring'].includes(p.activity)) {
      const forward = (keys.current.has('KeyW') || keys.current.has('ArrowUp') ? 1 : 0) - (keys.current.has('KeyS') || keys.current.has('ArrowDown') ? 1 : 0) - touchInput.z;
      const side = (keys.current.has('KeyD') || keys.current.has('ArrowRight') ? 1 : 0) - (keys.current.has('KeyA') || keys.current.has('ArrowLeft') ? 1 : 0) + touchInput.x;
      // Freeze the input basis for a held gesture: camera following must not
      // feed back into S/A/D and turn a straight walk into a circle.
      if (Math.hypot(forward, side) > .001) {
        if (!steering.current.active) { steering.current.active = true; steering.current.yaw = motion.yaw; }
        if (!looking.current && performance.now() >= manualLookUntil.current) autoLook.current = true;
      } else steering.current.active = false;
      dx = -Math.sin(steering.current.yaw) * forward + Math.cos(steering.current.yaw) * side; dz = -Math.cos(steering.current.yaw) * forward - Math.sin(steering.current.yaw) * side;
      const length = Math.max(1, Math.hypot(dx, dz)); dx /= length; dz /= length;
      const next = stepLocomotion(motion.position.x, motion.position.z, motion.facingYaw, dx, dz, dt);
      if (next.walking) {
        const distance = Math.hypot(next.x - motion.position.x, next.z - motion.position.z);
        const forwardX = (next.x - motion.position.x) / distance, forwardZ = (next.z - motion.position.z) / distance;
        const along = THREE.MathUtils.clamp(correction.current.x * forwardX + correction.current.y * forwardZ, -distance * .2, distance * .2);
        const [x, z] = slide(next.x, next.z, forwardX * along, forwardZ * along);
        correction.current.x -= x - next.x; correction.current.y -= z - next.z;
        next.x = x; next.z = z;
        next.yaw = movementYaw(x - motion.position.x, z - motion.position.z);
      }
      motion.position.set(next.x, groundHeightAt(next.x, next.z), next.z);
      motion.facingYaw = next.yaw; motion.walking = next.walking;
    } else { steering.current.active = autoLook.current = false; }
    if (autoLook.current && !looking.current && performance.now() >= manualLookUntil.current) {
      const turn = angleDelta(motion.yaw, motion.facingYaw);
      motion.yaw += turn * (reducedMotion ? 1 : 1 - Math.exp(-dt * 8));
      motion.yaw = THREE.MathUtils.euclideanModulo(motion.yaw + Math.PI, Math.PI * 2) - Math.PI;
      if (!steering.current.active && Math.abs(turn) < .001) autoLook.current = false;
    }
    const input = `${dx.toFixed(3)},${dz.toFixed(3)}`;
    if (joined && (performance.now() - lastSend.current > 50 || input !== lastInput.current)) { network.send({ type: 'move', dx, dz, yaw: motion.facingYaw }); lastSend.current = performance.now(); lastInput.current = input; }
    motion.firstPerson = firstPerson;
    const lying = p?.activity === 'lying'; const hammock = !!p?.slot?.startsWith('hammock'); const sitting = p?.slot?.startsWith('tea') || p?.slot?.startsWith('spa') || p?.slot?.startsWith('sauna') || p?.slot?.startsWith('camp'); const yoga = p?.activity === 'yoga', saunaRest = p?.activity === 'sauna', teaRest = p?.zone === 'tea' && (!!p.slot || p.activity === 'pouring' || p.activity === 'drinking'), campRest = p?.zone === 'campfire' && !!p.slot;
    const headY = groundHeightAt(motion.position.x, motion.position.z) + (hammock ? 1.12 : lying ? .98 : sitting ? 1.28 : yoga ? 1.4 : 1.63);
    target.current.set(motion.position.x, headY, motion.position.z + (hammock ? 0 : lying ? -.5 : 0));
    let distance = 5.2;
    if (firstPerson) {
      desired.current.copy(target.current);
      const approach = resetCamera || reducedMotion ? 1 : 1 - Math.exp(-dt * 14); camera.position.lerp(desired.current, approach);
      camera.lookAt(camera.position.x - Math.sin(motion.yaw) * Math.cos(motion.pitch), camera.position.y - Math.sin(motion.pitch) + (lying ? .7 : 0), camera.position.z - Math.cos(motion.yaw) * Math.cos(motion.pitch));
    } else {
      desired.current.set(Math.sin(motion.yaw) * (hammock ? 4.4 : campRest ? 3.6 : 5.2), (hammock ? 1.45 : campRest ? 1.55 : 1.9) + motion.pitch * 2.2, Math.cos(motion.yaw) * (hammock ? 4.4 : campRest ? 3.6 : 5.2)).add(target.current);
      if (yoga || saunaRest || teaRest || campRest) { const shoulder = teaRest ? -1.7 : campRest ? 0 : 1.7; desired.current.x += Math.cos(motion.yaw) * shoulder; desired.current.z -= Math.sin(motion.yaw) * shoulder; }
      ray.current.set(target.current, desired.current.clone().sub(target.current).normalize());
      const hit = new THREE.Vector3();
      boxes.current.forEach(box => { if (ray.current.intersectBox(box, hit)) { const len = hit.distanceTo(target.current) - .2; if (len > .05) distance = Math.min(distance, len); } });
      const offset = desired.current.clone().sub(target.current); if (offset.length() > distance) desired.current.copy(target.current).add(offset.setLength(Math.max(.35, distance)));
      // Keep the follow camera below the interior beams.
      desired.current.y = Math.min(p?.zone === 'sauna' ? 3.5 : 4.65, desired.current.y);
      camera.position.lerp(desired.current, resetCamera || reducedMotion ? 1 : 1 - Math.exp(-dt * 10));
      if (yoga || saunaRest || teaRest || campRest) { target.current.x -= Math.sin(motion.yaw) * (campRest ? 2.4 : 1.8); target.current.z -= Math.cos(motion.yaw) * (campRest ? 2.4 : 1.8); }
      if (teaRest) { target.current.x += Math.cos(motion.yaw) * 1.2; target.current.z -= Math.sin(motion.yaw) * 1.2; }
      if (campRest) target.current.y -= .35;
      camera.lookAt(target.current);
    }
    motion.cameraDistance = firstPerson ? 0 : camera.position.distanceTo(new THREE.Vector3(motion.position.x, headY, motion.position.z + (lying ? -.5 : 0)));
    {
      const floating = p?.zone === 'floating';
      const sky = floating ? '#0c161c' : day.background;
      const fogColor = floating ? '#162c27' : day.fog;
      if (scene.background instanceof THREE.Color) scene.background.lerp(new THREE.Color(sky), dt * 2);
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.lerp(new THREE.Color(fogColor), dt * 2);
        scene.fog.near = floating ? 25 : 55 + day.nightness * 25;
        scene.fog.far = floating ? 100 : 170 + day.nightness * 50;
      }
      gl.toneMappingExposure += ((floating ? .78 : day.exposure) - gl.toneMappingExposure) * Math.min(1, dt * 2);
    }
    if (!ready.current) { ready.current = true; onReady(); }
    frames.current++; elapsed.current += frameDt; if (elapsed.current > 2) { onStats(Math.round(frames.current / elapsed.current)); elapsed.current = 0; frames.current = 0; }
  }, -1);
  return null;
}
function useMemoRay() { return useRef(new THREE.Ray()); }
function Cast({ reducedMotion, hideNames }: { reducedMotion: boolean; hideNames: boolean }) {
  const { snapshot, id } = useSpace();
  return <><Avatar player={guide} guide reducedMotion={reducedMotion} hideNames={false} />{snapshot?.players.map(p => <Avatar key={p.id} player={p} self={p.id === id} reducedMotion={reducedMotion} hideNames={hideNames} />)}</>;
}
export function Scene({ firstPerson, reducedMotion, highQuality, joined, hideNames, day, onReady, onStats }: { firstPerson: boolean; reducedMotion: boolean; highQuality: boolean; joined: boolean; hideNames: boolean; day: DayCycle; onReady: () => void; onStats: (fps: number) => void }) {
  const [contextLost, setContextLost] = useState(false);
  return <SceneBoundary>{contextLost && <div className="webgl-error" role="alert"><h2>3D 화면 연결이 중단됐어요</h2><p>다른 3D 탭을 닫은 후 다시 열어 주세요.</p><button onClick={() => location.reload()}>다시 열기</button></div>}
    <Canvas shadows={highQuality} dpr={highQuality ? [1, 1.5] : [1, 1]} camera={{ position: [0, 3.7, 23], fov: 60, near: .08, far: 260 }} gl={{ antialias: highQuality, powerPreference: highQuality ? 'high-performance' : 'low-power', alpha: false }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = day.exposure; gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setContextLost(true); }); }} fallback={<div className="webgl-error">이 브라우저에서는 WebGL을 사용할 수 없어요. 최신 Chrome에서 열어 주세요.</div>}>
      <color attach="background" args={[day.background]} /><fog attach="fog" args={[day.fog, 55 + day.nightness * 25, 170 + day.nightness * 50]} />
      <Suspense fallback={null}><World reducedMotion={reducedMotion} highQuality={highQuality} day={day} /><Cast reducedMotion={reducedMotion} hideNames={hideNames} /></Suspense>
      <Controller firstPerson={firstPerson} reducedMotion={reducedMotion} joined={joined} day={day} onReady={onReady} onStats={onStats} />
    </Canvas>
  </SceneBoundary>;
}
