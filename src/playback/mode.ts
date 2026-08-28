/** Playback modes and the only legal moves between them; see CONTRIBUTING "Graphs". */

export type Mode = 'idle' | 'precomputing' | 'paused' | 'playing' | 'editing';

export type ModeEvent = 'invalidate' | 'precompute' | 'ready' | 'play' | 'pause' | 'end' | 'edit' | 'commit';

const TABLE: Readonly<Record<Mode, Readonly<Partial<Record<ModeEvent, Mode>>>>> = {
  idle: { invalidate: 'idle', precompute: 'precomputing', edit: 'editing' },
  precomputing: { invalidate: 'idle', ready: 'paused' },
  paused: { invalidate: 'idle', play: 'playing', edit: 'editing' },
  playing: { invalidate: 'idle', pause: 'paused', end: 'paused', edit: 'editing' },
  editing: { commit: 'idle' },
};

export function transition(mode: Mode, event: ModeEvent): Mode {
  return TABLE[mode][event] ?? mode;
}

export function accepts(mode: Mode, event: ModeEvent): boolean {
  return TABLE[mode][event] !== undefined;
}

export function hasFrames(mode: Mode): boolean {
  return mode === 'paused' || mode === 'playing';
}

/** Structural edits are only ever allowed with no run materialised. */
export function canEdit(mode: Mode): boolean {
  return mode === 'idle' || mode === 'editing';
}

/**
 * Machine state. `progress` is the fraction of the build drained so far and is
 * only meaningful while precomputing; every other mode pins it at zero.
 */
export interface ModeState {
  readonly mode: Mode;
  readonly progress: number;
}

export const INITIAL_STATE: ModeState = { mode: 'idle', progress: 0 };

export function step(state: ModeState, event: ModeEvent, progress = 0): ModeState {
  const mode = transition(state.mode, event);
  const next = mode === 'precomputing' ? progress : 0;
  if (mode === state.mode && next === state.progress) return state;
  return { mode, progress: next };
}

export function withProgress(state: ModeState, progress: number): ModeState {
  if (state.mode !== 'precomputing' || state.progress === progress) return state;
  return { mode: state.mode, progress };
}
