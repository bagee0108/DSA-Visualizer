/**
 * Every chrome colour in the app comes from here. See CONTRIBUTING "Themes".
 *
 * A preset writes down only what cannot be derived: per mode a ground, a
 * hairline and two text inks, plus ONE accent shared by both modes. Panel and
 * raised surfaces, the stronger edge, the middle text ink and every accent
 * shade (hover, press, wash, border, focus ring, text, the ink on top of an
 * accent fill) are computed from those, so changing one hex re-themes the
 * whole app consistently.
 *
 * Role colours - the eight highlight roles in src/renderers/roles.ts and the
 * --viz-* fills in index.css - are deliberately NOT part of a theme. They
 * carry meaning inside the canvas and were tuned for separability; a preset
 * may not touch them. themes.test.ts checks every preset's accent against
 * them so a new theme cannot quietly collide with the algorithm colours.
 *
 * This module is pure: vite.config.ts imports it to write the active theme
 * into index.html at build time, so the first paint is already themed.
 */

import { inkFor } from '../renderers/ink';
import { lighten, mix, withContrast } from './color';

export type Mode = 'dark' | 'light';

export interface ModeBase {
  /** Page and canvas background. Panel and raised steps are derived from it. */
  readonly ground: string;
  /** Hairline borders. */
  readonly line: string;
  /** Primary text. */
  readonly fg: string;
  /** Quietest text that still has to be read; must clear 4.5:1 on ground. */
  readonly fgMute: string;
}

export interface ThemePreset {
  readonly label: string;
  /** The one accent. Dark mode fills with it; light mode derives a darker shade. */
  readonly accent: string;
  readonly dark: ModeBase;
  readonly light: ModeBase;
}

export const PRESETS = {
  ember: {
    label: 'Ember',
    accent: '#ee5515',
    dark: { ground: '#0f0d0e', line: '#342c2a', fg: '#ece6e3', fgMute: '#9a8f8b' },
    light: { ground: '#f6f1ee', line: '#dacfca', fg: '#1d1716', fgMute: '#6d625e' },
  },
  brass: {
    label: 'Brass',
    accent: '#b68611',
    dark: { ground: '#0e0e0f', line: '#27272a', fg: '#e8e8ea', fgMute: '#8f8f96' },
    light: { ground: '#f5f5f6', line: '#dedee1', fg: '#18181b', fgMute: '#66666d' },
  },
} as const satisfies Record<string, ThemePreset>;

export type ThemeId = keyof typeof PRESETS;

/** Change this one line to re-theme the app. */
export const ACTIVE_THEME: ThemeId = 'ember';

/** Failure states only. Semantic, so shared by every preset rather than themed. */
const DANGER: Record<Mode, string> = { dark: '#ef9aa6', light: '#be1b38' };

export interface ChromeTokens {
  readonly ground: string;
  readonly panel: string;
  readonly raised: string;
  readonly line: string;
  readonly edge: string;
  readonly fg: string;
  readonly fgDim: string;
  readonly fgMute: string;
  /** Filled primary buttons, the lit path, the current level node. */
  readonly accent: string;
  readonly accentHover: string;
  readonly accentPress: string;
  /** Opaque tint of the ground, for selected rows and marquee highlights. */
  readonly accentWash: string;
  /** A border in the accent family that is quieter than the accent itself. */
  readonly accentLine: string;
  /** Accent-coloured text and glyphs ($ prompts); 4.5:1 on every surface. */
  readonly accentInk: string;
  /** Text and icons placed on an accent fill, derived by inkFor(). */
  readonly onAccent: string;
  /** Focus rings and thin indicator marks; 3:1 on every surface. */
  readonly focus: string;
  readonly danger: string;
  /** Canvas hairlines: grid, untraversed edges. Neutral, so it tracks the chrome. */
  readonly vizGrid: string;
}

export function deriveTokens(preset: ThemePreset, mode: Mode): ChromeTokens {
  const base = preset[mode];
  const dark = mode === 'dark';

  // Dark steps up towards the light; light puts panels above the ground and
  // insets below it, which is how the three levels read on a pale page.
  // The steps are large enough to read as levels on their own, without the
  // hairline: a panel that only a border distinguishes from the page is flat.
  const panel = dark ? lighten(base.ground, 0.045) : mix(base.ground, '#ffffff', 0.7);
  const raised = dark ? lighten(base.ground, 0.09) : lighten(base.ground, -0.04);
  const surfaces = [base.ground, panel, raised];

  const edge = mix(base.line, base.fgMute, 0.22);
  const fgDim = mix(base.fgMute, base.fg, 0.4);

  // On a dark ground a saturated accent is legible as it is. On a pale one it
  // is not - a bright orange is under 3:1 on near-white - so light mode fills
  // with the nearest shade that also works as text, and the whole family is
  // derived from that.
  const accent = dark
    ? withContrast(preset.accent, surfaces, 3)
    : withContrast(preset.accent, surfaces, 4.5);

  return {
    ground: base.ground,
    panel,
    raised,
    line: base.line,
    edge,
    fg: base.fg,
    fgDim,
    fgMute: base.fgMute,
    accent,
    // Hover moves away from the ground so it reads as lifting; press always
    // goes darker, which on a light-mode fill also keeps its white ink clear.
    accentHover: lighten(accent, dark ? 0.04 : -0.04),
    accentPress: lighten(accent, dark ? -0.04 : -0.08),
    // Selected states. Strong enough to read as the accent, faint enough that
    // text on it keeps full contrast.
    accentWash: mix(base.ground, accent, dark ? 0.22 : 0.2),
    // On a pale ground every tint between the page and the accent passes
    // through some role colour on the way (a peach meets `swapped` under
    // deuteranopia), so the light-mode accent border is the accent itself.
    accentLine: dark ? mix(base.ground, accent, 0.45) : accent,
    accentInk: withContrast(accent, surfaces, 4.5),
    onAccent: inkFor(accent),
    focus: withContrast(accent, surfaces, 3),
    danger: DANGER[mode],
    vizGrid: mix(base.line, edge, 0.6),
  };
}

/** Token name -> CSS custom property. @theme in index.css maps these to utilities. */
export const TOKEN_VARS: Record<keyof ChromeTokens, string> = {
  ground: '--theme-ground',
  panel: '--theme-panel',
  raised: '--theme-raised',
  line: '--theme-line',
  edge: '--theme-edge',
  fg: '--theme-fg',
  fgDim: '--theme-fg-dim',
  fgMute: '--theme-fg-mute',
  accent: '--theme-accent',
  accentHover: '--theme-accent-hover',
  accentPress: '--theme-accent-press',
  accentWash: '--theme-accent-wash',
  accentLine: '--theme-accent-line',
  accentInk: '--theme-accent-ink',
  onAccent: '--theme-on-accent',
  focus: '--theme-focus',
  danger: '--theme-danger',
  vizGrid: '--theme-viz-grid',
};

function declarations(tokens: ChromeTokens): string {
  return (Object.keys(TOKEN_VARS) as (keyof ChromeTokens)[])
    .map((key) => `${TOKEN_VARS[key]}:${tokens[key]};`)
    .join('');
}

/**
 * The stylesheet for one preset. Both modes are in it, keyed off the `dark`
 * class the theme toggle already manages, so switching mode needs no script.
 */
export function themeCss(preset: ThemePreset): string {
  return `:root.dark{color-scheme:dark;${declarations(deriveTokens(preset, 'dark'))}}:root:not(.dark){color-scheme:light;${declarations(deriveTokens(preset, 'light'))}}`;
}

export const THEME_STYLE_ID = 'theme';
