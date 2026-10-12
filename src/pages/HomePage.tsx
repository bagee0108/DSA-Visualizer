/**
 * Home: the hero, then the learning path. The path is the page's bold
 * element; everything around it stays quiet.
 */

import { useEffect, type ReactNode } from 'react';

import { HeroStage } from '../components/HeroStage';
import { Marquee } from '../components/Marquee';
import { Route } from '../components/Route';
import { ButtonLink } from '../components/ui';
import { firstOpenLevel, LEVELS } from '../core/levels';

function Hero(): ReactNode {
  const start = firstOpenLevel();

  return (
    <header className="mx-auto grid max-w-6xl items-center gap-x-10 gap-y-8 px-6 pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_44rem]">
      <div className="min-w-0">
        <p className="mb-4 font-mono text-meta text-fg-mute">
          <span className="text-accent-ink">$</span> play avl --insert 30,10,20
        </p>
        <h1 className="mb-4 max-w-[19ch] font-display text-display font-bold text-balance text-fg">
          Watch the algorithm think.
        </h1>
        <p className="mb-7 max-w-[44ch] text-title leading-relaxed text-fg-dim">
          Every comparison, swap and rotation, one frame at a time. Step it, scrub it, count it.
        </p>
        <div className="flex flex-wrap gap-2.5">
          {start !== undefined && (
            <ButtonLink to={`/visualize/${start.id}`} variant="primary" size="lg">
              Start the path
            </ButtonLink>
          )}
          <ButtonLink to="/browse" variant="secondary" size="lg">
            Browse all
          </ButtonLink>
        </div>
      </div>
      <HeroStage />
    </header>
  );
}

function Legend(): ReactNode {
  const node = 'inline-block h-3 w-3 rounded-full border-2';
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-fg-mute" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span className={`${node} border-accent bg-accent`} aria-hidden="true" />
        start here
      </li>
      <li className="flex items-center gap-1.5">
        <span className={`${node} border-accent`} aria-hidden="true" />
        open
      </li>
      <li className="flex items-center gap-1.5">
        <span className={`${node} border-dashed border-edge`} aria-hidden="true" />
        soon
      </li>
      <li className="flex items-center gap-1.5">
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-edge" aria-hidden="true">
          <path d="M6 1.2l1.4 3 3.2.3-2.4 2.2.7 3.2L6 8.3 3.1 9.9l.7-3.2L1.4 4.5l3.2-.3z" fill="none" stroke="currentColor" />
        </svg>
        your progress, once there is any
      </li>
    </ul>
  );
}

export function HomePage(): ReactNode {
  useEffect(() => {
    document.title = 'DSA Visualizer';
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <Hero />
      <Marquee />

      <section className="mx-auto max-w-6xl px-6 pt-8 pb-16" aria-labelledby="path-title">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <h2 id="path-title" className="mb-1 font-display text-section font-bold text-fg">
              The path
            </h2>
            <p className="max-w-[60ch] text-ui text-fg-dim">
              {LEVELS.length} levels in four tracks, easiest first. Levels marked soon are still being built.
            </p>
          </div>
          <Legend />
        </div>
        <Route />
      </section>
    </div>
  );
}
