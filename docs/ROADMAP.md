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
### Owner brief, 2026-10-20 (evening): 5a, then 6-9

Same rules as above, with one change: items 6-8 are no longer design stops.
Their designs below are pre-approved; build them directly and stop only to
deviate from them or on another stop condition. Every design choice made
while building goes in PROGRESS.md. Never touch main or Vercel. The brief
said to push dev after every item; the owner then said not to push until a
big chunk is done, so commits stay local and dev is pushed at milestones
(5a with 6, then 7, then 8 with 9).

5a. **Item 5 follow-ups** (one commit each).
   - Octile distance in the heuristic picker (admissible with diagonals,
     tighter than Euclidean). The found map where Manhattan with diagonals
     returns 7.4 against a shortest 6.2 becomes a visible preset, "When the
     heuristic overestimates", with a description of why. Tests: octile is
     optimal on every preset; the preset reproduces 7.4 vs 6.2.
   - Walls are part of the map, not algorithm state: board styling, not a
     palette change. A structural neutral a few steps above the board
     background with a subtle diagonal hatch; at least 3:1 non-text contrast
     against empty squares in both themes; 1x screenshots. N-Queens and
     Sudoku unchanged.
6. **Resizable panels** (pre-approved).
   - Hand-rolled, no library (a library would be a dependency stop).
   - Splitters between canvas and code panel, and between canvas and the
     bottom area (strips + explanation). The canvas never collapses: at least
     40% of the width and 45% of the height. Code panel and strips are
     collapsible. A "reset layout" control.
   - Each splitter: focusable, `role="separator"`, `aria-orientation`,
     `aria-valuenow/min/max` as percentages, `aria-controls`. Arrows 16 px,
     Shift+arrow 64 px, Home/End to min/max, Enter collapses or restores.
     Visible focus, 24x24 minimum hit area, double-click resets that
     splitter.
   - The canvas refits from the RUN BOUND on resize, throttled to animation
     frames, with no transitions on nodes.
   - Sizes saved per viewer in localStorage under a namespaced key, in
     try/catch, falling back to defaults. The /about privacy note says so.
   - Below ~900 px wide, panels stack and splitters turn horizontal. Verify
     200% zoom at 1366x768 and reflow at 320 CSS px.
   - Re-run axe and a keyboard walk on every visualizer scene type.
7. **Interactive graph editor** (pre-approved).
   - Graph scene levels only (not the A* board). Entering edit mode pauses
     and discards frames through the existing mode machine; leaving
     re-precomputes.
   - Toolbar: select/move, add node, add edge, delete; the directed toggle as
     it is. Pointer: click empty space adds a node; drag node to node (or
     click one, then the other) adds an edge; double-click an edge edits its
     weight inline; Delete removes the selection.
   - Keyboard for everything: Tab through nodes in id order; N adds a node at
     a free spot; E then pick a target to connect; arrows move the selected
     node; Enter on a selected edge edits its weight; Delete removes.
   - Undo/redo (Ctrl+Z / Ctrl+Y) over immutable graph snapshots.
   - Every edit rewrites the edge-list field and the URL; the clearance
     notice updates after each edit. Hand-placed positions are not shared
     through URLs (topology only), and a hint says so. Same caps: 150 nodes,
     600 edges.
   - Level-specific refusals (directed-only and so on) apply on leaving edit
     mode, with the established messages.
8. **Race mode** (pre-approved).
   - Clocked on operations: comparisons + array writes. Each tick advances N
     operations by speed; each side shows its last frame at or before its op
     count. First verify every sorting generator counts these consistently;
     a wrong counter is a bug, fixed with a test and noted in PROGRESS.
   - One timeline: scrub, step and speed act on the shared op clock. A side
     that finishes holds its final frame, marked done with its total.
   - Two ArrayScenes side by side with live op counters; stacked below
     ~900 px.
   - Presets: random, sorted, reversed, nearly sorted, few unique. Quicksort
     on sorted against insertion sort is one click. Cap 100 elements.
   - URL: both algorithm ids plus the shared input. Level 33 on the path.
   - No generator changes.
9. **Small backlog items** (one commit each).
   - Bellman-Ford: a "jump to end of pass" control, with a keyboard
     shortcut, so long runs are studyable.
   - The clearance notice also counts overlapping nodes (the brief was cut
     off here: "Clearance notice also counts overlapping"; read as the
     backlog entry for overlapping nodes in typed graphs).

**Not yet:** the Figma redesign, multi-language code (Java, Python, C++),
quizzes, accounts. Each comes later with its own brief.
