import { spawn } from 'node:child_process';
const children = [spawn('node', ['--env-file-if-exists=.env', '--import', 'tsx', '--watch', 'server/index.ts'], { stdio: 'inherit' }), spawn('node', ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; children.forEach(p => p.kill('SIGTERM')); setTimeout(() => process.exit(code), 300).unref(); }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
children.forEach(p => p.on('exit', code => stop(code ?? 1)));
