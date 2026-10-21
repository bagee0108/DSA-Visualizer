/** Edit distance (Levenshtein): fill the table, then trace one cheapest edit script back. */

import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { cellRef, colRef, MatrixScene, rowRef } from '../../core/matrixScene';
import { randomInt } from '../../core/random';
import { mutate, parseString, randomString, stringField, stringPairSize } from '../../core/stringInput';
import type { EntityId, MatrixArrow, MatrixCell, Strip, StripItem } from '../../core/types';
import { stepIds } from '../../core/steps';

interface EditInput {
  readonly a: string;
  readonly b: string;
}

const CODE = `function editDistance(a: string, b: string): { distance: number; edits: string[] } {
  const n = a.length;
  const m = b.length;
  const D = table(n + 1, m + 1);              // D[i][j]: edits turning a[0..i) into b[0..j)

  for (let i = 0; i <= n; i++) D[i][0] = i;   // delete all i characters
  for (let j = 0; j <= m; j++) D[0][j] = j;   // insert all j characters

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        D[i][j] = D[i - 1][j - 1];            // same character: free
      } else {
        D[i][j] = 1 + Math.min(
          D[i - 1][j],                        // delete a[i - 1]
          D[i][j - 1],                        // insert b[j - 1]
          D[i - 1][j - 1],                    // replace a[i - 1] with b[j - 1]
        );
      }
    }
  }

  const edits: string[] = [];                 // walk back for one cheapest script
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.unshift('keep ' + a[i - 1]); i--; j--;
    } else if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + 1) {
      edits.unshift('replace ' + a[i - 1] + ' with ' + b[j - 1]); i--; j--;
    } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
      edits.unshift('delete ' + a[i - 1]); i--;
    } else {
      edits.unshift('insert ' + b[j - 1]); j--;
    }
  }
  return { distance: D[n][m], edits };
}`;

const LINE = {
  table: 4,
  baseCol: 6,
  baseRow: 7,
  test: 11,
  keep: 12,
  min: 14,
  trace: 23,
  traceKeep: 28,
  traceReplace: 30,
  traceDelete: 32,
  traceInsert: 34,
  ret: 37,
} as const;
const STEP = stepIds(LINE);

const ALPHABET = 'ABCDEFGH';

const presets: readonly PresetSpec[] = [
  {
    id: 'classic',
    label: 'kitten',
    build: () => ({ a: 'kitten', b: 'sitting' }),
  },
  {
    id: 'sunday',
    label: 'sunday',
    build: () => ({ a: 'sunday', b: 'saturday' }),
  },
  {
    id: 'typos',
    label: 'A few typos',
    build: (size, rng) => {
      const a = randomString(rng, size, ALPHABET);
      return { a, b: mutate(rng, a, Math.max(1, Math.floor(size / 3)), ALPHABET) };
    },
  },
  {
    id: 'random',
    label: 'Unrelated',
    build: (size, rng) => ({ a: randomString(rng, size, ALPHABET), b: randomString(rng, randomInt(rng, Math.max(2, size - 3), size), ALPHABET) }),
  },
];

function parse(params: ParamMap): ParseResult<EditInput> {
  const a = parseString(params.a ?? '', 'From');
  if (!a.ok) return a;
  const b = parseString(params.b ?? '', 'To');
  if (!b.ok) return b;
  return { ok: true, value: { a: a.value, b: b.value } };
}

type Move = 'keep' | 'replace' | 'delete' | 'insert';

/** Where each move comes from, relative to the cell it fills. */
const DELTA: Record<Move, readonly [number, number]> = {
  keep: [1, 1],
  replace: [1, 1],
  delete: [1, 0],
  insert: [0, 1],
};

function arrow(to: MatrixCell, move: Move): MatrixArrow {
  const [dr, dc] = DELTA[move];
  return { from: { row: to.row - dr, col: to.col - dc }, to, label: move };
}

