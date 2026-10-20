# Progress

Against [ROADMAP.md](ROADMAP.md). Newest entry first under each heading.

## Where things stand

- **Branch:** dev. main is untouched by this run; production is the owner's
  call.
- **STOPPED after 9b, at the owner's request** ("stop once done with this
  task", given while 9b was in progress). Done from the brief of 2026-10-20
  (after the item 9 stop): the hotfix (`hotfix/step-crash` pushed, main
  untouched), ruling 1 (insertion sort as a level), ruling 3 (the clearance
  scale, which needed a fix) and 9b. dev is pushed. main and Vercel are
  untouched.
- **Not started:** item 10, the step-anchor refactor. The brief's closing
  "full summary" is the 9b stop entry below, since 10 did not run.
- **Resume:** item 10, as written in ROADMAP.

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

## Owner rulings, 2026-10-20 (after the item 9 stop)

- **Insertion sort:** make it a full level (code panel, explanation, presets
  including nearly sorted, marquee op, sitemap), in the sorting lane next to
  the others. Race mode keeps using the same generator.
- **`sitemap.test.ts` restructure (item 8): approved.** The test assumed at
  least one level was still "soon", which stopped being true when race mode
  opened. It now checks the same rule (soon levels are left out of the
  sitemap, open ones are in) against a synthetic soon level, with
  `sitemapPaths` taking the level list and the open check as parameters.
  Nothing is asserted less than before.
- **Strips panel:** confirm in PROGRESS how the clearance check's scale
  relates to the new canvas size, with numbers. Stricter than needed is
  fine, more lenient is not.
- **Hotfix:** branch `hotfix/step-crash` from origin/main with `c4bcf4e` and
  `f8b61cb`; push that branch only; the owner fast-forwards main.
- **Brief continued:** 9b (Dijkstra islands at 150 nodes under 17 ms median
  step) and 10 (step-anchor refactor). See ROADMAP.

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

### STOP after 9b (owner's request)

The owner asked mid-run to stop once 9b was done. Item 10 (step-anchor
refactor) is not started; nothing of it is in the tree.

**This brief, commits on dev** (all signed, typecheck, suite twice and build
clean at each): `87d52f4` (brief, rulings, hotfix log), `db2bb39` `cde32a3`
(ruling 1), `73d0aa7` `999e924` (ruling 3), `65e0e66` `df52279` (9b), and this
entry. On `hotfix/step-crash`: `7687831` `c84bdfb` (the two cherry-picks,
clean). Suite 728 → 735. No test on `it.fails`; no golden or fingerprint
test changed; no dependency added. main and Vercel untouched.

**Worth a look:**

1. **Ruling 3 found the strips panel more lenient** than the ruling allows
   (the graph drew up to 10% smaller than on main on short windows) and
   fixed it; see that entry. The visible effects: strips centred under the
   drawing at the canvas's scale, and status-line hints that drop from the
   end on narrow columns instead of wrapping.
2. **The explanation bar's 1 px jump** (on main too) was resizing the canvas
   on every step that changed the explanation's line count: the biggest
   step-time cost on Kruskal, Prim and topological sort. Fixed in `df52279`;
   it is a candidate for main alongside the hotfix.
3. **Insertion sort renumbers the path:** every level after 4 moves down
   one, race mode is 34.

### Item 9b: Dijkstra islands at 150 nodes (done)

**Already under 17 ms before this item's changes, on this machine.** README
method (key press to React commit plus style and layout, 120 steps, paint
excluded), five islands seeds at 150 nodes: dev before 9b 6.6-7.3 ms median
(p95 9.4-10.1); main `bd48036` 11.1-11.7. The README's 17.5 ms predates the
layout work; item 6 took the strips out of the canvas SVG (1,245 → 1,075
elements). Frames were never touched.

**Headroom, since the target is per machine:** at 2x CPU throttle dev was
16.6-17.3 ms (main 32-36), at 4x 42-44 (main 75-78). So on hardware half as
fast the islands case sits at the line.

**Two changes for that headroom, neither changing frames:**

- `65e0e66`: graph nodes and edges are memoised components on plain values,
  so a step reconciles only what changed. Proof of no visible change: the
  canvas's outerHTML hashed after each of 70 steps and at the end matches
  the previous build on all nine graph levels plus Dijkstra at 150 (islands
  and random), motion on and off: 22 runs x 71 steps identical. Islands at
  2x throttle: 15.7-16.0 ms.
