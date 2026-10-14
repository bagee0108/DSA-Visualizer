import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';

import { Logo } from './components/Logo';
import { ThemeToggle } from './components/ThemeToggle';
import { ButtonLink, FOCUS_RING } from './components/ui';
import { BrowsePage } from './pages/BrowsePage';
import { HomePage } from './pages/HomePage';
import { VisualizePage } from './pages/VisualizePage';
import { Link, RouterProvider, useRouter } from './router/router';
import { DevThemeSwitcher } from './theme/DevThemeSwitcher';

function Routes(): ReactNode {
  const { path } = useRouter();

  if (path === '/' || path === '') return <HomePage />;
  if (path === '/browse' || path === '/browse/') return <BrowsePage />;

  const visualizeMatch = /^\/visualize\/([^/]+)\/?$/.exec(path);
  if (visualizeMatch !== null) {
    const id = decodeURIComponent(visualizeMatch[1] ?? '');
    return <VisualizePage algorithmId={id} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-title font-semibold text-fg">Page not found</h1>
      <p className="text-meta text-fg-dim">
        <code className="font-mono text-fg">{path}</code> does not match a route.
      </p>
      <ButtonLink to="/" variant="secondary">
        Back to the path
      </ButtonLink>
    </div>
  );
}

function NavLink({ to, current, children }: { to: string; current: boolean; children: ReactNode }): ReactNode {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={`rounded-sm px-2.5 py-1 font-display text-meta font-semibold font-stretch-semi-condensed transition-colors ${
        current ? 'bg-raised text-fg' : 'text-fg-mute hover:bg-raised hover:text-fg'
      } ${FOCUS_RING}`}
    >
      {children}
    </Link>
  );
}

function Shell(): ReactNode {
  const { path } = useRouter();
  const route = path === '/' || path === '' ? 'home' : path.startsWith('/browse') ? 'browse' : 'visualize';

  return (
    <div className="flex h-full flex-col bg-ground text-fg">
      <header className="flex h-11 shrink-0 items-center gap-5 border-b border-line bg-panel px-3">
        <Link
          to="/"
          aria-label="dsa/visualizer, home"
          className={`flex items-center gap-2 rounded-xs font-display text-ui font-semibold font-stretch-semi-condensed text-fg ${FOCUS_RING}`}
        >
          <Logo surface="panel" className="h-6 w-6" />
          <span>
            dsa<span className="font-normal text-fg-mute">/</span>visualizer
          </span>
        </Link>
        {/* A leaderboard link joins these once that page exists; never before. */}
        <nav aria-label="Main" className="flex items-center gap-1">
          <NavLink to="/" current={route !== 'browse'}>
            Path
          </NavLink>
          <NavLink to="/browse" current={route === 'browse'}>
            Browse
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {import.meta.env.DEV && <DevThemeSwitcher />}
          {/* Reserved for the profile area once accounts exist. Empty on purpose. */}
          <div className="hidden w-32 sm:block" aria-hidden="true" />
          <ThemeToggle />
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <div
          key={route}
          className="h-full"
          style={{ animation: 'viz-route-in var(--duration-base) var(--ease-enter) backwards' }}
        >
          <Routes />
        </div>
      </main>
    </div>
  );
}

export default function App(): ReactNode {
  return (
    <RouterProvider>
      <Shell />
      <Analytics />
    </RouterProvider>
  );
}
