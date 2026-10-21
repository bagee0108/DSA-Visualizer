/**
 * Knuth-Morris-Pratt: build the failure function by sliding the pattern
 * along itself, then slide it along the text without ever moving back.
 */

import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { randomInt } from '../../core/random';
import { ArrayScene } from '../../core/scene';
import { parseString, randomString, stringField } from '../../core/stringInput';
import type { EntityId, Highlights } from '../../core/types';
import { stepIds } from '../../core/steps';

interface KmpInput {
  readonly text: string;
  readonly pattern: string;
}

/** Long enough for a few overlapping matches, short enough that every tile keeps its corner note. */
export const MAX_TEXT = 24;
export const MAX_PATTERN = 12;

const CODE = `function kmp(text: string, pattern: string): number[] {
  const m = pattern.length;
  const pi = new Array(m).fill(0);         // pi[i]: longest border of pattern[0..i]
  let k = 0;                               // length of the border being extended
  let i = 1;
  while (i < m) {
    if (pattern[i] === pattern[k]) {
      k++;                                 // the border grows by one
      pi[i++] = k;
    } else if (k > 0) {
      k = pi[k - 1];                       // fall back to the next shorter border
    } else {
      pi[i++] = 0;                         // no border ends at i
    }
  }

  const found: number[] = [];
  let j = 0;                               // pattern chars matched so far
  i = 0;                                   // i never moves backwards
  while (i < text.length) {
    if (text[i] === pattern[j]) {
      i++;
      j++;
      if (j === m) {
        found.push(i - m);                 // a whole match ends at i - 1
        j = pi[j - 1];                     // carry on: matches may overlap
      }
    } else if (j > 0) {
      j = pi[j - 1];                       // slide the pattern, keep the border
    } else {
      i++;                                 // nothing matched: move on
    }
  }
  return found;
}`;

export const LINE = {
  pi: 3,
  test: 7,
  grow: 9,
  fallBack: 11,
  none: 13,
  j: 18,
  compare: 21,
  advance: 23,
  whole: 25,
  carry: 26,
  slide: 29,
  moveOn: 31,
  ret: 34,
} as const;
export const STEP = stepIds(LINE);

const PREFIX = 'prefix comparisons';
const SEARCH = 'search comparisons';

const presets: readonly PresetSpec[] = [
  {
    id: 'classic',
    label: 'Textbook',
    build: () => ({ text: 'ABABDABACDABABCABAB', pattern: 'ABABCABAB' }),
  },
  {
    id: 'overlap',
    label: 'Overlapping',
    build: (size) => ({ text: 'A'.repeat(size), pattern: 'AAA' }),
  },
  {
    id: 'dna',
    label: 'DNA',
    build: (size, rng) => {
      const pattern = randomString(rng, randomInt(rng, 3, Math.min(5, size)), 'ACGT');
      const text = randomString(rng, size, 'ACGT');
      const at = randomInt(rng, 0, size - pattern.length);
      return { text: text.slice(0, at) + pattern + text.slice(at + pattern.length), pattern };
    },
  },
  {
    id: 'near-misses',
    label: 'Near misses',
    build: (size) => ({ text: 'AAAB'.repeat(Math.ceil(size / 4)).slice(0, size), pattern: 'AAAA' }),
  },
];

function parse(params: ParamMap): ParseResult<KmpInput> {
  const text = parseString(params.text ?? '', 'Text', MAX_TEXT);
  if (!text.ok) return text;
  const pattern = parseString(params.pattern ?? '', 'Pattern', MAX_PATTERN);
  if (!pattern.ok) return pattern;
  if (pattern.value.length > text.value.length) {
    return { ok: false, error: `The pattern (${pattern.value.length}) is longer than the text (${text.value.length}), so it cannot occur in it.` };
  }
  return { ok: true, value: { text: text.value, pattern: pattern.value } };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let at = from; at <= to; at++) out.push(at);
  return out;
}

/** A matched run: the same span in both rows. */
function run(from: number, to: number): EntityId[] {
  const span = range(from, to);
  return [...span, ...span.map((index) => `aux:${index}`)];
}

