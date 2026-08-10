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

### The tree renderer has two layouts on purpose. Do not unify them.

`layoutTree` in `src/renderers/TreeRenderer.tsx` assigns columns two different
ways depending on `snapshot.arity`, and it looks like a candidate for
simplification. It is not.

- **Binary trees put every node at x = its in-order rank.** A rotation is
  defined by the fact that it preserves in-order, so under rank layout a
  rotation renders as nodes moving *purely vertically*: the pivot rises, the
  old parent drops, the crossing subtree changes depth, and nothing moves
  sideways. That picture is the whole point of the AVL and red-black screens.
  It also makes the BST invariant visible (every node sits to the right of its
  entire left subtree). The cost is that a parent is not centred over its
  children, so edges skew toward the heavier subtree. That skew is accepted:
  it is the honest picture of subtree sizes.
- **N-ary trees (the trie) centre each node over its subtree's leaf span.** A
  trie has no in-order semantics and no rotations, so there is no order to
  preserve and no vertical-motion property to protect; leaf-span centring is
  simply the readable choice. Children are kept in lexicographic order by
  `TreeScene.attach`.

A single "tidy tree" layout that centres parents over children would make
every rotation a diagonal shuffle and destroy the property the binary branch
exists for. If a third structure needs a third layout, add a third branch.

Layout *scale* is a separate matter and is shared: slot width, level height and
the strip area are fixed for a whole run from a bound over the precomputed
frame array (`treeRunBound`), so an insertion never rescales the tree and a
node's x is a function of its rank alone. That bound is derived by the caller
and passed to the renderer as a prop. It is never written into a frame: frames
are frozen when yielded, and the bound is only known once the run has ended.

### Explanations are sentences, not labels

"Comparing a[3] and a[7]" is weak. "a[3] = 27 is below the pivot 45, so it
belongs in the left region" is what someone is actually here to learn.

Length is not free: playback dwell scales with the word count of the
explanation, so a rambling sentence slows the whole run down. Say the useful
thing and stop.

---

# Adding a structure family

Phases 2-4 need renderers beyond arrays. The path:

1. Add the snapshot type to the `StructureSnapshot` union in `src/core/types.ts`
   (e.g. `TreeSnapshot` with `kind: 'tree'`).
2. Write `src/renderers/TreeRenderer.tsx`. It takes one snapshot plus
   highlights and pointers, and returns SVG. No state, no effects, no
   algorithm imports.
3. Add the case to the switch in `src/renderers/index.tsx`.
4. Give it a scene class mirroring `ArrayScene` and `TreeScene`, so its
   algorithms get the same free counters and cached snapshots.

Layout maths may use D3 modules if a hand-rolled layout is not enough; the
tree renderer did not need one (in-order rank for binary trees, leaf-count
spans for n-ary - two deliberate systems, see the rule below). Rendering stays
hand-written SVG; no chart or graph libraries.

---

# Graphs

Three decisions shape the graph family. They were settled before the first
graph algorithm landed, and the later algorithms (and the editor, when it
comes) fit inside them without a rewrite.

### 1. Topology is held by reference, never snapshotted per frame

A `GraphSnapshot` carries the `Graph` (nodes with positions, edges, directed
and weighted flags) **by reference**. Every frame of a run points at the same
object, and nothing mutates it: a structural change is a new run, not a new
frame. What a frame snapshots is only the mutable state of the algorithm -
the visited set, distance labels, the tree edges chosen so far, the queue /
stack / priority-queue contents, and the edge under examination - and
`GraphScene` caches each of those as a frozen array or record until it
actually changes, the same way `ArrayScene` shares an elements array across
frames that did not write.

The reason is arithmetic. Dijkstra on 150 nodes yields thousands of frames;
if each frame copied ~300 edges the run would cost frames x edges and the
150-node target would not survive it. With topology shared, a frame costs
what changed in it.

Layout is part of topology. Positions are computed once at parse time by
`graphLayout.ts` (a deterministic force-directed pass, or a ring or lattice
when asked), so generators stay pure and the renderer only ever reads
`node.x` / `node.y`.

### 2. Interaction is an explicit mode machine

`src/playback/mode.ts` defines the modes and the only legal moves between
them. `PlaybackProvider` holds a `Mode`, not a boolean; `playing` is derived.

```
idle          no frames (nothing built, or the input failed to parse)
precomputing  a build is in flight
paused        frames exist, the cursor is stopped
playing       frames exist, the clock is running
editing       the structure is being changed; frames are discarded
```

| from \ event | invalidate | precompute | ready | play | pause | end | edit | commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| idle | idle | precomputing | - | - | - | - | editing | - |
| precomputing | idle | - | paused | - | - | - | - | - |
| paused | idle | - | - | playing | - | - | editing | - |
| playing | idle | - | - | - | paused | paused | editing | - |
| editing | - | - | - | - | - | - | - | idle |

`-` means the event is ignored. `invalidate` is what any structural change
sends: it pauses playback, discards the frame array, and leaves the machine in
`idle`, so the next `play` has to go through `precompute` again. `edit` does
the same and lands in `editing`, from which `commit` returns to `idle`. There
is no path from `playing` or `paused` to a structural change that keeps the
frames: no structural edits mid-run, ever.

Today the build is synchronous, so `precomputing` is entered and left within
one effect, and nothing in the UI sends `edit` - the graph editor is deferred.
Both states exist now so that an asynchronous build and the editor slot in
without touching the machine.

### 3. Graphs travel in the URL as a compact edge list, with a cap

The `g` param is the edge list, and it is the same string the text field
shows:

```
g=0-1,0-2,1-3:5,2-3:2,7
```

- `a-b` is an edge between integer node ids; `a-b:w` gives it a weight.
- A bare `n` declares an isolated node. Node ids run `0..max` and every id
  below the maximum exists, so `7` alone is a graph of eight nodes.
- Direction is a separate param (`directed=1`); for undirected graphs each
  edge is listed once.
- Tokens are separated by commas, which the query-string serializer keeps
  literal (it also keeps `:`), so the URL is readable and the same length as
  the field.

**Cap: 4,000 characters for the encoded `g` value.** Every current browser
and host accepts URLs far longer than that; the cap keeps the whole link
under the 8 KB request-line limit of common proxies with room to spare, and
it fits every built-in preset at the 150-node target (a 12x13 lattice is
about 2.2 KB). Past the cap the run still works, but the page holds the graph
in memory instead of the URL: the header shows **custom graph - not
shareable**, Copy link is disabled, and a reload or back navigation returns
to the defaults. A link is never produced that would fail to reproduce its
run.

# House rules

- **Strict TypeScript, no `any`.** `noUncheckedIndexedAccess` is on, which is
  why algorithms go through `ArrayScene` instead of touching raw arrays.
- **No `setInterval` in a render loop.** `requestAnimationFrame` or CSS
  transitions.
- **Ask before adding a dependency.** The current runtime dependency list is
  React and React DOM. That is deliberate.
- **Stay smooth at n=200** for arrays and ~150 nodes for graphs. If a frame
  needs more than a few hundred SVG nodes, simplify the drawing.
