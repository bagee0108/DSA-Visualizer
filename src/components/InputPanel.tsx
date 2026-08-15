/** Custom input, driven entirely by the algorithm's declared `fields`. */

import { useEffect, useState, type ReactNode } from 'react';

import { countTokens, type FieldSpec, type ParamMap, type RegisteredAlgorithm } from '../core/define';
import { makeRng, randomSeed } from '../core/random';

export interface InputPanelProps {
  readonly algorithm: RegisteredAlgorithm;
  readonly params: ParamMap;
  readonly error: string | null;
  readonly onApply: (params: ParamMap) => void;
}

export function InputPanel({ algorithm, params, error, onApply }: InputPanelProps): ReactNode {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...algorithm.defaults, ...params }));
  const [size, setSize] = useState(() => Math.max(algorithm.sizeRange.min, algorithm.sizeOf(params)));

  useEffect(() => {
    setDraft({ ...algorithm.defaults, ...params });
    const next = algorithm.sizeOf(params);
    if (next > 0) setSize(next);
  }, [algorithm, params]);

  const dirty = algorithm.fields.some((field) => (draft[field.key] ?? '') !== (params[field.key] ?? ''));

  const applyPreset = (presetId: string): void => {
    const preset = algorithm.presets.find((candidate) => candidate.id === presetId);
    if (preset === undefined) return;
    onApply({ ...draft, ...preset.build(size, makeRng(randomSeed())) });
  };

  const renderField = (field: FieldSpec): ReactNode => {
    const value = draft[field.key] ?? '';
    const update = (next: string): void => setDraft((current) => ({ ...current, [field.key]: next }));
    const inputClass =
      'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100';

    return (
      <div key={field.key} className="space-y-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor={`field-${field.key}`} className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {field.label}
          </label>
          {field.kind === 'numbers' && (
            <span className="font-mono text-[10px] text-slate-400">{countTokens(value)} elements</span>
          )}
          {field.kind === 'edges' && (
            <span className="font-mono text-[10px] text-slate-400">{countTokens(value)} edges</span>
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
            className={`${inputClass} resize-y leading-relaxed`}
          />
        ) : field.kind === 'select' ? (
          <select
            id={`field-${field.key}`}
            value={value}
            onChange={(event) => update(event.target.value)}
            className={inputClass}
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
            className={inputClass}
          />
        )}

        {field.help !== undefined && (
          <p className="text-[10px] leading-snug text-slate-400">{field.help}</p>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
      <header className="border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Input
        </h2>
      </header>

      <div className="space-y-3 px-3 py-2.5">
        {algorithm.presets.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {algorithm.presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">n</span>
              <input
                type="range"
                min={algorithm.sizeRange.min}
                max={algorithm.sizeRange.max}
                step={algorithm.sizeRange.step}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-slate-800"
                aria-label="Generated input size"
              />
              <span className="w-8 text-right font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                {size}
              </span>
            </div>
          </div>
        )}

        {algorithm.fields.map(renderField)}

        {error !== null && (
          <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] leading-snug text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onApply(draft)}
            disabled={!dirty}
            className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {dirty ? 'Run this input' : 'Running'}
          </button>
          <button
            type="button"
            onClick={() => onApply({ ...algorithm.defaults })}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Defaults
          </button>
        </div>
      </div>
    </section>
  );
}
