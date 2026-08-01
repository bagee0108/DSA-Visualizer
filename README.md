# DSA Visualizer

Frame-by-frame visualizations of data structures and algorithms. Every run is
precomputed, so you can scrub it like video: step backwards as cheaply as
forwards, jump to any point, and watch the live operation counters rewind with
you.

Built as a study tool, not a demo reel — the code panel, the call stack, the
invariant bands and the comparison/swap counters are all synced to the same
frame.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Arrays: quicksort, mergesort, heapsort, binary search, two pointers, sliding window, Kadane | **Complete** — 7 algorithms, 133 tests |
| 2 | Trees: BST, AVL, red-black, heap, trie, traversals | **Complete** — 6 algorithms, 88 tests |
| 3 | Graphs: BFS/DFS, Dijkstra, A*, Bellman-Ford, toposort, DSU, Kruskal, Prim, Tarjan | Planned |
| 4 | Segment tree, Fenwick, DP tables, KMP, backtracking | Planned |

## Quick start

Requires Node.js 20.19+ (or 22.12+) and npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run typecheck  # tsc --noEmit, strict, no `any`
npm test           # vitest, algorithm generators only
npm run test:watch
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the production build locally
```

## Screenshots

<!-- Phase 1 -->
![Phase 1 - array algorithms](docs/phase-1.gif)
<!-- TODO: record quicksort with the partition regions visible -->

<!-- Phase 2 -->
![Phase 2 - tree algorithms](docs/phase-2.gif)
<!-- TODO: record an AVL double rotation -->

<!-- Phase 3 -->
![Phase 3 - graph algorithms](docs/phase-3.gif)
<!-- TODO: record Dijkstra with the priority queue panel -->

<!-- Phase 4 -->
![Phase 4 - advanced structures](docs/phase-4.gif)
<!-- TODO: record a segment tree range query -->

## Keyboard

| Key | Action |
| --- | --- |
| `space` | play / pause |
| `left` / `right` | step one frame |
| `up` / `down` | double / halve speed |
| `Home` / `End` | first / last frame |
| `R` | reset to the first frame |

Shortcuts are ignored while a text field has focus.

## Pacing

The slow part of a frame is the sentence under the canvas, not the animation,
so 1x is a *reading* pace rather than a watching pace. Each frame is charged its
own dwell — a base cost plus a per-word increment, clamped to 0.4s–2.2s — which
means a frame that just advances a pointer goes by quickly while one that
explains an invariant holds long enough to actually read. The speed slider
divides that dwell across a logarithmic 0.25x–16x range: 0.25x picks a single
step apart, 1x reads, and past roughly 4x the commentary stops being legible and
it becomes a visuals-only view of the structure moving.

That ceiling exists because big runs are long — a 200-element quicksort is
~5,200 frames, two hours at 1x but under eight minutes at 16x. The scrub bar and
`End` cover the rest. Keep explanation strings tight, since verbose ones now
cost playback time. Tuning constants live in `src/playback/dwell.ts`.

## Architecture

Algorithm logic and rendering never touch each other.

```
src/
  core/            frame contract, algorithm registration, counters
    types.ts       Frame, snapshots, highlights, counters
    define.ts      defineAlgorithm(), type erasure, frame ceiling
    scene.ts       ArrayScene: backing store + automatic counters
    treeScene.ts   TreeScene: node table + rotations + counters
    registry.ts    id -> algorithm
  algorithms/      one file per algorithm, pure generators
  playback/        PlaybackProvider: the single cursor into a run
  renderers/       one renderer per structure family, frame in -> SVG out
  components/      player, code panel, counters, call stack, input
  pages/           home (searchable catalog) and visualize
```

Three rules hold the design together:

1. **A frame is the complete visual state**, never a delta. That is what makes
   backward stepping O(1) and scrubbing exact.
2. **Generators are pure.** Same params in, same frames out — including
   "random" inputs, which are seeded and written into the URL.
3. **Renderers are dumb.** They receive one frame and draw it. They cannot
   reach playback state or algorithm internals.

Adding an algorithm is one generator plus one line in
`src/algorithms/index.ts`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## URL state

The query string is the run. `/visualize/quicksort?input=5,3,8,1&pivot=median3`
reproduces exactly that run, back/forward buttons replay your history, and
**Copy link** in the header hands you a bookmark. Only non-default values are
written, so links stay short.

## Performance notes

- Frames are materialised once, up front, capped at 120k per run.
- Consecutive frames that do not mutate the array share one frozen snapshot, so
  a 5,000-frame run over 200 elements allocates a few hundred arrays.
- The render loop is `requestAnimationFrame` with a time accumulator — never
  `setInterval`. At high speed one animation frame advances several algorithm
  frames instead of queueing up.
- Bars are keyed by a stable element id, so a swap is one CSS transform
  transition rather than a re-layout.
- Targets: 200 elements for sorting, ~150 nodes for graphs.

## Deploying

Static build, no backend:

```bash
npm run build   # -> dist/
```

Deep links are real paths (`/visualize/quicksort`), so the host must serve
`index.html` for unknown paths. Netlify, Vercel and Cloudflare Pages do this
with one rule. On GitHub Pages, copy `dist/index.html` to `dist/404.html` after
building, and set `base` in `vite.config.ts` to `/<repo-name>/`.
