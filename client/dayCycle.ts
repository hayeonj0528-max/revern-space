export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

export type DayCycle = {
  phase: DayPhase;
  /** 0 = full day, 1 = full night */
  nightness: number;
  /** Courtyard lantern fill 0…1 */
  lantern: number;
  /** Sunset / sunrise glow strength 0…1 (peaks mid-dusk / mid-dawn) */
  glow: number;
  hemi: number;
  sun: number;
  hemiSky: string;
  hemiGround: string;
  sunColor: string;
  sunPos: [number, number, number];
  fog: string;
  background: string;
  exposure: number;
  /** Horizon band colors for the sky dome */
  horizon: string;
  zenith: string;
  /** UI night chrome when true */
  uiNight: boolean;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function smooth(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mixHex(a: string, b: string, t: number) {
  const parse = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const A = parse(a), B = parse(b);
  const c = A.map((v, i) => Math.round(v + (B[i]! - v) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Set to a clock hour (e.g. 12) to preview that time of day; `null` follows the real local clock. */
export const PREVIEW_HOUR: number | null = null;

/** Local-clock day/night blend. Soft dusk through the evening; full night after ~20:30. */
export function dayCycle(date = new Date()): DayCycle {
  if (PREVIEW_HOUR != null) {
    date = new Date(date);
    date.setHours(PREVIEW_HOUR, 0, 0, 0);
  }
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  let nightness = 0;
  // 16:30→20:30 gradual dusk (18:45 ≈ soft evening, not midnight); night after 20:30.
  if (h >= 16.5 && h < 20.5) nightness = smooth(16.5, 20.5, h);
  else if (h >= 20.5 || h < 5.5) nightness = 1;
  else if (h >= 5.5 && h < 7.5) nightness = 1 - smooth(5.5, 7.5, h);

  const evening = h >= 12 || h < 4;
  const phase: DayPhase =
    nightness >= .85 ? 'night'
      : nightness >= .2 ? (evening ? 'dusk' : 'dawn')
        : 'day';

  const lantern = clamp01((nightness - .18) / .45);
  const day = 1 - nightness;
  // Soft peak around mid-dusk / mid-dawn — capped so it stays gentle, not blood-red
  const glow = nightness > 0 && nightness < .92 ? Math.pow(Math.sin(nightness * Math.PI), 1.15) * .62 : 0;

  const hemiSky = mixHex(mixHex('#e7eddb', '#e8c9a4', glow * .55), '#1a2a32', nightness);
  const hemiGround = mixHex(mixHex('#6e7562', '#5a5548', glow * .35), '#1c2220', nightness);
  const sunColor = mixHex(mixHex('#ffedcc', '#f0c48a', glow * .85), '#3a4a68', Math.max(0, nightness - .4) / .6);
  const fog = mixHex(mixHex('#dce3d0', '#d4c2a8', glow * .55), '#0f1c22', nightness);
  const background = mixHex(mixHex('#dce3d0', '#d8c4a8', glow * .55), '#0c161c', nightness);
  const horizon = mixHex(mixHex('#c8d0b8', '#e8b88a', glow * .75), '#1a2430', Math.max(0, nightness - .15));
  const zenith = mixHex(mixHex('#dce3d0', '#8a9098', glow * .35), '#0a1218', nightness);

  // Sun sinks west (positive X) as evening progresses
  const sunY = 2 + 52 * Math.max(0.02, day * day);
  const sunX = evening ? (-20 + nightness * 95) : (60 - nightness * 95);
  const sunZ = evening ? (18 - nightness * 55) : (-10 + nightness * 40);

  return {
    phase,
    nightness,
    lantern,
    glow,
    hemi: .35 + 1.25 * day + .22 * glow,
    sun: .12 + 2.2 * day + .45 * glow * (1 - nightness * .35),
    hemiSky,
    hemiGround,
    sunColor,
    sunPos: [sunX, sunY, sunZ],
    fog,
    background,
    exposure: .7 + .35 * day + .12 * glow,
    horizon,
    zenith,
    uiNight: nightness >= .42
  };
}
