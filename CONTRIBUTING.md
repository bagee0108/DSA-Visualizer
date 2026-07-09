# Adding an algorithm

The whole point of the architecture is that this is a short list. You write one
pure generator and register it; the player, the scrub bar, the code panel, the
counters, the URL state and the home page entry all come for free.

## 1. Write the generator

Create `src/algorithms/<family>/<name>.ts`. A generator yields `Frame` objects
that each describe the **complete** visual state at that instant.

```ts
import { arrayField, arrayPresets, parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { ArrayScene } from '../../core/scene';

interface BubbleInput {
  readonly values: readonly number[];
}

const CODE = `for (let i = 0; i < n - 1; i++) {
  for (let j = 0; j < n - 1 - i; j++) {
    if (a[j] > a[j + 1]) {
      swap(a, j, j + 1);
    }
  }
}`;

function parse(params: ParamMap): ParseResult<BubbleInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array' });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { values: parsed.value } };
}

export const bubbleSort = defineAlgorithm<BubbleInput>({
  meta: {
    id: 'bubble-sort',
    name: 'Bubble sort',
    category: 'sorting',
    structureKind: 'array',
    blurb: 'Repeatedly swap adjacent pairs until nothing moves.',
    complexity: {
      time: { best: 'O(n)', average: 'O(n^2)', worst: 'O(n^2)' },
      space: 'O(1)',
    },
    code: CODE,
    trackedCounters: ['comparisons', 'swaps', 'accesses'],
    stable: true,
    inPlace: true,
  },
  fields: [arrayField],
  presets: arrayPresets,
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);
    const n = scene.length;

    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1 - i; j++) {
        const shouldSwap = scene.compare(j, j + 1) > 0;
        yield scene.frame({
          codeLine: 3,
          explanation: `Compare a[${j}] and a[${j + 1}].`,
          highlights: { comparing: [j, j + 1] },
          pointers: { i, j },
        });

        if (shouldSwap) {
          scene.swap(j, j + 1);
          yield scene.frame({
            codeLine: 4,
            explanation: `Out of order, so swap them.`,
            highlights: { swapped: [j, j + 1] },
            pointers: { i, j },
          });
        }
      }
      scene.markSorted(n - 1 - i);
    }

    scene.markSortedRange(0, n - 1);
    yield scene.frame({ codeLine: 0, explanation: 'Sorted.' });
  },
});
```

## 2. Register it

```ts
// src/algorithms/index.ts
import { bubbleSort } from './arrays/bubbleSort';

register(bubbleSort);
```

## 3. Add a catalog entry

`src/catalog.ts` drives the home page. Give the entry the **same id** as the
registered algorithm and it flips from "planned" to a working link
automatically.

## 4. Write the test

`src/algorithms/<family>/<name>.test.ts`. Test the generator, never the
rendering. Cover at least:

- the final frame holds the correct result (compare against a reference or a
  known-good built-in);
- operation counts match a reference implementation, and ideally a closed form
  for a known worst case;
- frame count is sane — bounded by the work actually done;
- every `codeLine` is inside the source, every pointer and highlight is inside
  the structure;
- the run is deterministic for identical params.

`src/algorithms/arrays/quicksort.test.ts` is the model to copy.

---

# Rules that keep this working

### A frame is the full state, not a delta

Backward stepping is an array index. If a frame only described what changed,
every backward step would require replaying from the start.

### Never mutate a frame after yielding it

`ArrayScene` handles this: it freezes each element snapshot and shares it across
consecutive frames that did not mutate the array. If you build snapshots by
hand, freeze them.

### Count operations through the scene, not by hand

`scene.compare()`, `scene.swap()`, `scene.read()` and `scene.write()` keep the
counters honest. If the algorithm on screen does a comparison, the readout must
show a comparison — that correspondence is the whole value of the panel.

### Generators must be pure

No `Math.random()`, no `Date.now()`. Randomness comes from a seed in the params
via `makeRng(seed)`, so a URL always reproduces the same run.

### Keep `codeLine` honest

The `code` string in `meta` is what the user reads. If a frame claims line 14,
line 14 must be the line that just executed. When the visualization takes a
shortcut the source does not show, say so in the explanation instead of
pointing at a line that did not run.

### Explanations are sentences, not labels

"Comparing a[3] and a[7]" is weak. "a[3] = 27 is below the pivot 45, so it
belongs in the left region" is what someone is actually here to learn.

---

# Adding a structure family

Phases 2-4 need renderers beyond arrays. The path:

1. Add the snapshot type to the `StructureSnapshot` union in `src/core/types.ts`
   (e.g. `TreeSnapshot` with `kind: 'tree'`).
2. Write `src/renderers/TreeRenderer.tsx`. It takes one snapshot plus
   highlights and pointers, and returns SVG. No state, no effects, no
   algorithm imports.
3. Add the case to the switch in `src/renderers/index.tsx`.
4. Consider a `TreeScene` in `src/core/` mirroring `ArrayScene`, so tree
   algorithms get the same free counters.

Layout maths (tree positions, force layout) may use D3 modules — `d3-hierarchy`
and friends. Rendering stays hand-written SVG; no chart or graph libraries.

---

# House rules

- **Strict TypeScript, no `any`.** `noUncheckedIndexedAccess` is on, which is
  why algorithms go through `ArrayScene` instead of touching raw arrays.
- **No `setInterval` in a render loop.** `requestAnimationFrame` or CSS
  transitions.
- **Ask before adding a dependency.** The current runtime dependency list is
  React and React DOM. That is deliberate.
- **Stay smooth at n=200** for arrays and ~150 nodes for graphs. If a frame
  needs more than a few hundred SVG nodes, simplify the drawing.
