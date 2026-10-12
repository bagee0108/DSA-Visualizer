/**
 * Colour maths for the theme layer. Pure functions, no DOM, so the same code
 * runs in the browser, in the Vite config that writes the theme into
 * index.html, and in the tests that guard it.
 *
 * Two spaces are used, each for what it is good at. OKLab/OKLCH for deriving
 * shades, because a lightness step there looks like the same step at any hue.
 * CIELAB with CIEDE2000 for measuring how far apart two colours look, because
 * that is the established perceptual-difference metric. Colour-vision
 * deficiency is simulated before measuring, so a pair that only differs in
 * the red-green axis is caught.
 */

import { contrastRatio } from '../renderers/ink';

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const text = hex.trim().replace(/^#/, '');
  const full = text.length === 3 ? [...text].map((digit) => digit + digit).join('') : text.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255) as unknown as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function linearRgb(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex);
  return [toLinear(r), toLinear(g), toLinear(b)];
}

function hexFromLinear([r, g, b]: Rgb): string {
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  return rgbToHex([fromLinear(clamp(r)), fromLinear(clamp(g)), fromLinear(clamp(b))]);
}

// ---------------------------------------------------------------- OKLab / OKLCH

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

function linearToOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function toOklch(hex: string): Oklch {
  const [l, a, b] = linearToOklab(linearRgb(hex));
  return { l, c: Math.hypot(a, b), h: Math.atan2(b, a) };
}

/** Back to sRGB, shedding chroma until the colour is inside the gamut. */
export function fromOklch({ l, c, h }: Oklch): string {
  let chroma = c;
  for (let i = 0; i < 24; i++) {
    const linear = oklabToLinear([l, chroma * Math.cos(h), chroma * Math.sin(h)]);
    if (linear.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4)) return hexFromLinear(linear);
    chroma *= 0.9;
  }
  return hexFromLinear(oklabToLinear([l, 0, 0]));
}

/** The same hue and chroma at a lightness `delta` higher (negative is darker). */
export function lighten(hex: string, delta: number): string {
  const colour = toOklch(hex);
  return fromOklch({ ...colour, l: Math.min(1, Math.max(0, colour.l + delta)) });
}

/** `amount` of the way from `from` to `to`, interpolated in OKLab. */
export function mix(from: string, to: string, amount: number): string {
  const a = linearToOklab(linearRgb(from));
  const b = linearToOklab(linearRgb(to));
  const t = Math.min(1, Math.max(0, amount));
  return hexFromLinear(oklabToLinear([0, 1, 2].map((i) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * t) as unknown as Rgb));
}

/**
 * The colour itself if it already clears `ratio` against every background,
 * otherwise the nearest shade of the same hue that does, moving away from the
 * backgrounds' lightness. This is what lets one accent serve as a fill, a
 * focus ring and text without a second hand-picked value.
 */
export function withContrast(hex: string, backgrounds: readonly string[], ratio: number): string {
  const worst = (candidate: string): number =>
    Math.min(...backgrounds.map((background) => contrastRatio(candidate, background)));
  if (worst(hex) >= ratio) return hex;

  const start = toOklch(hex);
  const meanBackground = backgrounds.reduce((sum, background) => sum + toOklch(background).l, 0) / backgrounds.length;
  const direction = meanBackground > 0.6 ? -1 : 1;
  for (let step = 1; step <= 200; step++) {
    const candidate = fromOklch({ ...start, l: Math.min(1, Math.max(0, start.l + direction * step * 0.005)) });
    if (worst(candidate) >= ratio) return candidate;
  }
  return direction < 0 ? '#000000' : '#ffffff';
}

// ---------------------------------------------------------------- CIELAB / CIEDE2000

export type Lab = readonly [number, number, number];

const WHITE_D65: Rgb = [0.95047, 1, 1.08883];

function linearToLab([r, g, b]: Rgb): Lab {
  const xyz: Rgb = [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = xyz.map((value, i) => f(value / (WHITE_D65[i] ?? 1)));
  return [116 * (fy ?? 0) - 16, 500 * ((fx ?? 0) - (fy ?? 0)), 200 * ((fy ?? 0) - (fz ?? 0))];
}

export function toLab(hex: string): Lab {
  return linearToLab(linearRgb(hex));
}

/** CIEDE2000 colour difference (kL = kC = kH = 1). */
export function deltaE2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number): number => {
    if (b === 0 && a === 0) return 0;
    const angle = Math.atan2(b, a) / rad;
    return angle < 0 ? angle + 360 : angle;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else hbarp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;

  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

// ---------------------------------------------------------------- colour vision

export type Vision = 'normal' | 'deuteranopia' | 'protanopia';

export const VISIONS: readonly Vision[] = ['normal', 'deuteranopia', 'protanopia'];

/** Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB. */
const CVD: Record<Exclude<Vision, 'normal'>, readonly Rgb[]> = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};

export function simulate(hex: string, vision: Vision): Lab {
  const linear = linearRgb(hex);
  if (vision === 'normal') return linearToLab(linear);
  const matrix = CVD[vision];
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const row = (i: number): number => {
    const [x, y, z] = matrix[i] ?? [0, 0, 0];
    return clamp(x * linear[0] + y * linear[1] + z * linear[2]);
  };
  return linearToLab([row(0), row(1), row(2)]);
}

/** How far apart two colours look to someone with this colour vision. */
export function visionDelta(a: string, b: string, vision: Vision): number {
  return deltaE2000(simulate(a, vision), simulate(b, vision));
}
