import { useEffect, useRef, useState } from 'react';
import {
  REFLECTION_INTERVAL_SEC,
  REFLECTION_QUESTIONS,
  shuffleReflectionOrder
} from '../shared/reflection';

type Props = {
  active: boolean;
  playing: boolean;
  sessionKey: number;
};

export function FloatingReflection({ active, playing, sessionKey }: Props) {
  const [order, setOrder] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [saved, setSaved] = useState(0);
  const [hint, setHint] = useState(false);
  const answerRef = useRef('');
  const indexRef = useRef(0);

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (!active) {
      setOrder([]);
      setIndex(0);
      setAnswer('');
      setSaved(0);
      answerRef.current = '';
      return;
    }
    setOrder(shuffleReflectionOrder(sessionKey ^ (Date.now() & 0xffff)));
    setIndex(0);
    setAnswer('');
    setSaved(0);
    answerRef.current = '';
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 5200);
    return () => window.clearTimeout(t);
  }, [active, sessionKey]);

  const goNext = () => {
    if (indexRef.current >= order.length - 1) return;
    if (answerRef.current.trim()) setSaved(n => n + 1);
    setAnswer('');
    answerRef.current = '';
    setIndex(i => Math.min(i + 1, order.length - 1));
  };

  useEffect(() => {
    if (!active || !playing || order.length === 0) return;
    let elapsed = 0;
    const id = window.setInterval(() => {
      elapsed += 1;
      if (elapsed < REFLECTION_INTERVAL_SEC) return;
      elapsed = 0;
      if (indexRef.current >= order.length - 1) return;
      if (answerRef.current.trim()) setSaved(n => n + 1);
      setAnswer('');
      answerRef.current = '';
      setIndex(i => Math.min(i + 1, order.length - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, playing, order.length, index]);

  if (!active || order.length === 0) return null;

  const qIndex = order[index] ?? 0;
  const question = REFLECTION_QUESTIONS[qIndex] ?? '';
  const done = index >= order.length - 1;

  return (
    <aside className="floating-reflection" aria-live="polite">
      <header className="floating-reflection-head">
        <span className="floating-reflection-label">나에게 묻기</span>
        <span className="floating-reflection-count">{index + 1} / {order.length}</span>
      </header>
      <p className="floating-reflection-q">{question}</p>
      <textarea
        className="floating-reflection-answer"
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        rows={2}
        maxLength={280}
        placeholder="마음속으로 답하거나, 여기에만 남겨 두세요"
        aria-label="나만의 답 (서버로 전송되지 않음)"
      />
      <div className="floating-reflection-actions">
        <button type="button" className="secondary" disabled={done} onClick={goNext}>
          {done ? '마지막 질문' : '다음 질문'}
        </button>
        {saved > 0 && <span className="floating-reflection-saved">남긴 답 {saved}</span>}
      </div>
      {hint && (
        <p className="floating-reflection-hint">
          답은 이 기기에서만 잠시 머물고, 누구에게도 보이지 않아요. 음악이 흐르는 동안 질문이 천천히 바뀝니다.
        </p>
      )}
    </aside>
  );
}
