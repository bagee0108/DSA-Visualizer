# Roadmap

The working plan for the graph path and what follows it. Progress against it,
with commit hashes and measured numbers, is in [PROGRESS.md](PROGRESS.md);
future sessions resume from these two files. All of CONTRIBUTING applies.

## Progress log

`docs/PROGRESS.md` is updated and pushed after every item and every stop:
what shipped, commit hashes, the numbers measured, anything deferred, and any
guarantee that turned out narrower than first reported. A stop report is
written into PROGRESS.md, committed and pushed to dev before stopping.

## Autonomy rules

Continue to the next item when the current one meets its acceptance criteria
and passes the self-review checklist: commit, push dev, update PROGRESS.md,
move on.

Stop when any of these happen:

- An item marked [DESIGN STOP] reaches its design proposal.
- Anything would push or merge to main, or touch Vercel settings, environment
  variables or domains. Production is always the owner's call.
- A dependency would be added.
- The role palette, the ring rules, a layout invariant or any existing
  guarantee would change.
- A test can't pass without weakening it, loosening a threshold, shrinking
  coverage, changing what a golden/fingerprint test hashes, or adding
  `it.fails`. Report instead.
- A perf target regresses (150-node graphs, 200-element sorts, step time per
  the README method), or precompute memory exceeds ~150 MB.
- The spec is ambiguous or two rules conflict.
- Anything would rewrite history.
- GPG signing fails. Never commit unsigned.

A stop report says what's done, what's blocked, the exact decision needed,
and a recommendation.

## Standing rules

Generators pure, frames immutable after yield, topology by reference, run
bound for layout, no decorative canvas motion, roles by meaning. Strict TS, no
`any`. Typecheck, suite (twice) and build at every commit. Real timestamps,
signed, no co-author lines. One commit per logical change. Never park work
outside the tree. Push dev only; never push main.

## Self-review checklist (every item)

- New generators: reference-implementation test, frame hygiene, sane frame
  counts, worst-case size and memory stated.
- New graph presets: multi-seed clearance and node-spacing tests pass.
- New page or scene type: axe in both themes, keyboard walk, screenshot at 1x
  in both themes at 1366x768.
- Levels: flipped to available in levels.ts, marquee op added, sitemap
  updated, directed/undirected refusal in the established pattern.
- Explanations: honest wording, no claims the visualization doesn't show.
- A guarantee that turns out narrower than reported is said so in PROGRESS.md.

## The plan

1. **Layout step 4: preset regeneration.** After generating a preset graph and
   laying it out, if clearance fails, regenerate with the next seed, up to 5
   tries; if all fail, use the fewest-violations attempt and show the notice
   from step 5. Report tries (average and worst) and added build time. BFS and
   DFS sweep tests come off `it.fails`.
2. **Layout step 5: notice for user-entered graphs** (edge-list field and
   shared URLs), shown under the canvas: "N edges pass close to nodes they
   don't connect to in this layout." Small, not a modal, screen-reader
   readable.
3. **Layout step 6: restore Kruskal's dense preset**, passing the multi-seed
   sweep. Confirm no sweep test is still on `it.fails`.
4. **Prim's MST.** Dijkstra's lazy heap and PQ strip, cheapest-key labels, MST
   as tree edges, spanning forest on disconnected input, undirected only.
   Total weight matches Kruskal's on every shared preset. Marquee op:
   extract-min.
5. **A\*** on the board scene. Walls, small f/g/h per cell, a multi-line map
   field (`S G # .`) serialised to the one-line URL form (round-trip test), a
   heuristic picker (Manhattan, Euclidean, zero = Dijkstra), a diagonal
   toggle. Path length matches a reference; with an admissible heuristic it's
   optimal. Marquee op: heuristic.
   **After item 5, STOP.** Every level on the path is live; launching is the
   owner's decision.
6. **[DESIGN STOP] Resizable panels.** Keyboard-operable splitters with
   separator semantics, refit from the run bound with no transition, saved
   sizes (and the privacy note updated), 200% zoom and 320 px reflow, and how
   the graph editor will sit in the layout.
7. **[DESIGN STOP] Interactive graph editor** in the existing `editing` mode.
   Propose interactions, keyboard equivalents for every pointer action, and
   how edits feed the URL encoding and the clearance notice.
8. **[DESIGN STOP] Race mode.** Clocked on operations, not frames; one
   timeline; presets that show the lesson.

**Not yet:** the Figma redesign, multi-language code (Java, Python, C++),
quizzes, accounts. Each comes later with its own brief.
