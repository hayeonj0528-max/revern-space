import { useEffect, useState } from 'react';
import { SLOTS } from '../shared/world';
import { audio } from './audio';
import { network, useSpace } from './network';
import { HudMenu, RoomHud } from './RoomHud';

export function CampfireInteraction() {
  const { snapshot, id, connection } = useSpace();
  const self = snapshot?.players.find(p => p.id === id);
  const [worry, setWorry] = useState('');
  const [toast, setToast] = useState('');
  const connected = connection === 'connected';
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  if (!self) return null;
  const logs = SLOTS.filter(s => s.kind === 'log');
  const near = !self.slot ? logs.filter(s => !snapshot?.occupancy[s.id] && Math.hypot(self.x - s.x, self.z - s.z) <= 3).sort((a, b) => Math.hypot(self.x - a.x, self.z - a.z) - Math.hypot(self.x - b.x, self.z - b.z))[0] : undefined;
  const seated = !!self.slot?.startsWith('camp-');
  const roasting = self.activity === 'roasting' || self.marshmallow === 'roasting';
  const ready = self.marshmallow === 'ready';
  const sit = () => { if (near) network.send({ type: 'reserve', slot: near.id }); };
  const burn = () => {
    // Worry text stays local only — never sent to the server.
    setWorry('');
    network.send({ type: 'burn-worry' });
    audio.effect('burn');
    setToast('마음이 조금 가벼워지길');
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat || !connected || document.querySelector('[role="dialog"]') || (e.target as HTMLElement).matches('input,textarea,select')) return;
      if (seated) network.send({ type: 'release' });
      else if (near) sit();
      else return;
      e.preventDefault(); (document.activeElement as HTMLElement)?.blur();
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [seated, near?.id, connected]);
  return <RoomHud label={seated ? '불멍 중' : '불멍 캠프 체험'} className="campfire-hud">
    <div className="hud-main">
      <span className="hud-status">{seated ? roasting ? '마시멜로가 노릇해지는 중' : ready ? '구운 마시멜로가 준비됐어요' : '장작불 곁에 앉아 있어요' : near ? '빈 통나무가 가까워요' : '통나무 가까이로 걸어가세요'}</span>
      {(seated || near) && <button className={seated ? 'secondary' : 'primary'} disabled={!connected} aria-keyshortcuts="E" onClick={event => { if (seated) network.send({ type: 'release' }); else sit(); event.currentTarget.blur(); }}>{seated ? '일어나기' : '통나무에 앉기'}<kbd aria-hidden="true">E</kbd></button>}
    </div>
    {seated && <div className="hud-controls">
      <button className="secondary" disabled={!connected || roasting || ready} onClick={event => { network.send({ type: 'roast' }); audio.effect('crackle'); event.currentTarget.blur(); }}>{roasting ? '굽는 중…' : '마시멜로 굽기'}</button>
      <button className="primary" disabled={!connected || !ready || self.activity === 'drinking'} onClick={event => { network.send({ type: 'eat-marshmallow' }); audio.effect('sip'); event.currentTarget.blur(); }}>{self.activity === 'drinking' ? '맛보는 중' : '먹기'}</button>
    </div>}
    <HudMenu label="고민 내려놓기">
      <span className="hud-menu-title">불에만 남겨 두어요</span>
      <p className="campfire-privacy">적은 내용은 누구에게도 보이지 않고, 불에만 남겨 두어요.</p>
      <textarea
        className="campfire-worry"
        value={worry}
        maxLength={80}
        rows={3}
        placeholder="마음에 남는 한 줄…"
        aria-label="고민 적기"
        onChange={e => setWorry(e.target.value)}
      />
      <button className="primary" disabled={!connected || !worry.trim()} onClick={event => { burn(); event.currentTarget.blur(); }}>불에 태우기</button>
    </HudMenu>
    {toast && <p className="hud-status campfire-toast" role="status">{toast}</p>}
  </RoomHud>;
}
