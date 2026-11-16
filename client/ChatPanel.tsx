import { useEffect, useRef, useState } from 'react';
import { CHAT_GREETINGS, CHAT_MAX_LEN, sanitizeChat } from '../shared/chat';
import { network, useSpace } from './network';

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { chat, id, connection, snapshot } = useSpace();
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const connected = connection === 'connected';
  useEffect(() => {
    if (!open) return;
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const send = (raw: string) => {
    const next = sanitizeChat(raw);
    if (!next || !connected) return;
    network.send({ type: 'chat', text: next });
    setText('');
  };
  return <aside className="chat-panel" role="dialog" aria-label="함께 나누는 말">
    <header className="chat-head">
      <div>
        <span className="eyebrow">QUIET CHAT</span>
        <strong>함께 나누는 말</strong>
        <small>접속자 {snapshot?.count ?? 0}명 · 짧은 인사도 좋아요</small>
      </div>
      <button type="button" className="chat-close" aria-label="닫기" onClick={onClose}>닫기</button>
    </header>
    <div className="chat-list" ref={list} aria-live="polite">
      {chat.length === 0 && <p className="chat-empty">아직 나눈 말이 없어요. 먼저 인사해 보세요.</p>}
      {chat.map(msg => {
        const mine = msg.kind === 'user' && msg.playerId === id;
        return <div key={msg.id} className={`chat-line ${msg.kind}${mine ? ' mine' : ''}`}>
          {msg.kind === 'system' ? <span className="chat-system">{msg.text}</span> : <>
            <span className="chat-from">{mine ? '나' : msg.from}</span>
            <span className="chat-text">{msg.text}</span>
          </>}
        </div>;
      })}
    </div>
    <div className="chat-greetings" role="group" aria-label="빠른 인사">
      {CHAT_GREETINGS.map(g => <button key={g} type="button" disabled={!connected} onClick={() => send(g)}>{g}</button>)}
    </div>
    <form className="chat-compose" onSubmit={e => { e.preventDefault(); send(text); }}>
      <label className="sr-only" htmlFor="chat-input">메시지</label>
      <input id="chat-input" value={text} maxLength={CHAT_MAX_LEN} disabled={!connected} placeholder="짧은 말을 남겨 보세요" autoComplete="off"
        onChange={e => setText(e.target.value)}
        onFocus={() => document.dispatchEvent(new Event('revern:ui'))} />
      <button type="submit" className="primary" disabled={!connected || !sanitizeChat(text)}>보내기</button>
    </form>
  </aside>;
}
