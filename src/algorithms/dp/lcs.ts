/** Longest common subsequence: fill the table, then trace one answer back from the corner. */

import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { cellRef, colRef, MatrixScene, rowRef } from '../../core/matrixScene';
import { randomInt } from '../../core/random';
import { mutate, parseString, randomString, stringField, stringPairSize } from '../../core/stringInput';
import type { EntityId, MatrixArrow, MatrixCell, Strip, StripItem } from '../../core/types';
import { stepIds } from '../../core/steps';

interface LcsInput {
  readonly a: string;
  readonly b: string;
}

const CODE = `function lcs(a: string, b: string): string {
  const n = a.length;
  const m = b.length;
  const L = table(n + 1, m + 1);              // L[i][j]: LCS length of a[0..i) and b[0..j)

  for (let i = 0; i <= n; i++) L[i][0] = 0;   // nothing in common with an empty b
  for (let j = 0; j <= m; j++) L[0][j] = 0;   // nor with an empty a

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        L[i][j] = L[i - 1][j - 1] + 1;        // match: one longer than the diagonal
      } else {
        L[i][j] = Math.max(L[i - 1][j], L[i][j - 1]);  // skip a char of a, or of b
      }
    }
  }

  let i = n;                                  // trace back from the corner
  let j = m;
  let out = '';
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out = a[i - 1] + out;                   // a matched char is part of the answer
      i--;
      j--;
    } else if (L[i - 1][j] >= L[i][j - 1]) {
      i--;                                    // the value came from above
    } else {
      j--;                                    // the value came from the left
    }
  }
  return out;
}`;

const LINE = {
  table: 4,
  baseCol: 6,
  baseRow: 7,
  test: 11,
  match: 12,
  skip: 14,
  trace: 19,
  traceTest: 23,
  take: 24,
  up: 28,
  left: 30,
  ret: 33,
} as const;
const STEP = stepIds(LINE);

const ALPHABET = 'ABCDEFGH';
const DNA = 'ACGT';

const presets: readonly PresetSpec[] = [
  {
    id: 'classic',
    label: 'Textbook',
    build: () => ({ a: 'ABCBDAB', b: 'BDCABA' }),
  },
  {
    id: 'dna',
    label: 'DNA',
    build: (size, rng) => ({ a: randomString(rng, size, DNA), b: randomString(rng, randomInt(rng, Math.max(2, size - 2), size), DNA) }),
  },
  {
    id: 'similar',
    label: 'Near copies',
    build: (size, rng) => {
      const a = randomString(rng, size, ALPHABET);
      return { a, b: mutate(rng, a, Math.max(1, Math.floor(size / 4)), ALPHABET) };
    },
  },
  {
    id: 'disjoint',
    label: 'Nothing shared',
    build: (size, rng) => ({ a: randomString(rng, size, 'ABCD'), b: randomString(rng, size, 'WXYZ') }),
  },
];

function parse(params: ParamMap): ParseResult<LcsInput> {
  const a = parseString(params.a ?? '', 'String a');
  if (!a.ok) return a;
  const b = parseString(params.b ?? '', 'String b');
  if (!b.ok) return b;
  return { ok: true, value: { a: a.value, b: b.value } };
}

function arrow(from: MatrixCell, to: MatrixCell, label: string): MatrixArrow {
  return { from, to, label };
}

