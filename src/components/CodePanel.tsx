/** The source panel, line-synced to the frame. */

import { useEffect, useRef, type ReactNode } from 'react';

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
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeLine]);

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-3 py-1.5">
        <h2 className="font-mono text-micro uppercase tracking-wider text-fg-mute">{title}</h2>
        <span className="font-mono text-micro tabular-nums text-fg-mute">
          {activeLine > 0 ? `line ${activeLine}` : 'idle'}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {lines.map((line, position) => {
          const lineNumber = position + 1;
          const isActive = lineNumber === activeLine;
          return (
            <div
              key={lineNumber}
              ref={isActive ? activeRef : null}
              className={`flex items-start gap-2 border-l-2 px-2 font-mono text-micro ${
                isActive ? 'border-accent bg-raised' : 'border-transparent'
              }`}
            >
              <span
                className={`w-6 shrink-0 select-none text-right tabular-nums ${
                  isActive ? 'text-accent' : 'text-fg-mute'
                }`}
              >
                {lineNumber}
              </span>
              <code className={`whitespace-pre ${isActive ? 'text-fg' : 'text-fg-dim'}`}>
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
    </section>
  );
}
