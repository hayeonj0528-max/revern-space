export const CHAT_MAX_LEN = 80;
export const CHAT_HISTORY = 40;
export const CHAT_COOLDOWN_MS = 1200;

export type ChatKind = 'user' | 'system';

export type ChatMessage = {
  id: string;
  at: number;
  playerId: string;
  from: string;
  text: string;
  kind: ChatKind;
};

/** Soft greeting chips for the wellness space. */
export const CHAT_GREETINGS = [
  '안녕하세요',
  '반갑습니다',
  '편히 쉬다 가세요',
  '좋은 하루 되세요',
  '고요한 시간 되세요'
] as const;

export function sanitizeChat(raw: unknown) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
}
