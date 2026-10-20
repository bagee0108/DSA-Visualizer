# Progress

Against [ROADMAP.md](ROADMAP.md). Newest entry first under each heading.

## Where things stand

- **Branch:** dev. main is untouched by this run; production is the owner's
  call.
- **Resumed 2026-10-20 evening** on the owner's brief (ROADMAP "Owner brief,
  2026-10-20 (evening)"): 5a, then 6-9, with 6-8 pre-approved instead of
  design stops. Commits stay local and dev is pushed at milestones, per the
  owner's "do not push until a big chunk is done".

## Done before this run

| Step | Commit | What |
| --- | --- | --- |
| Rebrand | `bd48036` | Product renamed Lowlink to Treewidth; the algorithm term low-link stays. |
| Layout step 3 | `08ee796` | Relocates nodes stuck between edges; spatial index of nodes and edges. |
| Layout step 2 | `170168c` | Multi-seed clearance sweep: every graph preset at 6/12/40/150 nodes x 20 fixed seeds. |
| Layout step 1 | `3ed1a4d` | Kruskal's MST on the shared disjoint-set forest, without the dense preset. |

**Open at the start of this run:**

- The BFS and DFS sweep tests are on `it.fails`: random sparse at 150 nodes
  fails on 1 of 20 seeds (2 edge/node pairs). Item 1 should take them off.
- Layout time, random sparse at 150 nodes: median 62 ms (unchanged), slowest
  seed 102 ms against 73-94 ms before `08ee796`. Accepted by the owner
  2026-10-20 (load cost, not step time).
- The working tree had an uncommitted edit to CONTRIBUTING.md (the
  `SITE_ORIGIN` / Vercel note) that this run did not make. The owner
  committed it as `bce9d9c` (signed, 01:38) just before this run's first
  commit, and it went to origin/dev with that push.

## Owner rulings, 2026-10-20 (after the item 3 stop)

- **Item 3:** option 1. Dense preset at density x2.5 at every size,
  description "about three and a half edges per node".
- **`08ee796`** (Union-Find golden fingerprint hashes topology, not
  positions): approved.
- **Slowest-seed layout at 150 nodes**, ~94 to 102 ms after `08ee796`:
  accepted. It is a one-time load cost, not step time.
- **Clearance notice copy:** match the site's style ("does not" / "do not"),
  not the contraction.
- **The three "narrower than it sounds" notes** (items 1 and 2) are accepted
  as recorded.
- **Backlog, not now:** have the notice also count overlapping nodes in typed
  graphs.

## After-the-fact decisions

- **`08ee796` changed what the Union-Find golden fingerprint hashes.** It
  switched the graph part of `fingerprint()` from node positions to topology
  (directed, weighted, node ids and labels, edges). Positions aren't part of a
  run, and every frame hash still matches, but this changed what a test
  guarantees: the golden no longer pins layout. Under the roadmap's rules that
  is a required stop; it was not taken at the time. **Approved by the owner
  2026-10-20.** Anything like it now stops the run.

## Log

(One entry per item and per stop, newest first.)

### STOP after item 5 (planned)

**Done this session:** items 1-5. Commits on dev, all signed, typecheck,
suite twice and build clean at each: `b4dff35` `9c64a7f` `4827d00` `b08d3ea`
(items 1-2, overnight), `aa253b5` `5fe2add` (item 3), `3e14b29` `36ff85d`
(item 4), `965d3a7` `b7100e7` `7a7ef55` (item 5), plus PROGRESS updates.
Suite: 657 tests. No test is on `it.fails`. No golden or fingerprint test
changed. No dependency added. main untouched.

**Blocked:** nothing. This is the planned stop.

**Decision needed:** whether to launch now that every algorithm level is live
(race mode is the one level still marked soon). Then item 6's design
proposal.

**Recommendation:** look at A*'s wall colour in the dark theme first (below).
It's the one visual call this session made that I'd want a second eye on.
Otherwise nothing here blocks a launch from the code side.

### Item 5: A* (done)

Commits: `965d3a7` (board scene: walls and notes), `b7100e7` (map format
and multi-line field), `7a7ef55` (A*).

- **Board scene:** two nullable snapshot fields. `walls` are fixed for the
  run and shared by reference. `notes` hold up to 3 lines of up to 8
  characters per square. N-Queens and Sudoku carry null for both and draw as
  before. Hygiene bars a piece or a note on a wall, and an over-long note.
