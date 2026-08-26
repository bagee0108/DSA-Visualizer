/** Custom input, driven entirely by the algorithm's declared `fields`. */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { countTokens, type FieldSpec, type ParamMap, type RegisteredAlgorithm } from '../core/define';
import { makeRng, randomSeed } from '../core/random';

export interface InputPanelProps {
  readonly algorithm: RegisteredAlgorithm;
  readonly params: ParamMap;
  readonly error: string | null;
  readonly onApply: (params: ParamMap) => void;
}

const FIELD_CLASS =
  'w-full rounded-sm border border-edge bg-ground px-2 py-1 font-mono text-meta text-fg outline-none placeholder:text-fg-mute focus:border-accent';

export function InputPanel({ algorithm, params, error, onApply }: InputPanelProps): ReactNode {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...algorithm.defaults, ...params }));
  const [size, setSize] = useState(() => Math.max(algorithm.sizeRange.min, algorithm.sizeOf(params)));

  useEffect(() => {
    setDraft({ ...algorithm.defaults, ...params });
    const next = algorithm.sizeOf(params);
    if (next > 0) setSize(next);
  }, [algorithm, params]);

  const dirty = algorithm.fields.some((field) => (draft[field.key] ?? '') !== (params[field.key] ?? ''));
  const { min, max, step } = algorithm.sizeRange;
  const sizeProgress = max === min ? 0 : ((size - min) / (max - min)) * 100;

  const applyPreset = (presetId: string): void => {
    const preset = algorithm.presets.find((candidate) => candidate.id === presetId);
    if (preset === undefined) return;
    onApply({ ...draft, ...preset.build(size, makeRng(randomSeed())) });
  };

  const renderField = (field: FieldSpec): ReactNode => {
    const value = draft[field.key] ?? '';
    const update = (next: string): void => setDraft((current) => ({ ...current, [field.key]: next }));

    return (
      <div key={field.key} className="space-y-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor={`field-${field.key}`} className="text-micro font-medium text-fg-dim">
            {field.label}
          </label>
          {(field.kind === 'numbers' || field.kind === 'edges') && (
            <span className="font-mono text-micro tabular-nums text-fg-mute">
              {countTokens(value)} {field.kind === 'edges' ? 'edges' : 'elements'}
            </span>
          )}
        </div>

        {field.kind === 'numbers' || field.kind === 'edges' ? (
          <textarea
            id={`field-${field.key}`}
            value={value}
            onChange={(event) => update(event.target.value)}
            placeholder={field.placeholder}
            rows={3}
            spellCheck={false}
            className={`${FIELD_CLASS} resize-y leading-relaxed`}
          />
        ) : field.kind === 'select' ? (
          <select
            id={`field-${field.key}`}
            value={value}
            onChange={(event) => update(event.target.value)}
            className={FIELD_CLASS}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`field-${field.key}`}
            type={field.kind === 'number' ? 'number' : 'text'}
            value={value}
            min={field.min}
            max={field.max}
            onChange={(event) => update(event.target.value)}
            placeholder={field.placeholder}
            className={FIELD_CLASS}
          />
        )}

        {field.help !== undefined && (
          <p className="text-micro leading-snug text-fg-mute">{field.help}</p>
        )}
      </div>
    );
  };

  return (
    <section className="shrink-0 border-t border-line">
      <header className="border-b border-line px-3 py-1.5">
        <h2 className="font-mono text-micro uppercase tracking-wider text-fg-mute">Input</h2>
      </header>

      <div className="space-y-3 px-3 py-2">
        {algorithm.presets.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {algorithm.presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="rounded-xs border border-line px-1.5 py-0.5 text-micro text-fg-dim transition-colors hover:border-edge hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-micro text-fg-mute">n</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
                className="viz-range flex-1"
                style={{ '--viz-range-progress': `${sizeProgress}%` } as CSSProperties}
                aria-label="Generated input size"
              />
              <span className="w-7 shrink-0 text-right font-mono text-micro tabular-nums text-fg">
                {size}
              </span>
            </div>
          </div>
        )}

        {algorithm.fields.map(renderField)}

        {error !== null && (
          <p className="border-l-2 border-danger pl-2 text-micro leading-snug text-danger">{error}</p>
        )}

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onApply(draft)}
            disabled={!dirty}
            className="flex-1 rounded-sm bg-fg px-3 py-1 text-meta font-medium text-ground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-25"
          >
            {dirty ? 'Run this input' : 'Running'}
          </button>
          <button
            type="button"
            onClick={() => onApply({ ...algorithm.defaults })}
            className="rounded-sm border border-edge px-3 py-1 text-meta font-medium text-fg-dim transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Defaults
          </button>
        </div>
      </div>
    </section>
  );
}
