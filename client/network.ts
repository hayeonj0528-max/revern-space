import { useSyncExternalStore } from 'react';
import type { ChatMessage } from '../shared/chat';
import type { Appearance, ClientMessage, Snapshot } from '../shared/world';

type Connection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
type State = { snapshot: Snapshot | null; id: string | null; connection: Connection; error: string; clockOffset: number; chat: ChatMessage[] };
let state: State = { snapshot: null, id: null, connection: 'idle', error: '', clockOffset: 0, chat: [] };
const listeners = new Set<() => void>();
function update(patch: Partial<State>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
let socket: WebSocket | null = null;
let profile: { nickname: string; appearance: Appearance } | null = null;
let token: string | null = null;
let retryTimer: ReturnType<typeof setTimeout>;
let intentional = false;
let retries = 0;
let generation = 0;
let lastMessageAt = 0;
export const network = {
  getState: () => state,
  join(nickname: string, appearance: Appearance) { profile = { nickname, appearance }; intentional = false; retries = 0; this.connect(); },
  connect() {
    if (!profile) return;
    clearTimeout(retryTimer);
    const attempt = ++generation;
    update({ connection: state.id ? 'reconnecting' : 'connecting', error: '' });
    if (!navigator.onLine) { update({ connection: 'reconnecting', error: '인터넷 연결을 기다리고 있어요. 연결 종료 후 15초간 자리를 보존합니다.' }); retryTimer = setTimeout(() => this.connect(), 1500); return; }
    let url = import.meta.env.VITE_WS_URL as string | undefined;
    if (!url) url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    const ws = new WebSocket(url); socket = ws; let welcomed = false;
    const timeout = setTimeout(() => { if (!welcomed) ws.close(); }, 6000);
    ws.addEventListener('open', () => { if (attempt !== generation) return; ws.send(JSON.stringify({ type: 'join', ...profile, ...(token ? { token } : {}) })); });
    ws.addEventListener('message', event => {
      if (attempt !== generation) return;
      let data: any; try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'welcome') { welcomed = true; clearTimeout(timeout); lastMessageAt = Date.now(); token = data.token; retries = 0; update({ id: data.id, connection: 'connected', error: '' }); }
      if (data.type === 'state') { lastMessageAt = Date.now(); update({ snapshot: data, clockOffset: data.now - Date.now() }); }
      if (data.type === 'chat' && Array.isArray(data.messages)) { lastMessageAt = Date.now(); update({ chat: data.messages }); }
      if (data.type === 'error') { update({ error: data.message }); if (!welcomed) { intentional = true; update({ connection: 'error' }); ws.close(); } }
    });
    ws.addEventListener('close', () => {
      clearTimeout(timeout); if (attempt !== generation || intentional) return;
      retries++;
      update({ connection: retries > 12 ? 'error' : 'reconnecting', error: retries > 12 ? '서버에 연결할 수 없어요. 서버 실행 상태를 확인하고 다시 연결해 주세요.' : '연결을 복구하고 있어요. 자리는 연결 종료 후 15초간 보존됩니다.' });
      if (retries <= 12) retryTimer = setTimeout(() => this.connect(), Math.min(1000 + retries * 200, 2500));
    });
    ws.addEventListener('error', () => ws.close());
  },
  send(message: ClientMessage) { if (socket?.readyState === WebSocket.OPEN && state.connection === 'connected') socket.send(JSON.stringify(message)); },
  clearError() { update({ error: '' }); },
  retry() { intentional = false; retries = 0; this.connect(); },
  leave() { intentional = true; ++generation; clearTimeout(retryTimer); this.send({ type: 'leave' }); socket?.close(1000); socket = null; token = null; update({ id: null, snapshot: null, connection: 'idle', error: '', chat: [] }); }
};
export function useSpace() { return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => state); }
window.addEventListener('pagehide', () => network.leave());
window.addEventListener('offline', () => { if (!intentional && profile) socket?.close(4000, 'Network offline'); });
window.addEventListener('online', () => { if (!intentional && profile && state.connection !== 'connected') network.retry(); });
// A half-open socket must not leave a stale scene labelled as connected.
setInterval(() => { if (state.connection === 'connected' && Date.now() - lastMessageAt > 6000) socket?.close(4000, 'Server heartbeat timeout'); }, 1000);

if (import.meta.env.DEV) Object.assign(window, { __REVERN__: { getState: network.getState } });
if (import.meta.hot) import.meta.hot.dispose(() => network.leave());
