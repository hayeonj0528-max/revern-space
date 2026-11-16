import * as THREE from 'three';

let seed = 47;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function texture(kind: 'wood' | 'stone' | 'roof' | 'plaster') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  // Korean palette: 소나무 timber, granite 기단, blue-grey 청기와, warm 황토 회벽.
  ctx.fillStyle = kind === 'wood' ? '#c9ad82' : kind === 'stone' ? '#aeb2a8' : kind === 'roof' ? '#1e3545' : '#ecc992'; ctx.fillRect(0, 0, 256, 256);
  const count = kind === 'wood' ? 2500 : 9000;
  for (let i = 0; i < count; i++) {
    const x = random() * 256, y = random() * 256;
    ctx.strokeStyle = ctx.fillStyle = `rgba(${random() > .5 ? '255,245,220' : '28,30,26'},${random() * (kind === 'wood' ? .1 : .11)})`;
    if (kind === 'wood') { ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 5, y + 10, x - 4, y + 45, x + 1, y + 90); ctx.stroke(); }
    else ctx.fillRect(x, y, random() * 3 + 1, random() * 2 + 1);
  }
  if (kind === 'roof') for (let x = 0; x < 256; x += 14) {
    // 청기와 rows: cooler blue-grey concave/convex tile rhythm.
    const gradient = ctx.createLinearGradient(x, 0, x + 14, 0); gradient.addColorStop(0, '#152838'); gradient.addColorStop(.45, '#3a556c'); gradient.addColorStop(1, '#1a3040'); ctx.fillStyle = gradient; ctx.fillRect(x, 0, 14, 256);
    for (let y = 0; y < 256; y += 28) { ctx.fillStyle = '#0c162099'; ctx.fillRect(x, y, 14, 2); ctx.fillStyle = '#628098'; ctx.fillRect(x + 6, y + 4, 2, 20); }
  }
  if (kind === 'plaster') for (let i = 0; i < 420; i++) { ctx.fillStyle = `rgba(148,96,48,${.08 + random() * .12})`; ctx.fillRect(random() * 256, random() * 256, 2 + random() * 3, 1 + random()); }
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'wood' ? 2 : kind === 'stone' ? 12 : 4, kind === 'wood' ? 1 : kind === 'stone' ? 12 : 4); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export const materials = {
  // Soft pine / chestnut timber — hanok posts, not lacquer-black shrine wood.
  wood: new THREE.MeshStandardMaterial({ map: texture('wood'), roughness: .8, color: '#c4a882' }),
  darkWood: new THREE.MeshStandardMaterial({ map: texture('wood'), roughness: .84, color: '#6e5340' }),
  stone: new THREE.MeshStandardMaterial({ map: texture('stone'), roughness: .95, color: '#c5c4b6' }),
  plaster: new THREE.MeshStandardMaterial({ map: texture('plaster'), roughness: 1, color: '#f0d9a8' }),
  roof: new THREE.MeshStandardMaterial({ map: texture('roof'), roughness: .74, color: '#243848', side: THREE.DoubleSide }),
  brass: new THREE.MeshStandardMaterial({ color: '#9a8560', roughness: .42, metalness: .55 }),
  // Quiet 단청 accents under eaves — spa-scale, not palace coverage.
  dancheongBlue: new THREE.MeshStandardMaterial({ color: '#2f5d8a', roughness: .88 }),
  dancheongGreen: new THREE.MeshStandardMaterial({ color: '#3d6b4f', roughness: .88 }),
  dancheongRed: new THREE.MeshStandardMaterial({ color: '#a33a2f', roughness: .88 })
};
export function foliageTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 640; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 115; const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * .87;
    ctx.save(); ctx.translate(x, y); ctx.rotate(random() * Math.PI); ctx.fillStyle = ['#7b965b', '#8ba86b', '#6e8d51', '#a3b57a', '#587341'][Math.floor(random() * 5)]; ctx.beginPath(); ctx.ellipse(0, 0, 4 + random() * 5, 2 + random() * 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function bambooCulmTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, '#5f7a3f'); g.addColorStop(.35, '#9bb45a'); g.addColorStop(.55, '#c5d27a'); g.addColorStop(.78, '#8eaa52'); g.addColorStop(1, '#4e6834');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  for (let y = 18; y < 256; y += 28 + Math.floor(random() * 10)) {
    ctx.fillStyle = '#3d5228'; ctx.fillRect(0, y, 64, 3 + random() * 2);
    ctx.fillStyle = 'rgba(230,235,200,.35)'; ctx.fillRect(0, y - 2, 64, 1.5);
    ctx.fillStyle = 'rgba(40,55,25,.25)'; ctx.fillRect(0, y + 4, 64, 2);
  }
  for (let i = 0; i < 80; i++) { ctx.fillStyle = `rgba(255,255,220,${.04 + random() * .06})`; ctx.fillRect(random() * 64, random() * 256, 1, 8 + random() * 20); }
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function bambooLeafTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 28; i++) {
    const x = 20 + random() * 88, y = 16 + random() * 96;
    ctx.save(); ctx.translate(x, y); ctx.rotate((random() - .5) * 1.2);
    const lg = ctx.createLinearGradient(0, -18, 0, 18);
    lg.addColorStop(0, '#c5d98a'); lg.addColorStop(.5, '#6f9448'); lg.addColorStop(1, '#3f5c2c');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(7, 0, 0, 22); ctx.quadraticCurveTo(-7, 0, 0, -20); ctx.fill();
    ctx.strokeStyle = 'rgba(45,60,28,.35)'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 20); ctx.stroke();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function latticeTexture(repeats: number) {
  // Korean 띠살 창호 — denser muntins on warm 한지, not sparse shoji bars.
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 384; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f3e8d4'; ctx.fillRect(0, 0, 256, 384);
  for (let i = 0; i < 1600; i++) { ctx.fillStyle = 'rgba(140,120,90,.045)'; ctx.fillRect(random() * 256, random() * 384, 2, 1); }
  ctx.fillStyle = '#5a4636';
  for (let i = 0; i <= 256; i += 16) ctx.fillRect(i - 1, 0, 2.2, 384);
  for (let j = 0; j <= 384; j += 32) ctx.fillRect(0, j - 1.5, 256, 3);
  ctx.fillStyle = '#3d342c';
  ctx.fillRect(0, 0, 256, 10); ctx.fillRect(0, 374, 256, 10);
  ctx.fillRect(0, 0, 10, 384); ctx.fillRect(246, 0, 10, 384);
  ctx.fillRect(0, 188, 256, 8);
  const t = new THREE.CanvasTexture(canvas); t.wrapS = THREE.RepeatWrapping; t.repeat.x = repeats; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Korean 창호 — warm 한지 paper with 띠살 wooden muntins. */
export function hanjiDoorTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4ebe0'; ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `rgba(170,150,120,${.03 + random() * .05})`;
    ctx.fillRect(random() * 256, random() * 512, 1 + random() * 2, 1);
  }
  // Outer 문선
  ctx.fillStyle = '#5a4636';
  ctx.fillRect(0, 0, 256, 14); ctx.fillRect(0, 498, 256, 14);
  ctx.fillRect(0, 0, 14, 512); ctx.fillRect(242, 0, 14, 512);
  // Mid rail (중방)
  ctx.fillRect(14, 248, 228, 12);
  // Vertical 띠살
  for (let x = 36; x < 230; x += 22) ctx.fillRect(x, 14, 3, 234);
  for (let x = 36; x < 230; x += 22) ctx.fillRect(x, 260, 3, 238);
  // Horizontal 띠살
  for (let y = 40; y < 240; y += 26) ctx.fillRect(14, y, 228, 2.5);
  for (let y = 286; y < 490; y += 26) ctx.fillRect(14, y, 228, 2.5);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function labelTexture(title: string, subtitle = '', dark = false) {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = dark ? '#172b26' : '#f4eee3'; ctx.fillRect(0, 0, 768, 256);
  ctx.strokeStyle = dark ? '#8c9d85' : '#b5aa94'; ctx.lineWidth = 2; ctx.strokeRect(14, 14, 740, 228);
  ctx.textAlign = 'center'; ctx.fillStyle = dark ? '#eee7d4' : '#3a342c';
  const titleSize = title.length > 10 ? 40 : 52;
  ctx.font = `500 ${titleSize}px "Noto Serif KR", Georgia, serif`; ctx.fillText(title, 384, subtitle ? 115 : 149);
  if (subtitle) { ctx.font = '20px "Noto Sans KR", sans-serif'; ctx.fillStyle = dark ? '#bac5b2' : '#7a7366'; ctx.fillText(subtitle, 384, 178); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}
