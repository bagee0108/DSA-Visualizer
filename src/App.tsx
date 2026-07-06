import type { ReactNode } from 'react';

import { ThemeToggle } from './components/ThemeToggle';
import { HomePage } from './pages/HomePage';
import { VisualizePage } from './pages/VisualizePage';
import { Link, RouterProvider, useRouter } from './router/router';

function Routes(): ReactNode {
  const { path } = useRouter();

  if (path === '/' || path === '') return <HomePage />;

  const visualizeMatch = /^\/visualize\/([^/]+)\/?$/.exec(path);
  if (visualizeMatch !== null) {
    const id = decodeURIComponent(visualizeMatch[1] ?? '');
    return <VisualizePage algorithmId={id} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Page not found</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        <code className="font-mono">{path}</code> does not match a route.
      </p>
      <Link
        to="/"
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Back to all algorithms
      </Link>
    </div>
  );
}

function Shell(): ReactNode {
  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-indigo-500" fill="currentColor" aria-hidden="true">
            <rect x="2" y="11" width="3" height="7" rx="1" />
            <rect x="7" y="7" width="3" height="11" rx="1" />
            <rect x="12" y="2" width="3" height="16" rx="1" />
          </svg>
          DSA Visualizer
        </Link>
        <span className="hidden text-[11px] text-slate-400 sm:inline">
          step, scrub and count every operation
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Routes />
      </main>
    </div>
  );
}

export default function App(): ReactNode {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  );
}
