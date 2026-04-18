# Isle of Elden

A single-player, turn-based 2D browser game about founding a settlement on a fantasy island and growing it toward a kingdom. Inspired by the 1968 *Hamurabi* BASIC game (allocate-and-consequences), *Civilization* (build-a-civ arc), *Lords of the Realm II* (seasonal pacing — planned for later), and *Master of Orion* (every patch of land matters, even the poor ones).

The world is low-fantasy: classical creatures exist but magic is fading, and the technological arc runs medieval → renaissance.

## Status

**v0.2.7 — Interactive merchants.** The merchant event no longer auto-takes food and auto-pays gold. Instead, a parchment-style trade panel appears when merchants arrive, offering one trade per visit: buy or sell food, wood, or stone at asymmetric rates (sell at 1g, buy at 2g; stone double that). You can decline without penalty. End Year is blocked until you resolve the visit.

### In v0.2.7
- **Merchant trade modal.** Pick one of six trade options, dial in 1–5 units, then Trade or Decline. Rates: sell food/wood at 1g each, stone at 2g each; buy food/wood at 2g each, stone at 4g each. Cap of 5 units per visit. Save key bumped to `v7` (new `pendingMerchant` state field).

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
- **Reach.** Tiles are workable only within 3 of town, or adjacent to any tile you're already working. Scouting is how you grow.
- **Pops have lifecycles.** Each pop tracks age + lifespan. Children (age <4) eat half but can't work. Adults consume more and do all the labor. Old age takes them in years 8–12.
- **Famine bites children first.** When food runs out, the youngest die before adults — deliberate long-run pressure to keep food a priority before births pay back.
- 5 resources: food, wood, stone, pops, gold
- 4 jobs (farmer, woodcutter, quarryman, scout)
- 10 random events (bountiful harvest, locusts, merchants, bandits, ruins, newcomers, wildfires, mild winter, strange lights, quiet year)
- **Tile info panel.** Click any discovered tile for its terrain, state, workers/capacity, and known reserve.
- Auto-save to `localStorage` on each turn

### Deferred to later versions
- Roads (v0.3) — extend reach deliberately; cost stone/wood/time
- Buildings beyond tile conversions (granaries, watchtowers, etc.)
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

1. v0.3 — Roads (deliberate reach extension), maybe granaries
2. v0.4 — Seasons
3. v0.5 — Combat loop (bandits become a persistent threat; militia)
4. v0.6 — Tech/era progression (medieval → renaissance)
5. v0.7 — Diplomacy
6. v0.8 — Procedural maps
7. v1.0 — Pixel-art asset pack, mobile wrapper
