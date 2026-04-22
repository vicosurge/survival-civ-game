# Isle of Cambrera

A single-player, turn-based 2D browser game about founding a settlement on a fantasy island and growing it toward a kingdom. Inspired by the 1968 *Hamurabi* BASIC game (allocate-and-consequences), *Civilization* (build-a-civ arc), *Lords of the Realm II* (seasonal pacing — planned for later), and *Master of Orion* (every patch of land matters, even the poor ones).

The world is low-fantasy: classical creatures exist but magic is fading, and the technological arc runs medieval → renaissance.

## Status

**v0.4 — Long House and Roads.** The settlement now has a civic milestone: once you reach 25 people, you can raise a **Long House** — a hall where the community gathers to govern itself. It raises morale, draws more survivors to Cambrera (word travels), and unlocks road construction. **Roads** are the first tile-targeted build action: click any in-reach tile, pay 2 wood + 5 stone, and lay a path. Road tiles extend your reach outward just like worked tiles do, letting you push your frontier without stationing a worker. The Long House also paves the town square automatically — the hall and the first road are the same civic moment.

The island's walking range is now grounded in its actual scale: each tile is ~10 hectares (~316 m across), so unassisted reach from the town centre drops from 3 to **2 tiles** (~630 m). Everything beyond that needs roads — or the boat.

### In v0.4
- **Long House building.** Gated at 25 pops (total, including children). Cost: 20 wood + 15 stone. Grants +8 morale on construction; permanently boosts newcomers event weight (×3 when both Long House and high morale are active). Town tile gets a road automatically.
- **Roads.** Click a discovered tile → Build Road button appears in the tile info panel. Cost 2 wood + 5 stone per tile. Tile must be in reach and non-water/mountain. Road tiles act as permanent reach anchors. Requires Long House.
- **Reach tightened to 2.** `BASE_REACH` reduced from 3 to 2 tiles, matching the island's ~10 ha/tile scale. Roads become the necessary expansion tool rather than a quality-of-life upgrade.
- Save key bumped to `v15` (`road` field on every tile).

### In v0.3.4
- **Hunters and woodcutters coexist on forest tiles.** A forest tile tracks both job types independently: `hunterWorkers` counts hunters; woodcutters fill the remaining capacity. Both can work the same tile simultaneously. When the game reserve depletes, `gameExhausted` closes the hunter slot permanently — woodcutters continue unaffected.
- Save key bumped to `v13`.

### In v0.3.2
- **Starter defaults swap.** 3 hunters + 1 scout replace the old 3 farmers + 1 scout; intro log reframes the first year as hunting parties, not ploughs.
- **Hunter Lodge building.** Cheap (10 wood), +0.5 food per hunter per year. Deliberately a trap: the bonus is sunk once forests exhaust.
- **River terrain.** A five-tile river threads the map from mountain to south coast with a small delta. Grass tiles adjacent to the river roll fertile automatically — a visible geographic hook for where farming is rich.
- **Fisher job.** Works beach **and** river tiles. Yield rolls fresh each harvest: baseline shallows roll 1–3 food/worker, rich waters (~20% of water tiles) roll 2–4. No cultivation wait and no fallow — you cast nets, you don't till them. No reserve drain either: water stays water.
- **Fishing grounds sketch.** Rich waters (crab, tuna, shoals) get a foam-fleck marker on the map and a tile-info line. Worked beach shows a small fishing boat; worked river shows a staked weir.
- **Forest-tile mode lock.** A forest is locked to `"hunter"` or `"woodcutter"` the moment its first worker arrives; clears when workers drop to 0. One mode per tile at a time.
- **Starter guarantees extended.** `ensureForestNearTown` guarantees a discovered forest on turn 1 (you can hunt immediately). `ensureFishingNearTown` guarantees a discovered beach or river tile in reach.
- Save key bumped to `v12` (new `fishRichness` on tiles, new `hunting_lodge` on buildings, new `"fisher"` job, new `"river"` terrain).

### In v0.3.0
- **"Mood" chip in the topbar** with green/gold/red colouring above 70 / 40 / below 40.
- **Growth gate at 50.** Food surplus no longer automatically produces babies — if morale is below 50, growth stalls until things improve.
- **Event biases.** Morale ≥ 80 doubles the `newcomers` event weight (thriving settlements attract wanderers). Morale ≤ 30 doubles the `bandits` weight (weakness attracts predators).
- Save key bumped to `v9` (new `morale` state field).

### In v0.2.9
- Starting resources: food 20→30, wood 10→18, stone 0→5
- `LIFESPAN_RANGE` [8, 12] → [10, 15] — more productive years per pop, less constant turnover
- Locusts and wildfire events: -8 → -6 (still painful, no longer immediately ruinous early game)

### In v0.2.8 — Buildings. Three one-time settlement upgrades give negative events a counter: a **granary** blocks locusts, a **palisade** blocks bandits, a **well** blocks wildfires. Buying them drains food/wood/stone, giving your surplus somewhere to go and a reason to keep woodcutters and quarrymen in rotation.

### In v0.2.8
- **Buildings sidebar.** New section under Villagers listing each upgrade with its cost and a Build button. Built ones show checked, with a green border.
- **Event blockers.** When a blocked event rolls, the chronicle shows an "averted" log entry instead of the damage — so you see your investment earning its keep. Costs: Granary 30 food + 15 wood, Palisade 20 wood + 25 stone, Well 10 wood + 15 stone. Save key bumped to `v8` (new `buildings` state field).

