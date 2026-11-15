import { useEffect, useState } from 'react';
import { MEDITATION, SLOTS, TEA_BOOKS, TEA_LIBRARY, TEA_QUOTES, TEAS, ZONES, type TeaId, teaById } from '../shared/world';
import { SHOP } from '../shared/shop';
import { audio } from './audio';
import { guide } from './guide';
import { FLOATING_MUSIC } from './music';
import { network, useSpace } from './network';
import { HudMenu, RoomHud } from './RoomHud';

type MeditationControls = { started: boolean; playing: boolean; elapsed: number; subtitles: boolean; error: string; onToggle: () => void; onEnd: () => void; onLeave: () => void };
export function RestInteraction({ meditation, onOpenMap, musicError, onEnableMusic }: { meditation: MeditationControls; onOpenMap: () => void; musicError?: string; onEnableMusic?: () => void }) {
  const { snapshot, id, connection } = useSpace();
  const self = snapshot?.players.find(p => p.id === id);
  const [pickedSlot, setPickedSlot] = useState<string | null>(null);
  const [tea, setTea] = useState<TeaId>('green'), [teaPoured, setTeaPoured] = useState(false);
  const [bookId, setBookId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [quote, setQuote] = useState('');
  if (!self) return null;
  const zone = self.zone, connected = connection === 'connected';
  if (zone === 'courtyard') {
    if (Math.hypot(self.x - SHOP.x, self.z - SHOP.z) <= SHOP.reach) return null;
    return <RoomHud label="숲의 중정 체험" className="courtyard-hud"><div className="hud-main"><span className="hud-status">천천히 둘러보세요 · 버튼으로 대나무길을 따라 노천탕에 들어갈 수 있어요</span>
      <button className="primary" disabled={!connected} onClick={event => { guide.active = true; network.send({ type: 'enter-onsen-path' }); event.currentTarget.blur(); }}>노천탕으로 가기</button>
      <button className="secondary" onClick={onOpenMap}>공간 둘러보기</button>
    </div></RoomHud>;
  }
  if (zone !== 'floating' && zone !== 'tea') return null;
  const slots = SLOTS.filter(slot => slot.zone === zone);
  const occupied = slots.filter(slot => snapshot?.occupancy[slot.id]).length;
  const nearTea = zone === 'tea' && !self.slot
    ? slots.filter(s => !snapshot?.occupancy[s.id] && Math.hypot(self.x - s.x, self.z - s.z) <= 2.6).sort((a, b) => Math.hypot(self.x - a.x, self.z - a.z) - Math.hypot(self.x - b.x, self.z - b.z))[0]
    : undefined;
  const nearLibrary = zone === 'tea' && Math.hypot(self.x - TEA_LIBRARY.x, self.z - TEA_LIBRARY.z) <= TEA_LIBRARY.reach;
  const reserve = () => {
    if (zone === 'tea') {
      if (nearTea) network.send({ type: 'reserve', slot: nearTea.id });
      return;
    }
    const chosen = pickedSlot ?? slots.find(slot => !snapshot?.occupancy[slot.id])?.id;
    if (chosen) network.send({ type: 'reserve', slot: chosen });
  };
  useEffect(() => {
    if (zone !== 'tea') return;
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat || !connected || document.querySelector('[role="dialog"]') || (e.target as HTMLElement).matches('input,textarea,select')) return;
      if (self.slot) network.send({ type: 'release' });
      else if (nearTea) network.send({ type: 'reserve', slot: nearTea.id });
      else return;
      e.preventDefault(); (document.activeElement as HTMLElement)?.blur();
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [zone, self.slot, nearTea?.id, connected]);
  useEffect(() => {
    if (zone !== 'tea') return;
    if (nearLibrary) return;
    setBookId(null); setPage(0); setQuote('');
  }, [zone, nearLibrary]);
  const slotMenu = <HudMenu label="자리 선택"><span className="hud-menu-title">{zone === 'floating' ? '튜브' : '좌석'} · {slots.length - occupied}자리 비어 있어요</span><div className="hud-slots" role="group" aria-label="자리 선택">{slots.map((slot, i) => {
    const owner = snapshot?.occupancy[slot.id];
    return <button key={slot.id} aria-label={`${zone === 'floating' ? '튜브' : '좌석'} ${i + 1}${owner ? ' 이용 중' : ' 비어 있음'}`} data-slot={slot.id} aria-pressed={pickedSlot === slot.id} disabled={!!owner || !connected} onClick={() => setPickedSlot(slot.id)}>{String(i + 1).padStart(2, '0')}</button>;
  })}</div></HudMenu>;
  if (zone === 'floating') {
    const stage = Math.min(4, Math.floor(meditation.elapsed / 120));
    const elapsed = `${Math.floor(meditation.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(meditation.elapsed % 60).toString().padStart(2, '0')}`;
    return <RoomHud label={self.slot ? '플로팅 휴식 중' : '플로팅 홀 체험'} className="floating-hud">
      <div className="hud-main"><span className="hud-status">{self.slot ? '튜브 위에서 쉬는 중' : pickedSlot ? `${slots.findIndex(slot => slot.id === pickedSlot) + 1}번 튜브 선택됨` : '빈 튜브에서 쉬어가세요'}</span>
        <button className={self.slot ? 'secondary' : 'primary'} disabled={!connected || !self.slot && occupied === slots.length} onClick={event => { if (self.slot) meditation.onLeave(); else reserve(); event.currentTarget.blur(); }}>{self.slot ? '내려오기' : '튜브 위에 눕기'}</button>
      </div>
      {!self.slot ? <div className="hud-controls">{slotMenu}</div> : <>
        <div className="hud-controls"><button className="primary" disabled={!connected || meditation.elapsed >= 600} onClick={event => { meditation.onToggle(); event.currentTarget.blur(); }}>{meditation.playing ? '일시정지' : meditation.started ? meditation.elapsed >= 600 ? '휴식 완료' : '음악 이어듣기' : '클래식 듣기'}</button>{meditation.started && <button className="secondary hud-icon" aria-label="음악 종료" title="음악 종료" onClick={meditation.onEnd}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="1" fill="currentColor" /></svg></button>}</div>
        {meditation.started && <div className="hud-progress" role="progressbar" aria-label="개인 명상 진행" aria-valuemin={0} aria-valuemax={600} aria-valuenow={Math.floor(meditation.elapsed)} aria-valuetext={`${elapsed}, ${MEDITATION[stage].title}`}><i style={{ width: `${meditation.elapsed / 6}%` }} /><span>{elapsed} / 10:00</span></div>}
        <HudMenu label="휴식 안내"><span className="hud-menu-title">{meditation.started ? MEDITATION[stage].title : '나만의 10분'}</span>{meditation.subtitles && <p>{meditation.started ? MEDITATION[stage].text : '잔잔한 피아노와 함께 편안히 쉬어가세요.'}</p>}<small>{FLOATING_MUSIC.koreanTitle} · 에릭 사티<br /><a href={FLOATING_MUSIC.performerUrl} target="_blank" rel="noreferrer">{FLOATING_MUSIC.performer}</a> · <a href={FLOATING_MUSIC.licenseUrl} target="_blank" rel="noreferrer">{FLOATING_MUSIC.license}</a></small></HudMenu>
      </>}
      {meditation.error && <p className="hud-error" role="alert">{meditation.error}</p>}
    </RoomHud>;
  }
  const busy = self.activity === 'pouring' || self.activity === 'drinking';
  const teaName = teaById(tea)?.name ?? '차';
  const seated = !!self.slot?.startsWith('tea-');
  const canRead = nearLibrary;
  const book = canRead ? TEA_BOOKS.find(b => b.id === bookId) : undefined;
  const drawQuote = () => setQuote(TEA_QUOTES[Math.floor(Math.random() * TEA_QUOTES.length)]!);
  const openBook = (id: string) => { setBookId(id); setPage(0); setQuote(''); };
  return <RoomHud label={seated ? '다실에서 쉬는 중' : `${ZONES.tea.name} 체험`} className={`tea-hud ${busy ? 'tea-busy' : ''}`}>
    {seated && <div className="tea-menu" role="group" aria-label="차 메뉴">
      {TEAS.map(t => <button key={t.id} type="button" className={tea === t.id ? 'tea-chip selected' : 'tea-chip'} aria-pressed={tea === t.id} disabled={busy || !connected} onClick={() => { setTea(t.id); setTeaPoured(false); }}>
        <span className="tea-swatch" style={{ background: t.color }} aria-hidden="true" />{t.name}
      </button>)}
    </div>}
    <div className="hud-main">
      <span className="hud-status" role="status">{
        book ? `${book.title} · ${page + 1}/${book.pages.length}`
          : quote && canRead ? '오늘의 한 줄'
            : self.activity === 'pouring' ? `${teaName}를 따르고 있어요`
              : self.activity === 'drinking' ? `${teaName}를 천천히 음미해요`
                : seated ? `${teaName} 한 잔의 여유`
                  : nearTea ? '빈 자리가 가까워요'
                    : nearLibrary ? '책장 앞에서 골라 읽으세요'
                      : '자리나 책장 가까이로 걸어가세요'
      }</span>
      {(seated || nearTea) && <button className={seated ? 'secondary' : 'primary'} disabled={!connected} aria-keyshortcuts="E" onClick={event => { if (seated) { network.send({ type: 'release' }); setBookId(null); setQuote(''); } else reserve(); event.currentTarget.blur(); }}>{seated ? '일어나기' : '앉기'}<kbd aria-hidden="true">E</kbd></button>}
    </div>
    {canRead && quote && !book && <p className="tea-quote" role="status">“{quote}”</p>}
    {book && <p className="tea-quote" role="status">{book.pages[page]}</p>}
    {seated && !busy && !book && <div className="hud-controls">
      <button className="secondary" disabled={!connected} onClick={event => { network.send({ type: 'pour', tea }); audio.effect('pour'); setTeaPoured(true); event.currentTarget.blur(); }}>{teaName} 따르기</button>
      <button className="primary" disabled={!connected || !teaPoured} onClick={event => { network.send({ type: 'drink', drink: tea }); audio.effect('sip'); event.currentTarget.blur(); }}>차 마시기</button>
    </div>}
    {canRead && !book && <div className="hud-controls">
      <button className="secondary" onClick={event => { drawQuote(); event.currentTarget.blur(); }}>명언 뽑기</button>
      <HudMenu label="책 읽기">
        <span className="hud-menu-title">다실 문고</span>
        {TEA_BOOKS.map(b => <button key={b.id} onClick={() => openBook(b.id)}>{b.title}<small>{b.author}</small></button>)}
      </HudMenu>
    </div>}
    {book && <div className="hud-controls">
      <button className="secondary" disabled={page <= 0} onClick={() => setPage(p => Math.max(0, p - 1))}>이전</button>
      <button className="secondary" disabled={page >= book.pages.length - 1} onClick={() => setPage(p => Math.min(book.pages.length - 1, p + 1))}>다음</button>
      <button className="primary" onClick={() => setBookId(null)}>덮기</button>
    </div>}
    {musicError && onEnableMusic && <p className="hud-error" role="status">{musicError}<button onClick={onEnableMusic}>음악 켜기</button></p>}
  </RoomHud>;
}