- `df52279`: the explanation bar reserves two lines but missed its 1 px
  border, so a step that changed the line count resized the canvas by a
  pixel and re-laid out the whole drawing (the profile showed 4.3 ms of
  forced layout a step on Kruskal against 1.7 on Dijkstra). Now two lines
  fit exactly. Kruskal disconnected 19.4-19.7 → 11.3-13.3 ms, Prim
  disconnected 15.4-15.6 → 9.0-9.6, Kruskal dense ~15 → 10.8-11.3,
  topological sort wide ~15 → 10.2-10.3.

**Every graph preset at 150 nodes now** (41 presets on 9 levels, two rounds
in one long run, which reads 2-3 ms higher than a fresh process): medians
5.8-11.6 ms, p95 at most 17.5 ms. Kruskal disconnected was the one median
over target (17.1-19.7 ms) before `df52279`, and it was over on main too
(22.6). README and CONTRIBUTING (Deferred entry removed) updated.

**Profile of what's left, islands:** about 4 ms of script (React's task),
2 ms of style and layout, forced early by the code panel reading its scroll
box after each commit (moving it would not change the total). Paint and
about 3.8 ms of animation-frame work (the counters' count-up) fall outside
the README method.

### Ruling 3: the clearance check's scale and the strips panel (fixed, `73d0aa7`)

**How the check is scaled.** `clearanceOf()` works on the drawn geometry in
view units, not pixels: an edge must keep `EDGE_CLEARANCE_VIEW` = 2 units
beyond the rim of every node it does not join, with the node radius also in
view units (16 at up to 12 nodes, down to 6.5 past 100). Layout, preset
regeneration and the notice all use that one check. Moving the strips into
their own panel changed none of its inputs: renderers lay out exactly as
before and only crop the viewBox where the strips started (graphs: 516 −
46 × strips units tall, against the 520 view that held the strips). So every
verdict is identical to main's, for every graph.

**How that relates to the canvas.** On screen everything is the view times
one factor, pixels per view unit, so the margin is always 2/16 of a default
node's radius, whatever the size. In pixels the 2-unit margin is
2 × (px per unit). That is where the new panel could make the check more
lenient than before: if the canvas drew the same view smaller than main
did, a pair that passes would sit closer on screen than it could on main.

**Measured, and it did** (`getScreenCTM()` on the canvas drawing, every
graph level, production builds of main `bd48036` and dev, default layout):

| viewport | main | dev before the fix | dev now |
| --- | --- | --- | --- |
| 1100x600 | 0.638 | 0.572 (−10.4%) | 0.644 (+0.8%) |
| 1280x720 | 0.858 | 0.856 (−0.2%) | 0.864 (+0.8%) |
| 1366x650 (Dijkstra) | 0.723 | 0.672 (−7.0%) | 0.729 (+0.8%) |
| 1366x768 | 0.962 | 0.939 (−2.4%) | 0.969 (+0.8%) |
| 1366x768 (Dijkstra) | 0.950 | 0.925 (−2.6%) | 0.957 (+0.8%) |
| 1440x900, 1920x1080, 2560x1440 | width-bound | same | same (0.0%) |
| 800x1000 (stacked) | 0.504 | 0.792 | 0.792 (+57%) |
| 320x700 (stacked) | 0.065-0.165 | 0.312 | 0.312 (+89% to +377%) |

At 1366x768 the 2-unit margin was 1.88 px on dev against 1.92 px on main,
and at 1100x600, 1.14 px against 1.28 px: more lenient, which the ruling
doesn't allow. Three causes, all chrome: the strips panel drew at the
column's width (up to a pixel a unit) rather than the canvas's scale, so on
a short window the strips took more height than they had inside the view;
the status line wrapped to two lines (47 px against 27) once the layout
chips were in it; and the splitter's line and the strips wrapper's padding
took 5 px.

**The fix:** the strips panel is capped at the canvas's own scale
(`stripsScale()` in `panels.ts`) and centred under the drawing, as it sat
inside the view before. While the canvas takes what the strips leave, both
settle on (canvas + strips px) / (view + strips view) = T/516 for graphs,
which is never less than main's T/520. Where a CSS limit pins the canvas,
the cap is simply the canvas's scale. The horizontal splitter takes no
height (its line overlays the panel), the strips wrapper lost its bottom
padding, and the status line stays one line: hints that don't fit drop from
the end instead of wrapping.

**After the fix,** across 14 viewports from 960x600 to 2560x1440 plus the
two stacked ones, every graph level (and every tree, table and board level
checked: tree traversals, BST, A*, LCS, knapsack, KMP, segment tree, trie,
N-Queens, heapsort, quicksort) draws at 0.0% to +1.1% of main, larger when
stacked, and the strips never at a larger scale than the canvas. So the
check is now at least as strict on screen as it was on main, at every size
measured, and stricter by the 0.8% where the 520 → 516 difference shows.

**Tests (+3):** graph views plus their strips never exceed the old single
view, for 1, 2 and 3 strips; the page's resize loop, simulated over heights
150-1400 px, widths 300-2600 px and 1-3 strips, settles within three resizes
with the strips never above the canvas and the canvas never below main's
scale; uncoupled, the cap follows the canvas alone.

**What the viewer can still do:** drag the splitters to their limits. At
1366x768 with both at the limit the canvas is 538x225 and draws at 0.47-0.53
px a unit, about a 1 px margin. That is the viewer's choice of a smaller
drawing, the same as main at an 800 px window (0.50), and the margin is
still the same fraction of a node.

**Design choices:** strips centred under the drawing (before, inside the
view, they sat where the view's centring put them; left-aligned they would
now hang off one side of a narrower drawing); the cap as a CSS variable set
from a ResizeObserver, so stepping renders once; hints ordered play, step,
end of pass, speed, reset, so a short line keeps the ones that matter.

**Checked:** axe clean on every scene type (array, insertion, BFS,
Bellman-Ford, traversal, AVL, Dijkstra, LCS, LIS, A*, N-Queens, /about), both
themes, at 1366x768, 200% zoom and 320 px, no horizontal overflow, keyboard
walk reaching both splitters with no hidden stops. Screenshots of main and
dev side by side at 1366x768, 1100x600 and 1366x650 match apart from the
slightly larger graph.

### Ruling 1: insertion sort as a level (done)

`db2bb39`. Level 5, tier 1, in the arrays lane just before merge sort, so it
opens the run of sorts; the ticker op is "shift" (sliding larger values
right), a new word on the ticker. Registered, so Browse and the sitemap list
it with no other change. Race mode imports the same generator.

**Design choices:**

- **Place on the path:** before merge sort, not after heapsort: it is the
  simplest of the four and the one the others are usually taught against.
  Every later level moves down one; race mode is now level 34 (README
  updated; nothing in the code names a level number).
- **Browse order** is the catalog's, which was already not the path's
  (quick, merge, heap). Insertion sort goes after heapsort so the existing
  Browse order doesn't shift.
- **The generator now matches the other sorts:** phase "insert" on every
  frame of a pass (the explanation bar shows it as a chip, as it shows
  "partition" or "merge"), and the final frame on line 0 with phase "done"
  and a "Sorted. N comparisons and M writes, with no extra memory." summary,
  as quicksort, merge sort and heapsort end. Counters and the frame sequence
  are otherwise unchanged, so race totals (198 operations for 100 sorted)
  hold. Before this it was race-only and had no level, so no golden pinned
  it.
- **Presets:** the shared array presets: random, sorted, reversed, nearly
  sorted, few unique, organ pipe. Size slider up to 100 as before; typed
  input up to the shared 200.

**Tests (+4):** on the path before merge sort with "shift" and in the
sitemap; nearly sorted is close to linear (111-127 comparisons at n=100
over 20 seeds, against 2,400-2,900 for random; the test asserts under 4n and
a fifth of random); every frame of a pass is "insert" and the run ends like
the other sorts; 200 reversed, the largest typed input, is 40,399 frames
(cap 120,000).

**Worst case:** 200 reversed, 40,399 frames of 200 values each, the same
order as quicksort on 200 sorted with the last-element pivot.

**Checked in a browser:** axe clean on the level (random and nearly sorted),
Browse and race mode, both themes, 1366x768, 1x screenshots; the 150-press
repro is clean with motion on and off. The tab-walk count of stops without
a detected ring is 8, against 9 on quicksort (one fewer field): the probe's
usual figure, not a new gap.

**Docs:** README status (Phase 1 is 8 algorithms; its test count is now the
arrays folder, 150, since the old 133 couldn't be rebuilt from today's
files) and race level 34; CONTRIBUTING's race section no longer says
insertion sort is race-only.

### Hotfix: the step crash, for main (done)

Branch `hotfix/step-crash` from origin/main (`bd48036`), in a separate
worktree so dev was never touched. `git cherry-pick c4bcf4e f8b61cb` **applied
cleanly**: no conflicts, no edits, the same two files (`FrameAnnouncer.tsx`,
`useMotion.ts`). They became `7687831` and `c84bdfb`, both signed, with the
original author dates. On the branch: typecheck clean, suite 607/607 twice
(main's suite; dev has more), build clean. Pushed `origin/hotfix/step-crash`
only. origin/main is still `bd48036`, and the branch fast-forwards from it.

**The repro:** the production build served with vercel.json's headers, 150
ArrowRight presses as fast as Playwright sends them, at 1366x768, on six
levels, with motion on and with reduced motion. An error is any page error
or console error, excluding the two Vercel insights scripts, which are 404s
on a local server.

| | quicksort | LCS | edit distance | mergesort | Dijkstra | BST |
| --- | --- | --- | --- | --- | --- | --- |
| main, motion on | #185 at press 53 | 53 | 53 | 54 | clean | 53 |
| main, reduced motion | 54 | 53 | 54 | 53 | clean | 53 |
| hotfix, both | clean | clean | clean | clean | clean | clean |

React error #185 is the minified "Maximum update depth exceeded". Dijkstra
stays clean on main only because its default run is 30 frames, so stepping
stops before press 53.

### STOP after item 9 (end of the brief)

**Done this session:** 5a and items 6-9, plus two bug fixes found on the
way. Commits on dev, all signed, typecheck, suite twice and build clean at
each: `cc338d1` (brief into ROADMAP), `1e635c0` `a8a89fd` (5a), `c4bcf4e`
`f8b61cb` (update-depth fixes), `16659ff` `ad87df9` (item 6), `24a51a7`
(item 7), `4df227d` `0233237` (item 8), `8f29ba9` `741d3f7` (item 9), plus
the PROGRESS updates. Suite: 728 tests (657 at the last stop). No test is on
`it.fails`. No golden or fingerprint test changed. No dependency added.
main and Vercel untouched. Pushes went to dev at the milestones the owner
asked for ("do not push until a big chunk is done"): after 5a+6, after 7,
and after 8+9.

**Blocked:** nothing.

**Worth a second look before deploy, most important first:**

1. **Insertion sort was added** for race mode's one-click lesson, which the
   design names but the code didn't have (item 8). It's race-only and
   touches no existing generator. Keep it, make it a level, or drop the
   preset.
2. **`sitemap.test.ts` was restructured** because it assumed some level was
   still "soon" (item 8). The rule is now tested on a synthetic soon level;
   nothing is checked less, but it is an existing test that changed.
3. **The strips moved out of the canvas** into their own panel (item 6),
   to make them resizable and collapsible without changing any layout
   geometry. It's the biggest visual change of the run.
4. **Two crash fixes worth shipping to main on their own** (`c4bcf4e`,
   `f8b61cb`): stepping fast (about 50 quick key presses) threw "Maximum
   update depth exceeded" on most levels, and on more with reduced motion.
   Both are on main's code today.
5. Thin margins I chose on purpose: walls clear 3:1 by 0.04 (5a); the
   splitters' 24 px targets overlap 16 px of the canvas edge (6).

**Item 9's brief was cut off** after "Clearance notice also counts
overlapping". I built the existing backlog entry it matches (overlapping
nodes). If more items followed, they didn't arrive.

### Item 9: small backlog items (done)

Commits: `8f29ba9` (Bellman-Ford: jump to the end of a pass), `741d3f7`
(the clearance notice counts overlapping nodes).

- **End of pass.** Frames already carry their pass as `phase` ("pass 2 of
  6"), so the jump is generic. The control goes to the last frame of the
  current phase run, or, from a phase's last frame, to the end of the next
  one, so repeated presses walk the run pass by pass. It lands on the last
  edge a pass relaxes (the "pass k relaxed n edges" summary frame already
  belongs to the next pass's phase). A level opts in with `meta.phaseJump`
  (Bellman-Ford: "pass"); it's a metadata field and no frame changed. The
  control is an "end of pass" chip after Jump to end, and the shortcut is
  Shift+Right, listed in the status line. On other levels Shift+Right is
  still a step. Checked in the browser: frames 11, 22, 33, 44 of 45 on the
  default run; axe clean in both themes. 3 tests.
- **Overlapping nodes.** A node overlaps another when their circles
  overlap (centres closer than two radii). The notice keeps its edge
  sentence word for word and adds "2 nodes overlap each other in this
  layout." / "N nodes overlap other nodes in this layout." (without "in
  this layout" when it follows the edge sentence). It shows for typed and
  hand-placed graphs and, with the editor, after every edit. Presets can't
  trigger it (their check already rejects crowded nodes), and every
  level's default stays silent (tested). Removed from CONTRIBUTING's
  Deferred list. 2 tests, plus the 4 wording tests given the new field.

### Item 8: race mode (done)

Commits: `4df227d` (insertion sort, and one operation count for every
sort), `0233237` (race mode).

**The one call to look at: insertion sort is new.** The approved design
says "Quicksort on sorted versus insertion sort is one click" and also "No
generator changes", but there was no insertion sort anywhere in the code
(the path's sorts are quicksort, merge sort and heapsort). I read "no
generator changes" as "don't bend the existing generators to suit the
race", not as "no racer the design names". So I added
`algorithms/arrays/insertionSort.ts`, the CLRS shifting version, with its
own tests (reference sort, stability, counts, hygiene, determinism, input
contract). It serves the race only: it isn't registered, has no level and
isn't on Browse. No existing generator changed. If you'd rather it were a
level of its own, or not there at all, either is a small change.

**Counter check (first step of the brief):** every sorting generator counts
comparisons and writes the same way. `opCount.test.ts` holds quicksort (all
five pivot strategies), merge sort, heapsort and insertion sort to reference
implementations written apart from the levels, over sorted, reversed,
random and few-unique inputs at 1-60 elements. The shared definition: a
comparison tests an element against an element or a value; a write is one
store into the array or the aux row (a swap is two writes, copying k values
to aux is k). **All four already agreed; no counter was wrong.** The test
also checks that comparisons + writes never fall from one frame to the next,
which the race clock relies on.

**Design choices made inside the approved design:**

- **Route.** `/visualize/race-mode`, a page of its own. `levels.ts` now has
  `PAGE_LEVELS` (`race-mode`) next to "is registered" for `isOpen`, so the
  home path, the neighbours and the sitemap pick it up.
- **Racers.** Quicksort, merge sort, heapsort, insertion sort. Each side is
  built with its level's defaults plus the shared input, so quicksort pivots
  on the last element (its level's default), and that is what makes sorted
  input quadratic. Default race: quicksort against insertion sort on a fixed
  shuffle of 1-40.
- **Clock.** Operations at 40 per second at 1x, times the speed (the same
  0.25x-16x marks as the player). Each side shows its last frame whose
  comparisons + writes are at or below the clock. Step moves to the next
  (or previous) operation boundary on either side, so every step changes at
  least one lane. The scrubber is in operations. Keys as on every level:
  space, left/right, up/down for speed, R/Home, End.
- **Done.** A side whose total is reached holds its final frame and shows
  "done · N ops" in its lane header.
- **Lanes.** Two array renderers side by side with live comparisons, writes
  and ops, and each side's own explanation under it. Stacked below 900 px,
  where the page scrolls and the timeline sticks to the bottom of the view.
  Bars animate only on a single step.
- **Presets.** Random, sorted, reversed, nearly sorted, few unique (the
  array levels' own, without organ pipe), at the n slider's size (4-100),
  plus "Quicksort vs insertion sort, sorted". At n = 40 that is 78
  operations against 2,418; at 100, 198 against 15,048.
- **URL.** `a`, `b` and `input`, defaults left out. Over 100 elements, or an
  unknown id, the page says so in the established style.
- **Announcements.** A live region, written through a ref, says where the
  reader landed (step, scrub, stop, end), never during play.
- **Marquee.** No op added: race mode shows the sorts' own operations, and
  "race" isn't an operation.

**Checked:**

- Browser, both themes, 1366x768: axe clean at the start and at the end;
  the lesson chip, 16x play, End, step back; tab order header, setup,
  timeline; no page errors. axe clean and no horizontal overflow at 880,
  at 320 and at 200% zoom.
- Worst cases at 100 elements, one process: quicksort on sorted 16,042
  frames (59 ms, about 43 MB); on reversed, quicksort 11,042 and insertion
  sort 10,199 frames, about 64 MB together, under 40 ms to build. Within
  the ~150 MB limit.
- 9 race tests: defaults, caps and errors, presets, sides built from level
  defaults, the clock never shows a frame ahead of it, finished sides hold
  their sorted final frame, the lesson's totals, stepping boundary to
  boundary both ways.

**Changed an existing test (please look):** `sitemap.test.ts` asserted that
at least one level is still "soon" before checking that soon levels are
never listed. With race mode open there are none, by design. Rather than
drop the rule, `sitemapPaths()` now takes the levels and the open test as
optional parameters, and the test holds the rule on a synthetic soon level
as well as on the real path. Nothing it checked is checked less. The home
page likewise only mentions "soon" (legend and intro) while some level is.

### Item 7: interactive graph editor (done)

Commit: `24a51a7`.

**Design choices made inside the approved design:**

- **Entry.** An "edit graph" chip at the canvas's top-left corner, on graph
  scene levels only (A* has a board, not a graph). It sits over the canvas's
  padding; on a crowded layout it can cover the top-left corner of the
  drawing. In edit mode a toolbar row replaces it at the top of the canvas
  pane, and a status and hint row sits under the editor.
- **Mode machine.** Entering sends `invalidate` then `edit`, so it also works
  mid-build, and frames are discarded. The page freezes the params the run
  was built from, so nothing rebuilds while the graph changes. Done sends
  `commit`: a changed graph builds again (precompute, then ready); an
  unchanged one is ready at once, from frame 1. While editing, the playback
  keys are off, the transport is disabled (Play was never disabled before),
  and the explanation says the run was set aside.
- **Tools decide the gestures.** "Drag a node" can't mean both move and
  join, so: select/move drags a node and selects; add node puts one where it
  clicks; add edge drags from node to node, or clicks one and then the
  other; delete removes what it clicks. Double-click on an edge edits its
  weight in any tool; Delete removes the selection in any tool.
- **Keys.** Tab walks the nodes in id order, then the edges (DOM order:
  visible edges, then nodes, then the edges' focusable hit paths on top,
  trimmed at the rims). N adds a node at the free spot farthest from the
  others and focuses it. E on a node starts a join; Tab to the target and
  press Enter (or E). Escape cancels. Arrows move the focused node 8 view
  units (Shift: 32). Enter on an edge opens an inline number field over its
  midpoint: Enter or blur keeps it, Escape drops it. Delete or Backspace
  removes; focus moves to the neighbouring node. Ctrl+Z undoes; Ctrl+Y or
  Ctrl+Shift+Z redoes. Undo and redo are also toolbar chips. Focus is
  selection.
- **Snapshots and history.** Every edit returns a new `EditorGraph`
  (`src/core/graphEdit.ts`, pure, 18 tests). History keeps 200 steps. A
  drag is one step, committed on release.
- **Ids stay 0..n-1.** The edge-list format needs every id below the largest
  to exist, so deleting a node renumbers the nodes after it. The status line
  says so when it happens.
- **Weights.** New edges weigh 1 on a level whose default graph is weighted
  (Dijkstra, Prim, Kruskal, Bellman-Ford); elsewhere edges have no weight
  and the editor says weights aren't used there.
- **Directed toggle.** A "directed" chip in the toolbar, the same param as
  the form's select. Directed to undirected merges each two-way pair into
  one edge (the first drawn) and says how many merged.
- **URL and field.** Every committed edit writes the edge list and direction
  into the URL with `replaceState` (one history entry per session, not one
  per edit) and so into the form's field. Over the 4,000-character cap the
  page falls back to "custom graph - not shareable", as for typed graphs.
- **Positions.** They travel in a `pos` param (layout units, 4 decimals)
  that `paramsToSearch` never writes. The page keeps it next to the one URL
  it was made for. All nine graph levels' parse passes it to `buildGraph`,
  which uses it only with exactly one in-box point per node (otherwise the
  usual layout). A link, a reload or a new tab therefore shares topology
  only, and the editor's hint says "Positions you place stay in this tab: a
  link shares the edges only." A run from the input panel keeps the
  positions only while the edges and direction are unchanged.
- **Clearance notice.** While editing it measures the edited graph at the
  band of the level's strip rows, after every committed edit.
- **Refusals.** Nothing new: on Done the level's parse refuses as it does
  for any input (Tarjan undirected, Kruskal directed, checked in the
  browser with their established messages).

**Checked:**

- In Chrome, Dijkstra: N, E then Enter, weight entry, Shift+arrow, undo,
  redo, delete with renumbering, click to add, drag to join. The URL and the
  field followed every topology edit; the notice appeared after an edit
  that crowded a node, and was gone after a reload (positions not shared).
  Done rebuilt the run (26 frames).
- axe clean in edit mode in both themes on Tarjan, Kruskal and BFS.
  Keyboard walk: the toolbar, then nodes 0, 1, 2... in order. Screenshots
  in both themes.
- 150 nodes / 524 edges (Prim dense): an arrow-key move, with its URL
  write, takes 14.4 ms median, 20.8 ms worst.
- 18 model tests: edits, caps, renumbering, direction changes, undo/redo,
  immutability, params round trip, positions reaching a level's run, `pos`
  never in a URL, Kruskal's refusal on the edited graph.

**Narrower than it might sound:**

- There's no component test for the editor itself (no DOM environment in
  the suite); its UI was checked by the scripted browser walk above.
- A node within 16 px of the canvas's right or bottom edge sits under a
  splitter's hit area, so a press there starts a resize. Nodes are kept in
  the layout box, whose padding is usually wider than that, but on a narrow
  canvas the outermost nodes can be hard to grab with a pointer. The keys
  still reach them.
- Done from an unchanged graph starts the run from frame 1, not from where
  you left it: entering discards the frames, as specified.

### Item 6: resizable panels (done)

Commits: `16659ff` (strips drawn in their own panel), `ad87df9` (splitters),
plus two bug fixes found while testing it, `c4bcf4e` and `f8b61cb` (below).

**Design choices made inside the approved design** (all in CONTRIBUTING
"Layout"):

- **Strips.** The design puts the strips in "the bottom area (strips +
  explanation)", but every renderer drew them inside its own SVG. Moving
  them out by re-laying out the structure without them would have changed
  the graph band that `LAYOUT_ASPECT` and the clearance check depend on, and
  that would have been a stop. Instead, on the visualize page renderers
  get `stripsApart`: they lay out exactly as before and crop their viewBox
  6 units under the band, where the strips would have started 12 below.
  A shared `StripsPanel` draws the same rows, with the same motion, under
  the canvas. No position, band or clearance figure changes (tested: the
  crop sits between the band and the first row for every renderer and
  strip count). The hero and any other use of a renderer are unchanged.
  The strips panel is never drawn larger than 1:1, so a collapsed side
  panel doesn't blow the chips up past the drawing.
- **One rule for both splitters.** Each splitter's `aria-valuenow` is the
  canvas's share, `aria-controls` names the canvas plus the pane on the
  far side (when it is in the document), forwards (right or down) grows the
  canvas, and Enter collapses or restores the far pane. Beside: the side
  panel, which holds the code, call stack, counters and input (the design's
  "code panel" is that whole column, since collapsing only the code would
  give the canvas no width). Above: the strips. The explanation and notice
  never collapse. With strips hidden, the "above" splitter reports what it
  measures. Only a collapsed side panel, when wide, reports 100%.
- **Minimums.** Canvas 40% of the row width and 45% of the region height,
  as specified. Side panel 272 px; strips-and-explanation area 64 px (the
  explanation's two lines). Defaults are the old fixed sizes (21rem, and
  23rem from 1280 px), so an untouched page looks as before.
- **Limits live in CSS** (`min-w-[40%]`, `max-w-[60%]`, `min-h-[45%]`,
  `max-h-[55%]`). The code only turns keys and drags into sizes, so a window
  resize can never push the canvas under its minimum.
- **Moving a collapsed splitter** (keys or drag) opens its pane, starting
  from the canvas at its largest. Off-axis arrows on a focused splitter do
  nothing and are kept from the playback shortcuts; so are Home and End. The
  playback key handler now ignores keys a focused control already handled
  (`defaultPrevented`).
- **Drag.** Pointer capture, the size written to the element once per
  animation frame, React told on release. While held, `data-resizing`
  switches every transition off on the page.
- **Refit.** Every renderer draws in view units from its run bound into a
  fixed viewBox, so a resize is the SVG's own rescale: nothing re-lays out
  and no node moves.
- **Stacked (below 900 px).** The page scrolls (the level header with it,
  so 200% zoom keeps room for the canvas). Both splitters are horizontal and
  set the canvas height, between 45% of the window under the top bar and
  all of it. The default is `clamp(45%, 62vw, 100%)`. The beside splitter
  sits between the transport and the side panel. Before this, the stacked
  layout gave the canvas almost no height (a sliver at 880 px, nothing at
  200% zoom).
- **Visible controls.** Pointer users get chips in the status line: "side
  panel" and "strips" (pressed = shown; "strips" only on levels that have
  them) and "reset layout" (disabled when the layout is the default). The
  status line now shows at every width; the shortcut hints still hide below
  640 px.
- **Target and focus.** A 24 px hit area over the one-pixel line, 16 px on
  the canvas side (letterboxed space) and 8 px on the panel side. Focus and
  drag show a 3 px line and a grip in the focus colour; hover shows them in
  the edge colour.
- **Storage.** `treewidth.layout.v1`, read and written in try/catch. Each
  field is validated on its own and falls back to its default; a default
  layout removes the key. The /about note now lists theme and panel sizes.

**Checked:**

- Splitter behaviour in Chrome at 1366x768, 880x768 and 320x640: arrows,
  Shift+arrows, Home/End, Enter both ways, off-axis arrows (the frame
  doesn't move), drag, reload (sizes kept), double-click, reset, and a
  corrupt saved value (defaults, no error).
- axe (WCAG 2.0-2.2 A/AA plus best practice) clean in both themes at
  1366x768, at 200% zoom on 1366x768 (683x384 CSS px) and at 320x640, on
  every scene type: array (quicksort), tree (AVL), graph (Dijkstra), matrix
  (LCS), split (LIS), board with notes (A*), board with tree (N-Queens),
  plus /about. No horizontal overflow at any of them.
- Keyboard walk at 1366: both splitters take focus on every visualizer
  page; no focus stop is hidden.
- **Step time**, README method, same cases as items 4-5, baseline build
  (`c4bcf4e`) against this one, two rounds each: Prim dense 9.4 → 6.3-6.7
  ms median, Prim ties 8.9-9.1 → 6.6-7.0, Prim disconnected 11.7 → 7.7-7.9,
  Kruskal dense 9.6-10.4 → 8.4, Dijkstra random 9.0-9.1 → 6.0-6.2, Dijkstra
  islands 11.2-12.0 → 6.6-7.0. Every p95 is lower too. Arrays at 200:
  quicksort 4.9-5.4 → 4.8-5.2, heapsort 5.7-6.1 → 5.1-5.6 (noise). I
  haven't isolated why the graphs got faster; the canvas SVG lost about 150
  nodes to the strips panel.

**Bugs found and fixed on the way** (each its own commit):

- `c4bcf4e`: stepping fast (about 50 key presses without a pause) threw
  "Maximum update depth exceeded" on every level with enough frames
  (quicksort, LCS, edit distance; BFS and knapsack ran out of frames
  first). The frame announcer copied its text into state from an effect,
  a second render per step. It now writes the live region through a ref.
  Present on main too, so worth shipping.
- `f8b61cb`: the same pattern in the counters' count-up under reduced
  motion (LCS threw after 55 quick presses with reduced motion emulated).
  With motion off it now returns the value directly.
- There's no component test for either: the suite has no DOM environment,
  and adding one would be a dependency. They were checked in the browser by
  the same scripted key floods that reproduced them.

**Narrower than it might sound:**

- At 320 px the strips draw at about a third of their size, as they did
  inside the canvas before; readable only by zooming.
- Stacked, both splitters set the same quantity (the canvas height). That
  follows from "splitters become horizontal" with the canvas always the
  controlled pane, but it means two handles for one size.
- The 24 px hit area overlaps 16 px of the canvas edge and 8 px of the
  panel. A press there starts a drag instead of reaching what is under it.
  Nothing interactive sits in those strips today. The graph editor (item 7)
  will need its edge margin to stay clear of it.

### Item 5a: A* follow-ups (done)

Commits: `cc338d1` (the brief into ROADMAP), `1e635c0` (octile and the
overestimate preset), `a8a89fd` (walls).

- **Octile** joins the picker between Euclidean and zero: max(dr, dc) +
  (√2 - 1) min(dr, dc), the cost of the way across open ground. Tested
  optimal against the independent grid Dijkstra on every preset, sizes
  6/12/20, random walls over 5 seeds, both ways of moving. Also tested: it
  is at least Euclidean and at most Manhattan everywhere, exact on open
  ground with diagonals, and on the open field it never expands more
  squares than Euclidean.
- **"When the heuristic overestimates"** is the found map
  (`.....S/#...#./....../G...../##..##`) as a preset. Design choices: it
  sets heuristic = Manhattan and moves = 8 itself (a preset's params merge
  over the form), so one click shows it. It is one fixed 5 x 6 map and
  ignores the size slider. I didn't give it a `maxSize`, because the cap
  hint would then sit under the slider for every size above 6; the
  description says "on a fixed 5 × 6 map" instead. The description comes
  from tracing the run: Manhattan charges 2 for a √2 diagonal, so the
  squares on the true route show f = 8, while the search goes down the right
  edge and along row 3 at f = 7.4 and pops G there. The test runs the preset
  itself: 7.4 against a reference 6.2, the run's own "costs 7.4", and
  octile and Euclidean both get 6.2 on the same map.
- **Walls:** two new derived theme tokens next to `vizGrid` (not role
  colours, so the role palette and its tests are untouched).
  `vizWall` = halfway between the hairline and the muted text, moved by
  `withContrast` only as far as 3:1 against the ground (an empty square).
  `vizWallHatch` = one OKLCH step (0.05) further from the ground. The hatch
  is a 2-unit line every 6 view units at 45° (an SVG pattern, id from
  `useId`). Measured: Ember dark 3.08 (hatch 3.80), Ember light 3.04 (3.72),
  Brass dark 3.04 (3.75), Brass light 3.07 (3.76); the old dim-text walls
  were 9.2 / 8.7. Tests: both at least 3:1 in every preset and mode,
  quieter than dim text, chroma under 0.03.
- Screenshots at 1x, 1366x768, both themes: the A* default mid-run, the
  overestimate map's final frame, N-Queens and Sudoku (unchanged: no walls,
  no pattern emitted). axe clean on all of them in both themes.

**Narrower than it might sound:** the walls clear 3:1 by a thin margin
(3.04 at worst), by design: the fill moves only as far as 3:1 needs. The
contrast is between a wall and an empty square. A wall next to a square
with a role fill (visited, open) is not held to 3:1.

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
