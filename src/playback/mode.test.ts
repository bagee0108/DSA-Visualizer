import { describe, expect, it } from 'vitest';

import { accepts, canEdit, hasFrames, transition, type Mode, type ModeEvent } from './mode';

const MODES: readonly Mode[] = ['idle', 'precomputing', 'paused', 'playing', 'editing'];
const EVENTS: readonly ModeEvent[] = ['invalidate', 'precompute', 'ready', 'play', 'pause', 'end', 'edit', 'commit'];

describe('playback mode machine', () => {
  it('builds a run through idle -> precomputing -> paused -> playing', () => {
    let mode: Mode = 'idle';
    mode = transition(mode, 'precompute');
    expect(mode).toBe('precomputing');
    mode = transition(mode, 'ready');
    expect(mode).toBe('paused');
    mode = transition(mode, 'play');
    expect(mode).toBe('playing');
    expect(transition(mode, 'pause')).toBe('paused');
    expect(transition(mode, 'end')).toBe('paused');
  });

  it('discards the run on any structural change, from any mode that has one', () => {
    for (const mode of ['precomputing', 'paused', 'playing'] as const) {
      expect(transition(mode, 'invalidate')).toBe('idle');
    }
    expect(transition('paused', 'edit')).toBe('editing');
    expect(transition('playing', 'edit')).toBe('editing');
    expect(transition('editing', 'commit')).toBe('idle');
  });

  it('never keeps frames across an edit: every mode with frames leaves them on edit', () => {
    for (const mode of MODES) {
      if (!hasFrames(mode)) continue;
      const next = transition(mode, 'edit');
      expect(hasFrames(next), `${mode} -> edit`).toBe(false);
      expect(canEdit(next), `${mode} -> edit lands somewhere editable`).toBe(true);
    }
  });

  it('cannot play without frames and cannot edit with them', () => {
    expect(accepts('idle', 'play')).toBe(false);
    expect(accepts('precomputing', 'play')).toBe(false);
    expect(accepts('editing', 'play')).toBe(false);
    expect(canEdit('paused')).toBe(false);
    expect(canEdit('playing')).toBe(false);
    expect(canEdit('idle')).toBe(true);
  });

  it('ignores events a mode does not accept, staying put', () => {
    for (const mode of MODES) {
      for (const event of EVENTS) {
        const next = transition(mode, event);
        if (!accepts(mode, event)) expect(next, `${mode} + ${event}`).toBe(mode);
        expect(MODES).toContain(next);
      }
    }
  });

  it('is only leavable from editing through commit', () => {
    for (const event of EVENTS) {
      expect(transition('editing', event)).toBe(event === 'commit' ? 'idle' : 'editing');
    }
  });
});