- **Map field:** rows of S G # . in a multi-line textarea, held as one line
  joined with "/" in the param and the URL. Round-trip tests cover field to
  line, parse to format, and through the query string. "/" now stays literal
  in the query, like "," and ":"; "#" shows as `%23` (a raw one would start
  the fragment). Maps are capped at 9 x 20 so f, g and h fit every square.
  Checked in the browser: typing rows with Enter, Run, the URL
  (`map=S..%23/.%23../...G`), reload.
- **A*:** heap keyed on f = g + h with lazy stale skipping, goal tested on
  pop. Heuristics: Manhattan, Euclidean, zero (= Dijkstra). Diagonal toggle;
  a diagonal costs √2 and cannot cut a wall's corner (my choice; the spec
  didn't say). Ties leave the heap in push order. Marquee op: heuristic.
  Sitemap and README updated.
- **Correctness:** the path matches an independent grid Dijkstra on every
  preset at 6/12/20 columns (random walls over 5 seeds) for every admissible
  combination: zero and Euclidean both ways, Manhattan with 4 directions.
  With diagonals Manhattan is inadmissible; the run says so in its first and
  last frames. That warning is backed by a found map where it is really
  longer (7.4 against 6.2), kept as a test. Over 140 reachable preset maps it
  was never longer, so on the presets the warning is mostly theoretical.
- **Worst case** (9 x 20, no walls, zero heuristic, diagonals): 1,297
  frames, about 3 MB, 9 ms. Step time on 9 x 20 boards, README method:
  median 6.4-6.6 ms, p95 under 10.
- axe clean in both themes at 1366x768, mid-run and on the final frame, for
  the default map, random walls, the pocket and the sealed goal. Tab walk as
  on every page; screenshots checked in both themes.

**Narrower than it might sound / for the owner:**

- **Wall colour in the dark theme.** Walls use the dim text colour, a
  neutral token, so they clear the 3:1 non-text contrast without touching
  the role palette. In dark mode that makes them light grey, the brightest
  thing on the board. Readable and unambiguous, but heavier than I'd like. A
  dedicated wall token would be a palette-level change, so I left it for you.
- f, g and h are rounded to one decimal, so f can differ from g + h by 0.1 on
  screen (tested to within 0.1).
- The dashed path line on the final frame runs under the notes on path
  squares; they stay readable.
- The size slider means columns for A* (rows follow, 4 to 9). The field help
  says "up to 9 rows of 20" but the slider itself doesn't say columns.
- S and G move from the centre of their square to its top-right corner once
  the square gets a note, so the letter shifts when the search reaches it.

### Housekeeping this session

- `bce9d9c`, the CONTRIBUTING `SITE_ORIGIN` note, was committed by the owner
  during the overnight run; this run never touched Vercel or main.

### Item 4: Prim's MST (done)

Commits: `3e14b29` (Kruskal's presets, refusal and number format move to
`mst.ts`, a pure move: preset output hash identical), `36ff85d` (Prim).

- Lazy heap as in Dijkstra (same `MinHeap`, same queue strip). Key labels
  (the cheapest edge known from the tree, ∞ to start). MST edges become tree
  edges when their node is extracted. A spanning forest on disconnected
  input. Undirected only, refused with Kruskal's message. Marquee op:
  extract-min. Open on registration; sitemap updated (checked in the built
  sitemap.xml); README row updated.
- Shares Kruskal's four presets (textbook, ties, dense, disconnected) with
  its own descriptions. Total weight matches Kruskal's on every preset at
  4/6/12/40/150 (test).
- Tests (18): reference forest and Kruskal parity; the same total from every
  start node; every join takes the lightest edge across the cut, checked from
  the frame's own visited set; the heap strip stays a heap; stale pops on
  dense input, only for nodes already in the tree; negative weights; the
  refusal; frame hygiene, determinism, input contract; the clearance sweep.
- **Worst case** (150 nodes, the 600-edge cap): 1,538 frames, about 25 MB
  heap delta (no forced gc, so an upper-ish estimate), 40 ms to build.
  Dijkstra on the same graph: 1,455 frames, about 22.5 MB.
- **Step time at 150**, README method, this machine: Prim dense median
  9.7 ms (p95 11.9), ties 9.4 (12.3), disconnected 11.8 (17.3); Kruskal
  dense 10.9 (14.7); Dijkstra random 9.0 (11.6), islands 11.6 (14.4). All
  medians under the 17 ms target.
- axe clean in both themes at 1366x768 on the Prim page and on its directed
  refusal. Screenshots in both themes looked right.
