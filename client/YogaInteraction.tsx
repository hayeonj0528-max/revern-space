import { useEffect, useState } from 'react';
import { nearbyYogaMat } from '../shared/world';
import { yogaFrame } from '../shared/yoga';
import { network, useSpace } from './network';

export function YogaInteraction() {
  const { snapshot, id, connection, clockOffset } = useSpace();
  const self = snapshot?.players.find(p => p.id === id);
  const active = self?.activity === 'yoga';
  const nearby = self?.zone === 'yoga' && !self.slot && snapshot ? nearbyYogaMat(self.x, self.z, snapshot.occupancy) : undefined;
  const connected = connection === 'connected';
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (active && network.getState().error) network.clearError(); }, [active]);
  useEffect(() => { if (!active) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 150); return () => clearInterval(timer); }, [active]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || !connected || self?.zone !== 'yoga' || document.querySelector('[role="dialog"]') || (event.target as HTMLElement).matches('input,textarea,select')) return;
      if (active || nearby) { event.preventDefault(); network.send({ type: active ? 'release' : 'join-yoga' }); (document.activeElement as HTMLElement)?.blur(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [active, nearby?.id, connected, self?.zone]);
  if (self?.zone !== 'yoga') return null;
  const frame = yogaFrame(now + clockOffset, snapshot?.yogaStartedAt ?? now);
  if (active) return <aside className="yoga-session" aria-label="요가 참여 중">
    <span><small>함께 요가하는 중</small><strong data-yoga-pose={frame.index}>{frame.name}</strong></span>
    <button disabled={!connected} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'release' }); event.currentTarget.blur(); }}>일어나기<kbd aria-hidden="true">E</kbd></button>
  </aside>;
  if (!nearby) return <p className="yoga-walk-hint">빈 매트 가까이로 걸어가 보세요.</p>;
  return <div className="yoga-nearby" aria-label="가까운 빈 매트">
    <span>비어 있는 요가 매트</span>
    <button disabled={!connected} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'join-yoga' }); event.currentTarget.blur(); }}>앉기<kbd aria-hidden="true">E</kbd></button>
  </div>;
}
