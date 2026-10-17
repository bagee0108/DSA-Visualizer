import type { ReactNode } from 'react';

import { Link } from '../router/router';
import { FOCUS_RING } from './ui';

const LINK = `inline-flex min-h-6 items-center rounded-xs underline decoration-line underline-offset-2 transition-colors hover:text-fg hover:decoration-fg-mute ${FOCUS_RING}`;

/** The quiet line at the foot of the reading pages. The visualizer is a full-screen tool and has none. */
export function SiteFooter(): ReactNode {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-6 py-4 text-meta text-fg-mute">
      <span>Lowlink, MIT licensed</span>
      <Link to="/about" className={LINK}>
        About and privacy
      </Link>
      <a href="/THIRD_PARTY_LICENSES.txt" className={LINK}>
        Third-party licences
      </a>
    </footer>
  );
}