- Tab walk: every stop takes focus in order. The stops without an outline
  are the range sliders and form fields, which use the site's existing
  focus styling. The same pattern is on Kruskal and Dijkstra; Prim adds one
  field (start node).
- The two console errors on every page are the Vercel analytics scripts,
  which the local server doesn't serve.

### Item 3: Kruskal's dense preset (done)

Commits: `aa253b5` (notice copy to "do not", backlog entry), `5fe2add` (dense
preset).

- Dense at density x2.5, "about three and a half edges per node", per the
  ruling. Over the 20 sweep seeds at 150 nodes: 524 edges, 72% rejected,
  749-1,343 frames, 6-9 ms to build. Regeneration averages 1.20 tries
  (worst 3) at 150 and 1.00 at 6/12/40; no seed falls back.
- The Kruskal sweep passes at every size. **No test in the suite is on
  `it.fails`** (counted: 0).
- The notice copy now reads "... nodes they do not connect to in this
  layout." The overlapping-nodes follow-up is in CONTRIBUTING's Deferred
  list.

### STOP at item 3: Kruskal's dense preset can't pass the sweep as defined

**Done:** items 1 (`9c64a7f`, `4827d00`) and 2 (`b08d3ea`), plus the vitest
worker cap (`b4dff35`). Suite 618/618 twice, typecheck and build clean at
every commit; all commits signed and pushed to dev. main untouched.

**Blocked:** item 3, "restore Kruskal's dense preset, passing the multi-seed
sweep." The preset as saved last session:

```ts
{
  id: 'dense',
  label: 'Dense',
  build: (size, rng) => finish(connected(0, size, Math.min(MAX_GRAPH_EDGES - size, size * 3), rng, () => randomInt(rng, 1, 20)), size, rng),
  description: 'about four edges per node, so most edges end up rejected: by the time they come up, their ends are already joined.',
}
```

At 150 nodes it is ~599 edges, at the 600-edge cap. With regeneration it
still fails the sweep: seed 5 at 150 uses up all 5 tries and keeps a graph
with 2 edge/node pairs (the check and the renderer agree on 2). Sizes 6, 12
and 40 pass. Single-layout failure rates over 60 fresh seeds:

| Dense variant | One layout fails | All 5 tries fail (p^5) | 20-seed sweep |
| --- | --- | --- | --- |
| x3 as saved, 150 nodes | 65% | ~12% | fails (seed 5) |
| x2.5, 150 nodes (~525 edges) | 15% | ~0.01% | passes |
| x2, 150 nodes (~450 edges) | 0 of 60 | ~0 | passes |
| x3 capped at 120 nodes | 37% at 130 | under 1% | passes |
| x3 capped at 110 nodes | 8% at 110 (32% at 100) | ~0.3% or less | passes |

So "restore it as defined" and "pass the sweep" conflict. Passing anyway
would need one of: a different preset, more than 5 tries, or layout work.
More tries and layout changes are both stop conditions of their own.

**Decision needed:** how the dense preset may differ from the saved one.

1. **Density x2.5 at every size (recommended).** "About three and a half
   edges per node." 150 stays available like every other preset; about 72%
   of edges are rejected at 150 (x3: about 75%), so the lesson is the same.
   A user lands on a fallback graph about 1 time in 10,000.
2. Density x2 ("about three edges per node"): no failures seen, about 67%
   rejected at 150. Safest, slightly weaker lesson.
3. Keep x3 and cap the preset at 110 or 120 nodes, with a cap reason like the
   ring's. Keeps "about four" but adds a second capped preset, and the
   failure rate is noisy around 100-130.
4. Keep x3 at 150 and accept that ~12% of dense@150 graphs fall back with the
   notice. The sweep then fails, so this needs a ruling on the sweep, which
   I can't make.

On a choice of 1-3, item 3 is a one-commit change: the preset, its
description, the sweep and Kruskal tests run as they are.

### Item 2: clearance notice under the canvas (done)

Commit: `b08d3ea`.

- `ClearanceNotice` (src/components) shows one line under the canvas, above
  the explanation: "N edges pass close to nodes they don't connect to in this
  layout." For one edge: "1 edge passes close to a node it doesn't connect
  to" (one node) or "... to nodes it doesn't connect to" (several).
- It shows for any graph run that has them: typed in the field, opened from a
  link, or a preset that used up its 5 tries. It counts with the renderer's
  own `clearanceOf()` on the drawn geometry, once per run.
- Accessibility: a `role="status"` paragraph that stays mounted and is empty,
  with no height, when there is nothing to say, so a new graph's notice is
  announced. Not focusable.
