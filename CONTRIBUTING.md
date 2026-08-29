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
4. Give it a scene class mirroring `ArrayScene`, `TreeScene` and
   `GraphScene`, so its algorithms get the same free counters and cached
   snapshots.

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

`precomputing` is a real state with a real duration: the build is drained a
slice at a time (see "Precompute" below) and carries a `progress` fraction.
Nothing in the UI sends `edit` yet - the graph editor is deferred - but the
state exists so it slots in without touching the machine.

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

**Cap: 4,000 characters for the query string** (`MAX_QUERY_LENGTH` in
`VisualizePage`). Every current browser and host accepts URLs far longer than
that; the cap keeps the whole link under the 8 KB request-line limit of
common proxies with room to spare, and it fits every built-in preset at the
150-node target (a 19x8 lattice is about 1.8 KB). Past the cap the run still
works, but the page holds the params in memory instead of the URL: the header
shows **custom graph - not shareable**, Copy link is disabled, and a reload
or any navigation returns to the URL's run. A link is never produced that
would fail to reproduce its run.

# Precompute

Building a run means draining a generator, and a 150-node Dijkstra yields
thousands of frames. Done in one go that blocks the frame, so the run is built
across animation frames instead.

- `algorithm.startBuild(params)` returns an `IncrementalBuild`; `step(budgetMs)`
  drains until the budget is spent and reports how many frames it has. The
  synchronous `algorithm.build(params)` is that same call with an infinite
  budget, so the two cannot drift - and `src/core/build.test.ts` asserts the
  frame arrays are deep-equal for an array, a tree and a graph algorithm.
- The slice is **8ms of wall clock, not a frame count**. A frame of a 12-key
  BST and a frame of a 150-node Dijkstra differ by more than an order of
  magnitude, so a fixed count would either stutter or crawl. The clock is read
  every 16 frames, because reading it per frame costs more than the slice it
  protects.
- `runChunked` in `src/playback/buildRunner.ts` drives it. Its scheduler is
  injectable, which is how cancellation is tested without a browser.
- **Cancellation is absolute.** `useChunkedBuild` cancels on any change of
  algorithm or params, and the runner checks its cancelled flag both before a
  slice and after it. A superseded build can never deliver frames into the run
  that replaced it; `buildRunner.test.ts` is where that is pinned down.

### Why the bar is honest about not knowing

A generator does not know how many frames it will yield, and asking it would
mean changing every generator. So the denominator in `buildProgress.ts` is the
frame count the last completed build of that algorithm at that input size
produced, defaulting to 1,200 the first time. The fraction is
`drained / (drained + max(estimate - drained, estimate * 0.08))`, which rises
towards the estimate and then approaches 1 asymptotically. It is monotone
whether the estimate was high or low, it never jumps backwards, and it never
reads 100% before the run exists. If exactness ever matters more than leaving
generators alone, a generator could declare its own frame count and this
becomes a real fraction.

The indicator is gated at 200ms: a build that finishes sooner shows nothing,
because a bar that flashes for 80ms is worse than no bar. Being information
rather than decoration, it still appears under `prefers-reduced-motion`; only
the easing on its fill is dropped.

---

# Design tokens

The reference class is developer tooling, not a dashboard template: dense,
information-first, restrained chrome, content dominant.

### The chrome is monochrome so the algorithm is not

The eight highlight roles in `src/renderers/roles.ts` are the only saturated
colour in the app. Every coloured button, badge or accent competes with the
visualization for the eye, so the chrome is greys plus one accent hue used
only for focus rings, the active source line and the scrub fill. This is why
the source panel marks keywords with weight instead of colour, and why phase
chips and status badges are grey.

`roles.ts` and the `--viz-*` role variables are semantic and documented. Do not
restyle them to suit a theme.

**Label colour is derived, never chosen.** A label drawn on top of a role fill
takes its colour from `inkFor()` in `src/renderers/ink.ts`, which measures the
fill's relative luminance and returns whichever of the two inks contrasts more.
Because the worse of the two is still the better choice at the crossover, the
contrast floor holds for *any* fill - the measured worst case over the whole
RGB cube is 4.3:1, and `ink.test.ts` pins that down. Never hardcode a label
colour per role: a future palette change would silently break the floor, and
this way it cannot. The palette itself stays defined once, in CSS; `readInk()`
resolves it and re-resolves when the theme class changes.

### Where the tokens live

All of them are in `src/index.css`. Dark is the primary theme, so `@theme`
holds its values and `:root:not(.dark)` overrides them for light. Because
utilities compile to `var(--color-…)`, a component never needs a `dark:`
variant for colour: the token flips underneath it.

