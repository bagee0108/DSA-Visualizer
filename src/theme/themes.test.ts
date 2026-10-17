import { describe, expect, it } from 'vitest';

import stylesheet from '../index.css?raw';
import type { HighlightRole } from '../core/types';
import { contrastRatio } from '../renderers/ink';
import { deltaE2000, visionDelta, VISIONS } from './color';
import { ACTIVE_THEME, deriveTokens, PRESETS, themeCss, type ChromeTokens, type Mode } from './themes';

/**
 * The accent may never look like an algorithm colour. It is kept out of the
 * canvas, but chrome and canvas share the screen, and a filled orange button
 * that reads as `comparing` to a deuteranope is a false signal.
 *
 * Measured as CIEDE2000 after simulating each colour-vision deficiency
 * (Machado 2009, full severity). Do not lower this to make a preset pass:
 * change the preset.
 */
const MIN_DELTA_E = 12;

const ROLES: readonly HighlightRole[] = [
  'comparing',
  'swapped',
  'pivot',
  'candidate',
  'sorted',
  'visited',
  'active',
  'excluded',
];

/** Every shade in the accent family, transient ones included: a hover still sits beside the canvas. */
const ACCENT_FAMILY: readonly (keyof ChromeTokens)[] = [
  'accent',
  'accentHover',
  'accentPress',
  'accentWash',
  'accentLine',
  'accentInk',
  'focus',
];

/** Role colours read from the stylesheet itself, so this cannot drift from what ships. */
function rolePalette(mode: Mode): Record<HighlightRole, string> {
  const selector = mode === 'dark' ? /:root\s*\{([^}]*)\}/ : /:root:not\(\.dark\)\s*\{([^}]*)\}/;
  const block = selector.exec(stylesheet)?.[1] ?? '';
  const palette = {} as Record<HighlightRole, string>;
  for (const role of ROLES) {
    const value = new RegExp(`--viz-${role}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1];
    if (value === undefined) throw new Error(`--viz-${role} not found in the ${mode} block of index.css`);
    palette[role] = value;
  }
  return palette;
}

const MODES: readonly Mode[] = ['dark', 'light'];

describe('colour maths', () => {
  it('matches the CIEDE2000 reference pairs (Sharma, Wu & Dalal 2005)', () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE2000([50, 0, 0], [50, -1, 2])).toBeCloseTo(2.3669, 4);
    expect(deltaE2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 4);
  });
});

describe('every preset stays clear of the role colours', () => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    for (const mode of MODES) {
      it(`${id} (${mode})`, () => {
        const tokens = deriveTokens(preset, mode);
        const roles = rolePalette(mode);
        for (const shade of ACCENT_FAMILY) {
          for (const role of ROLES) {
            for (const vision of VISIONS) {
              const delta = visionDelta(tokens[shade], roles[role], vision);
              expect(
                delta,
                `${id} ${mode} ${shade} ${tokens[shade]} vs ${role} ${roles[role]} under ${vision}`,
              ).toBeGreaterThanOrEqual(MIN_DELTA_E);
            }
          }
        }
      });
    }
  }
});

describe('every preset is legible', () => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    for (const mode of MODES) {
      it(`${id} (${mode})`, () => {
        const t = deriveTokens(preset, mode);
        const surfaces = { ground: t.ground, panel: t.panel, raised: t.raised };
        for (const [name, surface] of Object.entries(surfaces)) {
          expect(contrastRatio(t.fg, surface), `fg on ${name}`).toBeGreaterThanOrEqual(7);
          expect(contrastRatio(t.fgDim, surface), `fg-dim on ${name}`).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(t.fgMute, surface), `fg-mute on ${name}`).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(t.accentInk, surface), `accent-ink on ${name}`).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(t.focus, surface), `focus on ${name}`).toBeGreaterThanOrEqual(3);
        }
        // a pressed chip: fg text on the accent wash
        expect(contrastRatio(t.fg, t.accentWash), 'fg on the accent wash').toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.onAccent, t.accent), 'ink on the accent fill').toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.onAccent, t.accentHover), 'ink on the hover fill').toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.onAccent, t.accentPress), 'ink on the pressed fill').toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('one accent drives the family', () => {
  it('re-derives every accent token from the single base value', () => {
    const swapped = { ...PRESETS[ACTIVE_THEME], accent: '#3b82f6' };
    const before = deriveTokens(PRESETS[ACTIVE_THEME], 'dark');
    const after = deriveTokens(swapped, 'dark');
    for (const key of ['accent', 'accentHover', 'accentPress', 'accentWash', 'accentLine', 'accentInk', 'focus'] as const) {
      expect(after[key], key).not.toBe(before[key]);
    }
    expect(after.ground).toBe(before.ground);
  });

  it('emits both modes, keyed off the dark class', () => {
    const css = themeCss(PRESETS[ACTIVE_THEME]);
    expect(css).toContain(':root.dark{');
    expect(css).toContain(':root:not(.dark){');
    expect(css).not.toMatch(/undefined|NaN/);
  });
});
