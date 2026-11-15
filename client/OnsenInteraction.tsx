import { useEffect } from 'react';
import { SLOTS } from '../shared/world';
import { nearOnsenEntry, onsenAt } from '../shared/onsen';
import { guide } from './guide';
import { network, useSpace } from './network';
import { RoomHud } from './RoomHud';

export function OnsenInteraction() {
  const { snapshot, id, connection } = useSpace();
  const self = snapshot?.players.find(p => p.id === id);
  const connected = connection === 'connected';
  if (!self) return null;
  const bath = onsenAt(self.x, self.z);
  const entry = !bath && !self.slot ? nearOnsenEntry(self.x, self.z) : undefined;
  const onHammock = self.slot?.startsWith('hammock-');
  const nearHammock = !self.slot && !bath
    ? SLOTS.filter(s => s.kind === 'hammock' && !snapshot?.occupancy[s.id] && Math.hypot(self.x - s.x, self.z - s.z) <= 3.2)
      .sort((a, b) => Math.hypot(self.x - a.x, self.z - a.z) - Math.hypot(self.x - b.x, self.z - b.z))[0]
    : undefined;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat || !connected || document.querySelector('[role="dialog"]') || (e.target as HTMLElement).matches('input,textarea,select')) return;
      if (onHammock) network.send({ type: 'release' });
      else if (bath) network.send({ type: 'exit-bath' });
      else if (nearHammock) network.send({ type: 'reserve', slot: nearHammock.id });
      else if (entry) network.send({ type: 'enter-bath', bath: 'onsen' });
      else return;
      e.preventDefault(); (document.activeElement as HTMLElement)?.blur();
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onHammock, bath, nearHammock?.id, entry, connected]);
  if (onHammock) return <RoomHud label="그물침대 휴식 중" className="onsen-hud">
    <div className="hud-main"><span className="hud-status">대나무 사이, 그물 위에서 쉬는 중</span><button className="primary" disabled={!connected} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'release' }); event.currentTarget.blur(); }}>일어나기<kbd aria-hidden="true">E</kbd></button></div>
  </RoomHud>;
  if (bath) {
    guide.active = false;
    return <RoomHud label="노천탕 이용 중" className="onsen-hud">
      <div className="hud-main"><span className="hud-status">따뜻한 물에 몸을 맡기는 중</span><button className="primary" disabled={!connected} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'exit-bath' }); event.currentTarget.blur(); }}>탕에서 나오기<kbd aria-hidden="true">E</kbd></button></div>
    </RoomHud>;
  }
  if (guide.active) return <RoomHud label="노천탕으로 가는 중" className="onsen-hud">
    <div className="hud-main"><span className="hud-status">대나무길을 따라 천천히 걸어가고 있어요</span></div>
  </RoomHud>;
  return <RoomHud label="노천탕 체험" className="onsen-hud">
    <div className="hud-main"><span className="hud-status">{nearHammock ? '빈 그물침대가 가까워요' : entry ? '노천탕 계단 앞' : '대나무길을 따라 탕으로 들어가요'}</span>
      {nearHammock && <button className="primary" disabled={!connected} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'reserve', slot: nearHammock.id }); event.currentTarget.blur(); }}>그물침대에 눕기<kbd aria-hidden="true">E</kbd></button>}
      {!nearHammock && entry && <button className="primary" disabled={!connected} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'enter-bath', bath: 'onsen' }); event.currentTarget.blur(); }}>노천탕 들어가기<kbd aria-hidden="true">E</kbd></button>}
      {!nearHammock && !entry && <button className="primary" disabled={!connected} onClick={event => { guide.active = true; network.send({ type: 'enter-onsen-path' }); event.currentTarget.blur(); }}>노천탕으로 가기</button>}
    </div>
  </RoomHud>;
}
