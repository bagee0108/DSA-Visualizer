import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';

import { ThemeToggle } from './components/ThemeToggle';
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
      <Link
        to="/"
        className="rounded-sm border border-edge bg-raised px-3 py-1 text-meta font-medium text-fg transition-colors hover:border-fg-mute"
      >
        Back to all algorithms
      </Link>
    </div>
  );
}

function Shell(): ReactNode {
  const { path } = useRouter();
  const route = path === '/' || path === '' ? 'home' : path.startsWith('/browse') ? 'browse' : 'visualize';

  return (
    <div className="flex h-full flex-col bg-ground text-fg">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-panel px-3 py-1">
        <Link
          to="/"
          className="flex items-center gap-2 text-meta font-semibold text-fg-dim transition-colors hover:text-fg"
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-accent" fill="currentColor" aria-hidden="true">
            <rect x="2" y="11" width="3" height="7" rx="1" />
            <rect x="7" y="7" width="3" height="11" rx="1" />
            <rect x="12" y="2" width="3" height="16" rx="1" />
          </svg>
          DSA Visualizer
        </Link>
        <span className="hidden font-mono text-micro text-fg-mute sm:inline">
          step, scrub and count every operation
        </span>
        <div className="ml-auto flex items-center gap-2">
          {import.meta.env.DEV && <DevThemeSwitcher />}
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
