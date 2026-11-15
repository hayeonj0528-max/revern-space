import { useEffect, useState } from 'react';
import { SLOTS } from '../shared/world';
import { bathAt, nearBathEntry, SAUNA } from '../shared/spa';
import { audio } from './audio';
import { network, useSpace } from './network';
import { HudMenu, RoomHud } from './RoomHud';

export function SpaInteraction({ musicError, onEnableMusic }: { musicError: string; onEnableMusic: () => void }) {
  const { snapshot, id, connection, clockOffset } = useSpace();
  const self = snapshot?.players.find(p => p.id === id);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  const connected = connection === 'connected', sauna = self?.zone === 'sauna';
  const bath = self?.zone === 'spa' ? bathAt(self.x, self.z) : undefined;
  const entry = self && !self.slot && !bath && !sauna ? nearBathEntry(self.x, self.z) : undefined;
  const bench = self && sauna && !self.slot ? SLOTS.filter(s => s.kind === 'sauna-bench' && !snapshot?.occupancy[s.id] && Math.hypot(self.x - s.x, self.z - s.z) <= 3).sort((a, b) => Math.hypot(self.x - a.x, self.z - a.z) - Math.hypot(self.x - b.x, self.z - b.z))[0] : undefined;
  const heater = !!self && sauna && !self.slot && Math.hypot(self.x - SAUNA.heater[0], self.z - SAUNA.heater[1]) <= SAUNA.reach;
  const steamBusy = !!snapshot?.saunaSteamStartedAt && now + clockOffset - snapshot.saunaSteamStartedAt < SAUNA.steamCooldown;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat || !connected || !self || document.querySelector('[role="dialog"]') || (e.target as HTMLElement).matches('input,textarea,select')) return;
      if (self.slot) network.send({ type: 'release' });
      else if (bath) network.send({ type: 'exit-bath' });
      else if (entry) network.send({ type: 'enter-bath', bath: entry.id });
      else if (bench) network.send({ type: 'join-sauna' });
      else if (heater && !steamBusy) network.send({ type: 'sauna-steam' });
      else return;
      e.preventDefault(); (document.activeElement as HTMLElement)?.blur();
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [self?.slot, self?.zone, bath?.id, entry?.id, bench?.id, heater, steamBusy, connected]);
  if (!self) return null;
  const towel = <button disabled={!connected} aria-pressed={self.towel} onClick={event => { network.send({ type: 'towel' }); event.currentTarget.blur(); }}>{self.towel ? '양머리 벗기' : '양머리 착용'}</button>;
  const drink = <button disabled={!connected || self.activity === 'drinking'} onClick={event => { network.send({ type: 'drink', drink: 'sikhye' }); audio.effect('sip'); event.currentTarget.blur(); }}>{self.activity === 'drinking' ? '식혜 마시는 중' : '식혜 마시기'}</button>;
  const tools = <HudMenu label="휴식 도구">{towel}{drink}{!self.slot && <button disabled={!connected} onClick={() => { const seat = SLOTS.find(s => s.zone === 'spa' && !snapshot?.occupancy[s.id]); if (seat) network.send({ type: 'reserve', slot: seat.id }); }}>앉아 쉬기</button>}</HudMenu>;
  // Sauna: keep 양머리 as a direct button (not buried in a menu) so it is always one tap away on the bench.
  const musicRetry = musicError && <p className="hud-error" role="status">{musicError}<button onClick={onEnableMusic}>음악 켜기</button></p>;
  const stand = () => { network.send({ type: 'release' }); (document.activeElement as HTMLElement)?.blur(); };
  if (bath || self.slot) return <RoomHud label={bath ? `${bath.name} 이용 중` : sauna ? '사우나 찜질 중' : '스파 휴식 중'} className="spa-hud">
    <div className="hud-main"><span className="hud-status">{bath ? `${bath.name}에서 쉬는 중` : sauna ? '벤치에서 찜질 중' : '스파에서 쉬는 중'}</span><button className="primary" disabled={!connected} aria-keyshortcuts="E" onClick={event => { if (bath) network.send({ type: 'exit-bath' }); else stand(); event.currentTarget.blur(); }}>{bath ? '탕에서 나오기' : sauna ? '찜질 끝내기' : '일어나기'}<kbd aria-hidden="true">E</kbd></button></div>
    {!bath && <div className="hud-controls">{sauna ? towel : tools}</div>}{musicRetry}
  </RoomHud>;
  return <RoomHud label={sauna ? '핀란드 사우나 체험' : '스파 체험'} className="spa-hud">
    <div className="hud-main"><span className="hud-status">{sauna ? bench ? '비어 있는 목재 벤치' : heater ? '돌 위로 부드러운 증기를' : '빈 벤치 가까이로 걸어가세요' : entry ? `${entry.name} 계단 앞` : '탕의 계단으로 걸어 들어가세요'}</span>
      {entry && <button className="primary" disabled={!connected} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'enter-bath', bath: entry.id }); event.currentTarget.blur(); }}>{entry.name} 들어가기<kbd aria-hidden="true">E</kbd></button>}
      {bench && <button className="primary" disabled={!connected} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'join-sauna' }); event.currentTarget.blur(); }}>앉아 찜질하기<kbd aria-hidden="true">E</kbd></button>}
      {heater && <button className="primary" disabled={!connected || steamBusy || self.activity === 'pouring'} aria-keyshortcuts="E" onClick={event => { network.send({ type: 'sauna-steam' }); event.currentTarget.blur(); }}>{steamBusy ? '증기가 퍼지는 중' : '물 한 국자 붓기'}<kbd aria-hidden="true">E</kbd></button>}
    </div><div className="hud-controls">{sauna ? towel : tools}</div>{musicRetry}
  </RoomHud>;
}
