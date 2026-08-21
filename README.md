# Isle of Cambrera

A single-player, turn-based 2D browser game about founding a settlement on a fantasy island and growing it toward a kingdom. Inspired by the 1968 *Hamurabi* BASIC game (allocate-and-consequences), *Civilization* (build-a-civ arc), *Lords of the Realm II* (seasonal pacing — planned for later), and *Master of Orion* (every patch of land matters, even the poor ones).

The world is low-fantasy: classical creatures exist but magic is fading, and the technological arc runs medieval → renaissance.

- **Play it:** [cambrera.digimente.xyz](https://cambrera.digimente.xyz)
- **Roadmap + active work:** [project board](https://github.com/users/vicosurge/projects/1)
- **Version history:** [GitHub releases](https://github.com/vicosurge/survival-civ-game/releases) · [git log](https://github.com/vicosurge/survival-civ-game/commits/main)

## What it plays like

You land on a small northern island as refugees fleeing a continent-destroying war. Each turn is one year. You allocate a handful of workers across farming, hunting, fishing, woodcutting, quarrying, scouting, and — once there is something to defend against — the militia; buildings (granary, palisade, well, hunting lodge, lumber camp, mason's workshop, long house, shrine of Anata, chicken coop, muster field) give your resource surplus somewhere to go and counter specific threats; private houses lift the population cap once the long house stands (and each new house costs more than the last); your rescue ship can voyage out for two years to bring back survivors. Pops age through child / adult / elder phases (fertility window 14–35), fertile tiles matter, morale gates growth, and a chronicle of the years accumulates on the right. There is no hard win condition — the soft goal is becoming a kingdom.

When enough pops transition to elder, the settlement faces a civic decision: put elders to light work (food bonus, slight morale cost) or honour their rest (morale bonus). A second civic decision lands once the long house stands and there are children old enough to help — children working brings a tiny food and wood trickle at a real morale cost; letting them be children rewards the community's mood. A third law, the work levy, is yours to raise whenever you want it once the long house stands. All three are revisitable from the long house's Governance panel — but changing a standing law costs morale on top of the new policy's own effect, in both directions, so reversibility doesn't make the choice weightless and no amount of flipping back and forth wins you anything.

Bandits are other survivors of the same war — people who came ashore on a worse stretch of coast and ran out of season before they ran out of hunger. They do not raid and disappear. When they arrive they make a **camp**, somewhere out past the ground you have charted, and that camp stays: it gains strength every year you leave it alone, and it comes down on your stores when it pleases. A palisade turns a small band away outright, but a band that has outgrown your wall comes over it, and one you let grow strong enough will start taking lives as well as grain.

The answer is yours to choose. Send scouts and find where they sleep. Raise a **militia** at the muster field — villagers who grow nothing and cut nothing, whose only wage is the work they are not doing, and who will stand between the raiders and everyone else. Or march out and burn the camp, on odds the game shows you before you commit, knowing that losing means people do not come home. Doing none of it is also a choice, and for the first time in Cambrera it is one that can end you.


The first years point themselves. A short note above the villager panel names the one thing that matters right now — set your idle hands, get something built, find stone, reach twenty-five souls — and then retires for good when the Long House goes up. The build panel leads with what's worth building today and folds the rest into a group you can open whenever you want to see what you're saving toward, and a job only appears once there's land in reach for it. None of it is a tutorial and none of it is compulsory: one click on the **×** and you never see any of it again, in this game or any other.

Food does not keep forever. Your stores have a capacity — grain pits and lofts to begin with, far more once a granary stands and houses add their own larders — and half of whatever you hold above it spoils each winter. A surplus is something to spend, not bank: trade it, build with it, offer it at the shrine, or raise a work levy that feeds work gangs out of the stores and gets timber and stone back. Piling every villager onto the fields past the point you can store the harvest just feeds the rats.

At a handful of milestones the game stops and tells you a story — the landing, the first news of the war across the strait, the raising of the long house, the founding of the shrine, the discovery of the bandit camp, the day the militia came back from it. These *remembrances* have no mechanical effect whatsoever, and every one has a Skip button that costs you nothing. The ticking parts of the game are all in the panels; this is where the world gets room to breathe, for the players who want it. Anything you've reached is re-readable from the **Remembrances** panel, listed by the year it happened in your settlement — and anything you haven't reached yet doesn't appear there, so the list is never a spoiler.

Two town-centre upgrades — the Communal Garden and the Workshop Yard — give the settlement a small passive food and wood trickle from turn 1, so a settlement at 100% farming still has *some* construction headroom. They don't replace woodcutters or quarrymen, but they keep the build economy from flatlining. Once you can afford them, the Lumber Camp and Mason's Workshop lift the per-worker yields for wood and stone — finite seams still run dry, but the ceiling is higher.

Roads come in two tiers. A dirt path is cheap and available from turn 1 — a +1 reach anchor, handy for pulling an outlying stone or fertile tile into your territory before the Long House stands. Stone roads are Long House gated and reach further (+2), proper highways that pave over older paths. A chicken coop starts a fast-growing flock that produces eggs annually and auto-culls surplus birds at the flock cap. Once the Shrine of Anata stands, the priests may call for a great offering — accept (food → morale) or decline (morale cost). Merchants arrive with a cargo model: their wagon has a fixed capacity, and buying from them frees slots so you can sell more in the same visit. The more often you strike a deal, the bigger the wagons that come back — and once your Long House stands, building a dock lifts every sell rate by a gold per unit and lets your fishers cast a ring further along the shore and upriver.

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
  cutscenes.ts        milestone interlude triggers + archive helpers
  narratives.ts       chronicle prose kept out of the game logic
  content/            player-facing prose as JSON (cutscenes.json)
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
