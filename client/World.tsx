import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { COLLIDERS, SLOTS, TEA_LIBRARY, TEAS, ZONES, nearbyMassage, nearbyYogaMat, type Slot, type ZoneId } from '../shared/world';
import { SPA_BATHS, SAUNA } from '../shared/spa';
import { ONSEN, ONSEN_HAMMOCKS, ONSEN_PATH, onBambooPath, onOnsenWalk, onsenPathLength, onsenPathYaw } from '../shared/onsen';
import { SHOP } from '../shared/shop';
import { motion } from './controls';
import { materials, labelTexture, foliageTexture, latticeTexture, hanjiDoorTexture, bambooCulmTexture, bambooLeafTexture } from './materials';
import { network } from './network';
import { audio } from './audio';
import type { DayCycle } from './dayCycle';

function Box({ at, size, material = materials.wood, color, shadow = true }: { at: [number, number, number]; size: [number, number, number]; material?: THREE.Material; color?: string; shadow?: boolean }) {
  return <mesh position={at} castShadow={shadow} receiveShadow material={color ? undefined : material}><boxGeometry args={size} />{color && <meshStandardMaterial color={color} roughness={.85} />}</mesh>;
}
function roofGeometry(w: number, d: number, lift = 0, opts?: {
  shallow?: boolean;
  /** No eave past this local-Z face (−1 = −Z / open north). */
  flushFace?: -1 | 1;
  /** Pull the open face roof back so descending giwa never hangs over the doorway. */
  openInset?: number;
}) {
  // Korean 팔작지붕. Open tea front is cut back — no descending tile curtain over the doors.
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = []; const nx = 36, nz = 36;
  const shallow = !!opts?.shallow;
  const flush = opts?.flushFace;
  const inset = Math.max(0, opts?.openInset ?? 0);
  const sidePad = shallow ? .15 : 5.1;
  const ew = w + sidePad, ed = d + sidePad;
  const hipDrop = shallow ? 1.15 : 4.05, cornerLift = shallow || flush != null ? 0 : 2.85;
  const ridge = 7.85 + lift;
  const openEdge = flush === -1 ? -d / 2 + inset : flush === 1 ? d / 2 - inset : null;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let x = (i / nx - .5) * ew, z = (j / nz - .5) * ed;
    if (flush === -1) z = Math.max(z, openEdge!);
    if (flush === 1) z = Math.min(z, openEdge!);
    const ax = Math.abs(x) / (ew / 2);
    // Drop tiles only toward the closed back / sides — keep the cut open edge nearly flat.
    let azHip = Math.abs(z) / Math.max(ed / 2, .001);
    if (flush === -1) azHip = Math.max(0, z - (openEdge ?? 0)) / Math.max(d - inset, .001);
    if (flush === 1) azHip = Math.max(0, (openEdge ?? 0) - z) / Math.max(d - inset, .001);
    let hip = Math.max(azHip * (shallow ? .55 : 1), Math.max(0, (ax - (shallow ? .55 : .4)) / (shallow ? .45 : .6)));
    if (flush != null && Math.abs(z - (openEdge ?? 0)) < .08) hip = Math.max(0, (ax - .7) / .3) * .25;
    const corner = flush != null ? 0 : Math.pow(Math.min(1, ax) * Math.min(1, azHip), 1.55);
    const sag = flush != null ? 0 : .18 * Math.sin(ax * Math.PI) * Math.sin(azHip * Math.PI);
    const y = ridge - hipDrop * hip + cornerLift * Math.pow(corner, 1.02) + .12 * Math.pow(hip, 5) - sag;
    vertices.push(x, y, z); uvs.push(i / nx * w / 3.2, j / nz * d / 4);
    if (i < nx && j < nz) { const a = j * (nx + 1) + i; indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
function Lattice({ wall, center }: { wall: typeof COLLIDERS[number]; center: [number, number] }) {
  const alongX = wall.w > wall.d, width = alongX ? wall.w : wall.d;
  const map = useMemo(() => latticeTexture(width / 2.8), [width]);
  useEffect(() => () => map.dispose(), [map]);
  const inward = alongX ? Math.sign(center[1] - wall.z) : Math.sign(center[0] - wall.x);
  return <mesh position={[wall.x + (alongX ? 0 : .24 * inward), 3.55, wall.z + (alongX ? .24 * inward : 0)]} rotation={[0, alongX ? (inward > 0 ? 0 : Math.PI) : (inward > 0 ? Math.PI / 2 : -Math.PI / 2), 0]}><planeGeometry args={[width - .7, 1.7]} /><meshStandardMaterial map={map} roughness={.92} /></mesh>;
}
function HanjiDoorPanel({ width, height }: { width: number; height: number }) {
  const map = useMemo(() => hanjiDoorTexture(), []);
  useEffect(() => () => map.dispose(), [map]);
  return <group>
    <mesh position={[0, 0, .01]}><planeGeometry args={[width - .1, height - .1]} /><meshStandardMaterial map={map} roughness={.88} side={THREE.DoubleSide} /></mesh>
    <Box at={[0, height / 2 - .04, 0]} size={[width, .08, .08]} material={materials.wood} />
    <Box at={[0, -height / 2 + .04, 0]} size={[width, .08, .08]} material={materials.wood} />
    <Box at={[-width / 2 + .04, 0, 0]} size={[.08, height, .08]} material={materials.wood} />
    <Box at={[width / 2 - .04, 0, 0]} size={[.08, height, .08]} material={materials.wood} />
    <Box at={[0, 0, 0]} size={[width - .12, .06, .06]} material={materials.wood} />
  </group>;
}
/** Pair of 분합문 that slide sideways when a visitor walks up. */
function SlidingHanjiPair({
  at, doorW, doorH, nearX = 5.5, nearZMin, nearZMax, track = true
}: {
  at: [number, number, number];
  doorW: number;
  doorH: number;
  nearX?: number;
  nearZMin: number;
  nearZMax: number;
  track?: boolean;
}) {
  const left = useRef<THREE.Group>(null!);
  const right = useRef<THREE.Group>(null!);
  const open = useRef(0);
  useFrame((_, dt) => {
    const s = network.getState();
    const self = s.snapshot?.players.find(p => p.id === s.id);
    const near = !!self && Math.abs(self.x - at[0]) < nearX && self.z > nearZMin && self.z < nearZMax;
    open.current = THREE.MathUtils.damp(open.current, near ? 1 : 0, near ? 7 : 4.5, dt);
    const slide = open.current * (doorW * .95);
    if (left.current) left.current.position.x = -doorW * .52 - slide;
    if (right.current) right.current.position.x = doorW * .52 + slide;
  });
  return <group position={at}>
    {track && <>
      <Box at={[0, doorH / 2 + .06, 0]} size={[doorW * 2.35, .1, .14]} material={materials.wood} />
      <Box at={[0, -doorH / 2 - .04, 0]} size={[doorW * 2.35, .08, .14]} material={materials.wood} />
    </>}
    <group ref={left}><HanjiDoorPanel width={doorW} height={doorH} /></group>
    <group ref={right}><HanjiDoorPanel width={doorW} height={doorH} /></group>
  </group>;
}
/** Tea entrance 분합문 — slides sideways when a visitor approaches. */
function TeaSlidingDoors({ x, z, w, d, lift = 0 }: { x: number; z: number; w: number; d: number; lift?: number }) {
  const doorW = Math.min(3.4, w * .22);
  const doorH = 3.7 + lift * .2;
  const frontZ = z - d / 2;
  return <SlidingHanjiPair
    at={[x, .9 + doorH / 2, frontZ + .06]}
    doorW={doorW}
    doorH={doorH}
    nearX={doorW * 1.7}
    nearZMin={frontZ - 5}
    nearZMax={frontZ + 4}
  />;
}
/** Tall 한지 분합문 panels on a pavilion wall. */
function HanjiWall({ wall, center, lift = 0 }: { wall: typeof COLLIDERS[number]; center: [number, number]; lift?: number }) {
  const alongX = wall.w > wall.d, span = alongX ? wall.w : wall.d;
  const inward = alongX ? Math.sign(center[1] - wall.z) : Math.sign(center[0] - wall.x);
  const count = Math.max(3, Math.round(span / 2.4));
  const panelW = (span - .8) / count;
  const doorH = 3.6 + lift * .35;
  const y = .85 + doorH / 2;
  return <group>
    {Array.from({ length: count }, (_, i) => {
      const t = (i + .5) / count - .5;
      const px = alongX ? wall.x + t * (span - .6) : wall.x + inward * (wall.w / 2 + .08);
      const pz = alongX ? wall.z + inward * (wall.d / 2 + .08) : wall.z + t * (span - .6);
      const yaw = alongX ? (inward > 0 ? 0 : Math.PI) : (inward > 0 ? Math.PI / 2 : -Math.PI / 2);
      return <group key={i} position={[px, y, pz]} rotation={[0, yaw, 0]}>
        <HanjiDoorPanel width={panelW - .06} height={doorH} />
      </group>;
    })}
  </group>;
}
function CornerRidges({ w, d, lift = 0, short = false }: { w: number; d: number; lift?: number; short?: boolean }) {
  const tip = short ? 1.05 : 2.15;
  const geometries = useMemo(() => [-1, 1].flatMap(sx => [-1, 1].map(sz => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(sx * w * .3, 7.72 + lift, 0), new THREE.Vector3(sx * (w * .42), 6.55 + lift, sz * d * .28), new THREE.Vector3(sx * (w / 2 + (short ? .55 : 1.55)), (short ? 6.35 : 5.7) + lift, sz * (d / 2 + (short ? .55 : 1.55))), new THREE.Vector3(sx * (w / 2 + tip), (short ? 6.45 : 6.15) + lift, sz * (d / 2 + tip))]), 22, short ? .12 : .17, 6, false))), [w, d, lift, tip, short]);
  useEffect(() => () => geometries.forEach(g => g.dispose()), [geometries]);
  return <>{geometries.map((geo, i) => <mesh key={i} geometry={geo} material={materials.roof} />)}</>;
}
/** Plane faces +Z at yaw 0 — point the readable front toward the viewer. */
function faceYaw(viewX: number, viewZ: number, signX: number, signZ: number) {
  return Math.atan2(viewX - signX, viewZ - signZ);
}
function Sign({ title, subtitle, at, yaw = 0, dark = false, near = 12, hideClose = 0 }: { title: string; subtitle?: string; at: [number, number, number]; yaw?: number; dark?: boolean; near?: number; /** Fade out when closer than this (path signs). */ hideClose?: number }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const world = useRef(new THREE.Vector3());
  const texture = useMemo(() => labelTexture(title, subtitle, dark), [title, subtitle, dark]);
  // Appear when near enough; optional hideClose fades the label out before it blocks the view.
  useFrame(({ camera }) => {
    if (!mesh.current) return;
    mesh.current.getWorldPosition(world.current);
    const d = camera.position.distanceTo(world.current);
    const fadeIn = THREE.MathUtils.clamp((near + 4 - d) / 4, 0, 1);
    const fadeOut = hideClose > 0 ? THREE.MathUtils.clamp((d - hideClose) / 3.5, 0, 1) : 1;
    const fade = fadeIn * fadeOut;
    mesh.current.visible = fade > .02;
    (mesh.current.material as THREE.MeshStandardMaterial).opacity = fade;
  });
  const wide = title.length > 10;
  return <mesh ref={mesh} position={at} rotation={[0, yaw, 0]} visible={false}><planeGeometry args={[wide ? 4.6 : 3.6, 1.2]} /><meshStandardMaterial map={texture} roughness={.8} side={THREE.FrontSide} transparent opacity={0} depthWrite={false} /></mesh>;
}
function Pavilion({ id, lit = 0, reducedMotion = false }: { id: Exclude<ZoneId, 'courtyard' | 'campfire' | 'onsen' | 'sauna'>; lit?: number; reducedMotion?: boolean }) {
  // Hanok pavilion: 황토 walls, pine posts, 청기와 roof, quiet 단청 under the eaves.
  const r = ZONES[id], [x, z] = r.center, [w, d] = r.size;
  // Yoga and tea need more vertical air for standing poses / quiet reading.
  const lift = id === 'yoga' || id === 'tea' ? 2.2 : 0;
  const shallowRoof = id === 'tea';
  // Tea: pull giwa well behind the open north so no tile face hangs over the doors.
  const teaInset = 5.8;
  const geo = useMemo(() => roofGeometry(w, d, lift, shallowRoof ? { shallow: true, flushFace: -1, openInset: teaInset } : undefined), [w, d, lift, shallowRoof, teaInset]);
  const walls = COLLIDERS.filter(c => c.height > 1 && Math.abs(c.x - x) <= w / 2 + .1 && Math.abs(c.z - z) <= d / 2 + .1 && (c.w > 1 || c.d > 1) && c.z !== 5);
  const alongX = id === 'floating' || id === 'tea'; const openSide = id === 'floating' ? 1 : id === 'tea' ? -1 : id === 'yoga' ? 1 : -1;
  const beam = 5.02 + lift;
  const postH = 4.7 + lift;
  const cozy = id === 'yoga' || id === 'tea' || id === 'spa' || id === 'floating';
  const bright = id === 'tea' || id === 'yoga' || id === 'floating';
  // Indoor wash follows the day cycle — soft daylight by day, lanterns after dusk.
  const softLit = cozy ? (bright ? .26 : .14) + lit * (bright ? .74 : .66) : 0;
  const signAt: [number, number, number] = [alongX ? x + (id === 'tea' ? -w / 4 : w / 4) : x + (w / 2 + .3) * openSide, 3.65, alongX ? z + (d / 2 + .3) * openSide : z - d / 4];
  // Readable from the open approach, not from inside (avoids mirrored nameplates).
  const approachX = alongX ? signAt[0] : x + openSide * (w / 2 + 4);
  const approachZ = alongX ? z + openSide * (d / 2 + 4) : signAt[2];
  const signYaw = faceYaw(approachX, approachZ, signAt[0], signAt[2]);
  const postTs = [-.5, -.25, .25, .5] as const;
  const wallWashes: { at: [number, number, number]; yaw: number; width: number; key: string }[] = [];
  if (cozy) {
    walls.forEach((c, wi) => {
      const alongWallX = c.w >= c.d;
      const inwardX = Math.sign(x - c.x) || (alongWallX ? 0 : 1);
      const inwardZ = Math.sign(z - c.z) || (alongWallX ? 1 : 0);
      const yaw = Math.atan2(inwardX, inwardZ);
      const span = alongWallX ? c.w : c.d;
      const count = Math.max(1, Math.min(2, Math.round(span / 9)));
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count - .5;
        const px = alongWallX ? c.x + t * c.w * .65 : c.x + inwardX * (c.w / 2 + .08);
        const pz = alongWallX ? c.z + inwardZ * (c.d / 2 + .08) : c.z + t * c.d * .65;
        wallWashes.push({ at: [px, 2.15, pz], yaw, width: Math.min(2.4, span / count * .8), key: `${wi}-${i}` });
      }
    });
  }
  return <group>
    {id !== 'spa' && id !== 'floating' && <>
      <Box at={[x, -.28, z]} size={[w + 2.6, .28, d + 2.6]} material={materials.stone} />
      <Box at={[x, -.16, z]} size={[w + 1.5, .22, d + 1.5]} material={materials.stone} />
    </>}
    {id === 'spa' ? <SpaFloor /> : <Box at={[x, -.12, z]} size={[w + .6, .32, d + .6]} material={id === 'yoga' || id === 'tea' ? materials.wood : materials.stone} />}
    {walls.map((c, i) => <group key={i}>
      <Box at={[c.x, 2.4 + lift / 2, c.z]} size={[c.w, 4.8 + lift, c.d]} material={materials.plaster} />
      <Box at={[c.x, .48, c.z]} size={[c.w + .1, .82, c.d + .1]} material={materials.wood} />
      <Box at={[c.x, 2.5 + lift / 2, c.z]} size={[c.w + .12, .12, c.d + .12]} material={materials.wood} />
      {id === 'tea' || id === 'yoga' ? <HanjiWall wall={c} center={r.center} lift={lift} /> : <Lattice wall={c} center={r.center} />}
    </group>)}
    {id !== 'tea' && postTs.map(t => <group key={t} position={[alongX ? x + w * t : x + w / 2 * openSide, 0, alongX ? z + d / 2 * openSide : z + d * t]}>
      <Box at={[0, .22, 0]} size={[.9, .44, .9]} material={materials.stone} />
      <Box at={[0, postH / 2 + .2, 0]} size={[.4, postH, .4]} material={materials.wood} />
      <Box at={[0, beam - .17, 0]} size={alongX ? [1.55, .24, .72] : [.72, .24, 1.55]} material={materials.wood} />
    </group>)}
    {id === 'tea' && <TeaSlidingDoors x={x} z={z} w={w} d={d} lift={lift} />}
    <Box at={[x, beam, z - d / 2]} size={[w + .9, .32, .34]} material={materials.wood} />
    <Box at={[x, beam, z + d / 2]} size={[w + .9, .32, .34]} material={materials.wood} />
    <Box at={[x - w / 2, beam, z]} size={[.34, .32, d + .9]} material={materials.wood} />
    <Box at={[x + w / 2, beam, z]} size={[.34, .32, d + .9]} material={materials.wood} />
    {/* Quiet 단청 under eaves — skip tea entirely (no blue/green bands at the entrance). */}
    {id !== 'tea' && <>
      <Box at={[x, beam - .2, z - d / 2 + .02]} size={[w + .7, .08, .1]} material={materials.dancheongBlue} shadow={false} />
      <Box at={[x, beam - .28, z - d / 2 + .02]} size={[w + .7, .05, .08]} material={materials.dancheongGreen} shadow={false} />
      <Box at={[x, beam - .2, z + d / 2 - .02]} size={[w + .7, .08, .1]} material={materials.dancheongBlue} shadow={false} />
      <Box at={[x, beam - .28, z + d / 2 - .02]} size={[w + .7, .05, .08]} material={materials.dancheongGreen} shadow={false} />
    </>}
    {Array.from({ length: Math.ceil(w / 1.15) }, (_, i) => {
      // Tea: keep rafters behind the open doorway — matches the inset giwa cut.
      const rafterD = shallowRoof ? Math.max(4, d - teaInset) : d + 3.2;
      const rafterZ = shallowRoof ? z + teaInset / 2 : z;
      return <Box key={`rafter-${i}`} at={[x - w / 2 + i * 1.15, beam + .3, rafterZ]} size={[.09, .12, rafterD]} material={materials.wood} />;
    })}
    <mesh position={[x, 0, z]} geometry={geo} material={materials.roof} castShadow receiveShadow />
    {/* Stacked 용마루 — tea ridge sits over the inset roof, not the open door. */}
    <Box at={[x, 7.62 + lift, shallowRoof ? z + teaInset * .5 : z]} size={[w * (shallowRoof ? .78 : .92), .28, .42]} material={materials.roof} />
    <Box at={[x, 7.78 + lift, shallowRoof ? z + teaInset * .5 : z]} size={[w * (shallowRoof ? .74 : .88), .2, .5]} material={materials.roof} />
    <Box at={[x, 7.92 + lift, shallowRoof ? z + teaInset * .5 : z]} size={[w * (shallowRoof ? .7 : .84), .12, .58]} material={materials.roof} />
    {id !== 'tea' && [-1, 1].map(side => <group key={side} position={[x + side * w * .45, 7.98 + lift, z]}>
      <Box at={[0, 0, 0]} size={[.42, .48, .68]} material={materials.roof} />
      <Box at={[side * .16, .26, 0]} size={[.16, .2, .45]} material={materials.roof} />
      <Box at={[side * .05, .42, 0]} size={[.1, .14, .22]} material={materials.dancheongRed} shadow={false} />
    </group>)}
    {!shallowRoof && <group position={[x, 0, z]}><CornerRidges w={w} d={d} lift={lift} /></group>}
    <Sign title={r.name} subtitle={r.english} at={signAt} yaw={signYaw} />
    {cozy && wallWashes.map(s => <WallWash key={`wash-${s.key}`} at={s.at} yaw={s.yaw} width={s.width} lit={softLit} />)}
    {cozy && softLit > .05 && <>
      <CoveStrip at={[x, beam - .22, z - d / 2 + .2]} size={[w * .88, .04, .12]} lit={softLit} />
      <CoveStrip at={[x, beam - .22, z + d / 2 - .2]} size={[w * .88, .04, .12]} lit={softLit} />
      <CoveStrip at={[x - w / 2 + .2, beam - .22, z]} size={[.12, .04, d * .88]} lit={softLit} />
      <CoveStrip at={[x + w / 2 - .2, beam - .22, z]} size={[.12, .04, d * .88]} lit={softLit} />
      <pointLight position={[x, beam - 1.2, z]} color={bright ? '#fff4dc' : '#f0e2c8'} intensity={(bright ? 16 : 9) * softLit} distance={Math.max(w, d) * (bright ? 1.05 : .85)} decay={bright ? 1.35 : 1.5} />
      <pointLight position={[x, 2.2, z]} color={bright ? '#ffe9c4' : '#ead9bc'} intensity={(bright ? 9 : 4.5) * softLit} distance={Math.max(w, d) * (bright ? .75 : .55)} decay={1.5} />
      {bright && <>
        <pointLight position={[alongX ? x - 5 : x, 2.6, alongX ? z : z - 4]} color="#fff0d8" intensity={7 * softLit} distance={11} decay={1.45} />
        {id !== 'tea' && postTs.slice(0, 2).map(t => {
          const px = alongX ? x + w * t : x + w / 2 * openSide;
          const pz = alongX ? z + d / 2 * openSide : z + d * t;
          const insetX = alongX ? 0 : -openSide * .5;
          const insetZ = alongX ? -openSide * .5 : 0;
          return <group key={`bright-bulb-${t}`} position={[px + insetX, beam - .95, pz + insetZ]}>
            <mesh position={[0, .28, 0]}><cylinderGeometry args={[.01, .01, .4, 6]} /><meshStandardMaterial color="#5c5040" roughness={.85} /></mesh>
            <mesh><sphereGeometry args={[.1, 12, 10]} /><meshStandardMaterial color="#fff6e0" emissive="#ffe0a0" emissiveIntensity={1.6 + softLit} roughness={.3} toneMapped={false} /></mesh>
            <pointLight position={[0, -.05, 0]} color="#fff2d0" intensity={6.5 * softLit} distance={8} decay={1.45} />
          </group>;
        })}
      </>}
    </>}
  </group>;
}
function CourtyardBridge({ lanternLit = 0, reducedMotion = false, highQuality = false }: { lanternLit?: number; reducedMotion?: boolean; highQuality?: boolean }) {
  // Soft arch over the central basin — timber deck, stone abutments, quiet railings.
  const rails = useMemo(() => [-1, 1].map(side => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([-3.7, -2.2, 0, 2.2, 3.7].map(z => {
    const t = (z + 3.9) / 7.8;
    return new THREE.Vector3(side * 1.28, .88 + Math.sin(t * Math.PI) * .16, z);
  })), 24, .035, 6, false)), []);
  useEffect(() => () => rails.forEach(g => g.dispose()), [rails]);
  return <group position={[0, 0, -6]}>
    {[-1, 1].map(side => <group key={side}>
      <Box at={[0, -.02, side * 4.55]} size={[4.2, .28, 1.1]} material={materials.stone} />
      <Box at={[0, .12, side * 4.35]} size={[3.6, .18, .7]} material={materials.stone} />
      <Box at={[side * 1.55, .42, side * 4.15]} size={[.35, .55, .35]} material={materials.stone} />
    </group>)}
    {Array.from({ length: 15 }, (_, i) => {
      const t = i / 14, z = -3.9 + t * 7.8;
      const arch = Math.sin(t * Math.PI) * .16;
      return <Box key={i} at={[0, .08 + arch, z]} size={[2.55, .11, .52]} material={materials.wood} />;
    })}
    <Box at={[0, .14, 0]} size={[2.35, .04, 7.6]} color="#b89a78" shadow={false} />
    {[-1, 1].map((side, si) => <group key={side}>
      <Box at={[side * 1.28, .22, 0]} size={[.1, .12, 7.9]} material={materials.wood} />
      {Array.from({ length: 9 }, (_, i) => {
        const z = -3.6 + i * .9;
        const arch = Math.sin(((z + 3.9) / 7.8) * Math.PI) * .16;
        return <group key={i}>
          <Box at={[side * 1.28, .55 + arch, z]} size={[.07, .55, .07]} material={materials.wood} />
          <Box at={[side * 1.28, .85 + arch, z]} size={[.12, .08, .12]} material={materials.wood} />
        </group>;
      })}
      <mesh geometry={rails[si]} material={materials.wood} />
    </group>)}
    {/* Corner + mid-span 호롱 — street lights so the crossing stays readable after dusk. */}
    {[-1, 1].flatMap(side => [-3.35, 0, 3.35].map((z, i) =>
      <HorongPole key={`${side}-${z}`} at={[side * 2.05, 0, z]} lit={lanternLit} phase={side + i * 1.1} reducedMotion={reducedMotion} highQuality={highQuality} street />
    ))}
    <pointLight position={[0, 3.1, 0]} color="#ffd6a0" intensity={9 * lanternLit} distance={14} decay={1.5} />
    <pointLight position={[0, 2.6, -3.2]} color="#f8c284" intensity={5.5 * lanternLit} distance={10} decay={1.5} />
    <pointLight position={[0, 2.6, 3.2]} color="#f8c284" intensity={5.5 * lanternLit} distance={10} decay={1.5} />
  </group>;
}
/** 한옥 대문 — sits in the courtyard approach; roof stays short so it never hangs over the tea doors. */
function EntranceGate() {
  // Shallow, short roof — no long descending giwa curtain over the doorway.
  const geometry = useMemo(() => roofGeometry(9.2, 2.2, 0, { shallow: true }), []);
  const gateZ = 17;
  return <group position={[0, 0, gateZ]}>
    {[-1, 1].map(side => <group key={side}>
      <Box at={[side * 4.6, .28, 0]} size={[1.25, .56, 1.25]} material={materials.stone} />
      <Box at={[side * 4.6, 2.2, 0]} size={[.44, 3.8, .44]} material={materials.wood} />
      <Box at={[side * 4.6, 4.05, 0]} size={[1.1, .22, .7]} material={materials.wood} />
      {/* Side 담 with plaster and 기와 coping */}
      <Box at={[side * 9.6, .75, 0]} size={[7.6, 1.5, .58]} material={materials.plaster} />
      <Box at={[side * 9.6, 1.55, 0]} size={[7.85, .14, .72]} material={materials.roof} />
      <Box at={[side * 6.15, 1.05, 0]} size={[.3, 2.1, .3]} material={materials.wood} />
      <Box at={[side * 7.9, 1.05, 0]} size={[.3, 2.1, .3]} material={materials.wood} />
    </group>)}
    {/* Single 인방 under the roof — not double shrine lintels */}
    <Box at={[0, 3.95, 0]} size={[9.9, .3, .42]} material={materials.wood} />
    {/* 문지방 + 창호 판문 — slides open; tea 분합문 sits clear behind at the pavilion face. */}
    <Box at={[0, .14, 0]} size={[8.9, .22, .6]} material={materials.stone} />
    <SlidingHanjiPair
      at={[0, 1.95, .04]}
      doorW={5.8}
      doorH={3.55}
      nearX={6.5}
      nearZMin={gateZ - 5}
      nearZMax={gateZ + 5}
      track={false}
    />
    <mesh position={[0, -1.05, 0]} geometry={geometry} material={materials.roof} castShadow />
    <Box at={[0, 5.35, 0]} size={[7.2, .22, .36]} material={materials.roof} />
    <Sign title="REVERN" subtitle="나에게 돌아오는 문" at={[0, 5.55, .45]} />
  </group>;
}
function FloatingReflection({ reducedMotion }: { reducedMotion: boolean }) {
  const reflector = useMemo(() => {
    const shader = {
      uniforms: { color: { value: new THREE.Color('#153d38') }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, time: { value: 0 } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; void main(){vUv=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float time; varying vec4 vUv;
      void main(){vec2 p=vUv.xy/vUv.w;vec2 ripple=vec2(sin(p.y*190.+time*.45),cos(p.x*170.-time*.35))*.002;vec3 reflected=texture2D(tDiffuse,p+ripple).rgb;gl_FragColor=vec4(mix(vec3(.015,.06,.065),reflected*vec3(.65,.86,.82),.55),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
    };
    const surface = new Reflector(new THREE.PlaneGeometry(27, 23), { textureWidth: 512, textureHeight: 512, clipBias: .003, multisample: 0, shader });
    surface.position.set(0, .095, -41); surface.rotation.x = -Math.PI / 2;
    // Slow water needs a fresh reflection at 12.5Hz; walking and the main view remain independent.
    const renderReflection = surface.onBeforeRender.bind(surface); let last = 0;
    surface.onBeforeRender = (...args) => { const now = performance.now(); if (now - last < 80) return; last = now; renderReflection(...args); };
    return surface;
  }, []);
  useEffect(() => () => { reflector.geometry.dispose(); reflector.dispose(); }, [reflector]);
  useFrame(({ clock, camera }) => { reflector.visible = Math.abs(camera.position.z + 41) < 26 && Math.abs(camera.position.x) < 25; (reflector.material as THREE.ShaderMaterial).uniforms.time.value = reducedMotion ? 0 : clock.elapsedTime; });
  return <primitive object={reflector} />;
}
function Water({ x, z, w, d, dark = false, reducedMotion, basin = false, cool = false }: { x: number; z: number; w: number; d: number; dark?: boolean; reducedMotion: boolean; basin?: boolean; cool?: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null!);
  const uniforms = useMemo(() => ({ time: { value: 0 }, dark: { value: dark ? 1 : 0 }, cool: { value: cool ? 1 : 0 }, opacity: { value: basin ? .86 : 1 } }), [dark, cool, basin]);
  useFrame(({ clock }) => { if (mat.current) mat.current.uniforms.time.value = reducedMotion ? 0 : clock.elapsedTime; });
  return <group>
    <Box at={[x, basin ? -1.02 : -.32, z]} size={[w + .5, basin ? .3 : .5, d + .5]} material={materials.stone} />
    <mesh position={[x, .08, z]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[w, d]} /><shaderMaterial ref={mat} uniforms={uniforms} transparent={basin} depthWrite={!basin} vertexShader={'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'} fragmentShader={`varying vec2 vUv; uniform float time; uniform float dark; uniform float cool; uniform float opacity;
      void main(){vec2 p=vUv;float wave=sin(p.x*75.+sin(p.y*43.+time*.35))*sin(p.y*89.-time*.5);float soft=sin(p.x*19.+p.y*27.+time*.25)*.5+.5;vec3 base=mix(mix(vec3(.29,.44,.38),vec3(.18,.39,.48),cool),vec3(.025,.095,.105),dark);vec3 col=base+wave*.014+soft*.04;float light=0.;for(int i=0;i<6;i++){float ix=float(i)/5.;float streak=exp(-pow((p.x-ix)*38.+sin(p.y*67.+time*.6)*.7,2.));light+=streak*(.5+.5*sin(p.y*170.-time*.7))*pow(1.-p.y,2.);}col+=mix(vec3(.24,.28,.18),vec3(.72,.37,.11),dark)*light*.48;gl_FragColor=vec4(col,opacity);}`} /></mesh>
  </group>;
}
/** Soft cove strip under a beam — emissive only (no point light). */
function CoveStrip({ at, size, lit = .6 }: { at: [number, number, number]; size: [number, number, number]; lit?: number }) {
  if (lit < .05) return null;
  return <mesh position={at}><boxGeometry args={size} /><meshStandardMaterial color="#e8d4b0" emissive="#ffd9a0" emissiveIntensity={.4 + lit * .7} roughness={.9} toneMapped={false} /></mesh>;
}
/** Wall shelf with soft emissive edge — looks like hidden wash, no GPU point lights. */
function WallWash({ at, yaw = 0, width = 1.4, lit = .6 }: { at: [number, number, number]; yaw?: number; width?: number; lit?: number }) {
  if (lit < .05) return null;
  return <group position={at} rotation={[0, yaw, 0]}>
    <mesh position={[0, 0, .06]}><boxGeometry args={[width, .06, .14]} /><meshStandardMaterial color="#5a4a38" roughness={.85} /></mesh>
    <mesh position={[0, .04, .04]}><boxGeometry args={[width * .92, .02, .05]} /><meshStandardMaterial color="#f0e0c4" emissive="#ffd8a8" emissiveIntensity={.55 + lit * .65} roughness={1} toneMapped={false} /></mesh>
  </group>;
}
function Lantern({ at, dark = false, lit = 0, phase = 0, reducedMotion = false, highQuality = false }: { at: [number, number, number]; dark?: boolean; lit?: number; phase?: number; reducedMotion?: boolean; highQuality?: boolean }) {
  const glow = useRef<THREE.Mesh>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const useLight = highQuality && (dark || lit > .05);
  useFrame(({ clock }) => {
    const amount = dark ? 1 : lit;
    if (amount < .02 && !dark) return;
    const pulse = reducedMotion || amount < .02 ? 1 : 1 + Math.sin(clock.elapsedTime * 2 + phase) * .06 * amount;
    glow.current.scale.y = (dark ? 1.6 : 1) * pulse;
    if (mat.current) mat.current.emissiveIntensity = dark ? 2.4 : .2 + lit * 1.5;
    if (light.current) light.current.intensity = (dark ? 14 : 8 * lit) * (reducedMotion ? 1 : .92 + Math.sin(clock.elapsedTime * 1.7 + phase) * .08 * Math.min(1, amount || 1));
  });
  return <group position={at}>
    <Box at={[0, .65, 0]} size={[.14, 1.3, .14]} material={materials.darkWood} />
    <Box at={[0, 1.35, 0]} size={[.5, .12, .5]} material={materials.brass} />
    <mesh ref={glow} position={[0, 1.66, 0]} scale={dark ? [.7, 1.6, .7] : [1, 1, 1]}><sphereGeometry args={[.19, 12, 10]} /><meshStandardMaterial ref={mat} color="#f7d897" emissive="#ffb953" emissiveIntensity={dark ? 2.4 : .28} /></mesh>
    {useLight && <pointLight ref={light} position={[0, 1.8, 0]} color="#ffc17b" intensity={dark ? 14 : 8 * lit} distance={11} decay={1.35} />}
  </group>;
}
/** Small paper 호롱 hung in the bamboo — soft glow for the clearing when lit. */
function BambooHorong({ at, lit = 0, phase = 0, reducedMotion = false }: { at: [number, number, number]; lit?: number; phase?: number; reducedMotion?: boolean }) {
  const shade = useRef<THREE.MeshStandardMaterial>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const amount = Math.max(0, lit) * .62;
  useFrame(({ clock }) => {
    if (amount < .02) {
      if (shade.current) shade.current.emissiveIntensity = .06;
      if (light.current) light.current.intensity = 0;
      return;
    }
    const flicker = reducedMotion ? 1 : .94 + Math.sin(clock.elapsedTime * 1.9 + phase) * .04;
    if (shade.current) shade.current.emissiveIntensity = (.55 + amount * .85) * flicker;
    if (light.current) light.current.intensity = 5.2 * amount * flicker;
  });
  return <group position={at}>
    <mesh position={[0, .55, 0]}><cylinderGeometry args={[.008, .008, 1.1, 5]} /><meshStandardMaterial color="#3a342c" roughness={.9} /></mesh>
    <mesh position={[0, .05, 0]}><cylinderGeometry args={[.16, .18, .38, 12]} /><meshStandardMaterial ref={shade} color="#f3e2c0" emissive="#ffc878" emissiveIntensity={.06 + amount * 1.1} roughness={.85} toneMapped={false} /></mesh>
    <mesh position={[0, .26, 0]}><cylinderGeometry args={[.17, .17, .04, 12]} /><meshStandardMaterial color="#6a5640" roughness={.7} /></mesh>
    <mesh position={[0, -.16, 0]}><cylinderGeometry args={[.17, .17, .04, 12]} /><meshStandardMaterial color="#6a5640" roughness={.7} /></mesh>
    {amount > .05 && <pointLight ref={light} position={[0, .05, 0]} color="#ffd6a0" intensity={5.2 * amount} distance={11} decay={1.55} />}
  </group>;
}
/** Courtyard 호롱 — tall timber pole with a warm paper lantern. */
function HorongPole({ at, lit = 0, phase = 0, reducedMotion = false, highQuality = false, street = false }: { at: [number, number, number]; lit?: number; phase?: number; reducedMotion?: boolean; highQuality?: boolean; /** Always cast light when lit — for dim paths like the spa approach. */ street?: boolean }) {
  const shade = useRef<THREE.MeshStandardMaterial>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const amount = Math.max(0, lit);
  const cast = street || highQuality;
  const strength = street ? 11 : 7.5;
  const reach = street ? 16 : 12;
  useFrame(({ clock }) => {
    if (amount < .02) {
      if (shade.current) shade.current.emissiveIntensity = .05;
      if (light.current) light.current.intensity = 0;
      return;
    }
    const flicker = reducedMotion || !cast ? 1 : .94 + Math.sin(clock.elapsedTime * 1.8 + phase) * .04;
    if (shade.current) shade.current.emissiveIntensity = (.7 + amount * .9) * flicker;
    if (light.current) light.current.intensity = strength * amount * flicker;
  });
  return <group position={at}>
    <Box at={[0, 1.55, 0]} size={[.16, 3.1, .16]} material={materials.darkWood} />
    <Box at={[0, .08, 0]} size={[.42, .16, .42]} material={materials.stone} />
    <Box at={[.35, 2.95, 0]} size={[.7, .08, .1]} material={materials.darkWood} />
    <mesh position={[.55, 2.55, 0]}><cylinderGeometry args={[.012, .012, .7, 6]} /><meshStandardMaterial color="#4a4034" roughness={.9} /></mesh>
    <mesh position={[.55, 2.15, 0]}><cylinderGeometry args={[.18, .2, .42, 14]} /><meshStandardMaterial ref={shade} color="#f3e2c0" emissive="#ffc878" emissiveIntensity={.05 + amount * 1.55} roughness={.85} toneMapped={false} /></mesh>
    <mesh position={[.55, 2.38, 0]}><cylinderGeometry args={[.2, .2, .04, 14]} /><meshStandardMaterial color="#6a5640" roughness={.7} /></mesh>
    <mesh position={[.55, 1.93, 0]}><cylinderGeometry args={[.2, .2, .04, 14]} /><meshStandardMaterial color="#6a5640" roughness={.7} /></mesh>
    {cast && amount > .05 && <pointLight ref={light} position={[.55, 2.15, 0]} color="#ffd6a0" intensity={strength * amount} distance={reach} decay={1.45} />}
  </group>;
}
function Steam({ x, z, reducedMotion }: { x: number; z: number; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null!);
  const tick = useRef(0);
  useFrame(({ clock }) => {
    if (reducedMotion || (++tick.current % 2) !== 0) return;
    ref.current.children.forEach((child, i) => {
      child.position.y = .5 + (clock.elapsedTime * .12 + i * .4) % 1.8;
      child.position.x = Math.sin(i * 7 + clock.elapsedTime * .2) * .35;
      (child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = .045 * (1 - child.position.y / 2.4);
    });
  });
  return <group ref={ref} position={[x, 0, z]}>{[0, 1, 2].map(i => <mesh key={i} scale={[.22, .4, .22]}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#f8f1d8" transparent opacity={.05} depthWrite={false} /></mesh>)}</group>;
}
function Terrain() {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(); shape.moveTo(-250, -250); shape.lineTo(250, -250); shape.lineTo(250, 250); shape.lineTo(-250, 250); shape.closePath();
    for (const b of [...SPA_BATHS, ONSEN]) {
      const path = new THREE.Path();
      path.moveTo(b.x - b.w / 2, -b.z - b.d / 2); path.lineTo(b.x - b.w / 2, -b.z + b.d / 2); path.lineTo(b.x + b.w / 2, -b.z + b.d / 2); path.lineTo(b.x + b.w / 2, -b.z - b.d / 2); path.closePath();
      shape.holes.push(path);
    }
    return new THREE.ShapeGeometry(shape);
  }, []);
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -.3, 0]} receiveShadow><meshStandardMaterial color="#7d8d64" roughness={1} /></mesh>;
}
function SpaFloor() {
  return <group>
    {([{ x: 32, z: -11, w: 28.6, d: 2 }, { x: 32, z: 6, w: 28.6, d: 12.6 }, { x: 20.5, z: -5, w: 5, d: 10 }, { x: 33.5, z: -5, w: 3, d: 10 }, { x: 44.5, z: -5, w: 3, d: 10 }]).map((part, i) => <Box key={i} at={[part.x, -.12, part.z]} size={[part.w, .32, part.d]} material={materials.stone} />)}
  </group>;
}
function BathRails({ x }: { x: number }) {
  const rails = useMemo(() => [-1, 1].map(side => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x + side * 1.05, .13, 1.6), new THREE.Vector3(x + side * 1.05, .9, .9), new THREE.Vector3(x + side * 1.05, .85, -1), new THREE.Vector3(x + side * 1.05, -.45, -2.1)]), 20, .04, 8, false)), [x]);
  return <>{rails.map((geo, i) => <mesh key={i} geometry={geo} material={materials.brass} />)}</>;
}
function SpaBaths({ reducedMotion }: { reducedMotion: boolean }) {
  return <>{SPA_BATHS.map(bath => <group key={bath.id}>
    <Water x={bath.x} z={bath.z} w={bath.w} d={bath.d} basin cool={bath.id === 'cold'} reducedMotion={reducedMotion} />
    {[-1, 1].map(side => <Box key={side} at={[bath.x + side * bath.w / 2, -.3, -5]} size={[.3, 1, 10.3]} material={materials.stone} />)}
    <Box at={[bath.x, -.3, -10]} size={[bath.w, 1, .3]} material={materials.stone} />
    {[-1, 1].map(side => <Box key={side} at={[bath.x + side * (1.3 + (bath.w - 2.6) / 4), -.3, 0]} size={[(bath.w - 2.6) / 2, 1, .3]} material={materials.stone} />)}
    {[0, 1, 2, 3].map(i => <Box key={i} at={[bath.x, -.15 - i * .2, -.225 - i * .45]} size={[2.05, .2, .45]} material={materials.stone} />)}
    <BathRails x={bath.x} />
    <Sign title={bath.name} subtitle={bath.english} at={[bath.x, 2.4, -11.72]} />
    {bath.id === 'warm' && [-2, 0, 2].map(dx => <Steam key={dx} x={bath.x + dx} z={-5} reducedMotion={reducedMotion} />)}
  </group>)}</>;
}
function SaunaSteam({ reducedMotion }: { reducedMotion: boolean }) {
  const particles = useRef<THREE.Group>(null!);
  useFrame(() => {
    const s = network.getState(); const started = s.snapshot?.saunaSteamStartedAt ?? 0; const age = Date.now() + s.clockOffset - started;
    const active = !!started && age >= 0 && age < SAUNA.steamDuration;
    particles.current.visible = active;
    if (!active) return;
    particles.current.children.forEach((child, i) => { const t = age / 1000; child.position.set(Math.sin(i * 2.1 + t * .5) * (.2 + t * .1), 1.2 + (reducedMotion ? i * .15 : (t * .32 + i * .24) % 2.3), Math.cos(i * 1.8 + t * .4) * .35); child.scale.setScalar(.2 + Math.min(t, 4) * .14); (child as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material.opacity = Math.max(0, .13 * (1 - age / SAUNA.steamDuration)); });
  });
  return <group ref={particles} visible={false} position={[SAUNA.heater[0], 0, SAUNA.heater[1]]}>{Array.from({ length: 12 }, (_, i) => <mesh key={i}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial transparent opacity={0} color="#f3ead7" depthWrite={false} /></mesh>)}</group>;
}
/** Wall torch for the sauna doorway — warm flame, not a long cove bar. */
function WallTorch({ at, phase = 0, reducedMotion = false }: { at: [number, number, number]; phase?: number; reducedMotion?: boolean }) {
  const flame = useRef<THREE.MeshStandardMaterial>(null!);
  const light = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }) => {
    const flicker = reducedMotion ? 1 : .88 + Math.sin(clock.elapsedTime * 7.2 + phase) * .08 + Math.sin(clock.elapsedTime * 11.5 + phase * 1.7) * .05;
    if (flame.current) flame.current.emissiveIntensity = 1.8 * flicker;
    if (light.current) light.current.intensity = 5.2 * flicker;
  });
  return <group position={at}>
    <Box at={[0, .55, 0]} size={[.08, 1.1, .08]} material={materials.darkWood} />
    <Box at={[.18, 1.05, 0]} size={[.36, .08, .1]} material={materials.darkWood} />
    <mesh position={[.32, 1.15, 0]} rotation={[0, 0, .15]}><cylinderGeometry args={[.05, .07, .22, 8]} /><meshStandardMaterial color="#3a2a1c" roughness={.95} /></mesh>
    <mesh position={[.34, 1.42, 0]} scale={[.22, .42, .18]}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial ref={flame} color="#ff9a3a" emissive="#ff6a18" emissiveIntensity={1.8} roughness={.55} toneMapped={false} />
    </mesh>
    <mesh position={[.34, 1.62, 0]} scale={[.12, .28, .1]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial color="#ffd080" emissive="#ffb040" emissiveIntensity={2.2} roughness={.4} toneMapped={false} transparent opacity={.85} />
    </mesh>
    <pointLight ref={light} position={[.4, 1.5, 0]} color="#ff9a4a" intensity={5.2} distance={7} decay={1.65} />
  </group>;
}
function SaunaCabin({ reducedMotion }: { reducedMotion: boolean }) {
  return <group>
    <Box at={[55, -.12, 0]} size={[18, .32, 24]} material={materials.wood} />
    <Box at={[64, 2.1, 0]} size={[.35, 4.2, 24]} material={materials.darkWood} />
    <Box at={[55, 2.1, 12]} size={[18, 4.2, .35]} material={materials.darkWood} />
    <Box at={[55, .6, -12]} size={[18, 1.2, .35]} material={materials.darkWood} />
    <Box at={[55, 3.95, -12]} size={[18, .5, .35]} material={materials.darkWood} />
    {[-1, 1].map(side => <Box key={side} at={[55 + side * 7, 2.4, -12]} size={[4, 2.4, .35]} material={materials.darkWood} />)}
    <mesh position={[55, 2.4, -12]}><planeGeometry args={[10, 2.4]} /><meshPhysicalMaterial color="#d9e1cb" roughness={.15} transparent opacity={.2} side={THREE.DoubleSide} /></mesh>
    <Box at={[55, 4.3, 0]} size={[18.5, .35, 24.5]} material={materials.darkWood} />
    <Box at={[55, 4.55, 0]} size={[19, .12, 25]} material={materials.roof} />
    {Array.from({ length: 32 }, (_, i) => <group key={i}><Box at={[63.77, 2.1, -11.6 + i * .75]} size={[.08, 4.1, .045]} color="#b78b5d" shadow={false} />{i < 24 && <Box at={[46.3 + i * .75, 2.1, 11.77]} size={[.045, 4.1, .08]} color="#b78b5d" shadow={false} />}</group>)}
    <Box at={[61, .25, 0]} size={[2.8, .5, 20]} material={materials.wood} />
    <Box at={[62.4, .86, 0]} size={[2, .45, 20]} material={materials.wood} />
    <Box at={[58.9, .08, 0]} size={[1.2, .16, 20]} material={materials.wood} />
    {Array.from({ length: 27 }, (_, i) => <group key={i}><Box at={[61, .52, -9.7 + i * .74]} size={[2.7, .055, .5]} material={materials.wood} /><Box at={[62.4, 1.11, -9.7 + i * .74]} size={[1.9, .055, .5]} material={materials.wood} /></group>)}
    <Box at={[59.55, .2, 0]} size={[.04, .04, 19.5]} color="#e5bb79" shadow={false} />
    <pointLight position={[58.8, 1, -5]} intensity={20} distance={15} decay={1.5} color="#ffc37e" />
    <pointLight position={[58.8, 1, 6]} intensity={20} distance={15} decay={1.5} color="#ffc37e" />
    <group position={[SAUNA.heater[0], 0, SAUNA.heater[1]]}>
      <mesh position={[0, .6, 0]} castShadow><cylinderGeometry args={[.7, .65, 1.2, 18]} /><meshStandardMaterial color="#3f4641" roughness={.7} metalness={.5} /></mesh>
      {Array.from({ length: 19 }, (_, i) => <mesh key={i} position={[Math.sin(i * 2.4) * .48, 1.2 + i % 3 * .065, Math.cos(i * 2.4) * .48]} scale={[.2, .12, .19]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={i % 3 ? '#626b60' : '#8a8c78'} roughness={1} /></mesh>)}
      <Box at={[0, .5, .67]} size={[.6, .3, .035]} color="#aa6944" />
      {[-1, 1].map(side => <Box key={side} at={[side * 1.05, .75, 0]} size={[.09, .12, 2.2]} material={materials.wood} />)}
      <mesh position={[-1.4, .35, .3]}><cylinderGeometry args={[.32, .26, .6, 16]} /><meshStandardMaterial color="#b78e60" roughness={.9} /></mesh>
      {/* Soft löyly cove — warm wash over the stones and water bucket, not a spotlight. */}
      <Box at={[0, 2.35, -.15]} size={[2.4, .06, .35]} material={materials.wood} />
      <CoveStrip at={[0, 2.22, -.05]} size={[2.1, .035, .12]} lit={.55} />
      <WallWash at={[-1.55, 1.35, .15]} yaw={Math.PI / 2} width={1.4} lit={.45} />
      <pointLight position={[0, 2.05, .2]} color="#ffc17b" intensity={4.2} distance={6.5} decay={1.7} />
      <pointLight position={[-1.25, 1.55, .35]} color="#f0d4a8" intensity={2.4} distance={4.2} decay={1.8} />
    </group>
    <SaunaSteam reducedMotion={reducedMotion} />
    {/* Above the door lintel, facing the spa — not clipped by the frame. */}
    <Sign title="핀란드 사우나" subtitle="FINNISH SAUNA · LÖYLY" at={[45.35, 4.35, 3]} yaw={-Math.PI / 2} near={18} />
    <Sign title="나무의 온기, 잔잔한 쉼" subtitle="BENCHES & WARM STONES" at={[55, 2.9, 11.55]} yaw={Math.PI} near={14} />
    {[1, 5].map(z => <Box key={z} at={[45.78, 1.8, z]} size={[.2, 3.6, .2]} material={materials.wood} />)}
    <Box at={[45.78, 3.6, 3]} size={[.2, .2, 4.4]} material={materials.wood} />
    {/* Doorway torches — flank the exit instead of a long cove bar. */}
    <WallTorch at={[46.05, .55, 1.05]} phase={.4} reducedMotion={reducedMotion} />
    <WallTorch at={[46.05, .55, 4.95]} phase={2.1} reducedMotion={reducedMotion} />
  </group>;
}
const Forest = memo(function Forest({ reducedMotion, highQuality }: { reducedMotion: boolean; highQuality: boolean }) {
  const trunks = useRef<THREE.InstancedMesh>(null!), crowns = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const foliage = useMemo(() => foliageTexture(), []);
  const crownPlanes = highQuality ? 12 : 6;
  const trees = useMemo(() => {
    const data: { x: number; z: number; h: number; r: number; phase: number }[] = []; let seed = 19;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const count = highQuality ? 185 : 100;
    for (let i = 0; i < count; i++) { const angle = rand() * Math.PI * 2; const radius = 72 + rand() * 45; data.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius - 5, h: 6 + rand() * 8, r: 2.5 + rand() * 3.2, phase: rand() * 10 }); }
    [[-20, -17], [20, -18], [-20, 17], [-19, 29], [19, 29], [-25, -20], [25, -20], [-24, 44], [24, 44]].forEach(([x, z]) => data.push({ x, z, h: 7 + rand() * 3, r: 3 + rand(), phase: rand() * 10 }));
    return data.filter(tree => {
      if (tree.x > 44 && tree.x < 72 && tree.z > -18 && tree.z < 18) return false;
      if (tree.x > 14 && tree.x < 36 && tree.z > 12 && tree.z < 32) return false; // onsen clearing + path
      if (tree.x > 9 && tree.x < 28 && tree.z > 9 && tree.z < 20) return false; // bamboo corridor + stall
      if (tree.x > -34 && tree.x < -14 && tree.z > 11 && tree.z < 29) return false; // campfire clearing
      if (Math.hypot(tree.x - SHOP.x, tree.z - SHOP.z) < 8) return false;
      return true;
    });
  }, [highQuality]);
  const ready = useRef(false);
  const tick = useRef(0);
  const palette = useMemo(() => ['#e1e7ca', '#bfceaa', '#ccdab4', '#adbc9a'].map(c => new THREE.Color(c)), []);
  useEffect(() => { ready.current = false; tick.current = 0; }, [trees, crownPlanes]);
  useFrame(({ clock }) => {
    const swayOn = highQuality && !reducedMotion;
    // Crowns are expensive; init once, freeze on mobile, throttle sway on desktop.
    if (ready.current && (!swayOn || (++tick.current % 4) !== 0)) return;
    trees.forEach((tree, i) => {
      if (!ready.current) {
        dummy.position.set(tree.x, tree.h * .43, tree.z); dummy.scale.set(.25, tree.h * .86, .25); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); trunks.current.setMatrixAt(i * 3, dummy.matrix);
        for (const side of [-1, 1]) { dummy.position.set(tree.x + side * .55, tree.h * .7, tree.z + side * .25); dummy.scale.set(.13, tree.h * .4, .13); dummy.rotation.set(.18, 0, side * -.5); dummy.updateMatrix(); trunks.current.setMatrixAt(i * 3 + (side === -1 ? 1 : 2), dummy.matrix); }
      }
      const sway = swayOn ? Math.sin(clock.elapsedTime * (.22 + (i % 4) * .045) + tree.phase) * .1 : 0;
      for (let j = 0; j < crownPlanes; j++) {
        const step = highQuality ? 2.7 : 4.2;
        dummy.position.set(tree.x + Math.sin(j * step) * tree.r * .45 + sway, tree.h - (j % 3) * tree.r * .45, tree.z + Math.cos(j * step) * tree.r * .4);
        dummy.scale.set(tree.r * (highQuality ? .9 : 1.05), tree.r * (highQuality ? .8 : .95), 1); dummy.rotation.set((j % 3 - 1) * .7, tree.phase + j * 1.2, sway * .15); dummy.updateMatrix(); crowns.current.setMatrixAt(i * crownPlanes + j, dummy.matrix);
        if (!ready.current) crowns.current.setColorAt(i * crownPlanes + j, palette[i % 4]!);
      }
    });
    if (!ready.current) {
      trunks.current.instanceMatrix.needsUpdate = true;
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
      ready.current = true;
    }
    crowns.current.instanceMatrix.needsUpdate = true;
  });
  return <group><instancedMesh ref={trunks} args={[undefined, undefined, trees.length * 3]} castShadow={highQuality}><cylinderGeometry args={[.7, 1, 1, 6]} /><meshStandardMaterial color="#5d5543" roughness={1} /></instancedMesh><instancedMesh ref={crowns} args={[undefined, undefined, trees.length * crownPlanes]} castShadow={highQuality} receiveShadow={highQuality}><planeGeometry args={[2, 2]} /><meshStandardMaterial map={foliage} alphaTest={.4} side={THREE.DoubleSide} roughness={1} /></instancedMesh></group>;
});
function YogaMat({ slot, index }: { slot: Slot; index: number }) {
  const material = useRef<THREE.MeshStandardMaterial>(null!), outline = useRef<THREE.Group>(null!);
  const colors = useMemo(() => ({ idle: new THREE.Color(index % 2 ? '#b5b7a2' : '#a6ae96'), near: new THREE.Color('#c5d2ac'), occupied: new THREE.Color('#929f87') }), [index]);
  useFrame((_, dt) => {
    const state = network.getState(), self = state.snapshot?.players.find(p => p.id === state.id);
    const nearest = self?.zone === 'yoga' && !self.slot ? nearbyYogaMat(motion.position.x, motion.position.z, state.snapshot?.occupancy ?? {}) : undefined;
    const near = nearest?.id === slot.id;
    material.current.color.lerp(near ? colors.near : state.snapshot?.occupancy[slot.id] ? colors.occupied : colors.idle, 1 - Math.exp(-dt * 12));
    material.current.emissiveIntensity = near ? .08 : 0; outline.current.visible = near;
  });
  return <group position={[slot.x, 0, slot.z]}>
    <mesh position={[0, .11, 0]} receiveShadow><boxGeometry args={[1.25, .06, 2.7]} /><meshStandardMaterial ref={material} color={index % 2 ? '#b5b7a2' : '#a6ae96'} emissive="#81935d" roughness={.95} /></mesh>
    <Box at={[0, .15, .95]} size={[1.1, .04, .035]} color="#d0cdb8" />
    <group ref={outline} visible={false}>
      {[-1, 1].map(side => <group key={side}><Box at={[side * .65, .15, 0]} size={[.035, .025, 2.76]} color="#e2d7b3" shadow={false} /><Box at={[0, .15, side * 1.37]} size={[1.33, .025, .035]} color="#e2d7b3" shadow={false} /></group>)}
    </group>
  </group>;
}
/** Bodyfriend-style full-body massage chair — local forward is −Z (matches slot yaw). */
function BodyfriendMassageChair({ slot }: { slot: Slot }) {
  const outline = useRef<THREE.Group>(null!);
  const leather = useRef<THREE.MeshStandardMaterial>(null!);
  const colors = useMemo(() => ({ idle: new THREE.Color('#4a4038'), near: new THREE.Color('#6a5c50'), occupied: new THREE.Color('#3a342e') }), []);
  useFrame((_, dt) => {
    const state = network.getState(), self = state.snapshot?.players.find(p => p.id === state.id);
    const nearest = self?.zone === 'yoga' && !self.slot ? nearbyMassage(motion.position.x, motion.position.z, state.snapshot?.occupancy ?? {}) : undefined;
    const near = nearest?.id === slot.id;
    const occupied = !!state.snapshot?.occupancy[slot.id];
    leather.current.color.lerp(near ? colors.near : occupied ? colors.occupied : colors.idle, 1 - Math.exp(-dt * 12));
    leather.current.emissiveIntensity = near ? .14 : .04;
    outline.current.visible = near;
  });
  return <group position={[slot.x, 0, slot.z]} rotation={[0, slot.yaw, 0]}>
    {/* Raised wood plinth so the chair reads clearly on the daecheong floor */}
    <Box at={[0, .06, .05]} size={[1.35, .12, 2.35]} material={materials.darkWood} />
    <Box at={[0, .14, .05]} size={[1.2, .06, 2.15]} color="#c4b59a" />
    {/* Base / chassis */}
    <Box at={[0, .28, .08]} size={[1.05, .22, 1.75]} color="#2c2824" />
    <Box at={[0, .42, .18]} size={[.98, .14, 1.2]} color="#3a342e" />
    {/* Seat cushion */}
    <mesh position={[0, .62, .25]} castShadow receiveShadow>
      <boxGeometry args={[.92, .26, .82]} />
      <meshStandardMaterial ref={leather} color="#4a4038" emissive="#8a6a48" emissiveIntensity={.04} roughness={.68} metalness={.06} />
    </mesh>
    {/* Reclined backrest */}
    <group position={[0, .88, .82]} rotation={[-.52, 0, 0]}>
      <Box at={[0, .62, 0]} size={[.94, 1.28, .26]} color="#4a4038" />
      <Box at={[0, .62, -.07]} size={[.8, 1.12, .12]} color="#5c5046" />
      <Box at={[0, 1.18, .02]} size={[.78, .32, .2]} color="#3a342e" />
    </group>
    {/* Armrests */}
    {[-1, 1].map(side => <group key={side}>
      <Box at={[side * .54, .68, .2]} size={[.16, .14, .95]} color="#2c2824" />
      <Box at={[side * .54, .84, .05]} size={[.18, .1, .62]} color="#4a4038" />
      <Box at={[side * .54, .52, .62]} size={[.14, .48, .14]} color="#c4a574" />
    </group>)}
    {/* Calf / footrest */}
    <group position={[0, .48, -.62]} rotation={[.38, 0, 0]}>
      <Box at={[0, 0, 0]} size={[.88, .2, .62]} color="#4a4038" />
      <Box at={[0, -.1, -.26]} size={[.8, .14, .32]} color="#3a342e" />
    </group>
    {/* Side control panel + brand plaque */}
    <Box at={[.58, .78, .4]} size={[.1, .28, .34]} color="#1a1816" />
    <Box at={[.61, .78, .4]} size={[.03, .18, .22]} color="#e2c48a" shadow={false} />
    <Box at={[0, .2, 1.05]} size={[.7, .05, .14]} color="#e2c48a" shadow={false} />
    <Sign title="바디프렌드" subtitle="BODYFRIEND" at={[0, 1.85, .15]} yaw={Math.PI} near={14} />
    <pointLight position={[0, 1.55, .2]} color="#f0d4a8" intensity={2.4} distance={4.5} decay={2} />
    <group ref={outline} visible={false}>
      <Box at={[0, 1.05, .05]} size={[1.4, .025, 2.45]} color="#e2d7b3" shadow={false} />
    </group>
  </group>;
}
function flameTexture(seed = 0) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 256);
  const lobes = 3 + (seed % 2);
  for (let L = 0; L < lobes; L++) {
    const cx = 64 + Math.sin(seed * 1.7 + L * 2.1) * (10 + L * 4);
    const g = ctx.createLinearGradient(cx, 250, cx, 8 + L * 12);
    g.addColorStop(0, 'rgba(20,4,0,0)');
    g.addColorStop(.08, 'rgba(120,18,0,.35)');
    g.addColorStop(.22, 'rgba(220,45,0,.75)');
    g.addColorStop(.42, 'rgba(255,95,12,.92)');
    g.addColorStop(.62, 'rgba(255,170,35,.95)');
    g.addColorStop(.82, 'rgba(255,235,140,.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    const w = 34 - L * 6 + (seed % 3) * 2;
    ctx.beginPath();
    ctx.moveTo(cx, 250);
    ctx.bezierCurveTo(cx - w, 200, cx - w * 1.1, 110, cx - w * .35, 28 + L * 18);
    ctx.bezierCurveTo(cx - 4, 55, cx + 4, 55, cx + w * .35, 28 + L * 18);
    ctx.bezierCurveTo(cx + w * 1.1, 110, cx + w, 200, cx, 250);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  const core = ctx.createRadialGradient(64, 175, 2, 64, 170, 48);
  core.addColorStop(0, 'rgba(255,252,230,.98)');
  core.addColorStop(.25, 'rgba(255,200,70,.7)');
  core.addColorStop(.55, 'rgba(255,100,20,.35)');
  core.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = core; ctx.beginPath(); ctx.ellipse(64, 175, 32, 62, 0, 0, Math.PI * 2); ctx.fill();
  // Soft edge falloff so additive plates don't read as hard cards.
  const mask = ctx.createRadialGradient(64, 140, 20, 64, 140, 70);
  mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = mask; ctx.fillRect(0, 0, 128, 256);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function CampfirePit({ reducedMotion, highQuality }: { reducedMotion: boolean; highQuality: boolean }) {
  const flames = useRef<THREE.Group>(null!);
  const embers = useRef<THREE.Group>(null!);
  const smoke = useRef<THREE.Group>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const fill = useRef<THREE.PointLight>(null!);
  const glow = useRef<THREE.Mesh>(null!);
  const bed = useRef<THREE.Mesh>(null!);
  const billboard = useRef(new THREE.Vector3());
  const maps = useMemo(() => [0, 1, 2].map(flameTexture), []);
  const tick = useRef(0);
  const flameCount = highQuality ? 14 : 6;
  const emberCount = highQuality ? 28 : 10;
  const smokeCount = highQuality ? 8 : 3;
  useEffect(() => () => maps.forEach(m => m.dispose()), [maps]);
  useFrame(({ clock, camera }) => {
    if (!highQuality && (++tick.current % 2) !== 0) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const flicker = reducedMotion ? 1 : .78 + Math.sin(t * 9.7) * .1 + Math.sin(t * 14.3) * .07 + Math.sin(t * 23.1) * .04;
    if (light.current) light.current.intensity = 34 * flicker;
    if (fill.current) fill.current.intensity = 14 * (.85 + flicker * .15);
    if (glow.current) {
      glow.current.scale.setScalar(.9 + flicker * .25);
      (glow.current.material as THREE.MeshBasicMaterial).opacity = .2 + flicker * .14;
    }
    if (bed.current) (bed.current.material as THREE.MeshStandardMaterial).emissiveIntensity = .55 + flicker * .35;
    flames.current.children.forEach((child, i) => {
      child.getWorldPosition(billboard.current);
      child.lookAt(camera.position.x, billboard.current.y, camera.position.z);
      const wave = reducedMotion ? 1 : .72 + Math.sin(t * (5.5 + i * 1.4) + i) * .22 + Math.sin(t * (11 + i * .7) + i * 2.4) * .12;
      const lean = reducedMotion ? 0 : Math.sin(t * (1.8 + i * .3) + i) * .06;
      child.scale.set(.5 + (i % 4) * .1, wave * (1.1 + (i % 5) * .14), 1);
      child.position.y = .38 + Math.abs(Math.sin(t * 2.8 + i * 1.3)) * .12;
      child.position.x = Math.sin(t * 2.1 + i * 2.3) * .05 + lean;
      child.position.z = Math.cos(t * 1.6 + i * 1.7) * .04;
      (child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = .45 + Math.sin(t * 7.5 + i) * .18;
    });
    embers.current.children.forEach((child, i) => {
      const speed = .28 + (i % 7) * .07;
      const life = (t * speed + i * .55) % 2.6;
      const spin = i * 1.7 + t * (.4 + (i % 3) * .15);
      const rise = life * life * .55;
      child.position.set(Math.sin(spin) * (.12 + life * .2), .45 + rise * 2.1, Math.cos(spin * .9) * (.1 + life * .18));
      const fade = life < .15 ? life / .15 : life > 1.8 ? Math.max(0, (2.6 - life) / .8) : 1;
      child.scale.setScalar(.02 + (1 - life / 2.6) * .055);
      (child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = .95 * fade;
    });
    smoke.current.children.forEach((child, i) => {
      const life = (t * .12 + i * .5) % 3.2;
      child.position.set(Math.sin(i * 2.8 + t * .18) * (.1 + life * .28), .85 + life * 1.55, Math.cos(i * 2.1 + t * .14) * (.08 + life * .22));
      child.scale.setScalar(.2 + life * .45);
      (child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = .09 * (1 - life / 3.2);
    });
  });
  return <group position={[-24, 0, 20]}>
    <Box at={[0, -.08, 0]} size={[4.2, .16, 4.2]} material={materials.stone} />
    {Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return <mesh key={i} position={[Math.cos(a) * 1.12, .16, Math.sin(a) * 1.12]} rotation={[.25, a, .2]} castShadow>
        <boxGeometry args={[.48, .26, .3]} /><meshStandardMaterial color={i % 2 ? '#5e584c' : '#6a6458'} roughness={1} />
      </mesh>;
    })}
    {/* Ash / coal bed */}
    <mesh ref={bed} position={[0, .12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[.72, 20]} />
      <meshStandardMaterial color="#1a100c" roughness={1} emissive="#ff4a12" emissiveIntensity={.7} />
    </mesh>
    <mesh position={[0, .13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[.35, .85, 24]} />
      <meshBasicMaterial color="#ff6a28" transparent opacity={.18} depthWrite={false} toneMapped={false} />
    </mesh>
    {/* Criss-cross firewood with glowing ends */}
    {[[.18, .22, -.06, .55, .42], [-.14, .3, .1, -.6, .55], [.06, .38, .0, 1.15, .28], [-.08, .2, -.14, -.25, .95], [.02, .26, .12, 2.0, .38]].map(([x, y, z, yaw, len], i) =>
      <group key={i} position={[x, y, z]} rotation={[.12 + i * .04, yaw, .3]}>
        <mesh castShadow>
          <cylinderGeometry args={[.065, .085, len, 7]} />
          <meshStandardMaterial color={i % 2 ? '#3a2a1c' : '#241810'} roughness={1} emissive="#5a1c08" emissiveIntensity={.2 + i * .04} />
        </mesh>
        <mesh position={[0, len * .42, 0]}>
          <sphereGeometry args={[.07, 8, 6]} />
          <meshStandardMaterial color="#2a1810" emissive="#ff5a18" emissiveIntensity={.9} roughness={.8} />
        </mesh>
      </group>
    )}
    <mesh ref={glow} position={[0, .55, 0]}><sphereGeometry args={[.85, 16, 12]} /><meshBasicMaterial color="#ff7020" transparent opacity={.32} depthWrite={false} toneMapped={false} /></mesh>
    <mesh position={[0, .2, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[1.8, 24]} />
      <meshBasicMaterial color="#ff5a18" transparent opacity={.16} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
    <group ref={flames}>
      {Array.from({ length: flameCount }, (_, i) => <mesh key={i} position={[Math.sin(i * 1.7) * .14, .52, Math.cos(i * 1.3) * .12]} renderOrder={2}>
        <planeGeometry args={[.7 + (i % 3) * .18, 1.25 + (i % 4) * .22]} />
        <meshBasicMaterial map={maps[i % maps.length]} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>)}
    </group>
    <group ref={embers}>{Array.from({ length: emberCount }, (_, i) => <mesh key={i}><sphereGeometry args={[1, 5, 4]} /><meshBasicMaterial color={i % 4 ? '#ffc266' : '#ff5a22'} transparent depthWrite={false} toneMapped={false} /></mesh>)}</group>
    <group ref={smoke}>{Array.from({ length: smokeCount }, (_, i) => <mesh key={i}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#b8b0a2" transparent opacity={.05} depthWrite={false} /></mesh>)}</group>
    <pointLight ref={light} position={[0, 1.25, 0]} color="#ff8c3a" intensity={34} distance={highQuality ? 20 : 14} decay={1.35} />
    {highQuality && <pointLight ref={fill} position={[0, .4, 0]} color="#ff4a12" intensity={14} distance={7} decay={1.8} />}
    <Sign title="불멍 캠프" subtitle="CAMPFIRE · MARSHMALLOW" at={[0, 2.6, -3.8]} yaw={faceYaw(6.5, -5.5, 0, -3.8)} />
  </group>;
}
function WorryBurns({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null!);
  const seen = useRef(0);
  const burns = useRef<{ id: number; born: number; mesh: THREE.Group }[]>([]);
  useFrame(({ clock }) => {
    const seq = network.getState().snapshot?.worryBurnSeq ?? 0;
    if (seq > seen.current) {
      for (let n = seen.current; n < seq; n++) {
        const paper = new THREE.Group();
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(.35, .45), new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: .95, side: THREE.DoubleSide }));
        sheet.rotation.x = -.4; paper.add(sheet);
        group.current.add(paper);
        burns.current.push({ id: n, born: clock.elapsedTime, mesh: paper });
        if (n === seq - 1) audio.effect('burn');
      }
      seen.current = seq;
    }
    const t = clock.elapsedTime;
    burns.current = burns.current.filter(burn => {
      const age = t - burn.born;
      const p = burn.mesh;
      if (age > 2.4) { group.current.remove(p); p.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); } }); return false; }
      const lift = reducedMotion ? Math.min(age, 1) * .9 : Math.min(1, age / 1.1) * 1.6;
      p.position.set(Math.sin(age * 3 + burn.id) * .2, .5 + lift, Math.cos(age * 2.2) * .15);
      p.rotation.y = age * 2.5; p.rotation.z = Math.sin(age * 4) * .4;
      p.scale.setScalar(Math.max(.05, 1 - age / 2.2));
      p.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.lerpColors(new THREE.Color('#efe6d2'), new THREE.Color('#3a2a1c'), Math.min(1, age / 1.4));
          child.material.emissive = new THREE.Color('#ff6a2a');
          child.material.emissiveIntensity = age < 1.2 ? age * .8 : Math.max(0, 1.2 - age);
        }
      });
      return true;
    });
  });
  return <group ref={group} position={[-24, 0, 20]} />;
}
function CampfireYard({ reducedMotion, highQuality }: { reducedMotion: boolean; highQuality: boolean }) {
  return <group>
    <Box at={[-24, -.14, 20]} size={[17, .2, 15]} material={materials.stone} />
    <Box at={[-12, -.14, 12]} size={[8, .2, 5]} material={materials.stone} />
    <CampfirePit reducedMotion={reducedMotion} highQuality={highQuality} />
    <WorryBurns reducedMotion={reducedMotion} />
    {SLOTS.filter(s => s.kind === 'log').map(slot => <group key={slot.id} position={[slot.x, 0, slot.z]} rotation={[0, slot.yaw, 0]}>
      <mesh position={[0, .28, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.22, .26, 1.5, 10]} /><meshStandardMaterial color="#5c4a38" roughness={1} /></mesh>
      <mesh position={[0, .22, .35]} rotation={[.2, .4, Math.PI / 2]}><cylinderGeometry args={[.16, .18, .9, 8]} /><meshStandardMaterial color="#6a5642" roughness={1} /></mesh>
    </group>)}
  </group>;
}
function BambooGrove() {
  const culms = useRef<THREE.InstancedMesh>(null!);
  const nodes = useRef<THREE.InstancedMesh>(null!);
  const shoots = useRef<THREE.InstancedMesh>(null!);
  const leaves = useRef<THREE.InstancedMesh>(null!);
  const culmMap = useMemo(() => bambooCulmTexture(), []);
  const leafMap = useMemo(() => bambooLeafTexture(), []);
  useEffect(() => () => { culmMap.dispose(); leafMap.dispose(); }, [culmMap, leafMap]);
  const plants = useMemo(() => {
    const data: { x: number; z: number; h: number; lean: number; phase: number; thick: number }[] = [];
    let seed = 41;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const onWalk = (x: number, z: number) => onOnsenWalk(x, z) || Math.hypot(x - SHOP.x, z - SHOP.z) < 3.2;
    // Keep water + inner deck clear; plant tightly around so the bath feels wrapped in bamboo.
    const inBath = (x: number, z: number) => Math.abs(x - ONSEN.x) < ONSEN.w / 2 + 1.1 && Math.abs(z - ONSEN.z) < ONSEN.d / 2 + 1.1;
    const inSouthMouth = (x: number, z: number) => Math.abs(x - ONSEN.x) < 3.2 && z < ONSEN.z - 1.5 && z > ONSEN.z - 7.2;
    const nearHammock = (x: number, z: number) => ONSEN_HAMMOCKS.some(h => {
      const mx = (h.a[0] + h.b[0]) / 2, mz = (h.a[1] + h.b[1]) / 2;
      return Math.hypot(x - mx, z - mz) < 2.6;
    });
    const push = (x: number, z: number, cluster = 1, hedge = false) => {
      for (let k = 0; k < cluster; k++) {
        const qx = x + (rand() - .5) * .18, qz = z + (rand() - .5) * .18;
        if (inBath(qx, qz) || inSouthMouth(qx, qz) || nearHammock(qx, qz)) continue;
        if (hedge ? onWalk(qx, qz) : onOnsenWalk(qx, qz)) continue;
        data.push({ x: qx, z: qz, h: 5.2 + rand() * 3.8, lean: (rand() - .5) * .035, phase: rand() * 8, thick: .048 + rand() * .032 });
      }
    };
    // No bamboo along the approach path — keep the walk open; wrap only the bath itself.
    const nearApproach = (x: number, z: number) => {
      const [ax, az] = ONSEN_PATH.from, [bx, bz] = ONSEN_PATH.to;
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      return Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < 4.2;
    };
    for (let a = 0; a < Math.PI * 2; a += .11) {
      for (const r of [5.6, 6.7, 7.9, 9.2, 10.5]) {
        const bx = ONSEN.x + Math.cos(a) * r, bz = ONSEN.z + Math.sin(a) * r;
        if (bz < ONSEN.z - 3.2 && Math.abs(bx - ONSEN.x) < 3.6) continue;
        if (onOnsenWalk(bx, bz) || inBath(bx, bz) || inSouthMouth(bx, bz) || nearApproach(bx, bz)) continue;
        push(bx, bz, 1);
      }
    }
    for (const side of [-1, 1]) for (let i = 0; i < 14; i++) {
      const z = ONSEN.z - 3.2 + i * .7;
      if (nearApproach(ONSEN.x + side * 6.8, z)) continue;
      push(ONSEN.x + side * (6.4 + (i % 3) * .45), z, 2);
      push(ONSEN.x + side * (7.6 + (i % 2) * .4), z + .2, 1);
    }
    return data;
  }, []);
  const RING = 5, LEAF = 6;
  useEffect(() => {
    const dummy = new THREE.Object3D();
    plants.forEach((p, i) => {
      // Tapered culm
      dummy.position.set(p.x, p.h * .5, p.z);
      dummy.scale.set(p.thick, p.h, p.thick * .92);
      dummy.rotation.set(p.lean, p.phase, p.lean * .35);
      dummy.updateMatrix();
      culms.current.setMatrixAt(i, dummy.matrix);
      for (let r = 0; r < RING; r++) {
        const t = (r + 1) / (RING + 1);
        dummy.position.set(p.x + p.lean * t * .8, p.h * t, p.z);
        const rad = p.thick * (1.15 - t * .25);
        dummy.scale.set(rad * 1.35, .035, rad * 1.35);
        dummy.rotation.set(0, p.phase, 0);
        dummy.updateMatrix();
        nodes.current.setMatrixAt(i * RING + r, dummy.matrix);
      }
      for (let s = 0; s < 2; s++) {
        const t = .55 + s * .18;
        const ang = p.phase + s * 2.1;
        dummy.position.set(p.x + Math.cos(ang) * .12, p.h * t, p.z + Math.sin(ang) * .12);
        dummy.scale.set(p.thick * .45, p.h * .22, p.thick * .45);
        dummy.rotation.set(.55, ang, .35 * (s ? 1 : -1));
        dummy.updateMatrix();
        shoots.current.setMatrixAt(i * 2 + s, dummy.matrix);
      }
      for (let j = 0; j < LEAF; j++) {
        const tier = Math.floor(j / 3);
        const ang = p.phase + j * 1.05 + tier;
        const lift = .64 + tier * .2 + (j % 3) * .03;
        dummy.position.set(p.x + Math.cos(ang) * (.18 + tier * .08), p.h * lift, p.z + Math.sin(ang) * (.18 + tier * .08));
        dummy.scale.set(1.2, .58, 1);
        dummy.rotation.set(.55 + tier * .15, ang, (j % 2 ? .4 : -.4));
        dummy.updateMatrix();
        leaves.current.setMatrixAt(i * LEAF + j, dummy.matrix);
      }
    });
    culms.current.instanceMatrix.needsUpdate = true;
    nodes.current.instanceMatrix.needsUpdate = true;
    shoots.current.instanceMatrix.needsUpdate = true;
    leaves.current.instanceMatrix.needsUpdate = true;
  }, [plants]);
  return <group>
    <instancedMesh ref={culms} args={[undefined, undefined, plants.length]} castShadow={false}>
      <cylinderGeometry args={[1, 1.12, 1, 6]} />
      <meshStandardMaterial map={culmMap} roughness={.72} metalness={.02} />
    </instancedMesh>
    <instancedMesh ref={nodes} args={[undefined, undefined, plants.length * RING]} castShadow={false}>
      <cylinderGeometry args={[1, 1, 1, 6]} />
      <meshStandardMaterial color="#3f5428" roughness={.9} />
    </instancedMesh>
    <instancedMesh ref={shoots} args={[undefined, undefined, plants.length * 2]} castShadow={false}>
      <cylinderGeometry args={[.7, 1, 1, 5]} />
      <meshStandardMaterial map={culmMap} roughness={.75} />
    </instancedMesh>
    <instancedMesh ref={leaves} args={[undefined, undefined, plants.length * LEAF]}>
      <planeGeometry args={[1.35, .7]} />
      <meshStandardMaterial map={leafMap} alphaTest={.35} side={THREE.DoubleSide} roughness={.95} />
    </instancedMesh>
  </group>;
}
function netTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c4b496'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(70,55,40,.55)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath(); ctx.moveTo(i * 8, 0); ctx.lineTo(i * 8, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 8); ctx.lineTo(128, i * 8); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function RopeLine({ from, to }: { from: readonly [number, number, number]; to: readonly [number, number, number] }) {
  const { mid, len, quat } = useMemo(() => {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const length = Math.hypot(dx, dy, dz) || .001;
    return {
      mid: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2] as [number, number, number],
      len: length,
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / length, dy / length, dz / length))
    };
  }, [from, to]);
  return <mesh position={mid} quaternion={quat}><cylinderGeometry args={[.016, .016, len, 5]} /><meshStandardMaterial color="#6b5744" roughness={1} /></mesh>;
}
function HammockTree({ at }: { at: [number, number] }) {
  const foliage = useMemo(() => foliageTexture(), []);
  useEffect(() => () => foliage.dispose(), [foliage]);
  return <group position={[at[0], 0, at[1]]}>
    <mesh position={[0, 2.4, 0]} castShadow><cylinderGeometry args={[.22, .32, 4.8, 8]} /><meshStandardMaterial color="#5c4a38" roughness={1} /></mesh>
    <mesh position={[.35, 3.6, .1]} rotation={[.25, 0, -.55]} castShadow><cylinderGeometry args={[.08, .12, 1.8, 6]} /><meshStandardMaterial color="#5c4a38" roughness={1} /></mesh>
    <mesh position={[-.3, 3.9, -.15]} rotation={[.2, .4, .5]} castShadow><cylinderGeometry args={[.07, .11, 1.5, 6]} /><meshStandardMaterial color="#5c4a38" roughness={1} /></mesh>
    {/* Keep canopy off the hammock mid-span so lying guests can see the night sky. */}
    {[[.15, 5.35, .55, 1.9], [.85, 4.85, .35, 1.55], [-.8, 5.0, -.4, 1.45], [.55, 5.55, -.55, 1.35], [-.55, 5.45, .6, 1.25]].map(([x, y, z, s], i) =>
      <mesh key={i} position={[x, y, z]} rotation={[.3 + i * .1, i * 1.1, .2]}><planeGeometry args={[s, s]} /><meshStandardMaterial map={foliage} alphaTest={.4} side={THREE.DoubleSide} roughness={1} color={i % 2 ? '#c5d2a8' : '#a8bc8a'} /></mesh>
    )}
    <Box at={[0, .08, 0]} size={[.7, .16, .7]} material={materials.stone} />
  </group>;
}
function Hammock({ id, a, b, height = 1.15, sag = .55 }: { id: string; a: [number, number]; b: [number, number]; height?: number; sag?: number }) {
  const map = useMemo(() => netTexture(), []);
  useEffect(() => () => map.dispose(), [map]);
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const facing = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const width = Math.min(1.35, len * .38);
  const net = useMemo(() => {
    const lSeg = 22, wSeg = 10;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= wSeg; j++) for (let i = 0; i <= lSeg; i++) {
      const u = i / lSeg, v = j / wSeg;
      const x = (u - .5) * len * .92;
      const z = (v - .5) * width;
      const along = Math.abs(u - .5) * 2, across = Math.abs(v - .5) * 2;
      const y = height - sag * (1 - along * along) * (1 - across * across * .35);
      pos.push(x, y, z); uv.push(u * 3, v * 2);
      if (i < lSeg && j < wSeg) {
        const a0 = j * (lSeg + 1) + i;
        idx.push(a0, a0 + lSeg + 1, a0 + 1, a0 + 1, a0 + lSeg + 1, a0 + lSeg + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }, [len, width, height, sag]);
  useEffect(() => () => net.dispose(), [net]);
  const ropes = useMemo(() => ([
    [[-len / 2, 2.9, 0], [-len * .28, height - sag * .12, width * .32]] as const,
    [[-len / 2, 2.9, 0], [-len * .28, height - sag * .12, -width * .32]] as const,
    [[len / 2, 2.9, 0], [len * .28, height - sag * .12, width * .32]] as const,
    [[len / 2, 2.9, 0], [len * .28, height - sag * .12, -width * .32]] as const
  ]), [len, height, sag, width]);
  return <group onClick={e => { e.stopPropagation(); network.send({ type: 'reserve', slot: id }); }}>
    <HammockTree at={a} />
    <HammockTree at={b} />
    <group position={[mid[0], 0, mid[1]]} rotation={[0, facing, 0]}>
      <mesh geometry={net} castShadow><meshStandardMaterial map={map} color="#d2c3a4" roughness={.95} side={THREE.DoubleSide} /></mesh>
      {ropes.map((pair, i) => <RopeLine key={i} from={pair[0]} to={pair[1]} />)}
    </group>
  </group>;
}
/** Raised stone walk — E→N turn; curbs stop short of the corner so the right turn stays open. */
function BambooPathWalk() {
  const [fx, fz] = ONSEN_PATH.from, [tx] = ONSEN_PATH.to;
  const pathLen = onsenPathLength();
  const w = ONSEN_PATH.halfW * 2;
  const curb = w / 2 + .12;
  const midX = (fx + tx) / 2;
  const apronZ1 = 18.9;
  const steps = Math.max(6, Math.round(pathLen / 1.35));
  return <group>
    {/* Courtyard mouth */}
    <Box at={[fx - 1.2, -.12, fz]} size={[3.2, .16, w + 1.2]} color="#c9c2b0" />
    {/* East–west bed + surface */}
    <Box at={[midX, -.1, fz]} size={[pathLen + 1.2, .14, w + .55]} color="#b7b09c" />
    <Box at={[midX, -.02, fz]} size={[pathLen + .6, .12, w]} color="#d8d1bc" />
    {Array.from({ length: steps }, (_, i) => {
      const x = fx + (i + .5) * (pathLen / steps);
      return <Box key={i} at={[x, .02, fz]} size={[1.05, .08, w * .72]} color="#cfc7b4" />;
    })}
    {/* Right curb — ends before the corner (was sealing the north turn) */}
    <Box at={[midX - 1.1, .06, fz + curb]} size={[pathLen - 2.8, .22, .28]} material={materials.stone} />
    {/* Left curb — also clear of the corner, then along the apron west edge */}
    <Box at={[midX - .55, .06, fz - curb]} size={[pathLen - .7, .22, .28]} material={materials.stone} />
    <Box at={[tx - curb, .06, (fz + apronZ1) / 2 + 1.1]} size={[.28, .22, apronZ1 - fz - 1.4]} material={materials.stone} />
    {/* North apron into the bath */}
    <Box at={[tx, -.1, (fz + apronZ1) / 2]} size={[w + .45, .14, apronZ1 - fz + .8]} color="#b7b09c" />
    <Box at={[tx, -.02, (fz + apronZ1) / 2]} size={[w - .1, .12, apronZ1 - fz + .4]} color="#d8d1bc" />
  </group>;
}
function OnsenYard({ reducedMotion, lanternLit, highQuality = false }: { reducedMotion: boolean; lanternLit: number; highQuality?: boolean }) {
  const [fx, fz] = ONSEN_PATH.from, [tx, tz] = ONSEN_PATH.to;
  const pathYaw = onsenPathYaw();
  const px = -Math.cos(pathYaw), pz = Math.sin(pathYaw);
  const along = (t: number, side: number, dist = 2.9): [number, number, number] =>
    [fx + (tx - fx) * t + px * side * dist, 0, fz + (tz - fz) * t + pz * side * dist];
  const signOnPath: [number, number, number] = [fx + (tx - fx) * .1, 2.85, fz + (tz - fz) * .1];
  // Hang 호롱 in the bamboo ring — skip the open south mouth.
  const bambooLights = useMemo(() => {
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + .15;
      if (Math.sin(a) < -.55) continue; // south entrance
      const r = 6.4 + (i % 3) * .55;
      spots.push([ONSEN.x + Math.cos(a) * r, 2.15 + (i % 2) * .35, ONSEN.z + Math.sin(a) * r]);
    }
    return spots;
  }, []);
  return <group>
    <BambooPathWalk />
    {/* Stone apron + smaller timber deck — less ryokan wood clearing */}
    <Box at={[ONSEN.x, -.14, ONSEN.z]} size={[15, .2, 14]} material={materials.stone} />
    <Box at={[ONSEN.x, -.06, ONSEN.z + .4]} size={[9.5, .12, 8.5]} material={materials.wood} />
    <BambooGrove />
    {bambooLights.map((at, i) =>
      <BambooHorong key={`onsen-horong-${i}`} at={at} lit={lanternLit} phase={i * 1.3} reducedMotion={reducedMotion} />
    )}
    {ONSEN_HAMMOCKS.map(h => <Hammock key={h.id} id={h.id} a={h.a} b={h.b} height={1.2} sag={.56} />)}
    <Water x={ONSEN.x} z={ONSEN.z} w={ONSEN.w} d={ONSEN.d} basin reducedMotion={reducedMotion} />
    {/* Low bath lip only — no tall wall across the water. */}
    {[-1, 1].map(side => <Box key={`lip-x-${side}`} at={[ONSEN.x + side * ONSEN.w / 2, -.48, ONSEN.z]} size={[.36, .28, ONSEN.d + .15]} material={materials.stone} />)}
    <Box at={[ONSEN.x, -.48, ONSEN.z + ONSEN.d / 2]} size={[ONSEN.w + .15, .28, .36]} material={materials.stone} />
    {[-1, 1].map(side => <Box key={`lip-s-${side}`} at={[ONSEN.x + side * (2.1 + (ONSEN.w - 4.2) / 4), -.48, ONSEN.z - ONSEN.d / 2]} size={[(ONSEN.w - 4.2) / 2, .28, .36]} material={materials.stone} />)}
    {[0, 1, 2, 3].map(i => <Box key={i} at={[ONSEN.x, -.15 - i * .18, ONSEN.z - ONSEN.d / 2 + .3 + i * .35]} size={[3.4, .18, .4]} material={materials.stone} />)}
    {[-2, 0, 2].map(dx => <Steam key={dx} x={ONSEN.x + dx} z={ONSEN.z} reducedMotion={reducedMotion} />)}
    <Sign title="노천탕" subtitle="바깥 탕" at={[ONSEN.x + 2.6, 2.5, ONSEN.entry[1] - .4]} yaw={faceYaw(fx, fz, ONSEN.x + 2.6, ONSEN.entry[1] - .4)} near={16} hideClose={5} />
    <Sign title="노천탕으로 가는 길" subtitle="마당에서 이어지는 산책" at={signOnPath} yaw={-Math.PI / 2} near={26} hideClose={4.5} />
    <HorongPole at={along(.28, 1)} lit={lanternLit * .7} phase={.6} reducedMotion={reducedMotion} highQuality={highQuality} street />
    <HorongPole at={along(.55, -1)} lit={lanternLit * .7} phase={1.2} reducedMotion={reducedMotion} highQuality={highQuality} street />
    <HorongPole at={along(.82, 1)} lit={lanternLit * .7} phase={1.8} reducedMotion={reducedMotion} highQuality={highQuality} street />
    <pointLight position={[ONSEN.x, 3.2, ONSEN.z + .4]} color="#ffd6a0" intensity={3.2 * lanternLit} distance={14} decay={1.55} />
  </group>;
}
function Birds({ reducedMotion, highQuality }: { reducedMotion: boolean; highQuality: boolean }) {
  const group = useRef<THREE.Group>(null!);
  const tick = useRef(0);
  const birds = useMemo(() => Array.from({ length: highQuality ? 10 : 5 }, (_, i) => ({
    r: 18 + (i % 5) * 4.5,
    y: 9 + (i % 4) * 2.2,
    speed: .12 + (i % 3) * .04,
    phase: i * 1.7,
    tilt: (i % 2 ? 1 : -1) * .15
  })), [highQuality]);
  useFrame(({ clock }) => {
    if (reducedMotion || (!highQuality && (++tick.current % 2) !== 0)) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const b = birds[i]!;
      const a = t * b.speed + b.phase;
      child.position.set(Math.cos(a) * b.r, b.y + Math.sin(a * 2.2) * .4, Math.sin(a) * b.r * .7 - 2);
      child.rotation.y = -a + Math.PI / 2;
      child.rotation.z = Math.sin(t * 8 + b.phase) * .35;
      child.rotation.x = b.tilt;
    });
  });
  return <group ref={group}>{birds.map((_, i) => <group key={i}>
    <mesh scale={[.18, .05, .08]}><sphereGeometry args={[1, 6, 4]} /><meshStandardMaterial color="#f7f4ee" roughness={.82} /></mesh>
    <mesh position={[0, 0, 0]} rotation={[0, 0, .4]} scale={[.22, .015, .08]}><boxGeometry /><meshStandardMaterial color="#ebe6dc" roughness={.88} /></mesh>
    <mesh position={[0, 0, 0]} rotation={[0, 0, -.4]} scale={[.22, .015, .08]}><boxGeometry /><meshStandardMaterial color="#ebe6dc" roughness={.88} /></mesh>
  </group>)}</group>;
}
function Furnishings({ reducedMotion, highQuality, lanternLit = 0 }: { reducedMotion: boolean; highQuality: boolean; lanternLit?: number }) {
  const tubes = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { tubes.current.children.forEach((obj, i) => { obj.position.y = reducedMotion ? .18 : .18 + Math.sin(clock.elapsedTime * .65 + i * 1.7) * .025; }); });
  const nightish = lanternLit > .45;
  return <group>
    {SLOTS.filter(s => s.kind === 'mat').map((slot, i) => <YogaMat key={slot.id} slot={slot} index={i} />)}
    {SLOTS.filter(s => s.kind === 'massage').map(slot => <BodyfriendMassageChair key={slot.id} slot={slot} />)}
    <Box at={[-32, .12, -7.5]} size={[2.2, .08, 2]} color="#c4b69b" />
    <SpaBaths reducedMotion={reducedMotion} />
    <Box at={[32, -.005, 8.5]} size={[27.5, .12, 6.5]} material={materials.wood} />
    <Box at={[34.5, 2.4, 5]} size={[23, 4.8, .35]} material={materials.darkWood} />
    <Lattice wall={{ x: 34.5, z: 5, w: 23, d: .35, height: 4.8 }} center={[32, 8.5]} />
    <Sign title="스파 라운지" subtitle="REST LOUNGE · 양머리와 식혜" at={[37, 3.3, 11.7]} yaw={faceYaw(21, 4, 37, 11.7)} />
    <Water x={0} z={-41} w={27} d={23} dark={nightish} reducedMotion={reducedMotion} />
    {highQuality && <FloatingReflection reducedMotion={reducedMotion} />}
    <group ref={tubes}>{SLOTS.filter(s => s.kind === 'tube').map(slot => <group key={slot.id} position={[slot.x, .18, slot.z]} onClick={e => { e.stopPropagation(); network.send({ type: 'reserve', slot: slot.id }); }}>
      <mesh scale={[1.1, 1.8, .7]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[.84, .22, 10, 36]} /><meshStandardMaterial color="#e4dac5" roughness={.5} /></mesh>
      <Box at={[0, .04, 0]} size={[1.55, .16, 2.6]} color="#bfbda9" />
      <Box at={[0, .22, -.93]} size={[1.2, .22, .4]} color="#efe7d7" />
    </group>)}</group>
    {[-14.5, 14.5].flatMap((x, side) => [-32, -40, -49].map((z, i) => <Lantern key={`${x}-${z}`} at={[x, 0, z]} lit={lanternLit} phase={i + side * 3} reducedMotion={reducedMotion} highQuality={highQuality} />))}
    <Sign title="조용히, 물에 기대어" subtitle="FLOATING MEDITATION" at={[0, 2.8, -53.7]} yaw={faceYaw(0, -28, 0, -53.7)} dark={nightish} />
    {SLOTS.filter(s => s.zone === 'tea' || s.zone === 'spa').map(slot => <group key={slot.id}>
      <Box at={[slot.x, .2, slot.z]} size={[1.3, .36, 1.25]} material={materials.wood} />
      <Box at={[slot.x, .43, slot.z]} size={[1.1, .12, 1.05]} color="#c5c1a7" />
      {slot.zone === 'tea' && <group>
        <Box at={[slot.x, .57, slot.z - 1.45]} size={[2.2, .16, 1.1]} material={materials.darkWood} />
        <Box at={[slot.x, .26, slot.z - 1.45]} size={[1.6, .52, .15]} material={materials.wood} />
        {TEAS.map((tea, i) => <mesh key={tea.id} position={[slot.x - .55 + i * .36, .75, slot.z - 1.45]}>
          <cylinderGeometry args={[.065, .05, .12, 14]} />
          <meshStandardMaterial color={tea.color} roughness={.55} />
        </mesh>)}
        <Steam x={slot.x} z={slot.z - 1.45} reducedMotion={reducedMotion} />
      </group>}
    </group>)}
    <TeaLibrary />
  </group>;
}
function TeaLibrary() {
  const { x, z, yaw } = TEA_LIBRARY;
  const spines = ['#7a5a48', '#4a5c48', '#8b6b5a', '#5c4a3a', '#6a7058', '#9a7a5c', '#3d4a42', '#a08060'];
  return <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
    <Box at={[0, .08, 0]} size={[2.4, .16, 1.1]} material={materials.stone} />
    <Box at={[0, 1.15, -.15]} size={[2.2, 2.2, .35]} material={materials.darkWood} />
    {[0, 1, 2, 3].map(row => <Box key={row} at={[0, .35 + row * .5, -.02]} size={[2.05, .06, .28]} material={materials.wood} />)}
    {Array.from({ length: 24 }, (_, i) => {
      const row = Math.floor(i / 6), col = i % 6;
      return <Box key={i} at={[-.85 + col * .34, .55 + row * .5, .02]} size={[.28, .38, .18]} color={spines[i % spines.length]} />;
    })}
    <Box at={[0, .22, .55]} size={[1.1, .12, .7]} color="#c5c1a7" />
    <Sign title="다실 문고" subtitle="BOOKS & QUIET LINES" at={[0, 2.55, .2]} near={10} />
  </group>;
}
function SunsetSky({ day }: { day: DayCycle }) {
  const root = useRef<THREE.Group>(null!);
  const starsRef = useRef<THREE.Points>(null!);
  const starMat = useRef<THREE.PointsMaterial>(null!);
  const moonMat = useRef<THREE.MeshBasicMaterial>(null!);
  const moonHalo = useRef<THREE.MeshBasicMaterial>(null!);
  const moonSoft = useRef<THREE.MeshBasicMaterial>(null!);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(day.zenith) },
      horizon: { value: new THREE.Color(day.horizon) },
      glow: { value: day.glow },
      night: { value: day.nightness }
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform float glow; uniform float night;
      varying vec3 vDir;
      void main(){
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y * .55 + .45, 0., 1.);
        float band = pow(clamp(1. - abs(dir.y + .05), 0., 1.), 1.35);
        vec3 sky = mix(horizon, zenith, smoothstep(.05, .9, h));
        vec3 blush = mix(vec3(.96, .78, .58), vec3(.9, .68, .55), .35 + .2 * (1. - h));
        float wash = glow * band * (.4 + .25 * (1. - night));
        sky = mix(sky, blush, wash);
        sky += blush * glow * pow(band, 2.4) * .22;
        gl_FragColor = vec4(sky, 1.);
      }`
  }), []);
  const starGeo = useMemo(() => {
    const count = 1100;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Upper hemisphere — keep a little clear of the horizon haze.
      const u = Math.random(), v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(.08 + .92 * Math.pow(v, .72));
      const r = 195;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame(({ camera, clock }) => {
    root.current.position.copy(camera.position);
    mat.uniforms.zenith.value.set(day.zenith);
    mat.uniforms.horizon.value.set(day.horizon);
    mat.uniforms.glow.value = day.glow;
    mat.uniforms.night.value = day.nightness;
    const starVis = Math.max(0, Math.min(1, (day.nightness - .38) / .42));
    if (starMat.current) {
      const twinkle = day.nightness > .5 ? .82 + Math.sin(clock.elapsedTime * .7) * .08 : 1;
      starMat.current.opacity = starVis * .92 * twinkle;
      starMat.current.size = 1.15 + starVis * .55;
      starsRef.current.visible = starVis > .02;
    }
    const moonVis = Math.max(0, Math.min(1, (day.nightness - .42) / .4));
    if (moonMat.current) moonMat.current.opacity = moonVis;
    if (moonHalo.current) moonHalo.current.opacity = .16 * moonVis;
    if (moonSoft.current) moonSoft.current.opacity = .055 * moonVis;
  });
  useEffect(() => () => { mat.dispose(); starGeo.dispose(); }, [mat, starGeo]);
  const sunAt = useMemo(() => {
    const v = new THREE.Vector3(day.sunPos[0], Math.max(day.sunPos[1], 3), day.sunPos[2]).normalize().multiplyScalar(170);
    return [v.x, v.y, v.z] as [number, number, number];
  }, [day.sunPos[0], day.sunPos[1], day.sunPos[2]]);
  // Moon rises opposite the sun — high and soft through the night.
  const moonAt = useMemo(() => {
    const opposite = new THREE.Vector3(-day.sunPos[0], Math.max(28, 62 - day.sunPos[1] * .35), -day.sunPos[2] * .65);
    opposite.normalize().multiplyScalar(165);
    return [opposite.x, opposite.y, opposite.z] as [number, number, number];
  }, [day.sunPos[0], day.sunPos[1], day.sunPos[2]]);
  const sunOpacity = day.glow > .03 || (day.nightness > 0 && day.nightness < .88) ? 1 : 0;
  const moonVisible = day.nightness > .4;
  return <group ref={root}>
    <mesh material={mat} renderOrder={-20} frustumCulled={false}><sphereGeometry args={[220, 32, 16]} /></mesh>
    <points ref={starsRef} geometry={starGeo} renderOrder={-19} frustumCulled={false} visible={false}>
      <pointsMaterial ref={starMat} color="#f4f1e8" size={1.4} sizeAttenuation={false} transparent opacity={0} depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} />
    </points>
    <group position={sunAt} visible={sunOpacity > 0}>
      <mesh renderOrder={-19}><sphereGeometry args={[6 + day.glow * 3.5, 16, 12]} /><meshBasicMaterial color={day.sunColor} toneMapped={false} fog={false} depthWrite={false} /></mesh>
      <mesh renderOrder={-18}><sphereGeometry args={[13 + day.glow * 8, 16, 12]} /><meshBasicMaterial color="#f5d6b0" transparent opacity={.14 + day.glow * .2} depthWrite={false} toneMapped={false} fog={false} /></mesh>
      <mesh renderOrder={-17}><sphereGeometry args={[24 + day.glow * 14, 12, 10]} /><meshBasicMaterial color="#e8b892" transparent opacity={.05 + day.glow * .08} depthWrite={false} toneMapped={false} fog={false} /></mesh>
    </group>
    <group position={moonAt} visible={moonVisible}>
      <mesh renderOrder={-16}><sphereGeometry args={[5.2, 20, 16]} /><meshBasicMaterial ref={moonMat} color="#f2eee2" transparent opacity={0} toneMapped={false} fog={false} depthWrite={false} /></mesh>
      <mesh renderOrder={-15}><sphereGeometry args={[9.5, 16, 12]} /><meshBasicMaterial ref={moonHalo} color="#d8e0f0" transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} /></mesh>
      <mesh renderOrder={-14}><sphereGeometry args={[18, 12, 10]} /><meshBasicMaterial ref={moonSoft} color="#a8b8d0" transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} /></mesh>
    </group>
  </group>;
}
/** Courtyard snack stall — 라면 · 계란 · 식혜 · 핫바 · 떡볶이. */
function ShopStall({ lanternLit = 0, highQuality = false }: { lanternLit?: number; highQuality?: boolean }) {
  const { x, z, yaw } = SHOP;
  return <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
    <Box at={[0, -.08, .2]} size={[3.4, .16, 2.2]} material={materials.stone} />
    <Box at={[0, .55, .15]} size={[2.8, 1.05, 1.1]} material={materials.wood} />
    <Box at={[0, 1.12, .15]} size={[2.9, .1, 1.2]} material={materials.wood} />
    {[-1.15, 1.15].map(sx => <Box key={sx} at={[sx, 1.55, -.35]} size={[.14, 1.7, .14]} material={materials.wood} />)}
    <Box at={[0, 2.28, -.05]} size={[2.55, .1, 1.35]} material={materials.wood} />
    <Box at={[0, 2.42, -.35]} size={[2.9, .1, 1.55]} material={materials.roof} />
    <Box at={[0, 2.52, -.35]} size={[3.05, .08, 1.65]} material={materials.roof} />
    <Box at={[0, 2.18, .35]} size={[2.5, .06, .08]} material={materials.dancheongBlue} shadow={false} />
    <Box at={[0, 1.7, -.55]} size={[2.4, 1.1, .12]} material={materials.plaster} />
    <Box at={[-.95, 1.35, .55]} size={[.42, .18, .42]} color="#c45c3a" />
    <Box at={[-.95, 1.52, .55]} size={[.28, .16, .28]} color="#f2e6d4" />
    <mesh position={[-.42, 1.28, .55]}><sphereGeometry args={[.12, 10, 8]} /><meshStandardMaterial color="#d9a066" roughness={.7} /></mesh>
    <mesh position={[-.2, 1.28, .5]}><sphereGeometry args={[.11, 10, 8]} /><meshStandardMaterial color="#c9894a" roughness={.72} /></mesh>
    <mesh position={[.2, 1.3, .52]} rotation={[.12, 0, 0]}><cylinderGeometry args={[.09, .09, .38, 10]} /><meshStandardMaterial color="#e8d9b8" roughness={.55} /></mesh>
    <mesh position={[.2, 1.52, .52]}><cylinderGeometry args={[.1, .1, .06, 10]} /><meshStandardMaterial color="#8b6b3d" roughness={.6} /></mesh>
    {/* 핫바 — warm sausage on a stick */}
    <mesh position={[.55, 1.38, .55]} rotation={[.55, .2, .15]}><cylinderGeometry args={[.05, .055, .42, 8]} /><meshStandardMaterial color="#c45a3a" roughness={.65} /></mesh>
    <mesh position={[.55, 1.18, .62]} rotation={[.55, .2, .15]}><cylinderGeometry args={[.012, .012, .28, 6]} /><meshStandardMaterial color="#d8c4a0" roughness={.85} /></mesh>
    {/* 떡볶이 — red sauce plate with rice cakes */}
    <mesh position={[.95, 1.24, .52]}><cylinderGeometry args={[.22, .2, .05, 12]} /><meshStandardMaterial color="#e8d9c4" roughness={.7} /></mesh>
    <mesh position={[.95, 1.28, .52]}><cylinderGeometry args={[.18, .18, .04, 12]} /><meshStandardMaterial color="#c43a28" roughness={.55} /></mesh>
    {[[-.06, .04], [.05, -.03], [.02, .06], [-.04, -.05]].map(([dx, dz], i) =>
      <mesh key={i} position={[.95 + dx, 1.33, .52 + dz]} rotation={[.2, i, .4]}><cylinderGeometry args={[.035, .035, .09, 8]} /><meshStandardMaterial color="#f0d8b8" roughness={.75} /></mesh>
    )}
    <Sign title={SHOP.name} subtitle={SHOP.english} at={[0, 2.85, .1]} yaw={0} near={16} />
    {(highQuality || lanternLit > .05) && <pointLight position={[0, 2.1, .4]} color="#f6d4a0" intensity={4 + 6 * lanternLit} distance={7} decay={2} />}
  </group>;
}
export const World = memo(function World({ reducedMotion, highQuality, day }: { reducedMotion: boolean; highQuality: boolean; day: DayCycle }) {
  const lanternLit = day.lantern;
  return <group>
    <SunsetSky day={day} />
    <hemisphereLight color={day.hemiSky} groundColor={day.hemiGround} intensity={day.hemi} />
    <directionalLight position={day.sunPos} color={day.sunColor} intensity={day.sun} castShadow={highQuality} shadow-mapSize={[1024, 1024]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} shadow-camera-far={120} shadow-bias={-.0003} shadow-normalBias={.08} />
    {day.glow > .12 && <directionalLight position={[day.sunPos[0] * .4, Math.max(4, day.sunPos[1] * .35), day.sunPos[2] * .4]} color="#f0c49a" intensity={.28 * day.glow} />}
    {day.nightness > .35 && <ambientLight color="#2a3a48" intensity={.22 + day.nightness * .2} />}
    {day.nightness > .45 && <directionalLight position={[-day.sunPos[0] * .5, 40, -day.sunPos[2] * .35]} color="#c8d4e8" intensity={.18 + day.nightness * .16} />}
    <Terrain />
    <Box at={[0, -.16, 2]} size={[33, .18, 36]} material={materials.stone} />
    <Box at={[0, -.14, -18]} size={[7, .2, 18]} material={materials.stone} />
    <Box at={[0, -.14, 22]} size={[7, .2, 6]} material={materials.stone} />
    <Box at={[-18, -.14, 0]} size={[6, .2, 7]} material={materials.stone} />
    <Box at={[18, -.14, 2]} size={[6, .2, 7]} material={materials.stone} />
    <Box at={[-10, -.14, 12]} size={[5, .2, 8]} material={materials.stone} />
    {Array.from({ length: 9 }, (_, i) => <Box key={i} at={[-14 + i * 3.5, -.045, 6]} size={[.025, .01, 28]} color="#a5aa95" shadow={false} />)}
    <Water x={0} z={-6} w={13} d={8} reducedMotion={reducedMotion} />
    <CourtyardBridge lanternLit={lanternLit} reducedMotion={reducedMotion} highQuality={highQuality} />
    <Forest reducedMotion={reducedMotion} highQuality={highQuality} />
    <Birds reducedMotion={reducedMotion} highQuality={highQuality} />
    {(['yoga', 'spa', 'floating', 'tea'] as const).map(id => <Pavilion key={id} id={id} lit={lanternLit} reducedMotion={reducedMotion} />)}
    <CampfireYard reducedMotion={reducedMotion} highQuality={highQuality} />
    <OnsenYard reducedMotion={reducedMotion} lanternLit={lanternLit} highQuality={highQuality} />
    <ShopStall lanternLit={lanternLit} highQuality={highQuality} />
    <Furnishings reducedMotion={reducedMotion} highQuality={highQuality} lanternLit={lanternLit} />
    <SaunaCabin reducedMotion={reducedMotion} />
    <EntranceGate />
    {/* Courtyard edge lamps */}
    {[-1, 1].flatMap((side, si) => (side === 1 ? [-16, 20] : [-16, 10, 20]).map((z, zi) => <HorongPole key={`${side}-${z}`} at={[side * 6, 0, z]} lit={lanternLit} phase={si + zi * 1.4} reducedMotion={reducedMotion} highQuality={highQuality} />))}
    {([[-11, 9], [11, 9], [-9, -12], [9, -12]] as const).map(([hx, hz], i) =>
      <HorongPole key={`horong-${hx}-${hz}`} at={[hx, 0, hz]} lit={lanternLit} phase={i * 1.4} reducedMotion={reducedMotion} highQuality={highQuality} />
    )}
    {/* Spa approach street lamps — courtyard path only; keep cushion seats clear. */}
    {([[16.5, -8], [16.5, 2], [16.5, 10]] as const).map(([hx, hz], i) =>
      <HorongPole key={`spa-lamp-${hx}-${hz}`} at={[hx, 0, hz]} lit={lanternLit} phase={2.1 + i * .7} reducedMotion={reducedMotion} highQuality={highQuality} street />
    )}
    {/* Yoga approach street lamps — courtyard side only, not inside the pavilion. */}
    {([[-16.5, -8], [-16.5, 0], [-16.5, 8]] as const).map(([hx, hz], i) =>
      <HorongPole key={`yoga-lamp-${hx}-${hz}`} at={[hx, 0, hz]} lit={lanternLit} phase={3.4 + i * .7} reducedMotion={reducedMotion} highQuality={highQuality} street />
    )}
    {/* Floating hall approach — one street 호롱 on the south path. */}
    <HorongPole at={[2.4, 0, -22]} lit={lanternLit} phase={4.8} reducedMotion={reducedMotion} highQuality={highQuality} street />
    {/* Tea approach — both flanks only; keep the center gate/door path clear. */}
    {([-1, 1] as const).flatMap((side, si) => ([[4.8, 19], [5.2, 22]] as const).map(([x, z], i) =>
      <HorongPole key={`tea-lamp-${side}-${z}`} at={[side * x, 0, z]} lit={lanternLit} phase={5.2 + si + i} reducedMotion={reducedMotion} highQuality={highQuality} street />
    ))}
    <pointLight position={[-5.5, 2.8, 20.5]} color="#ffd6a0" intensity={4.5 * lanternLit} distance={11} decay={1.55} />
    <pointLight position={[5.5, 2.8, 20.5]} color="#ffd6a0" intensity={4.5 * lanternLit} distance={11} decay={1.55} />
    <Sign title="REVERN" subtitle="잠시, 나에게 돌아오는 시간" at={[9, 1.7, 21]} yaw={-.35} />
    <Box at={[9, .7, 21]} size={[.12, 1.4, .12]} material={materials.wood} />
    {[-1, 1].map(side => <group key={side}>
      <Box at={[side * 19, .7, 25]} size={[8, 1.4, .55]} material={materials.plaster} />
      <Box at={[side * 19, 1.45, 25]} size={[8.2, .12, .7]} material={materials.roof} />
    </group>)}
    <pointLight position={[33, 3.2, 0]} color="#f8c284" intensity={(6 + 10 * lanternLit) * (highQuality ? 1 : .75)} distance={18} decay={1.5} />
  </group>;
});
