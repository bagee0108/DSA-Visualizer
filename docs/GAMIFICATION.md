# Gamification: where it plugs in

The UI is laid out for progress, quizzes, accounts and a leaderboard, but none
of them exist. This note says where each one attaches, so the work that adds
them changes what fills a slot rather than the layout around it.

Nothing here is a game mechanic. What a star means, what earns XP and how a
quiz is scored are decisions for the work that builds them.

## The rule the current UI follows

Every slot is drawn in its truthful empty state. Stars are outlines, the header
says "not started", and nothing is filled, counted or marked complete. Pages
that do not exist get no link, not a disabled one. Keep that rule: an empty
slot is better than a number that is not real.

## Levels are the unit

`src/core/levels.ts` is the spine. Every algorithm is a `Level` with an `id`,
a route position (`number`), a `lane` and a `tier`. Progress, XP and quiz
results should all be keyed by **level id**, never by number: the order is
provisional, and numbers shift when it changes.

A level is open exactly when its id is registered (`isOpen`). Progress belongs
in a separate store, not in `levels.ts`, so that file stays a pure description
of the route.

## Where each piece attaches

| what | where it goes | today |
| --- | --- | --- |
| Stars per level | `ProgressStars` in `src/components/level.tsx`. It is used on every route stop and in the visualizer header. | Always three outlines, labelled "Progress: not started". Give it an earned count and it fills in place, with no layout change. |
| Progress along the path | `Route` in `src/components/Route.tsx`. `layout()` already computes `along`, each stop's distance from level 1, and `routePath()` draws any prefix of the route. | The orange line marks *open* levels. Progress would be a second path over it, drawn to the last level completed, and it can reuse the reveal keyframes. |
| XP total | The profile slot in the app header (`src/App.tsx`, the empty `w-32` box). | Empty on purpose. |
| Quiz mode | The visualizer header's reserved room (`src/pages/VisualizePage.tsx`, the empty `w-32` box before the level steps). That is where a Watch / Quiz switch goes. In quiz mode the right-hand column would take the quiz panel. | Empty on purpose. No control is drawn until quizzes exist. |
| Quiz answers | Chips (`Chip` with `pressed` in `src/components/ui.tsx`) for choices, `Button` `primary` to submit. | The vocabulary exists; nothing uses it for quizzes yet. |
| Leaderboard | A third link in the main nav, after Browse. | No link. Add it in the same change as the page. |

### Quiz state is not playback state

The playback mode machine (`src/playback/mode.ts`) describes frames and the
clock: idle, precomputing, paused, playing, editing. A quiz is a different
concern: whether the learner is watching or answering, and what they answered.
Keep it in its own state next to the mode machine, not inside it. A quiz can
*drive* playback (pause at a frame, ask what happens next), but through the
existing events, so the machine and its tests stay as they are.

## Accounts and the leaderboard need a backend

The app is a static single-page app on Vercel: no server, no database, no
sign-in. Everything it shows is computed in the browser, and a URL reproduces
a run exactly.

- **Progress for one person on one device** could live in browser storage
  without changing that. It would not follow anyone to another device, and it
  is lost when site data is cleared.
- **Accounts** need authentication and a server-side store, which the app does
  not have.
- **A leaderboard** needs all of that, plus a reason to trust the numbers.
  Scores computed in the browser can be edited before they are sent, so a fair
  board means the server checks results, for example by re-running the seeded
  generator for the submitted answers.

Adding a backend is a deliberate break from the current architecture. It
brings hosting, auth, data retention and abuse handling, and it should be
decided on its own, not slipped in with a UI change. Until then, the profile
slot and the leaderboard's place in the nav stay empty.