export const kmp = defineAlgorithm<KmpInput>({
  meta: {
    id: 'kmp',
    name: 'KMP',
    category: 'strings',
    structureKind: 'array',
    blurb: 'Build the failure function, then match without ever backing up.',
    complexity: {
      time: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' },
      space: 'O(m)',
      notes: [
        'i only ever moves forward through the text. A mismatch slides the pattern right instead of re-reading text, which is why there is no n*m worst case.',
        'Every comparison either advances i or slides the pattern at least one place, so the search makes at most 2n comparisons; the failure function at most 2m.',
        'The failure function is the same search run on the pattern against itself: pi[i] is the longest border of pattern[0..i], a prefix that is also a suffix.',
      ],
    },
    code: CODE,
    stepLines: LINE,
    trackedCounters: ['comparisons'],
  },
  fields: [
    stringField('text', 'Text', 'ABABDABACDABABCABAB', MAX_TEXT),
    stringField('pattern', 'Pattern', 'ABABCABAB', MAX_PATTERN),
  ],
  presets,
  sizeRange: { min: 4, max: MAX_TEXT, step: 1 },
  sizeOf: (params) => (params.text ?? '').replace(/\s+/g, '').length,
  parse,
  *run({ text, pattern }) {
    const m = pattern.length;
    const n = text.length;
    const letters = [...pattern];
    const pi = new Array<number>(m).fill(0);
    const notes = (count: number): string[] => pi.slice(0, count).map(String);

    // Phase 1: the pattern is the main row, and its own prefix slides beneath it.
    const self = new ArrayScene<string>(letters);
    self.bump(PREFIX, 0);
    self.bump(SEARCH, 0);
    self.setNote(0, '0');

    let k = 0;
    let i = 1;
    yield self.frame({
      step: STEP.pi,
      phase: 'failure function',
      explanation: `First, pi for "${pattern}": pi[i] is the length of the longest proper prefix of pattern[0..i] that is also its suffix. The small number in a tile's corner is its pi. pi[0] = 0, since one character has no proper border.`,
    });

    while (i < m) {
      // The prefix being extended, slid so its next character pattern[k] sits under pattern[i].
      self.placeAux(`border, k = ${k}`, letters.slice(0, k + 1), i - k, notes(k + 1));
      const border = k === 0 ? [] : run(i - k, i - 1);
      self.countComparison();
      self.bump(PREFIX);
      const same = letters[i] === letters[k];
      yield self.frame({
        step: STEP.test,
        phase: 'failure function',
        explanation: `${k === 0 ? 'No border to extend yet.' : `The border "${pattern.slice(0, k)}" ends just before i.`} pattern[${i}] = '${letters[i]}' against pattern[${k}] = '${letters[k]}': ${same ? 'equal' : 'different'}.`,
        highlights: { comparing: [i, `aux:${i}`], active: border },
        pointers: { i },
        auxPointers: { k: i },
      });

      if (same) {
        k += 1;
        pi[i] = k;
        self.setNote(i, String(k));
        yield self.frame({
          step: STEP.grow,
          phase: 'failure function',
          explanation: `The border grows to ${k}, so pi[${i}] = ${k}: "${pattern.slice(0, k)}" is both a prefix and a suffix of "${pattern.slice(0, i + 1)}".`,
          highlights: { sorted: [i], active: run(i - k + 1, i) },
          pointers: { i },
          auxPointers: { k: i },
        });
        i += 1;
      } else if (k > 0) {
        const shorter = pi[k - 1] ?? 0;
        yield self.frame({
          step: STEP.fallBack,
          phase: 'failure function',
          explanation: `It cannot grow. The next shorter border to try is pi[${k - 1}] = ${shorter}, read from the corner of pattern[${k - 1}]. Slide the prefix so ${shorter === 0 ? 'nothing' : `only "${pattern.slice(0, shorter)}"`} stays lined up; i stays put.`,
          highlights: { candidate: [`aux:${i - 1}`], active: border },
          pointers: { i },
          auxPointers: { k: i },
        });
        k = shorter;
      } else {
        self.setNote(i, '0');
        yield self.frame({
          step: STEP.none,
          phase: 'failure function',
          explanation: `pi[${i}] = 0: no prefix of "${pattern.slice(0, i + 1)}" is also its suffix.`,
          highlights: { sorted: [i] },
          pointers: { i },
          auxPointers: { k: i },
        });
        i += 1;
      }
    }

    // Phase 2: the text is the main row; the pattern, captioned with pi, slides along it.
    const scene = new ArrayScene<string>([...text]);
    const prefixComparisons = self.counters().comparisons;
    scene.countComparison(prefixComparisons);
    scene.bump(PREFIX, prefixComparisons);
    scene.bump(SEARCH, 0);

    const found: number[] = [];
    const piNotes = notes(m);
    let j = 0;
    /** The pattern at shift at - j, cut short where it would hang off the end of the text. */
    const placePattern = (at: number): void => {
      const shift = at - j;
      const fits = Math.min(m, n - shift);
      scene.placeAux(fits < m ? `pattern at ${shift}, overhanging` : `pattern at ${shift}`, letters.slice(0, fits), shift, piNotes);
    };
    const look = (extra: Highlights): Highlights => {
      const done = found.flatMap((start) => range(start, start + m - 1));
      return done.length === 0 ? extra : { sorted: done, ...extra };
    };
    const matched = (at: number): EntityId[] => (j === 0 ? [] : run(at - j, at - 1));

    placePattern(0);
    yield scene.frame({
      step: STEP.j,
      phase: 'search',
      explanation: `pi is [${pi.join(', ')}]. Now the text. i walks it once, left to right, and never steps back; j counts the pattern characters matched so far. On a mismatch the pattern slides right instead.`,
      pointers: { i: 0 },
      auxPointers: { j: 0 },
    });

    let at = 0;
    while (at < n) {
      placePattern(at);
      scene.countComparison();
      scene.bump(SEARCH);
      const same = text[at] === letters[j];
      yield scene.frame({
        step: STEP.compare,
        phase: 'search',
        explanation: `${j === 0 ? 'Nothing matched yet.' : `${j} matched so far.`} text[${at}] = '${text[at]}' against pattern[${j}] = '${letters[j]}': ${same ? 'equal' : 'different'}.`,
        highlights: look({ comparing: [at, `aux:${at}`], active: matched(at) }),
        pointers: { i: at },
        auxPointers: { j: at },
      });

      if (same) {
        const before = j;
        j += 1;
        yield scene.frame({
          step: STEP.advance,
          phase: 'search',
          explanation: `Both advance: j becomes ${j}${j === m ? ', the whole pattern' : ''}, and i moves past ${at}.`,
          highlights: look({ active: run(at - before, at) }),
          pointers: { i: at },
          auxPointers: { j: at },
        });
        if (j === m) {
          const start = at - m + 1;
          found.push(start);
          yield scene.frame({
            step: STEP.whole,
            phase: 'search',
            explanation: `Match at ${start}: text[${start}..${at}] is "${pattern}".`,
            highlights: look({}),
            pointers: { i: at },
            auxPointers: { j: at },
          });
          const keep = pi[m - 1] ?? 0;
          yield scene.frame({
            step: STEP.carry,
            phase: 'search',
            explanation:
              keep === 0
                ? `Carry on. pi[${m - 1}] = 0, so the next match cannot overlap this one.`
                : `Carry on. pi[${m - 1}] = ${keep}: the match ends in "${pattern.slice(0, keep)}", so keep that much matched and look for an overlapping match.`,
            highlights: look({ candidate: [`aux:${at}`] }),
            pointers: { i: at },
            auxPointers: { j: at },
          });
          j = keep;
        }
        at += 1;
      } else if (j > 0) {
        const keep = pi[j - 1] ?? 0;
        yield scene.frame({
          step: STEP.slide,
          phase: 'search',
          explanation:
            keep === 0
              ? `Mismatch. pi[${j - 1}] = 0: no border of "${pattern.slice(0, j)}" can stay lined up, so the pattern slides until its start is under i. i does not move.`
              : `Mismatch. pi[${j - 1}] = ${keep}: the matched "${pattern.slice(0, j)}" ends in "${pattern.slice(0, keep)}", which is also how the pattern starts. Slide it ${j - keep} right so that border stays matched; i does not move.`,
          highlights: look({ candidate: [`aux:${at - 1}`], active: matched(at) }),
          pointers: { i: at },
          auxPointers: { j: at },
        });
        j = keep;
      } else {
        yield scene.frame({
          step: STEP.moveOn,
          phase: 'search',
          explanation: 'Nothing is matched, so i moves on.',
          highlights: look({}),
          pointers: { i: at },
          auxPointers: { j: at },
        });
        at += 1;
      }
    }

    const counters = scene.counters();
    yield scene.frame({
      step: STEP.ret,
      phase: 'done',
      explanation: `${
        found.length === 0 ? `"${pattern}" does not occur in the text.` : `"${pattern}" occurs at ${found.join(', ')}.`
      } The search made ${counters.extra[SEARCH] ?? 0} comparisons over ${n} characters (at most 2n = ${2 * n}); pi took ${counters.extra[PREFIX] ?? 0}.`,
      highlights: look({}),
    });
  },
});
