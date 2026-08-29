/**
 * Label ink, derived from the fill it sits on rather than chosen per role.
 *
 * Picking whichever of the two inks contrasts more is what makes the floor
 * hold by construction: the worst case is a fill whose luminance sits exactly
 * between them, and even there the winner clears 4.3:1. A future palette
 * cannot break it, because nothing about the palette is written down here.
 */

import { useEffect, useState } from 'react';

export const FILL_NAMES = [
  'comparing',
  'swapped',
  'pivot',
  'candidate',
  'sorted',
  'visited',
  'active',
  'excluded',
  'default',
  'rb-red',
  'rb-black',
] as const;

export type FillName = (typeof FILL_NAMES)[number];
export type InkMap = Readonly<Record<FillName, string>>;

export const LIGHT_INK = '#ffffff';
export const DARK_INK = '#0b0d0f';

function parseColor(value: string): readonly [number, number, number] | null {
  const text = value.trim();

  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3) {
      const parts = [...hex].map((digit) => parseInt(digit + digit, 16));
      return parts.every((part) => Number.isFinite(part)) ? [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0] : null;
    }
    if (hex.length === 6 || hex.length === 8) {
      const parts = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
      return parts.every((part) => Number.isFinite(part)) ? [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0] : null;
    }
    return null;
  }

  const numbers = text.match(/-?\d*\.?\d+/g);
  if (text.startsWith('rgb') && numbers !== null && numbers.length >= 3) {
    const parts = numbers.slice(0, 3).map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }
  return null;
}

export function relativeLuminance(value: string): number | null {
  const rgb = parseColor(value);
  if (rgb === null) return null;
  const [r, g, b] = rgb.map((channel) => {
    const unit = Math.min(1, Math.max(0, channel / 255));
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === null || second === null) return 1;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** The more legible of the two inks on this fill. */
export function inkFor(fill: string): string {
  if (relativeLuminance(fill) === null) return LIGHT_INK;
  return contrastRatio(LIGHT_INK, fill) >= contrastRatio(DARK_INK, fill) ? LIGHT_INK : DARK_INK;
}

const FALLBACK: InkMap = Object.freeze(
  Object.fromEntries(FILL_NAMES.map((name) => [name, LIGHT_INK])) as Record<FillName, string>,
);

/** Resolves the palette out of CSS, so the palette stays defined in one place. */
export function readInk(): InkMap {
  if (typeof document === 'undefined') return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  const entries = FILL_NAMES.map((name) => [name, inkFor(styles.getPropertyValue(`--viz-${name}`))] as const);
  return Object.freeze(Object.fromEntries(entries) as Record<FillName, string>);
}

export function useInk(): InkMap {
  const [ink, setInk] = useState(readInk);

  useEffect(() => {
    const observer = new MutationObserver(() => setInk(readInk()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return ink;
}