### In v0.2.7
- **Merchant trade modal.** Pick one of six trade options, dial in 1–5 units, then Trade or Decline. Rates: sell food/wood at 1g each, stone at 2g each; buy food/wood at 2g each, stone at 4g each. Cap of 5 units per visit.

### In v0.2.6
- **Three scripted Exarum waves.** Target years 5 / 10 / 20 with ±3-year jitter rolled at New Game. Each wave spawns 2 adult refugees and a lore entry; the wave replaces the random event for that year. Old saves are invalidated (SAVE_KEY bumped to `v6`).

### In v0.2.5
- **Fertility is now the primary sort key** in `findEligibleTile`. Distance is the tiebreaker. No change to wood/stone allocation — those tiles have `fertility = 0`.

### In v0.2.4
- **Intro papyrus.** CSS-only parchment panel with the Cambrera war-refugee framing. Shows on first load and on New Game unless the player opts out.

### In v0.2.2
- **Cambrera.** The island is named; starter log reflects the refugee framing. (Gameplay unchanged — the world is just fleshed out.)
- **Rescue ship.** Dedicate 2 idle adults to a 2-year voyage. On return, 0–3 refugees may join. Sailors risk old-age death while at sea and a small chance of being lost.
- **Starter guarantees.** Each of the 5 adult starters gets ≥ 6 years of remaining life (no more whole-cohort cliff in years 2–5). 2 children age 0–2 now start with them so second-generation runway is baked in.
- **Topbar rate indicators.** Food chip shows net `±N/yr`, wood and stone show gross `+N/yr` production — so a net deficit is visible before it becomes a famine. Projection counts cultivating tiles too, so clicking + updates the delta immediately.
- **No starter woodcutter.** Food is the priority on turn 1; the 4th adult starts idle for the player to place.
- **Fertile grassland.** ~30% of grass tiles roll fertile (+1 food per farmer). Starter town is guaranteed at least one fertile tile in reach. Fertility is visible on discovery; the auto-allocator prefers fertile land on ties.

### Carried from v0.2.1
- One hand-crafted 20×15 tile island
- Fog of war — tiles start hidden, scouts reveal the frontier
- **Tile-based workforce.** Each worker occupies a tile. Tile capacity is variable (some grasslands are rich, others sparse); revealed on discovery.
- **Visible growth.** Wild grassland → cultivating → farmland; forest → logging camp; stone outcrops → quarry. Each conversion takes 1 year and is drawn on the map.
- **Depletion with hidden reserves.** Forests and quarries have secret amounts of timber/stone. You find out how much was there when it runs out.
- **Reversion.** Abandoned tiles go fallow for 2 years, then revert to wild.
- **Reach.** Tiles are workable only within 2 of town, adjacent to any worked tile, or adjacent to any road tile. Scouting reveals the frontier; roads extend it.
- **Pops have lifecycles.** Each pop tracks age + lifespan. Children (age <4) eat half but can't work. Adults consume more and do all the labor. Old age takes them in years 8–12.
- **Famine bites children first.** When food runs out, the youngest die before adults — deliberate long-run pressure to keep food a priority before births pay back.
- 5 resources: food, wood, stone, pops, gold
- 6 jobs (farmer, hunter, fisher, woodcutter, quarryman, scout)
- 10 random events (bountiful harvest, locusts, merchants, bandits, ruins, newcomers, wildfires, mild winter, strange lights, quiet year)
- **Tile info panel.** Click any discovered tile for its terrain, state, workers/capacity, and known reserve.
- Auto-save to `localStorage` on each turn

### Deferred to later versions
- **Dock / pier** — longer fishing range and better trade rates
- **Blacksmith** — tools synergy across farmer/hunter/fisher
- **Farm adjacency synergy** — working adjacent fields rewards deliberate clustering
- Seasonal turns (spring / summer / autumn / winter)
- Combat — bandits promoted from event to persistent threat; militia allocation
- Diplomacy with other settlements
- Tech / renaissance progression
- Procedural map generation
- Real pixel-art tileset (current tiles are geometric placeholders)
- Mobile wrapper via Capacitor

## Playing locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

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

No game engine — a turn-based tile game doesn't need the weight. Can layer React in later if the UI gets gnarly.

## Project structure

```
index.html            canvas + sidebar shell (allocator, tile info, log)
src/
  main.ts             entry point, wires everything
  types.ts            shared types and tuning constants
  map.ts              hand-crafted island, capacity generation, reach/eligibility
  state.ts            newGame / save / load / allocation summaries
  events.ts           random events table + roller
  turn.ts             end-year resolution pipeline (tile-aware)
  render.ts           canvas renderer (wild / cultivating / worked / fallow / exhausted)
  ui.ts               DOM overlay (topbar, allocator, tile info, log)
  style.css           retro-inspired palette (muted browns, gold accents)
```

## Roadmap (rough, not committed)

1. ~~v0.3 — Reach expansion, granaries~~ ✓
2. ~~v0.4 — Long House, Roads~~ ✓
3. v0.5 — Seasons (spring / summer / autumn / winter pacing)
4. v0.6 — Combat loop (bandits become a persistent threat; militia allocation)
5. v0.7 — Tech/era progression (medieval → renaissance)
6. v0.8 — Diplomacy (the far settlement across the mountain range)
7. v0.9 — Procedural maps
8. v1.0 — Pixel-art asset pack, mobile wrapper
