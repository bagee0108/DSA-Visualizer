/** The source panel, line-synced to the frame. */

import { useEffect, useRef, type ReactNode } from 'react';

const TOKEN_PATTERN =
  /(\/\/.*$)|(\b(?:function|const|let|var|return|if|else|for|while|do|switch|case|break|continue|new|of|in|typeof)\b)|(\b(?:number|string|boolean|void|null|undefined|true|false)\b)|(\b\d+(?:\.\d+)?\b)/g;

const TOKEN_CLASS = [
  'text-slate-400 dark:text-slate-500 italic',
  'text-violet-600 dark:text-violet-400',
  'text-sky-600 dark:text-sky-400',
  'text-amber-600 dark:text-amber-400',
] as const;

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
    <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h2>
        <span className="font-mono text-[11px] text-slate-400">
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
              className={`flex items-start gap-2 border-l-2 px-2 font-mono text-xs leading-5 ${
                isActive
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                  : 'border-transparent'
              }`}
            >
              <span
                className={`w-6 shrink-0 select-none text-right tabular-nums ${
                  isActive ? 'text-indigo-500' : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {lineNumber}
              </span>
              <code className="whitespace-pre text-slate-700 dark:text-slate-200">
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
