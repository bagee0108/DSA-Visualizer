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
