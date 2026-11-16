import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HAIRS, OUTFITS, SKINS, isTea, teaById, type Player } from '../shared/world';
import { groundHeightAt } from '../shared/spa';
import { yogaFrame } from '../shared/yoga';
import { angleDelta, movementYaw } from '../shared/locomotion';
import { network } from './network';
import { labelTexture } from './materials';
import { motion } from './controls';

type PoseSample = { time: number; x: number; z: number; yaw: number; slot: string | null };
/** Spa → swimsuit, sauna → 찜질복, elsewhere → chosen outfit. */
function attireFor(zone: Player['zone'], activity: Player['activity']) {
  if (zone === 'sauna') return 'sauna' as const;
  if (zone === 'spa' || zone === 'onsen' || activity === 'bathing') return 'swim' as const;
  return 'casual' as const;
}
export function Avatar({ player, self = false, guide = false, reducedMotion = false, hideNames = false }: { player: Player; self?: boolean; guide?: boolean; reducedMotion?: boolean; hideNames?: boolean }) {
  const root = useRef<THREE.Group>(null!), body = useRef<THREE.Group>(null!), upper = useRef<THREE.Group>(null!);
  const leftArm = useRef<THREE.Group>(null!), rightArm = useRef<THREE.Group>(null!), leftLeg = useRef<THREE.Group>(null!), rightLeg = useRef<THREE.Group>(null!);
  const leftKnee = useRef<THREE.Group>(null!), rightKnee = useRef<THREE.Group>(null!);
  const ladle = useRef<THREE.Group>(null!);
  const marshmallow = useRef<THREE.Group>(null!);
  const marshmallowMat = useRef<THREE.MeshStandardMaterial>(null!);
  const name = useRef<THREE.Sprite>(null!), cup = useRef<THREE.Group>(null!), pot = useRef<THREE.Group>(null!);
  const nameMap = useMemo(() => labelTexture(guide ? '요가 가이드' : player.nickname, guide ? '안내 캐릭터 · 방문객 수 제외' : '', true), [player.nickname, guide]);
  const casual = OUTFITS[player.appearance.outfit], skin = SKINS[player.appearance.skin], hair = HAIRS[player.appearance.hair];
  const attire = attireFor(player.zone, player.activity);
  // Swimsuit: deep teal. 찜질복: soft pink set (classic jjimjilbang).
  const top = attire === 'sauna' ? '#e8a0b8' : attire === 'swim' ? '#2c6b78' : casual;
  const arm = attire === 'swim' ? skin : top;
  const thigh = attire === 'sauna' ? '#f0c8d4' : attire === 'swim' ? '#245a66' : '#e0dbcc';
  const calf = attire === 'sauna' ? '#f0c8d4' : attire === 'swim' ? skin : '#e0dbcc';
  const shoe = attire === 'sauna' ? '#e8a0b8' : attire === 'swim' ? skin : '#c7bca6';
  const initialPosition = useRef<[number, number, number]>([player.x, groundHeightAt(player.x, player.z), player.z]);
  const samples = useRef<PoseSample[]>([]), walkPhase = useRef(0), walkWeight = useRef(0);
  const pRef = useRef(player); pRef.current = player;
  useFrame(({ clock, camera }, dt) => {
    const p = pRef.current, t = clock.elapsedTime, speed = 1 - Math.exp(-dt * 16);
    const state = network.getState();
    const lying = p.activity === 'lying';
    const hammock = !!p.slot?.startsWith('hammock');
    const massage = !!p.slot?.startsWith('massage');
    const seated = p.activity === 'sitting' || p.activity === 'sauna' || p.activity === 'roasting' || !!(p.slot?.startsWith('tea') || p.slot?.startsWith('spa') || p.slot?.startsWith('camp') || massage);
    root.current.visible = !self || (!motion.firstPerson && motion.cameraDistance > .9);
    let x = p.x, z = p.z, yaw = p.yaw;
    if (self) { x = motion.position.x; z = motion.position.z; yaw = p.slot ? p.yaw : motion.facingYaw; }
    else if (!guide) {
      // Interpolate position and heading on the same server timeline. Separate
      // rotation damping would make a walking avatar slide sideways through turns.
      const time = state.snapshot?.now ?? Date.now(), poses = samples.current;
      const previous = poses.at(-1);
      if (!previous || previous.time !== time) {
        if (previous && (Math.hypot(p.x - previous.x, p.z - previous.z) > 3 || previous.slot !== p.slot)) poses.length = 0;
        poses.push({ time, x: p.x, z: p.z, yaw: p.yaw, slot: p.slot });
      }
      const renderTime = Date.now() + state.clockOffset - 100;
      while (poses.length > 2 && poses[1].time <= renderTime) poses.shift();
      const a = poses[0], b = poses[1] ?? a;
      const alpha = a === b ? 1 : THREE.MathUtils.clamp((renderTime - a.time) / (b.time - a.time), 0, 1);
      x = THREE.MathUtils.lerp(a.x, b.x, alpha); z = THREE.MathUtils.lerp(a.z, b.z, alpha);
      yaw = a.yaw + angleDelta(a.yaw, b.yaw) * alpha;
    }
    const travelled = Math.hypot(x - root.current.position.x, z - root.current.position.z);
    if (!self && !guide && !p.slot && travelled > .000001 && travelled < 1) yaw = movementYaw(x - root.current.position.x, z - root.current.position.z);
    // Hammock: settle into the net sag (~0.65); tube floating uses ground level.
    root.current.position.set(x, groundHeightAt(x, z) + (hammock ? .68 : 0), z);
    root.current.rotation.y = yaw;
    const walking = !p.slot && (self ? motion.walking : !guide && travelled > .000001 && travelled < 1);
    if (walking) walkPhase.current += Math.min(travelled, .4) * 2.8;
    walkWeight.current = THREE.MathUtils.lerp(walkWeight.current, walking ? 1 : 0, speed);
    if (hammock) {
      const breathe = reducedMotion ? 0 : Math.sin(t * .7 + p.x) * .012;
      body.current.rotation.set(-Math.PI / 2 + .08, 0, 0);
      body.current.position.set(0, .18 + breathe, .08);
    } else {
      body.current.rotation.set(lying ? -Math.PI / 2 : massage ? -.42 : 0, 0, 0);
      body.current.position.set(0, lying ? .7 + (reducedMotion ? 0 : Math.sin(t * .65 + p.x) * .025) : seated ? (massage ? -.08 : -.25) : 0, lying ? .75 : massage ? .12 : 0);
    }
    upper.current.rotation.set(0, 0, 0);
    let la = 0, ra = 0, lx = 0, rx = 0, leg = seated ? Math.PI / 2 : 0;
    const stride = Math.sin(walkPhase.current) * walkWeight.current;
    if (!seated && !lying && p.activity !== 'yoga') { lx = -stride * .45; rx = -lx; leg = stride * .55; body.current.position.y += Math.abs(stride) * .025; }
    leftLeg.current.rotation.set(leg, 0, 0); rightLeg.current.rotation.set(seated ? leg : -leg, 0, 0);
    leftKnee.current.rotation.x = rightKnee.current.rotation.x = seated ? -Math.PI / 2 : 0;
    if (walking) { leftKnee.current.rotation.x = -Math.max(0, stride) * .65; rightKnee.current.rotation.x = -Math.max(0, -stride) * .65; }
    if (hammock) {
      // Soft cradle: bent knees, arms resting on the torso.
      leftLeg.current.rotation.set(.42, .08, .06);
      rightLeg.current.rotation.set(.42, -.08, -.06);
      leftKnee.current.rotation.x = -.7;
      rightKnee.current.rotation.x = -.7;
      lx = .55; rx = .55; la = .25; ra = -.25;
      upper.current.rotation.set(.04, 0, 0);
    }
    if (p.activity === 'yoga') {
      const { pose } = yogaFrame(Date.now() + state.clockOffset, state.snapshot?.yogaStartedAt ?? Date.now());
      body.current.position.y = pose.bodyY;
      upper.current.rotation.set(pose.spineX, 0, pose.spineZ);
      lx = pose.leftArmX; la = pose.leftArmZ; rx = pose.rightArmX; ra = pose.rightArmZ;
      leftLeg.current.rotation.set(pose.leftLegX, pose.leftLegY, pose.leftLegZ);
      rightLeg.current.rotation.set(pose.rightLegX, pose.rightLegY, pose.rightLegZ);
      leftKnee.current.rotation.x = pose.leftKnee; rightKnee.current.rotation.x = pose.rightKnee;
    }
    if (massage) { lx = .5; la = .62; rx = .5; ra = -.62; leftKnee.current.rotation.x = rightKnee.current.rotation.x = -.85; }
    if (p.activity === 'drinking') { rx = 2.2 + Math.sin(t * 2) * .07; ra = -.2; }
    if (p.activity === 'pouring') { rx = 1.4; ra = -.35; lx = 1.1; }
    if (p.activity === 'roasting' || p.marshmallow === 'ready') {
      // Reach the stick forward toward the nearby fire.
      rx = p.activity === 'roasting' ? 1.55 : 1.25;
      ra = p.activity === 'roasting' ? -.15 : -.22;
      lx = .35;
    }
    leftArm.current.rotation.set(lx, 0, la); rightArm.current.rotation.set(rx, 0, ra);
    const hasTea = isTea(p.drink);
    cup.current.visible = p.activity === 'drinking' || p.activity === 'pouring' && hasTea; pot.current.visible = p.activity === 'pouring' && hasTea;
    ladle.current.visible = p.activity === 'pouring' && p.zone === 'sauna';
    if (cup.current.visible) {
      const mat = (cup.current.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.color.set(p.drink === 'sikhye' ? '#d5b56a' : teaById(p.drink)?.color ?? '#e2d9bf');
    }
    const showMallow = p.marshmallow === 'roasting' || p.marshmallow === 'ready';
    marshmallow.current.visible = showMallow;
    if (showMallow && marshmallowMat.current) {
      const target = p.marshmallow === 'ready' ? '#c48a4a' : '#f3e6c8';
      marshmallowMat.current.color.lerp(new THREE.Color(target), 1 - Math.exp(-dt * 1.6));
    }
    if (p.activity === 'bathing' || p.activity === 'sauna' || massage) upper.current.rotation.x = Math.sin(t * .8) * .012;
    name.current.visible = !self && !hideNames && camera.position.distanceTo(root.current.position) < 22;
    root.current.scale.setScalar(p.connected ? 1 : .94);
  });
  const sphere = (position: [number, number, number], scale: [number, number, number], color: string) => <mesh position={position} scale={scale} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={color} roughness={.85} /></mesh>;
  return <group ref={root} name={`avatar:${player.id}`} position={initialPosition.current}>
    <group ref={body}>
      {sphere([0, .81, 0], attire === 'swim' ? [.24, .12, .17] : [.27, .18, .19], top)}
      <group ref={upper} position={[0, .82, 0]}>
        {sphere([0, .3, 0], attire === 'swim' ? [.24, .28, .15] : [.27, .38, .17], top)}
        {sphere([0, .79, 0], [.205, .235, .195], skin)}
        {sphere([0, .92, .035], [.215, .15, .19], hair)}
        {sphere([-.072, .82, -.177], [.015, .018, .015], '#453b30')}
        {sphere([.072, .82, -.177], [.015, .018, .015], '#453b30')}
        {sphere([0, .74, -.19], [.022, .009, .008], '#b77e6c')}
        <group ref={leftArm} name="left-arm" position={[-.28, .52, 0]}>{sphere([0, -.2, 0], [.09, .29, .09], arm)}{sphere([0, -.49, 0], [.069, .1, .065], skin)}</group>
        <group ref={rightArm} name="right-arm" position={[.28, .52, 0]}>
          {sphere([0, -.2, 0], [.09, .29, .09], arm)}{sphere([0, -.49, 0], [.069, .1, .065], skin)}
          <group ref={ladle} position={[0, -.53, -.08]}><mesh position={[0, -.12, 0]}><cylinderGeometry args={[.018, .022, .4, 8]} /><meshStandardMaterial color="#ad8559" /></mesh>{sphere([0, -.35, 0], [.115, .055, .1], '#bd976e')}</group>
          <group ref={marshmallow} visible={false} position={[0, -.52, -.12]} rotation={[1.25, 0, 0]}>
            <mesh position={[0, -.38, 0]}><cylinderGeometry args={[.012, .015, .95, 6]} /><meshStandardMaterial color="#8a6a45" /></mesh>
            <mesh position={[0, -.88, 0]} scale={[.085, .095, .085]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial ref={marshmallowMat} color="#f3e6c8" roughness={.9} /></mesh>
          </group>
          <group ref={cup} position={[0, -.55, -.08]} rotation={[Math.PI / 2, 0, 0]}><mesh><cylinderGeometry args={[.075, .055, .12, 16]} /><meshStandardMaterial color={teaById(player.drink)?.color ?? (player.drink === 'sikhye' ? '#d5b56a' : '#e2d9bf')} /></mesh></group>
        </group>
        {player.towel && <group position={[0, .96, 0]}>
          {sphere([0, 0, 0], [.23, .1, .21], '#eee6d5')}
          {[-1, 1].map(side => <mesh key={side} position={[side * .23, -.025, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[.09, .055, 10, 20]} /><meshStandardMaterial color="#f4ecdd" roughness={1} /></mesh>)}
        </group>}
        <group ref={pot} position={[-.23, .28, -.35]} rotation={[.4, 0, -.45]}>{sphere([0, 0, 0], [.12, .1, .12], '#6c7659')}<mesh position={[.12, .04, 0]} rotation={[0, 0, -.9]}><cylinderGeometry args={[.025, .04, .17, 12]} /><meshStandardMaterial color="#6c7659" /></mesh></group>
      </group>
      <group ref={leftLeg} name="left-leg" position={[-.12, .77, 0]}>{sphere([0, -.18, 0], attire === 'swim' ? [.1, .16, .1] : [.11, .23, .11], thigh)}<group ref={leftKnee} position={[0, attire === 'swim' ? -.28 : -.36, 0]}>{sphere([0, -.14, 0], [.09, .2, .09], calf)}{sphere([0, -.31, -.045], [.1, .07, .16], shoe)}</group></group>
      <group ref={rightLeg} name="right-leg" position={[.12, .77, 0]}>{sphere([0, -.18, 0], attire === 'swim' ? [.1, .16, .1] : [.11, .23, .11], thigh)}<group ref={rightKnee} position={[0, attire === 'swim' ? -.28 : -.36, 0]}>{sphere([0, -.14, 0], [.09, .2, .09], calf)}{sphere([0, -.31, -.045], [.1, .07, .16], shoe)}</group></group>
    </group>
    <sprite ref={name} position={[0, 2.2, 0]} scale={guide ? [1.9, .64, 1] : [1.1, .32, 1]}><spriteMaterial map={nameMap} transparent depthTest={false} /></sprite>
  </group>;
}