export const editDistance = defineAlgorithm<EditInput>({
  meta: {
    id: 'edit-distance',
    name: 'Edit distance',
    category: 'dynamic-programming',
    structureKind: 'matrix',
    blurb: 'Levenshtein table with insert / delete / replace arrows, then the cheapest edit script.',
    complexity: {
      time: { best: 'O(nm)', average: 'O(nm)', worst: 'O(nm)' },
      space: 'O(nm)',
      notes: [
        'Same shape as LCS, with costs instead of lengths: a match is free, and every other move costs one.',
        'Up is a delete, left is an insert, the diagonal is a replace or a free keep. The traceback reads the script off those directions.',
        'The distance alone needs two rows, O(min(n, m)) space. Damerau-Levenshtein adds a fourth move, swapping two neighbours.',
      ],
    },
    code: CODE,
    stepLines: LINE,
    trackedCounters: ['comparisons', 'reads', 'writes'],
  },
  fields: [stringField('a', 'From', 'kitten'), stringField('b', 'To', 'sitting')],
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
      rowTitle: 'i: prefix of from',
      colTitle: 'j: prefix of to',
    });
    const script: StripItem[] = [];
    const strips = (): readonly Strip[] => [{ kind: 'output', label: 'edits', items: [...script] }];

    yield scene.frame({
      step: STEP.table,
      phase: 'setup',
      explanation: `D[i][j] will hold the fewest edits that turn the first i characters of "${a}" into the first j of "${b}". Each insert, delete or replace costs one.`,
      strips: strips(),
    });

    const column: EntityId[] = [];
    for (let i = 0; i <= n; i++) {
      scene.write(i, 0, i);
      column.push(cellRef(i, 0));
    }
    yield scene.frame({
      step: STEP.baseCol,
      phase: 'base case',
      explanation: 'Turning i characters into nothing takes i deletes, so column 0 counts up.',
      highlights: { active: column },
      strips: strips(),
    });

    const row: EntityId[] = [];
    for (let j = 0; j <= m; j++) {
      scene.write(0, j, j);
      row.push(cellRef(0, j));
    }
    yield scene.frame({
      step: STEP.baseRow,
      phase: 'base case',
      explanation: 'Turning nothing into j characters takes j inserts, so row 0 counts up too.',
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
          explanation: `D[${i}][${j}]: compare a[${i - 1}] = '${ca}' with b[${j - 1}] = '${cb}'.`,
          highlights: { active: [cellRef(i, j)], comparing: [rowRef(i), colRef(j)] },
          pointers,
          strips: strips(),
        });

        if (ca === cb) {
          const diagonal = scene.read(i - 1, j - 1);
          scene.write(i, j, diagonal);
          yield scene.frame({
            step: STEP.keep,
            phase: 'fill',
            explanation: `'${ca}' is already right, so keeping it is free: the diagonal's ${diagonal} carries over.`,
            highlights: { active: [cellRef(i, j)], comparing: [cellRef(i - 1, j - 1)], sorted: [rowRef(i), colRef(j)] },
            pointers,
            arrows: [arrow(here, 'keep')],
            strips: strips(),
          });
          continue;
        }

        const cost: Record<Exclude<Move, 'keep'>, number> = {
          delete: scene.read(i - 1, j),
          insert: scene.read(i, j - 1),
          replace: scene.read(i - 1, j - 1),
        };
        scene.countComparison(2);
        const best = Math.min(cost.delete, cost.insert, cost.replace);
        scene.write(i, j, best + 1);

        const kept: EntityId[] = [];
        const dropped: EntityId[] = [];
        const winners: string[] = [];
        for (const move of ['delete', 'insert', 'replace'] as const) {
          const source = arrow(here, move).from;
          if (cost[move] === best) {
            kept.push(cellRef(source.row, source.col));
            winners.push(move);
          } else {
            dropped.push(cellRef(source.row, source.col));
          }
        }
        const how = winners.length === 1 ? `${winners[0]} is cheapest` : `${winners.join(' and ')} tie`;
        yield scene.frame({
          step: STEP.min,
          phase: 'fill',
          explanation: `'${ca}' ≠ '${cb}', so one edit is needed here. Delete ${cost.delete}, insert ${cost.insert}, replace ${cost.replace}: ${how}, so 1 + ${best} = ${best + 1}.`,
          highlights: { active: [cellRef(i, j)], comparing: kept, excluded: dropped },
          pointers,
          arrows: [arrow(here, 'delete'), arrow(here, 'insert'), arrow(here, 'replace')],
          strips: strips(),
        });
      }
    }

    const distance = scene.peek(n, m) ?? 0;
    let i = n;
    let j = m;
    scene.walk(i, j);
    yield scene.frame({
      step: STEP.trace,
      phase: 'traceback',
      explanation: `D[${n}][${m}] = ${distance} is the distance. Walk back from the corner to read off one script that achieves it.`,
      highlights: { active: [cellRef(i, j)] },
      pointers: { i: rowRef(i), j: colRef(j) },
      strips: strips(),
    });

    while (i > 0 || j > 0) {
      const here = { row: i, col: j };
      const ca = a[i - 1] ?? '';
      const cb = b[j - 1] ?? '';
      const value = scene.peek(i, j) ?? 0;
      let move: Move;
      if (i > 0 && j > 0) scene.countComparison();
      if (i > 0 && j > 0 && ca === cb) {
        move = 'keep';
      } else if (i > 0 && j > 0 && value === scene.read(i - 1, j - 1) + 1) {
        move = 'replace';
      } else if (i > 0 && value === scene.read(i - 1, j) + 1) {
        move = 'delete';
      } else {
        move = 'insert';
      }

      const id = `${i}:${j}`;
      const chip =
        move === 'keep' ? `=${ca}` : move === 'replace' ? `${ca}→${cb}` : move === 'delete' ? `-${ca}` : `+${cb}`;
      script.unshift({ id, label: chip });
      const [dr, dc] = DELTA[move];
      i -= dr;
      j -= dc;
      scene.walk(i, j);

      const said: Record<Move, string> = {
        keep: `'${ca}' matches, so keep it for free and step back along the diagonal.`,
        replace: `D came from the diagonal plus one: replace '${ca}' with '${cb}'.`,
        delete: `D came from above plus one: delete '${ca}'.`,
        insert: `D came from the left plus one: insert '${cb}'.`,
      };
      yield scene.frame({
        step: { keep: STEP.traceKeep, replace: STEP.traceReplace, delete: STEP.traceDelete, insert: STEP.traceInsert }[move],
        phase: 'traceback',
        explanation: said[move],
        highlights: { active: [cellRef(i, j)], candidate: [`output:${id}`] },
        pointers: { i: rowRef(i), j: colRef(j) },
        arrows: [arrow(here, move)],
        strips: strips(),
      });
    }

    const changes = script.filter((item) => !item.label.startsWith('='));
    yield scene.frame({
      step: STEP.ret,
      phase: 'done',
      explanation:
        distance === 0
          ? `The strings are equal: distance 0, every character kept.`
          : `Distance ${distance}: ${changes.map((item) => item.label).join(', ')}. Read the edits strip left to right to turn "${a}" into "${b}".`,
      highlights: { candidate: changes.map((item) => `output:${item.id}`) },
      strips: strips(),
    });
  },
});
