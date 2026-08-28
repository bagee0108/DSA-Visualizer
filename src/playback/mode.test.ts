import { describe, expect, it } from 'vitest';

import { accepts, canEdit, hasFrames, INITIAL_STATE, step, transition, withProgress, type Mode, type ModeEvent } from './mode';

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

describe('precompute progress', () => {
  it('carries progress only while precomputing, and zeroes it everywhere else', () => {
    const building = step(INITIAL_STATE, 'precompute', 0.4);
    expect(building).toEqual({ mode: 'precomputing', progress: 0.4 });
    expect(step(building, 'ready')).toEqual({ mode: 'paused', progress: 0 });
    expect(step(step(building, 'ready'), 'play').progress).toBe(0);
    expect(step(building, 'invalidate')).toEqual({ mode: 'idle', progress: 0 });
  });

  it('updates progress in place without leaving precomputing', () => {
    const building = step(INITIAL_STATE, 'precompute', 0.1);
    const later = withProgress(building, 0.7);
    expect(later).toEqual({ mode: 'precomputing', progress: 0.7 });
    expect(withProgress(later, 0.7)).toBe(later);
  });

  it('refuses to attach progress to a mode that is not precomputing', () => {
    const paused = step(step(INITIAL_STATE, 'precompute'), 'ready');
    expect(withProgress(paused, 0.5)).toBe(paused);
    expect(step(paused, 'play', 0.9).progress).toBe(0);
  });

  it('returns the same object when nothing moved, so React can bail out', () => {
    const paused = step(step(INITIAL_STATE, 'precompute'), 'ready');
    expect(step(paused, 'ready')).toBe(paused);
    expect(step(INITIAL_STATE, 'play')).toBe(INITIAL_STATE);
  });
});
