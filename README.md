# Isle of Cambrera

A single-player, turn-based 2D browser game about founding a settlement on a fantasy island and growing it toward a kingdom. Inspired by the 1968 *Hamurabi* BASIC game (allocate-and-consequences), *Civilization* (build-a-civ arc), *Lords of the Realm II* (seasonal pacing — planned for later), and *Master of Orion* (every patch of land matters, even the poor ones).

The world is low-fantasy: classical creatures exist but magic is fading, and the technological arc runs medieval → renaissance.

- **Play it:** [cambrera.digimente.xyz](https://cambrera.digimente.xyz)
- **Roadmap + active work:** [project board](https://github.com/users/vicosurge/projects/1)
- **Version history:** [GitHub releases](https://github.com/vicosurge/survival-civ-game/releases) · [git log](https://github.com/vicosurge/survival-civ-game/commits/main)

## What it plays like

You land on a small northern island as refugees fleeing a continent-destroying war. Each turn is one year. You allocate a handful of workers across farming, shepherding, hunting, fishing, woodcutting, quarrying, and scouting; buildings (granary, palisade, well, hunting lodge, long house, shrine of Anata, chicken coop) give your resource surplus somewhere to go and counter specific threats; private houses lift the population cap once the long house stands; your rescue ship can voyage out for two years to bring back survivors. Pops age through child / adult / elder phases (fertility window 14–35), fertile tiles matter, morale gates growth, and a chronicle of the years accumulates on the right. There is no hard win condition — the soft goal is becoming a kingdom.

When enough pops transition to elder, the settlement faces a civic decision: put elders to light work (food bonus, slight morale cost) or honour their rest (morale bonus). A second civic decision lands once the long house stands and there are children old enough to help — children working brings a tiny food and wood trickle at a real morale cost; letting them be children rewards the community's mood. Both laws are revisitable from the long house's Governance panel — every flip applies the same morale cost as the original decision, so reversibility doesn't make the choice weightless. Raiders from the island's harsh interior strike periodically — highland survivalists who have lived on Cambrera far longer than your settlement has.

Two town-centre upgrades — the Communal Garden and the Workshop Yard — give the settlement a small passive food and wood trickle from turn 1, so a settlement at 100% farming still has *some* construction headroom. They don't replace woodcutters or quarrymen, but they keep the build economy from flatlining.

Shepherds work grass tiles exclusively, maintaining a sheep herd that grows each year and produces wool (a trade commodity) and food from milk. A standing slaughter order lets you cull for extra food each year. A chicken coop starts a fast-growing flock that produces eggs annually and auto-culls surplus birds at the flock cap. Merchants arrive with a cargo model: their wagon has a fixed capacity, buying from them frees slots so you can sell more in the same visit — wool included.

## Playing locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`. Requires Node ≥ 18.

## Building for deployment

```bash
npm run build     # type-check + production bundle to dist/
npm run preview   # serve the production bundle locally
```

The `dist/` folder is static files — drop it on any host (GitHub Pages, Netlify, Vercel, a plain S3 bucket).

## Stack

- **TypeScript** (strict mode)
- **Vite** for dev server and bundling
- **HTML Canvas** for map rendering
- **DOM overlay** for UI panels (resource bar, allocator, tile info, chronicle log)
- **localStorage** for saves

No game engine — a turn-based tile game doesn't need the weight. React can layer in later if the UI gets gnarly.

## Project structure

```
index.html            canvas + sidebar shell (allocator, tile info, log)
src/
  main.ts             entry point, wires everything
  types.ts            shared types and tuning constants
  map.ts              hand-crafted island, capacity generation, reach/eligibility
  state.ts            newGame / save / load / allocation summaries
  events.ts           random events table + roller
  turn.ts             end-year resolution pipeline
  render.ts           canvas renderer
  ui.ts               DOM overlay (topbar, allocator, tile info, log, overlays)
  style.css           retro-inspired palette (muted browns, gold accents)
feedback-worker/      Cloudflare Worker — stores alpha tester feedback in D1
  wrangler.toml       Worker config + D1 binding + route (cambrera.digimente.xyz/feedback*)
  schema.sql          D1 migration (run once with wrangler d1 execute --remote)
  src/index.ts        POST /feedback (store) · GET /feedback/dashboard (protected view)
```

## Feedback system (alpha)

Testers click **Leave Feedback** above the chronicle. Their name, 1–5 star rating, free text, game version, and (optionally) the full chronicle of their run are sent to a Cloudflare Worker at `cambrera.digimente.xyz/feedback` and stored in a D1 database. The dashboard is at `/feedback/dashboard?key=<DASHBOARD_KEY>`.

**Export Chronicle** sits next to the feedback button — testers can download their run as a plain-text file (`cambrera-chronicle-yearN.txt`, oldest year first, metadata header included). The same serializer powers the optional chronicle attach in feedback. When a settlement falls, the feedback modal auto-opens with the chronicle attach pre-checked, so post-mortems are one click away.

**First-time setup** (inside `feedback-worker/`):

```bash
npm install
wrangler d1 create cambrera-feedback          # paste the database_id into wrangler.toml
wrangler d1 execute cambrera-feedback --file=schema.sql --remote
wrangler secret put DASHBOARD_KEY             # pick a strong random string
wrangler deploy
```

**Migrating an existing deployment to the chronicle column** — run once if the D1 instance was created before chronicle support:

```bash
wrangler d1 execute cambrera-feedback --remote \
  --command "ALTER TABLE feedback ADD COLUMN chronicle TEXT"
wrangler deploy
```