| group | tokens |
| --- | --- |
| surfaces | `ground` (page and canvas), `panel` (docked panels), `raised` (insets, chips, selected states) |
| lines | `line` (hairline), `edge` (input borders, stronger separators) |
| text | `fg`, `fg-dim`, `fg-mute` |
| accent | `accent`, and `danger` for failure states only |

Three background levels, no more. Hierarchy comes from those levels and 1px
hairlines — **never** from a shadow, and never from a translucent panel.

### Type

Inter for UI, JetBrains Mono for the source panel, strips, node labels and
every numeric readout. Both are self-hosted variable subsets in `public/fonts`,
so there is no webfont request and no dependency. Numbers live in the mono
face, which makes them tabular by construction and stops them jittering as
playback advances.

Five sizes, and only five: `text-micro` (11px), `text-meta` (12px), `text-ui`
(13px, the body default), `text-body` (14px, explanation prose) and
`text-title` (17px). Tailwind's own `text-sm`/`text-lg`/… still exist until the
rollout finishes; they are not part of the scale and nothing new should use
them.

### Spacing, radius, motion

Spacing is Tailwind's 4px scale (`--spacing`), used through the numeric
utilities. No arbitrary values: `px-[13px]` is a bug, `px-3` is the rule. The
exceptions are viewport-relative sizes, which the scale does not cover.

Radii are small and there are three: `rounded-xs` (2px), `rounded-sm` (3px),
`rounded-md` (4px).

Durations are `--duration-fast` (120ms, hovers and presses),
`--duration-base` (200ms, anything that travels) and `--duration-slow` (320ms,
a card crossing the grid). Nothing names a raw millisecond value.

### Motion means something, so nothing may move for decoration

Inside the canvas, movement *is* the explanation: vertical means a rotation
changed a node's depth, horizontal means a rank shifted, a mount means a node
was created, and the curve tells the two apart. Anything that moves for looks
in that field will be read as an algorithmic event. **No pulses, glows,
shimmers, particles or ambient motion on nodes, edges, cells, bars or strips.**
Polish belongs in the chrome, where there is no vocabulary to corrupt.

| token | curve | means |
| --- | --- | --- |
| `--ease-slide` | ease-in-out | order-preserving lateral movement: in-order rank slides, strip reflow |
| `--ease-drop` | ease-out | a decisive arrival: depth changes from a rotation, a node mounting |
| `--ease-paint` | ease-out | a recolour |
| `--ease-swap` | linear | a direct exchange of two array elements |
| `--ease-ui` | ease-in-out-ish | chrome hovers, presses, the code line following along |
| `--ease-enter` | ease-out | something chrome-side arriving |
| `--ease-exit` | ease-in | something chrome-side leaving |

The first four are load-bearing: do not collapse them into one curve. A
rotation reads as a rotation partly because its vertical motion eases out while
a rank slide eases in and out; that correspondence is described under the tree
layout rule above. The last three are deliberately separate names so chrome
polish can never borrow the canvas vocabulary.

The one animation in the drawing that is not a structural event is a strip
chip arriving or leaving, and it earns its place by being *informative*: a
queue loses its front, a stack loses its top, so chips leave by the side they
actually leave from. `StripRow` derives that from consecutive item lists rather
than from playback direction, which is why stepping backwards reads correctly -
a dequeued chip coming back is an arrival at the front, and that is what it
looks like.

Chrome hovers and presses need no token at the call site: the theme sets
`--default-transition-duration` and `--default-transition-timing-function`, so
a bare `transition-colors` is already 120ms on the UI curve. Canvas transitions
are built as strings in the renderers because their duration is derived from
the frame dwell.

### Motion off

`prefers-reduced-motion: reduce` sets all three duration tokens to `0ms` and
collapses every animation and transition. Every state change still happens and
still lands in the right place - the app has to be completely usable with
motion off, so nothing may depend on an animation having run. Code that
animates in JavaScript (the counter roll, the home page grid) checks
`usePrefersReducedMotion()` and jumps straight to the final value.

All motion is CSS transitions or `requestAnimationFrame`. Never `setInterval`,
and no animation library.

**A token nothing references is not emitted.** Tailwind tree-shakes unused
theme variables, so a `var(--duration-slow)` added before anything uses it
resolves to nothing. Check the built CSS if a token appears to do nothing.

### The one hand-written rule set

`.viz-range` in `src/index.css` styles the transport and size sliders. Range
inputs keep their track and thumb in shadow DOM that utility classes cannot
reach, so they are styled once there and driven by a `--viz-range-progress`
percentage set inline. It is the only component-shaped CSS in the project.

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
