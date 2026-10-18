/** Custom input, driven entirely by the algorithm's declared `fields`. */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { countTokens, type FieldSpec, type ParamMap, type RegisteredAlgorithm } from '../core/define';
import { makeRng, randomSeed } from '../core/random';
import { Button, Chip, PanelHeader } from './ui';

export interface InputPanelProps {
  readonly algorithm: RegisteredAlgorithm;
  readonly params: ParamMap;
  readonly error: string | null;
  readonly onApply: (params: ParamMap) => void;
}

const FIELD_CLASS =
  'w-full rounded-sm border border-edge bg-ground px-2 py-1 font-mono text-meta text-fg outline-none placeholder:text-fg-mute focus:border-focus';

export function InputPanel({ algorithm, params, error, onApply }: InputPanelProps): ReactNode {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...algorithm.defaults, ...params }));
  const [size, setSize] = useState(() => Math.max(algorithm.sizeRange.min, algorithm.sizeOf(params)));
  // The preset behind the current run, so its description can say what it shows; any other run clears it.
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  useEffect(() => setAppliedPreset(null), [algorithm]);

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
    const capped = Math.min(size, preset.maxSize ?? size);
    setSize(capped);
    setAppliedPreset(preset.id);
    onApply({ ...draft, ...preset.build(capped, makeRng(randomSeed())) });
  };
  const described = algorithm.presets.find((preset) => preset.id === appliedPreset && preset.description !== undefined);
  const runOwn = (next: ParamMap): void => {
    setAppliedPreset(null);
    onApply(next);
  };
  // Presets that will build fewer than n, and why; shown under the size control while it is past their cap.
  const capped = algorithm.presets.filter((preset) => preset.maxSize !== undefined && preset.maxSize < size);

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
      <PanelHeader title="input" />

      <div className="space-y-3 px-3 py-2">
        {algorithm.presets.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {algorithm.presets.map((preset) => (
                <Chip key={preset.id} onClick={() => applyPreset(preset.id)}>
                  {preset.label}
                </Chip>
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
            {described !== undefined && (
              <p className="text-micro leading-snug text-fg-dim">
                {described.label}: {described.description}
              </p>
            )}
            {capped.map((preset) => (
              <p key={preset.id} className="text-micro leading-snug text-fg-mute">
                {preset.label}: up to {preset.maxSize} {algorithm.meta.structureKind === 'graph' ? 'nodes' : 'elements'}, {preset.capReason}.
              </p>
            ))}
          </div>
        )}

        {algorithm.fields.map(renderField)}

        {error !== null && (
          <p className="border-l-2 border-danger pl-2 text-micro leading-snug text-danger">{error}</p>
        )}

        <div className="flex gap-1">
          <Button variant="primary" className="flex-1" onClick={() => runOwn(draft)} disabled={!dirty}>
            {dirty ? 'Run this input' : 'Running'}
          </Button>
          <Button variant="secondary" onClick={() => runOwn({ ...algorithm.defaults })}>
            Defaults
          </Button>
        </div>
      </div>
    </section>
  );
}
