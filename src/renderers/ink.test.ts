import { describe, expect, it } from 'vitest';

import { contrastRatio, DARK_INK, inkFor, LIGHT_INK, relativeLuminance } from './ink';

/** Every fill the renderers put a label on, in both themes. */
const DARK_THEME = {
  comparing: '#fbbf24',
  swapped: '#fb7185',
  pivot: '#a78bfa',
  candidate: '#22d3ee',
  sorted: '#34d399',
  visited: '#6366f1',
  active: '#38bdf8',
  excluded: '#334155',
  default: '#64748b',
  'rb-red': '#ef4444',
  'rb-black': '#cbd5e1',
};

const LIGHT_THEME = {
  comparing: '#f59e0b',
  swapped: '#f43f5e',
  pivot: '#8b5cf6',
  candidate: '#06b6d4',
  sorted: '#10b981',
  visited: '#5f6fac',
  active: '#0ea5e9',
  excluded: '#cbd5e1',
  default: '#94a3b8',
  'rb-red': '#dc2626',
  'rb-black': '#1e293b',
};

/** WCAG's floor for large text, and the floor this has to hold. */
const FLOOR = 3;

describe('label ink', () => {
  it('clears the floor on every fill in both themes', () => {
    for (const [theme, palette] of [
      ['dark', DARK_THEME],
      ['light', LIGHT_THEME],
    ] as const) {
      for (const [role, fill] of Object.entries(palette)) {
        const ratio = contrastRatio(inkFor(fill), fill);
        expect(ratio, `${theme} ${role} (${fill})`).toBeGreaterThanOrEqual(FLOOR);
      }
    }
  });

  it('holds the floor for any colour at all, which is the point', () => {
    let worst = Infinity;
    let worstColour = '';
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 17) {
        for (let b = 0; b < 256; b += 17) {
          const fill = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
          const ratio = contrastRatio(inkFor(fill), fill);
          if (ratio < worst) {
            worst = ratio;
            worstColour = fill;
          }
        }
      }
    }
    expect(worst, `worst case was ${worstColour}`).toBeGreaterThanOrEqual(4.3);
  });

  it('picks the ink that actually contrasts more, not a fixed one', () => {
    expect(inkFor('#ffffff')).toBe(DARK_INK);
    expect(inkFor('#000000')).toBe(LIGHT_INK);
    expect(inkFor('#fbbf24'), 'bright amber wants dark ink').toBe(DARK_INK);
    expect(inkFor('#6366f1'), 'deep indigo wants light ink').toBe(LIGHT_INK);
  });

  it('is never worse than the hardcoded white it replaces', () => {
    for (const fill of Object.values(LIGHT_THEME)) {
      expect(contrastRatio(inkFor(fill), fill)).toBeGreaterThanOrEqual(contrastRatio(LIGHT_INK, fill));
    }
  });

  it('reads the colour formats the stylesheet can produce', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('  #000000  ')).toBeCloseTo(0, 5);
    expect(relativeLuminance('rgb(255, 255, 255)')).toBeCloseTo(1, 5);
    expect(relativeLuminance('rgba(0, 0, 0, 0.5)')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#fbbf24')).toBeCloseTo(relativeLuminance('rgb(251, 191, 36)') ?? -1, 6);
  });

  it('falls back to a legible ink rather than throwing on nonsense', () => {
    expect(relativeLuminance('not a colour')).toBeNull();
    expect(inkFor('')).toBe(LIGHT_INK);
    expect(contrastRatio('nope', '#fff')).toBe(1);
  });
});
