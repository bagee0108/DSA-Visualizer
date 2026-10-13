/**
 * A slow band of operation names between the hero and the path: texture, in
 * the app's own vocabulary. It is chrome, so it may move; it is decorative, so
 * screen readers skip it. Under reduced motion it does not move at all, and
 * anyone can pause it, since anything that moves for more than five seconds
 * has to be stoppable.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { operations, type Operation } from '../core/levels';
import { IconButton } from './ui';

/** The route's operations; the highlighted ones you can watch today. */
function Run({ words }: { words: readonly Operation[] }): ReactNode {
  return (
    <span className="flex shrink-0 items-center gap-7 pr-7">
      {words.map(({ name, available }) => (
        <span key={name} className="flex items-center gap-7">
          <span className={available ? 'text-accent-ink' : 'text-fg-mute'}>{name}</span>
          <span className="text-edge">/</span>
        </span>
      ))}
    </span>
  );
}

export function Marquee(): ReactNode {
  const [paused, setPaused] = useState(false);
  const words = useMemo(operations, []);

  return (
    <div className="relative flex h-10 items-center overflow-hidden border-y border-line bg-panel">
      <div
        aria-hidden="true"
        className="flex min-w-max animate-[viz-ticker_var(--duration-ticker)_linear_infinite] font-display text-ui font-stretch-semi-condensed whitespace-nowrap motion-reduce:animate-none"
        style={{ animationPlayState: paused ? 'paused' : 'running' }}
      >
        {/* Two identical runs, so sliding by exactly one run loops seamlessly. */}
        <Run words={words} />
        <Run words={words} />
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center bg-panel pr-2 pl-1 motion-reduce:hidden">
        <IconButton size="sm" label={paused ? 'Resume the ticker' : 'Pause the ticker'} onClick={() => setPaused((was) => !was)}>
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden="true">
            {paused ? <path d="M6 4.5v11l9-5.5-9-5.5z" /> : <path d="M5.5 4.5h3v11h-3zM11.5 4.5h3v11h-3z" />}
          </svg>
        </IconButton>
      </div>
    </div>
  );
}
