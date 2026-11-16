import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Scene } from './Scene';
import { network, useSpace } from './network';
import { audio } from './audio';
import { FLOATING_MUSIC, SPA_MUSIC, TEA_MUSIC } from './music';
import { dayCycle, type DayCycle } from './dayCycle';
import { YogaInteraction } from './YogaInteraction';
import { SpaInteraction } from './SpaInteraction';
import { RestInteraction } from './RestInteraction';
import { motion, touchInput } from './controls';
import { HAIRS, OUTFITS, SKINS, ZONES, ZONE_IDS, type Appearance, type ZoneId } from '../shared/world';
import { randomNickname } from '../shared/nicknames';
import { CampfireInteraction } from './CampfireInteraction';
import { OnsenInteraction } from './OnsenInteraction';
import { ShopInteraction } from './ShopInteraction';
import { ChatPanel } from './ChatPanel';
import { guide } from './guide';

type IconName = 'sound' | 'mute' | 'map' | 'people' | 'close' | 'arrow' | 'leaf' | 'eye' | 'settings' | 'pause' | 'play' | 'chat';
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    sound: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    mute: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m16 9 5 6m0-6-5 6" /></>,
    map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16" /></>,
    people: <><circle cx="9" cy="7" r="3" /><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 6" /></>,
    chat: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 10h8M8 13h5" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    leaf: <><path d="M20 3C6 2 2 8 5 15c6 6 15 1 15-12Z" /><path d="M3 21 15 9" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    play: <path d="m8 4 12 8-12 8V4Z" />
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    document.dispatchEvent(new Event('revern:ui'));
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') { const list = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,[tabindex="0"]'); if (!list?.length) return; const first = list[0], last = list[list.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    window.addEventListener('keydown', key); return () => { window.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'wide' : ''}`}><div className="modal-heading"><div><span className="eyebrow">REVERN SPACE</span><h2>{title}</h2></div><button className="icon-button" aria-label="닫기" onClick={onClose}><Icon name="close" /></button></div>{children}</div></div>;
}
function Joystick() {
  const [knob, setKnob] = useState([0, 0]); const origin = useRef([0, 0]);
  const reset = () => { touchInput.x = touchInput.z = 0; setKnob([0, 0]); };
  useEffect(() => reset, []);
  return <div className="joystick" role="group" aria-label="터치 이동 조이스틱" onPointerDown={e => { e.preventDefault(); origin.current = [e.clientX, e.clientY]; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; let x = e.clientX - origin.current[0], y = e.clientY - origin.current[1]; const ratio = Math.max(1, Math.hypot(x, y) / 30); x /= ratio; y /= ratio; touchInput.x = x / 30; touchInput.z = y / 30; setKnob([x, y]); }} onPointerUp={reset} onPointerCancel={reset} onLostPointerCapture={reset}><span style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} /><small>이동</small></div>;
}

export function App() {
  const space = useSpace(); const self = space.snapshot?.players.find(p => p.id === space.id); const joined = !!self;
  const zone: ZoneId = self?.zone ?? 'courtyard';
  const [ready, setReady] = useState(false), [firstPerson, setFirstPerson] = useState(false), [fps, setFps] = useState(0);
  const [nickname, setNickname] = useState(() => randomNickname()), [appearance, setAppearance] = useState<Appearance>({ skin: 0, hair: 0, outfit: 0 });
  const [modal, setModal] = useState<'map' | 'sound' | 'visitors' | 'help' | null>(null), [mapZone, setMapZone] = useState<ZoneId>('courtyard');
  const [chatOpen, setChatOpen] = useState(false), [chatSeen, setChatSeen] = useState(0);
  const chatUnread = Math.max(0, space.chat.length - chatSeen);
  const [muted, setMuted] = useState(false), [volume, setVolume] = useState(.35), [background, setBackground] = useState(true), [subtitles, setSubtitles] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches), [highQuality, setHighQuality] = useState(() => !matchMedia('(pointer:coarse)').matches);
  const [audioReady, setAudioReady] = useState(false), [musicError, setMusicError] = useState(''), [spaMusicError, setSpaMusicError] = useState('');
  const [day, setDay] = useState<DayCycle>(() => dayCycle());
  const inSpa = joined && (zone === 'spa' || zone === 'sauna');
  const softPiano = joined && (zone === 'spa' || zone === 'sauna' || zone === 'tea');
  const softTrack = zone === 'tea' ? TEA_MUSIC : SPA_MUSIC;
  const [meditating, setMeditating] = useState(false), [meditationStarted, setMeditationStarted] = useState(false), [meditationElapsed, setMeditationElapsed] = useState(0);
  const onReady = useCallback(() => setReady(true), []), onStats = useCallback((n: number) => setFps(n), []), closeModal = useCallback(() => setModal(null), []);
  useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.code === 'KeyV' && !e.repeat && joined && !(e.target as HTMLElement).matches('input,select,textarea')) setFirstPerson(p => !p); if (e.key === 'Escape') document.exitPointerLock?.(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [joined]);
  useEffect(() => {
    const tick = () => {
      const next = dayCycle();
      setDay(next);
      audio.setDayPart(next.nightness);
    };
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => { audio.configure({ muted, volume, background }); }, [muted, volume, background]);
  useEffect(() => { audio.setZone(zone); }, [zone]);
  useEffect(() => {
    let active = true;
    if (softPiano && audioReady && space.connection === 'connected') {
      setSpaMusicError('');
      audio.setSoftTrack(softTrack.src);
      void audio.playSpaMusic().then(ok => { if (active && !ok) setSpaMusicError('음악을 시작하려면 아래 버튼을 눌러 주세요.'); });
    } else audio.pauseSpaMusic(true);
    return () => { active = false; audio.pauseSpaMusic(true); };
  }, [softPiano, softTrack.src, zone, audioReady, space.connection]);

  useEffect(() => {
    if (!meditating) return;
    let last = performance.now();
    const timer = setInterval(() => { const now = performance.now(); setMeditationElapsed(t => Math.min(600, t + (now - last) / 1000)); last = now; }, 250);
    return () => clearInterval(timer);
  }, [meditating]);
  useEffect(() => {
    let active = true;
    if (meditating) {
      setMusicError('');
      void audio.playMusic().then(ok => {
        if (active && !ok) { setMusicError('음악을 재생할 수 없어요. 연결 상태를 확인하고 다시 눌러 주세요.'); setMeditating(false); }
      });
    } else audio.pauseMusic();
    return () => { active = false; audio.pauseMusic(); };
  }, [meditating]);
  useEffect(() => { if (meditationElapsed >= 600) setMeditating(false); }, [meditationElapsed]);
  useEffect(() => { if (self?.activity !== 'lying' || space.connection !== 'connected') { setMeditating(false); if (self?.activity !== 'lying') { setMeditationStarted(false); setMeditationElapsed(0); audio.pauseMusic(true); } } }, [self?.activity, space.connection]);
  // Tube rest faces the ceiling — drop into first person when lying down.
  useEffect(() => { if (self?.activity === 'lying') setFirstPerson(true); }, [self?.activity]);
  useEffect(() => { if (!space.error || space.connection !== 'connected') return; const timer = setTimeout(() => network.clearError(), 5500); return () => clearTimeout(timer); }, [space.error, space.connection]);
  const enter = async (e: React.FormEvent) => { e.preventDefault(); if (!nickname.trim()) return; const ok = await audio.unlock(); setAudioReady(ok); audio.setZone('courtyard'); network.join(nickname.trim(), appearance); };
  const toggleView = () => { setFirstPerson(v => !v); (document.activeElement as HTMLElement)?.blur(); };
  const openMap = () => { setMapZone(zone); setModal('map'); };
  const openChat = () => { setChatOpen(true); setChatSeen(space.chat.length); setModal(null); };
  useEffect(() => { if (chatOpen) setChatSeen(space.chat.length); }, [chatOpen, space.chat.length]);
  useEffect(() => { if (!joined) { setChatOpen(false); setChatSeen(0); } }, [joined]);
  const endMeditation = () => { setMeditating(false); setMeditationStarted(false); setMeditationElapsed(0); audio.pauseMusic(true); };
  const leave = () => { endMeditation(); audio.stop(); network.leave(); setModal(null); motion.initialized = false; motion.position.set(ZONES.courtyard.spawn[0], 0, ZONES.courtyard.spawn[1]); motion.yaw = 0; motion.facingYaw = 0; setFirstPerson(false); };
  const connected = space.connection === 'connected';
  const activityName = (activity: string) => ({ idle: '쉬는 중', walking: '걷는 중', yoga: '요가 중', sitting: '앉아 쉬는 중', lying: '튜브 위에서 쉬는 중', drinking: '마시는 중', pouring: '물 따르는 중', bathing: '탕에서 쉬는 중', sauna: '찜질 중', roasting: '마시멜로 굽는 중' }[activity] ?? activity);
  const mapLabel = (id: ZoneId) => ({ courtyard: '중정', yoga: '호흡', spa: '스파', sauna: '찜질', floating: '부유', tea: '다실', campfire: '불멍', onsen: '노천' }[id]);
  const mapBody: Record<ZoneId, string> = {
    courtyard: '수공간과 숲으로 열린 넓은 정원. 바람이 지나는 길을 천천히 걸어보세요.',
    yoga: '넉넉한 매트 위에서 빈 매트 가까이에서 앉으면 다양한 요가 동작에 함께할 수 있어요. 서쪽 벽에는 바디프렌드 전신 마사지기 두 대가 있어요.',
    spa: '따로 마련된 온탕과 냉탕의 계단으로 걸어 들어가 몸을 쉬게 하세요. 곁의 목재 문은 핀란드 사우나로 연결됩니다.',
    sauna: '목재 단 벤치와 돌 히터가 있는 핀란드식 공간. 벤치에 앉아 쉬거나 돌 위에 물을 부어 부드러운 증기를 만들어 보세요.',
    floating: '물 위에 누워 클래식을 들으며, 나에게 묻는 100문 100답으로 천천히 쉬어보세요. 답은 누구에게도 보이지 않아요.',
    tea: '정원이 내다보이는 자리에 앉아, 따뜻한 차를 따르고 음미하세요.',
    campfire: '장작불 곁 통나무에 앉아 마시멜로를 굽거나, 적은 내용은 누구에게도 보이지 않는 고민을 불에 남겨 두세요.',
    onsen: '대나무길을 따라 들어가면 도착하는 숲속 탕. ‘노천탕으로 가기’를 누르면 길을 따라 천천히 걸어가 따뜻한 물에 입수합니다.'
  };
  return <main className={`${joined ? 'entered' : 'entrance'} ${joined && day.uiNight ? 'night' : ''} ${reducedMotion ? 'reduced-motion' : ''} ${self?.activity === 'yoga' ? 'yoga-active' : ''} ${self?.activity === 'sauna' ? 'sauna-active' : ''} ${zone === 'sauna' ? 'sauna-room' : ''}`}>
    <audio ref={audio.bindMusic} data-revern-music="floating" src={FLOATING_MUSIC.src} preload="none" loop />
    <audio ref={audio.bindSpaMusic} data-revern-spa-music="spa" src={softTrack.src} preload="none" loop />
    <div className="scene" aria-label="REVERN 한옥 웰니스 3D 공간"><Scene firstPerson={firstPerson} reducedMotion={reducedMotion} highQuality={highQuality} joined={joined} hideNames={meditating || self?.activity === 'yoga' || self?.activity === 'sauna'} day={day} onReady={onReady} onStats={onStats} /></div>
    <div className="scene-shade" />
    <header className="header"><button className="brand" aria-label={joined ? '공간 안내 열기' : 'REVERN SPACE'} onClick={() => joined && setModal('help')}><span className="brand-word">REVERN<span className="brand-dot">®</span></span><span className="brand-sub">S P A C E</span></button>
      {joined && <><div className="location"><span className="location-line" /><div><span className="eyebrow">{ZONES[zone].english}</span><span className="location-name">{ZONES[zone].name}</span></div></div><nav className="toolbar" aria-label="공간 도구"><button className="presence" onClick={() => setModal('visitors')} aria-label={`실제 접속자 ${space.snapshot?.count ?? 0}명`}><span className={`status-dot ${connected ? 'online' : ''}`} /><Icon name="people" /><span>{space.snapshot?.count ?? 0}<small> / {space.snapshot?.capacity ?? 24}</small></span></button><button className={`icon-button chat-button${chatUnread && !chatOpen ? ' has-unread' : ''}`} aria-label={chatUnread && !chatOpen ? `함께 나누는 말, 새 메시지 ${chatUnread}개` : '함께 나누는 말'} title="함께 나누는 말" onClick={openChat}><Icon name="chat" />{chatUnread > 0 && !chatOpen && <span className="chat-badge" aria-hidden="true">{chatUnread > 9 ? '9+' : chatUnread}</span>}</button><button className="icon-button" aria-label="소리와 화면 설정" title="소리와 화면 설정" onClick={() => setModal('sound')}><Icon name={muted ? 'mute' : 'sound'} /></button><button className="icon-button map-button" aria-label="공간 지도" onClick={openMap}><Icon name="map" /><span>공간 지도</span></button></nav></>}
      {!joined && <span className="header-note"><span className="status-dot online" /> A QUIET PLACE TO RETURN</span>}
    </header>
    {!ready && <div className="loading" role="status"><span className="loading-ring" />숲과 빛을 준비하고 있어요</div>}
    {!joined && ready && <div className="welcome-layout"><div className="welcome-caption"><span className="eyebrow">A HANOK WELLNESS RETREAT</span><span>숲과 한옥 사이,<br />오롯이 머무는 쉼.</span><div className="caption-rule" /><small>걷고 · 숨 쉬고 · 비워내는 시간</small></div><section className="welcome-panel"><span className="eyebrow">WELCOME TO REVERN SPACE</span><h1>잠시,<br />나에게 돌아오는 시간</h1><p>바람이 머무는 한옥에서<br />당신만의 속도로 쉬어가세요.</p><form onSubmit={enter}><label className="field-label" htmlFor="nickname">닉네임 <span>최대 12자</span></label><div className="nickname-row"><input id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={12} placeholder="원하면 바꿔도 괜찮아요" autoComplete="nickname" required /><button type="button" className="secondary nickname-reroll" onClick={() => setNickname(randomNickname())} aria-label="닉네임 다시 뽑기">다시 뽑기</button></div>
      <div className="appearance"><div className="mini-avatar" style={{ '--skin': SKINS[appearance.skin], '--hair': HAIRS[appearance.hair], '--outfit': OUTFITS[appearance.outfit] } as CSSProperties}><i /><b /></div><div className="swatch-fields">{([{ key: 'skin', label: '피부', colors: SKINS }, { key: 'hair', label: '헤어', colors: HAIRS }, { key: 'outfit', label: '의상', colors: OUTFITS }] as const).map(row => <fieldset key={row.key}><legend>{row.label}</legend>{row.colors.map((color, i) => <button type="button" key={color + i} className={`swatch ${appearance[row.key] === i ? 'selected' : ''}`} aria-label={`${row.label} ${i + 1}`} aria-pressed={appearance[row.key] === i} style={{ backgroundColor: color }} onClick={() => setAppearance(a => ({ ...a, [row.key]: i }))} />)}</fieldset>)}</div></div>
      <button className="primary enter-button" disabled={space.connection === 'connecting' || space.connection === 'reconnecting'} type="submit"><span>{space.connection === 'connecting' || space.connection === 'reconnecting' ? '공간에 연결하고 있어요' : '들어가기'}</span><Icon name="arrow" /></button>
      {space.error && <p className="form-error" role="alert">{space.error}</p>}<small className="welcome-hint">다른 방문객과 함께하는 공간입니다.<br />소리는 입장 후 언제든 조절할 수 있어요.</small></form></section></div>}
    {!joined && <footer className="entrance-footer"><span>REVERN — REST, AND RETURN TO YOURSELF.</span><span>한옥 웰니스 리트리트</span></footer>}
    {joined && <>
      <div className="view-toggle" role="group" aria-label="시점 전환"><button aria-pressed={!firstPerson} onClick={() => { if (firstPerson) toggleView(); }}>3인칭</button><button aria-pressed={firstPerson} onClick={() => { if (!firstPerson) toggleView(); }}>1인칭</button><kbd>V</kbd></div>
      {space.connection !== 'connected' && <div className="connection-banner" role="alert"><span className="status-dot" />{space.connection === 'error' ? '연결을 복구하지 못했어요.' : '재연결 중 · 자리를 최대 15초 보존해요.'}<button onClick={() => network.retry()}>다시 연결</button></div>}
      {space.error && connected && <div className="toast" role="status">{space.error}<button onClick={() => network.clearError()} aria-label="알림 닫기"><Icon name="close" size={16} /></button></div>}
      {zone === 'yoga' && <YogaInteraction />}
      {inSpa && <SpaInteraction musicError={spaMusicError} onEnableMusic={async () => { setAudioReady(await audio.unlock()); setSpaMusicError(await audio.playSpaMusic() ? '' : '음악 파일을 재생할 수 없어요. 다시 시도해 주세요.'); }} />}
      {zone === 'campfire' && <CampfireInteraction />}
      {zone === 'onsen' && <OnsenInteraction />}
      {zone === 'courtyard' && <ShopInteraction />}
      {zone !== 'yoga' && !inSpa && zone !== 'campfire' && zone !== 'onsen' && <RestInteraction key={zone} onOpenMap={openMap} musicError={zone === 'tea' ? spaMusicError : undefined} onEnableMusic={zone === 'tea' ? async () => { setAudioReady(await audio.unlock()); setSpaMusicError(await audio.playSpaMusic() ? '' : '음악 파일을 재생할 수 없어요. 다시 시도해 주세요.'); } : undefined} meditation={{ started: meditationStarted, playing: meditating, elapsed: meditationElapsed, subtitles, error: musicError, onToggle: async () => { setAudioReady(await audio.unlock()); setMeditationStarted(true); setMeditating(value => !value); }, onEnd: endMeditation, onLeave: () => { endMeditation(); network.send({ type: 'release' }); } }} />}
      <div className="movement-help"><div><kbd>W</kbd><br /><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>천천히 걷기<br /><small>드래그로 둘러보기 · V 시점</small></span></div><Joystick /><div className="mobile-look-hint">오른쪽을 드래그해 둘러보세요</div>
      <footer className="experience-footer"><button onClick={() => setModal('help')}>이용 안내</button><span className="ambient-label"><span className="sound-bars"><i /><i /><i /></span>{muted || !background ? '고요한 시간' : zone === 'floating' ? '물 위의 고요' : zone === 'tea' || inSpa ? '잔잔한 피아노' : '숲의 소리'}</span><span className="quality-label">{fps ? `${fps} fps` : 'REVERN SPACE'}</span></footer>
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </>}
    {modal === 'map' && <Modal title="마음이 향하는 곳으로" onClose={closeModal} wide><p className="modal-intro">회랑을 따라 걸어가거나, 공간을 선택해 바로 이동하세요.</p><div className="map-layout"><div className="garden-map"><div className="map-path horizontal" /><div className="map-path vertical" />{ZONE_IDS.map(id => <button className={`map-node map-${id} ${mapZone === id ? 'selected' : ''}`} key={id} aria-label={`${ZONES[id].name} 선택`} aria-pressed={mapZone === id} onClick={() => setMapZone(id)}><span>{mapLabel(id)}</span><strong>{ZONES[id].name}</strong><small>{zone === id ? '현재 머무는 곳' : `${space.snapshot?.players.filter(p => p.connected && p.zone === id).length ?? 0}명 머무는 중`}</small></button>)}<span className="map-north">N ↑</span></div><div className="map-detail"><span className="eyebrow">{ZONES[mapZone].english}</span><h3>{ZONES[mapZone].name}</h3><p>{ZONES[mapZone].subtitle}</p><p className="map-detail-body">{mapBody[mapZone]}</p><button className="primary" disabled={!connected} onClick={() => { endMeditation(); if (mapZone === 'onsen') { guide.active = true; network.send({ type: 'enter-onsen-path' }); } else { guide.active = false; network.send({ type: 'travel', zone: mapZone }); } closeModal(); }}>{mapZone === 'onsen' ? '대나무길로 노천탕 입수' : '이 공간으로 이동'}<Icon name="arrow" size={17} /></button><small>{mapZone === 'onsen' ? '대나무길을 따라 걸어가 탕에 들어갑니다.' : '이용 중인 자리는 이동하면 비워집니다.'}</small></div></div></Modal>}
    {modal === 'sound' && <Modal title="나에게 편안한 설정" onClose={closeModal}><div className="settings-row"><label htmlFor="mute">전체 음소거</label><input id="mute" type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} /></div><div className="settings-row"><label htmlFor="volume">음량 <small>{Math.round(volume * 100)}%</small></label><input id="volume" type="range" min="0" max="1" step=".05" value={volume} onChange={e => setVolume(Number(e.target.value))} /></div><div className="settings-row"><label htmlFor="background">환경음과 음악</label><input id="background" type="checkbox" checked={background} onChange={e => setBackground(e.target.checked)} /></div><p className="settings-hint">스파·사우나·다실에 들어가면 잔잔한 피아노가 흐릅니다. 플로팅에서는 클래식 듣기로 시작하세요.<br />플로팅·스파·사우나: {FLOATING_MUSIC.title} — {FLOATING_MUSIC.composer}<br />다실: {TEA_MUSIC.title} — {TEA_MUSIC.composer}<br />연주: <a href={FLOATING_MUSIC.performerUrl} target="_blank" rel="noreferrer">{FLOATING_MUSIC.performer}</a> · <a href={FLOATING_MUSIC.licenseUrl} target="_blank" rel="noreferrer">{FLOATING_MUSIC.license}</a> / <a href={TEA_MUSIC.performerUrl} target="_blank" rel="noreferrer">{TEA_MUSIC.performer}</a></p><div className="settings-row"><label htmlFor="subtitles">휴식 안내 글</label><input id="subtitles" type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)} /></div><div className="settings-row"><label htmlFor="motion">움직임 줄이기</label><input id="motion" type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} /></div><div className="settings-row"><label htmlFor="quality">그림자 · 수면 반사 (무거움)</label><input id="quality" type="checkbox" checked={highQuality} onChange={e => setHighQuality(e.target.checked)} /></div><p className="settings-hint">화면 선명도는 기기에 맞춰 항상 유지됩니다. 이 옵션은 그림자·반사만 켭니다.</p><p className="settings-hint">{audioReady ? '환경음 재생이 활성화되어 있습니다.' : '소리를 시작하려면 아래 버튼을 눌러 주세요.'}</p><button className="secondary" onClick={async () => { setAudioReady(await audio.unlock()); audio.setZone(zone); }}>소리 활성화</button></Modal>}
    {modal === 'visitors' && <Modal title="함께 머무는 사람들" onClose={closeModal}><p className="modal-intro">현재 실제로 연결된 방문객 {space.snapshot?.count ?? 0}명<br /><small>요가 안내 캐릭터는 접속자 수에 포함하지 않습니다.</small></p><ul className="visitor-list">{space.snapshot?.players.map(p => <li key={p.id} data-player={p.nickname} data-x={p.x.toFixed(2)} data-z={p.z.toFixed(2)}><span className="visitor-color" style={{ background: OUTFITS[p.appearance.outfit] }} /><div><strong>{p.nickname}{p.id === space.id ? ' (나)' : ''}</strong><small>{ZONES[p.zone].name} · {activityName(p.activity)}{p.towel ? ' · 양머리' : ''}</small></div><span className={`status-dot ${p.connected ? 'online' : ''}`} title={p.connected ? '접속 중' : '재접속 대기 중'} /></li>)}</ul><p className="settings-hint">연결이 끊기면 15초간 자리를 보존한 후 자동으로 비웁니다.</p></Modal>}
    {modal === 'help' && <Modal title="편안히 머무는 방법" onClose={closeModal}><div className="help-copy"><p><strong>걷기</strong> WASD 또는 방향키. 모바일은 왼쪽 조이스틱을 사용하세요. 이동 방향에 맞춰 시선도 함께 돌아갑니다. 대나무길에서는 A/D로 옆으로만 움직일 수 있어요.</p><p><strong>둘러보기</strong> 화면을 드래그하세요. PC에서는 화면을 두 번 클릭하면 마우스가 고정되고, Esc로 해제됩니다.</p><p><strong>시점 전환</strong> 오른쪽의 1인칭·3인칭 버튼 또는 V 키. 앉거나 누워 있는 중에도 바꿀 수 있어요.</p><p><strong>체험</strong> 요가는 빈 매트 가까이에서 앉기 버튼이나 E 키로 참여하세요. 다른 공간은 빈자리를 선택해 이용하세요. 지도에서 바로 이동할 수도 있어요.</p><p><strong>숲속 매점</strong> 중정 동쪽에 라면·맥반석 계란·식혜·핫바·떡볶이가 있어요. 메타버스 후원(체험) 또는 카카오톡 송금 버튼으로 바로 후원할 수 있습니다.</p><p><strong>함께 나누는 말</strong> 상단 말풍선 버튼으로 짧은 인사와 댓글을 나눌 수 있어요.</p><p><strong>나만의 명상</strong> 각자의 속도로 음악을 듣고 편안히 쉬어가세요.</p></div><button className="secondary" onClick={leave}>공간에서 나가기</button></Modal>}
  </main>;
}
