/** The source panel, line-synced to the frame. */

import { useEffect, useRef, type ReactNode } from 'react';

import { usePrefersReducedMotion } from '../hooks/useMotion';

/** Row height in px. The sliding highlight is positioned off it, so the row
 *  and this constant have to agree; `text-micro` carries a 16px line box. */
const LINE_H = 16;

const TOKEN_PATTERN =
  /(\/\/.*$)|(\b(?:function|const|let|var|return|if|else|for|while|do|switch|case|break|continue|new|of|in|typeof)\b)|(\b(?:number|string|boolean|void|null|undefined|true|false)\b)|(\b\d+(?:\.\d+)?\b)/g;

/**
 * Syntax emphasis is monochrome on purpose: the code panel sits beside the
 * canvas, and saturated tokens would compete with the highlight roles. Weight
 * marks keywords, dimming marks comments.
 */
const TOKEN_CLASS = ['italic text-fg-mute', 'font-medium text-fg', '', ''] as const;

interface Token {
  readonly text: string;
  readonly className: string;
}

function tokenize(line: string): readonly Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  TOKEN_PATTERN.lastIndex = 0;
  let match = TOKEN_PATTERN.exec(line);
  while (match !== null) {
    if (match.index > cursor) {
      tokens.push({ text: line.slice(cursor, match.index), className: '' });
    }
    const groupIndex = [1, 2, 3, 4].find((group) => match?.[group] !== undefined) ?? 0;
    tokens.push({ text: match[0], className: TOKEN_CLASS[groupIndex - 1] ?? '' });
    cursor = match.index + match[0].length;
    match = TOKEN_PATTERN.exec(line);
  }

  if (cursor < line.length) tokens.push({ text: line.slice(cursor), className: '' });
  return tokens;
}

export interface CodePanelProps {
  readonly lines: readonly string[];
  readonly activeLine: number;
  readonly title?: string;
}

export function CodePanel({ lines, activeLine, title = 'Source' }: CodePanelProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const userScrolledAt = useRef(0);
  const reduced = usePrefersReducedMotion();

  // A scroll the reader started wins for a while; following the active line
  // must never yank the panel out from under them.
  const markUserScroll = (): void => {
    userScrolledAt.current = performance.now();
  };

  useEffect(() => {
    const box = scrollRef.current;
    if (box === null || activeLine <= 0) return;
    if (performance.now() - userScrolledAt.current < 1500) return;

    const top = (activeLine - 1) * LINE_H;
    const viewTop = box.scrollTop;
    const viewBottom = viewTop + box.clientHeight;
    if (top >= viewTop + LINE_H && top + LINE_H <= viewBottom - LINE_H) return;

    box.scrollTo({
      top: Math.max(0, top - box.clientHeight / 2 + LINE_H / 2),
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [activeLine, reduced]);

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-3 py-1.5">
        <h2 className="font-mono text-micro uppercase tracking-wider text-fg-mute">{title}</h2>
        <span className="font-mono text-micro tabular-nums text-fg-mute">
          {activeLine > 0 ? `line ${activeLine}` : 'idle'}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        onWheel={markUserScroll}
        onTouchStart={markUserScroll}
        onPointerDown={markUserScroll}
      >
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 border-l-2 border-accent bg-raised"
            style={{
              height: `${LINE_H}px`,
              transform: `translateY(${Math.max(0, activeLine - 1) * LINE_H}px)`,
              opacity: activeLine > 0 ? 1 : 0,
              transition: 'transform var(--duration-base) var(--ease-slide), opacity var(--duration-fast) var(--ease-ui)',
            }}
          />
          {lines.map((line, position) => {
            const lineNumber = position + 1;
            const isActive = lineNumber === activeLine;
            return (
              <div
                key={lineNumber}
                className="relative flex items-start gap-2 border-l-2 border-transparent px-2 font-mono text-micro"
                style={{ height: `${LINE_H}px` }}
              >
                <span
                  className={`w-6 shrink-0 select-none text-right tabular-nums transition-colors ${
                    isActive ? 'text-accent' : 'text-fg-mute'
                  }`}
                >
                  {lineNumber}
                </span>
                <code className={`whitespace-pre transition-colors ${isActive ? 'text-fg' : 'text-fg-dim'}`}>
                  {line.length === 0
                    ? ' '
                    : tokenize(line).map((token, tokenIndex) => (
                        <span key={tokenIndex} className={token.className}>
                          {token.text}
                        </span>
                      ))}
                </code>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
