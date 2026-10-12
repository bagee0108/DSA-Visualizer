import { useEffect, useState, type ReactNode } from 'react';

import { ACTIVE_THEME, PRESETS, THEME_STYLE_ID, themeCss, type ThemeId } from './themes';

const STORAGE_KEY = 'dsa-dev-theme';

function isThemeId(value: string | null): value is ThemeId {
  return value !== null && Object.hasOwn(PRESETS, value);
}

function readChoice(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(saved)) return saved;
  } catch {
  }
  return ACTIVE_THEME;
}

/**
 * Development only: previews every preset live by rewriting the theme
 * stylesheet that vite.config.ts put into index.html. App renders it behind
 * import.meta.env.DEV, so it is stripped from production builds. Shipping a
 * different theme is a change to ACTIVE_THEME, not to this.
 */
export function DevThemeSwitcher(): ReactNode {
  const [choice, setChoice] = useState<ThemeId>(readChoice);
  const css = themeCss(PRESETS[choice]);

  useEffect(() => {
    let style = document.getElementById(THEME_STYLE_ID);
    if (style === null) {
      style = document.createElement('style');
      style.id = THEME_STYLE_ID;
      document.head.prepend(style);
    }
    style.textContent = css;
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
    }
  }, [choice, css]);

  return (
    <label className="flex items-center gap-1.5 font-mono text-micro text-fg-mute">
      theme
      <select
        value={choice}
        onChange={(event) => {
          if (isThemeId(event.target.value)) setChoice(event.target.value);
        }}
        className="rounded-xs border border-line bg-ground px-1 text-micro text-fg outline-none focus-visible:border-focus"
      >
        {(Object.keys(PRESETS) as ThemeId[]).map((id) => (
          <option key={id} value={id}>
            {PRESETS[id].label}
            {id === ACTIVE_THEME ? ' (shipped)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