- Checked at 1366x768, 1x, dark and light: axe clean (WCAG 2.0-2.2 A/AA plus
  best practice) on BFS and Dijkstra with typed graphs that trigger it, the
  BFS default and quicksort. A 40-stop tab walk never lands on it; applying a
  clear graph in place empties it. Screenshots looked right in both themes:
  small, aligned with the explanation bar's inset.
- Tests: wording for 0, 1 and many edges; a typed BFS grid graph gives the
  expected sentence from the level's real first frame; every graph level's
  default run is silent.

**Narrower than it might sound / for the owner:**

- It reports edges only. Two nodes laid on top of each other in a typed graph
  get no notice. The spec named only edges, so I kept to it.
- The sentence uses "don't", the owner's wording. It is the first contraction
  in the UI copy, which otherwise says "does not". Left as specified.

### Item 1: preset regeneration (done)

Commits: `9c64a7f` (regeneration), `4827d00` (layout memo).

- Every graph preset in every level goes through `regenerating()`. After a
  preset builds a graph, `layoutViolations()` lays it out and counts edges
  within the clearance of a node they don't join, plus crowded node pairs. If
  it counts any, the preset builds again, up to 5 graphs, and keeps the one
  with the fewest violations.
- "Next seed" is implemented as drawing on from the same seeded stream. The
  first graph uses the rng exactly as before, so a preset that was clear
  builds the same graph from the same seed. The Union-Find golden
  fingerprints are untouched, and no golden or test was edited to pass.
- BFS and DFS sweep tests are off `it.fails`; no sweep test is on it now.
- **Tries over the sweep** (8 levels x every preset x 6/12/40/150 x 20
  seeds = 2,880 builds): average 1.001, worst 2. Retried: random@150, one
  seed, in BFS, DFS and Union-Find (the same graph). No build used up all
  5 tries.
- **Added build time.** With the memo (`4827d00`), applying a preset at 150
  nodes costs one layout plus a 2-3 ms check. Medians over 20 seeds
  (build + parse vs one layout): random 94.0 vs 90.7 ms, tree 52.1 vs 50.5,
  islands 55.8 vs 53.4. A retried seed pays one layout per graph tried:
  random worst 235.7 ms. Without the memo, the regeneration commit alone
  added a median 47.6 ms at 150 (p95 89.5, worst 191.7).
- **Layout itself is unchanged.** Layouts are byte-identical to `b4dff35` on
  the 20 random@150 sweep graphs. Timed in one process, old and new layout
  medians were within noise of each other (65-82 ms vs 80-85 ms across three
  rounds). On this machine, random@150 measures 80-90 ms median, against the
  62 ms recorded last session. That's the machine, not the code: the old file
  times the same here.
- Suite time: 28 s, then 54 s with regeneration, 32 s with the memo.

**Narrower than it might sound:**

- The check measures at the smallest scale any graph level draws (893 view
  units, two strip rows), not at each level's own scale. So Union-Find (one
  strip row, 968) retried a random@150 graph that was already clear as drawn
  there. Harmless (it gets a different, also clear graph), but it's a retry
  the canvas didn't need.
- Regeneration is checked, not proven: the sweep's 20 seeds pass, but a seed
  outside them can use up its tries and fall back to the fewest-violations
  graph. Item 2's notice covers that case on the canvas.
- My first version of the check widened every two-way chord by the bow's
  peak, as the repair pass does. That flagged Tarjan's ring@150 on 19 of 20
  seeds, though the renderer measured them as clear. It shipped measuring
  each two-way edge along its drawn curve instead (Tarjan: no retries). A
  test holds the check to never being more lenient than the renderer, at
  both band heights, on crowded undirected and directed graphs.

### Before item 1: suite flaked on a clean tree

At `bd48036`, with no changes, `vitest run` failed 1-2 tests per run, not the
same ones each time: `bellman-ford: frames > holds every structural invariant
on every preset` and `tarjan: outlines on the canvas > never draws an outline
around another component's node`. Both timed out at vitest's 5 s default
(5.0-5.6 s); alone, the Bellman-Ford one takes 1.4 s. The cause is CPU
contention: one worker per logical core (12 here) running the clearance sweeps
side by side.

Fix: `maxWorkers: 4` in the vitest config. No test, timeout or threshold
changed. Measured on this machine: 12 workers 36-37 s with failures; 6 workers
34 s, all 607 pass; 4 workers 28 s, all 607 pass.
