import type { ReactNode } from 'react';

import { useTheme } from '../hooks/useTheme';
import { IconButton } from './ui';

export function ThemeToggle(): ReactNode {
  const { theme, toggleTheme } = useTheme();

  return (
    <IconButton
      size="sm"
      onClick={toggleTheme}
      label="Toggle colour theme"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        {theme === 'dark' ? (
          <path d="M15.5 11.9A6 6 0 0 1 8.1 4.5a6 6 0 1 0 7.4 7.4z" />
        ) : (
          <>
            <circle cx="10" cy="10" r="3.6" />
            <path d="M10 1.6v2.2M10 16.2v2.2M1.6 10h2.2M16.2 10h2.2M4 4l1.6 1.6M14.4 14.4 16 16M16 4l-1.6 1.6M5.6 14.4 4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </IconButton>
  );
}
