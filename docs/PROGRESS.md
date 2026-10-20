# Progress

Against [ROADMAP.md](ROADMAP.md). Newest entry first under each heading.

## Where things stand

- **Branch:** dev. main is untouched by this run; production is the owner's
  call.
- **Next item:** 1 (layout step 4, preset regeneration).

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
- The working tree carries an uncommitted edit to CONTRIBUTING.md (the
  `SITE_ORIGIN` / Vercel note) that this run did not make. It is left
  uncommitted and out of every commit here.

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
