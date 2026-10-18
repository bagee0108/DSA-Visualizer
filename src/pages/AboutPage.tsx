/** About: where the name comes from, what is collected, and the licences. */

import type { ReactNode } from 'react';

import { SiteFooter } from '../components/SiteFooter';
import { FOCUS_RING } from '../components/ui';
import { usePageMeta } from '../hooks/usePageMeta';

const LINK = `rounded-xs text-fg underline decoration-edge underline-offset-2 transition-colors hover:decoration-fg ${FOCUS_RING}`;

const FONTS: ReadonlyArray<readonly [string, string]> = [
  ['Martian Mono', 'martian-mono'],
  ['Atkinson Hyperlegible Next', 'atkinson-hyperlegible-next'],
  ['JetBrains Mono', 'jetbrains-mono'],
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): ReactNode {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="font-display text-ui font-semibold font-stretch-semi-condensed text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AboutPage(): ReactNode {
  usePageMeta('About - Treewidth');

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[68ch] space-y-8 px-6 pt-10 pb-12 text-ui text-fg-dim">
        <h1 className="font-display text-section font-bold text-fg">About</h1>

        <Section id="about-name" title="The name">
          <p>
            The name comes from treewidth, a measure in graph theory of how close a graph is to being a tree.
          </p>
        </Section>

        <Section id="about-privacy" title="Privacy">
          <p>
            Treewidth sets no cookies and stores only your light or dark theme choice in your browser. It uses Vercel Web
            Analytics and Speed Insights to count page views and measure load times, without cookies or ad tracking.
          </p>
        </Section>

        <Section id="about-licences" title="Licences">
          <p>Treewidth is released under the MIT License. Copyright (c) 2026 Bageerathan Saravanakumar.</p>
          <p>
            The fonts are under the SIL Open Font License 1.1:{' '}
            {FONTS.map(([name, folder], index) => (
              <span key={folder}>
                {index > 0 && (index === FONTS.length - 1 ? ' and ' : ', ')}
                <a href={`/fonts/${folder}/OFL.txt`} className={LINK}>
                  {name}
                </a>
              </span>
            ))}
            .
          </p>
          <p>
            The code Treewidth ships from other projects, with each licence in full:{' '}
            <a href="/THIRD_PARTY_LICENSES.txt" className={LINK}>
              third-party licences
            </a>
            .
          </p>
        </Section>
      </div>
      <SiteFooter />
    </div>
  );
}
