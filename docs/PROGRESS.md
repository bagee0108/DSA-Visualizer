# Progress

Against [ROADMAP.md](ROADMAP.md). Newest entry first under each heading.

## Where things stand

- **Branch:** dev. main is untouched by this run; production is the owner's
  call.
- **Next item:** 3 (layout step 6, restore Kruskal's dense preset).

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
  seed 102 ms against 73-94 ms before `08ee796`. Not yet ruled on by the
  owner.
- The working tree had an uncommitted edit to CONTRIBUTING.md (the
  `SITE_ORIGIN` / Vercel note) that this run did not make. The owner
  committed it as `bce9d9c` (signed, 01:38) just before this run's first
  commit, and it went to origin/dev with that push.

## After-the-fact decisions

- **`08ee796` changed what the Union-Find golden fingerprint hashes.** It
  switched the graph part of `fingerprint()` from node positions to topology
  (directed, weighted, node ids and labels, edges). Positions aren't part of a
  run, and every frame hash still matches, but this changed what a test
  guarantees: the golden no longer pins layout. Under the roadmap's rules that
  is a required stop; it was not taken at the time. Recorded here for the
  owner's ruling. Anything like it now stops the run.

## Log

(One entry per item and per stop, newest first.)

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