export const lcs = defineAlgorithm<LcsInput>({
  meta: {
    id: 'lcs',
    name: 'Longest common subsequence',
    category: 'dynamic-programming',
    structureKind: 'matrix',
    blurb: 'Fill the table in computation order with dependency arrows, then trace the answer back.',
    complexity: {
      time: { best: 'O(nm)', average: 'O(nm)', worst: 'O(nm)' },
      space: 'O(nm)',
      notes: [
        'Each cell needs only its upper, left and upper-left neighbours, so filling row by row always has them ready.',
        'The length alone needs two rows of the table, O(min(n, m)) space. Recovering the subsequence needs the whole table, or Hirschberg\'s divide and conquer.',
        'Ties in the traceback can go either way. Each choice gives a different subsequence of the same length.',
      ],
    },
    code: CODE,
    stepLines: LINE,
    trackedCounters: ['comparisons', 'reads', 'writes'],
  },
  fields: [stringField('a', 'String a', 'ABCBDAB'), stringField('b', 'String b', 'BDCABA')],
  presets,
  sizeRange: { min: 2, max: 12, step: 1 },
  sizeOf: stringPairSize,
  parse,
  *run({ a, b }) {
    const n = a.length;
    const m = b.length;
    const scene = new MatrixScene({
      rowHeaders: ['ε', ...a],
      colHeaders: ['ε', ...b],
      rowTitle: 'i: prefix of a',
      colTitle: 'j: prefix of b',
    });
    const answer: StripItem[] = [];
    const strips = (): readonly Strip[] => [{ kind: 'output', label: 'lcs', items: [...answer] }];

    yield scene.frame({
      step: STEP.table,
      phase: 'setup',
      explanation: `L[i][j] will hold the LCS length of the first i characters of "${a}" and the first j of "${b}". Row and column 0 stand for an empty prefix.`,
      strips: strips(),
    });

    const column: EntityId[] = [];
    for (let i = 0; i <= n; i++) {
      scene.write(i, 0, 0);
      column.push(cellRef(i, 0));
    }
    yield scene.frame({
      step: STEP.baseCol,
      phase: 'base case',
      explanation: 'An empty b has nothing in common with any prefix of a, so column 0 is all zeros.',
      highlights: { active: column },
      strips: strips(),
    });

    const row: EntityId[] = [];
    for (let j = 0; j <= m; j++) {
      scene.write(0, j, 0);
      row.push(cellRef(0, j));
    }
    yield scene.frame({
      step: STEP.baseRow,
      phase: 'base case',
      explanation: 'Likewise an empty a: row 0 is all zeros.',
      highlights: { active: row },
      strips: strips(),
    });

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const ca = a[i - 1] ?? '';
        const cb = b[j - 1] ?? '';
        const here = { row: i, col: j };
        const pointers = { i: rowRef(i), j: colRef(j) };

        scene.countComparison();
        yield scene.frame({
          step: STEP.test,
          phase: 'fill',
          explanation: `L[${i}][${j}]: compare a[${i - 1}] = '${ca}' with b[${j - 1}] = '${cb}'.`,
          highlights: { active: [cellRef(i, j)], comparing: [rowRef(i), colRef(j)] },
          pointers,
          strips: strips(),
        });

        if (ca === cb) {
          const diagonal = scene.read(i - 1, j - 1);
          scene.write(i, j, diagonal + 1);
          yield scene.frame({
            step: STEP.match,
            phase: 'fill',
            explanation: `'${ca}' matches, so it can end a common subsequence: one longer than the diagonal, ${diagonal} + 1 = ${diagonal + 1}.`,
            highlights: { active: [cellRef(i, j)], comparing: [cellRef(i - 1, j - 1)], sorted: [rowRef(i), colRef(j)] },
            pointers,
            arrows: [arrow({ row: i - 1, col: j - 1 }, here, 'match +1')],
            strips: strips(),
          });
        } else {
          const up = scene.read(i - 1, j);
          const left = scene.read(i, j - 1);
          scene.countComparison();
          const best = Math.max(up, left);
          scene.write(i, j, best);
          const kept: EntityId[] = [];
          const dropped: EntityId[] = [];
          (up === best ? kept : dropped).push(cellRef(i - 1, j));
          (left === best ? kept : dropped).push(cellRef(i, j - 1));
          const why =
            up === left
              ? `both give ${best}`
              : up > left
                ? `skipping '${ca}' keeps ${up}, more than the ${left} from skipping '${cb}'`
                : `skipping '${cb}' keeps ${left}, more than the ${up} from skipping '${ca}'`;
          yield scene.frame({
            step: STEP.skip,
            phase: 'fill',
            explanation: `'${ca}' ≠ '${cb}', so one of them is not in the answer. Take the better of up and left: ${why}.`,
            highlights: { active: [cellRef(i, j)], comparing: kept, excluded: dropped },
            pointers,
            arrows: [arrow({ row: i - 1, col: j }, here, 'skip a'), arrow({ row: i, col: j - 1 }, here, 'skip b')],
            strips: strips(),
          });
        }
      }
    }

    const length = scene.peek(n, m) ?? 0;
    let i = n;
    let j = m;
    const taken: EntityId[] = [];
    scene.walk(i, j);
    yield scene.frame({
      step: STEP.trace,
      phase: 'traceback',
      explanation: `L[${n}][${m}] = ${length} is the answer's length. Walk back from the corner, following where each value came from, to recover the characters.`,
      highlights: { active: [cellRef(i, j)] },
      pointers: { i: rowRef(i), j: colRef(j) },
      strips: strips(),
    });

    while (i > 0 && j > 0) {
      const ca = a[i - 1] ?? '';
      const cb = b[j - 1] ?? '';
      const from = { row: i, col: j };
      scene.countComparison();

      if (ca === cb) {
        answer.unshift({ id: `a${i - 1}`, label: ca });
        taken.push(rowRef(i), colRef(j));
        i -= 1;
        j -= 1;
        scene.walk(i, j);
        yield scene.frame({
          step: STEP.take,
          phase: 'traceback',
          explanation: `'${ca}' matched here, so it is in the answer. Step back along the diagonal.`,
          highlights: { active: [cellRef(i, j)], sorted: [...taken], candidate: [`output:a${i}`] },
          pointers: { i: rowRef(i), j: colRef(j) },
          arrows: [arrow({ row: i, col: j }, from, 'match +1')],
          strips: strips(),
        });
        continue;
      }

      const up = scene.read(i - 1, j);
      const left = scene.read(i, j - 1);
      scene.countComparison();
      const goUp = up >= left;
      if (goUp) i -= 1;
      else j -= 1;
      scene.walk(i, j);
      yield scene.frame({
        step: goUp ? STEP.up : STEP.left,
        phase: 'traceback',
        explanation: goUp
          ? `'${ca}' ≠ '${cb}'. The value came from above (${up}${up === left ? ', a tie, broken upward' : ` > ${left}`}), so '${ca}' is skipped.`
          : `'${ca}' ≠ '${cb}'. The value came from the left (${left} > ${up}), so '${cb}' is skipped.`,
        highlights: { active: [cellRef(i, j)], sorted: [...taken] },
        pointers: { i: rowRef(i), j: colRef(j) },
        arrows: [arrow({ row: i, col: j }, from, goUp ? 'skip a' : 'skip b')],
        strips: strips(),
      });
    }

    const text = answer.map((item) => item.label).join('');
    yield scene.frame({
      step: STEP.ret,
      phase: 'done',
      explanation:
        length === 0
          ? `The walk reached an edge without a match: "${a}" and "${b}" share no character, so the LCS is empty.`
          : `The walk reached an edge. The LCS is "${text}", length ${length}. Its characters are the matched rows and columns.`,
      highlights: { sorted: [...taken] },
      strips: strips(),
    });
  },
});
