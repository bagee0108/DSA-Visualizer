import { Component, type ErrorInfo, type ReactNode } from 'react';

import { buttonClass } from './ui';

interface State {
  readonly failed: boolean;
}

/**
 * The last line of defence: a render error anywhere shows this page instead
 * of an empty root. It stands alone (no router, no shell), since either of
 * those may be what broke; the link is a plain full page load.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Lowlink hit an error it could not recover from', error, info.componentStack);
  }

  override componentDidUpdate(): void {
    if (this.state.failed) document.title = 'Something went wrong - Lowlink';
  }

  override componentDidMount(): void {
    this.componentDidUpdate();
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 bg-ground p-6 text-center text-fg">
        <h1 className="text-title font-semibold">Something went wrong</h1>
        <p className="max-w-md text-meta text-fg-dim">
          Lowlink hit an error it could not recover from. Reloading usually fixes it; if it keeps happening, start
          again from the path.
        </p>
        <a href="/" className={buttonClass('secondary')}>
          Back to the path
        </a>
      </main>
    );
  }
}
