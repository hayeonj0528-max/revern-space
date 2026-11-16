import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './room.js';
import type { ClientMessage } from '../shared/world.js';

export function createSpaceServer(options: { capacity?: number; graceMs?: number } = {}) {
  const room = new Room(options.capacity ?? Number(process.env.MAX_CLIENTS || 12), options.graceMs ?? Number(process.env.RECONNECT_GRACE_MS || 15000));
  const root = resolve('dist');
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.json': 'application/json' };
  const http = createServer(async (req, res) => {
    if (req.url === '/api/health') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, connected: room.snapshot().count, capacity: room.capacity })); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('파일을 찾을 수 없습니다. 개발 중이라면 http://localhost:5173 에 접속해 주세요.'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  http.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    const allow = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    let valid = !origin;
    if (origin) { try { valid = allow.length > 0 ? allow.includes(origin) : new URL(origin).host === req.headers.host; } catch { valid = false; } }
    if (req.url !== '/ws' || !valid) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', ws => {
    let id: string | undefined; let messages = 0; let windowAt = Date.now();
    alive.set(ws, true); ws.on('pong', () => alive.set(ws, true));
    const send = (data: object) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
    const timeout = setTimeout(() => { if (!id) ws.close(4001, '입장이 필요합니다.'); }, 10000);
    ws.on('message', raw => {
      const now = Date.now(); if (now - windowAt > 1000) { windowAt = now; messages = 0; }
      if (++messages > 80) { ws.close(4008, '요청이 너무 많습니다.'); return; }
      try {
        const data = JSON.parse(raw.toString()) as ClientMessage;
        if (!data || typeof data !== 'object' || typeof data.type !== 'string') throw new Error('올바르지 않은 메시지입니다.');
        if (!id) {
          if (data.type !== 'join') throw new Error('먼저 입장해 주세요.');
          const { session, rejoined } = room.join(data, send); id = session.player.id; clearTimeout(timeout);
          send({ type: 'welcome', id, token: session.token });
          send({ type: 'chat', messages: room.chatMessages() });
          broadcast();
          if (!rejoined) broadcastChat();
        } else {
          room.handle(id, data);
          if (data.type === 'leave') { broadcastChat(); broadcast(); ws.close(1000); }
          else if (data.type === 'chat') broadcastChat();
          else if (data.type !== 'move') broadcast();
        }
      } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : '요청을 처리할 수 없습니다.' }); }
    });
    ws.on('error', () => ws.terminate());
    ws.on('close', () => { clearTimeout(timeout); if (id) { room.disconnect(id); broadcast(); } });
  });
  function broadcast() { const message = JSON.stringify(room.snapshot()); for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(message); }
  function broadcastChat() { const message = JSON.stringify({ type: 'chat', messages: room.chatMessages() }); for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(message); }
  let last = Date.now(); let frame = 0;
  const tick = setInterval(() => { const now = Date.now(); room.tick((now - last) / 1000, now); last = now; if (++frame % 2 === 0) broadcast(); }, 1000 / 30);
  const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!alive.get(ws)) { ws.terminate(); continue; } alive.set(ws, false); ws.ping(); } }, 5000);
  return { http, room, wss, close: () => new Promise<void>(done => { clearInterval(tick); clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate(); wss.close(); http.close(() => done()); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createSpaceServer();
  const port = Number(process.env.PORT || 2567); const host = process.env.HOST || '0.0.0.0';
  app.http.listen(port, host, () => console.log(`REVERN server · http://localhost:${port} · WebSocket /ws · capacity ${app.room.capacity}`));
  process.on('SIGTERM', async () => { await app.close(); process.exit(0); });
  process.on('SIGINT', async () => { await app.close(); process.exit(0); });
}
