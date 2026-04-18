# CLAUDE.md

Context for future Claude sessions working on this project. Read this first.

## What this is

**Isle of Elden** — a single-player, turn-based, browser-based 2D civ-builder. The player founds a settlement on **Cambrera**, a small northern island chosen by refugees fleeing a continent-destroying war. Grows toward a kingdom over time. Inspired by *Hamurabi* (1968), *Civilization*, *Lords of the Realm II*, and *Master of Orion* (poor tiles should still matter).

> Full Cambrera lore lives in `memory/project_cambrera_lore.md` — read it before adding events, flavor text, or hostile encounters so they stay thematically aligned.

**Design constraints (do not violate without asking):**
- Turn-based, one turn = one year (seasonal pacing is a planned later feature — not current).
- **Low fantasy**, medieval → renaissance arc. Classical fantasy creatures can exist, but magic is *fading*. Don't drift toward high-fantasy spell systems.
- Single-player, browser-first. Eventual mobile via Capacitor wrapper — don't rewrite for it.
- Open-ended play, soft goal of becoming a kingdom. No hard win condition.
- Staged mechanical complexity: early = resources + exploration, mid = combat, late = diplomacy. Don't skip ahead.
- **Pops are abstract à la Stellaris** — one worker represents an unspecified group. UI never commits to a literal headcount. Each grassland tile is framed as ~10 hectares.

## Dev commands

```bash
npm install        # first time only
npm run dev        # Vite dev server on :5173 with HMR
npm run build      # tsc --noEmit + vite build → dist/
npm run preview    # serve dist/ locally
npx tsc --noEmit   # type-check only, no bundle
```

Requires Node ≥ 18.

## Stack

- TypeScript (strict mode, noUnusedLocals + noUnusedParameters on)
- Vite 5
- HTML Canvas for map, DOM overlay for UI
- localStorage for saves (single save slot, key `isle-of-elden-save-v8` as of v0.2.8 — bump on breaking state-shape changes)
- **No engine, no UI framework.** If UI complexity demands it, React can layer in — don't reach for Phaser/Pixi/Godot.

## Current mechanics (v0.2.8)

### Buildings (v0.2.8)

One-time-purchase settlement upgrades declared in `types.ts:BUILDINGS`. Each has a resource cost and (via the events table) blocks a specific negative event. `state.buildings: Record<BuildingId, boolean>` tracks what's built. UI lives in a dedicated sidebar section below Villagers (`#buildings-section`); clicking Build calls `build()` in `turn.ts` which subtracts resources and flips the flag.

**The three starter buildings:**
| Building | Cost | Blocks |
|---|---|---|
| Granary | 30 food, 15 wood | locusts |
| Palisade | 20 wood, 25 stone | bandits |
| Well | 10 wood, 15 stone | forest_fire |

**Blocker mechanism:** events carry optional `blockedBy: BuildingId` + `blockedText: string`. `rollEvent` picks normally, then if the chosen event is blocked, returns the `blockedText` as a "good" tone log and skips the `apply`. The blocked roll still consumes the year's event slot — the "averted" chronicle line *is* the event — which is narratively satisfying (the player sees their investment pay off) and keeps the turn pipeline unchanged.

**Design intent to preserve:**
- **Granary cost uses food deliberately.** It's the one sink for excess food early — gives food surplus somewhere to go instead of dead-weighting the stockpile. Palisade and Well need wood+stone, which forces redeploying farmers into woodcutters/quarrymen. This is the deliberate answer to "farming-only settlements have nothing to do with surplus" from Vicente's Y50 playtest.
- **One-time purchase, no durability.** Buildings don't wear out or get destroyed. Keep it that way unless we add a raid-escalation mechanic that specifically targets structures — otherwise it's bookkeeping without payoff.
- **Extension path:** adding a building = add a `BuildingId`, append to `BUILDINGS` table, optionally tag an event with `blockedBy` + `blockedText`. No turn.ts or UI churn. Future buildings may not block events at all (e.g. a watchtower that extends reach, a market that improves trade rates) — the blocker is one effect among many; don't couple the system to it.
- **SAVE_KEY bumped to `v8`** because `buildings` is a new required field; v7 saves won't load.

### Merchant trade modal (v0.2.7)

The random `merchants` event no longer auto-trades. When it rolls, it sets `state.pendingMerchant = true` and logs a neutral arrival line; `maybeShowTradeModal` (called from `redraw()` in `main.ts`) then opens a parchment-style overlay (`#trade-overlay`) that lets the player pick one action (buy/sell × food/wood/stone), dial quantity 1–`TRADE_MAX_PER_VISIT` (5), and either Trade or Decline. `executeTrade`/`declineTrade` in `turn.ts` clear the flag and append a log entry.

**Rates** (`TRADE_RATES` in `types.ts`): sell food/wood at 1 gold each, stone at 2 gold each; buy food/wood at 2 gold each, stone at 4 gold each. Asymmetric by design — merchants are not a neutral market, they take their cut. Stone is double because it's the slowest resource to produce.

**Design intent to preserve:**
- **End Year is blocked** while `pendingMerchant` is true. The turn button re-labels to "Merchants waiting…" and disables. This keeps the chronicle ordering clean (the trade is resolved in the same year the merchants arrived) and prevents the player from silently "skipping" the visit by spamming End Year.
- **One trade per visit.** The cap of 5 units per visit combined with a single action per visit is what keeps merchants from becoming an infinite-liquidity exploit. Don't add "trade again" — the constraint is the point.
- **Decline costs nothing.** The player should be able to shake their head at bad prices without penalty; the strategic tension is "do I spend gold on stone now or wait for a cheaper visit that may never come."
- **Flag-based pause, not async/await.** `pendingMerchant` is a boolean on state that the modal closes by mutating state + calling the caller's redraw callback. This keeps the turn pipeline synchronous and the save format plain JSON. If future events need the same pause semantics (e.g. a raid-or-pay-tribute choice), add a similar flag rather than introducing a Promise-driven turn loop.
- **SAVE_KEY bumped to `v7`** because `pendingMerchant` is a new required field; v6 saves won't load.

### Scripted Exarum-survivor waves (v0.2.6)

Three one-shot narrative events scheduled at `newGame()` — target years `SCRIPTED_WAVE_TARGETS = [5, 10, 20]` with ±`SCRIPTED_WAVE_JITTER = 3` years of jitter, ordering enforced by `SCRIPTED_WAVE_MIN_GAP = 3`. Rolled fire-years live on `state.scriptedWaves: ScriptedWave[]`. At step 4 of the turn pipeline, if a wave's year matches `state.year` and it hasn't fired, it **replaces** the random event roll for that year, spawns `SCRIPTED_WAVE_REFUGEES = 2` adults, and writes a lore-length log entry. Narrative content is in `events.ts:SCRIPTED_WAVE_TEXT` — do not drift from the canonical names in `memory/project_cambrera_lore.md` (Exarum, Klon, Destum, Cuarecam, Duras/Vizqe/Drazna/Harab/Bludris, Bura, Captain Amezcua, draconians).

**Design intent to preserve:**
- Waves replace (not augment) the random event for that year — avoids mixing "survivors arrive + locusts" in a single chronicle turn, which would muddle the narrative beat.
- Refugee count matches the random `newcomers` event (2 adults) so the scripted arc doesn't secretly snowball the economy.
- Jitter (±3) means two playthroughs won't share fire-years exactly, but the arc still lands roughly at Y5/Y10/Y20.
- `fired` flag on each wave (not a cleared array) because save/load must persist which ones have played. Old saves without `scriptedWaves` won't load — SAVE_KEY bumped to `v6`.
- Extension path: adding a 4th scripted event means adding a `ScriptedWaveId`, appending to `SCRIPTED_WAVE_TARGETS`, and writing the text — no turn.ts or state.ts churn.

### Allocator sort order (v0.2.5)

`findEligibleTile` sorts by **fertility DESC, distance ASC**. Fertile grass is picked before baseline grass even if further from town; among tiles of equal fertility the nearest wins. Wood/stone tiles always have `fertility = 0` so for them distance remains the effective primary. The previous v0.2.4 ordering (distance primary, fertility tiebreaker) meant the town tile always outranked fertile neighbors — the allocator would pile workers onto the town tile until its capacity filled before ever touching rich land nearby. Keep fertility as primary when tuning: the whole point of fertile-land mechanics is that the allocator steers toward them without the player micromanaging.



### Intro papyrus (v0.2.4)

`#intro-overlay` in `index.html` is a parchment-style overlay with the Cambrera backstory. Hidden by default via the `hidden` class. `maybeShowIntro()` in `ui.ts` un-hides it on first load and after New Game, unless `localStorage["isle-of-elden-skip-intro"] === "1"`. The "Skip this on future games" checkbox inside the overlay sets/clears that key. No game-state impact; CSS-only styling, no assets.

### Pops

A pop is a `{ age, lifespan }` record, not a counter. See `Pop` in `types.ts`.

- `ADULT_AGE = 4` — pops under this can't work and eat less (`FOOD_PER_CHILD = 1` vs `FOOD_PER_ADULT = 2`).
- `LIFESPAN_RANGE = [8, 12]` — rolled per pop; they die of old age when `age >= lifespan`.
- `STARTER_AGE_RANGE = [4, 7]` — five starter adults are staggered, and their lifespan is floored at `age + 6` so the whole cohort can't die before babies mature (v0.2.2 fix).
- Starter settlement also includes **2 children** (age 0–2) via `makeStarterChild()` so there's a second-generation runway from turn 1.
- **Turn-1 allocation is 3 farmers + 1 scout; the 5th adult is intentionally idle.** Food-first; the player decides where to put the 4th worker (more farming, more scouting, quarrying, or resting). Don't pre-place a starter woodcutter.
- `NEWCOMER_AGE_RANGE = [4, 7]` — wanderers arriving via the `newcomers` event (or via the rescue ship) are adults.
- Babies are born at age 0 via `makeBabyPop()` when growth fires.

**Famine kills the youngest first.** The greedy loop in `endYear` sorts pops by age ascending, pops them off while accumulating `FOOD_PER_CHILD`/`FOOD_PER_ADULT` worth of shortfall per death. Deliberate design choice: it means a food crisis is a delayed-productivity debt (a dead child is 4 years of future labor lost) rather than an immediate one, and it keeps food as the perpetual priority during growth bursts.

**Bandits kill adults**, not children (defenders fall). `removePops(state, 1, "adult")` in `events.ts`.

### Rescue ship (v0.2.2)

The settlers arrived by ship; it's still there. `state.boat` tracks it:

```ts
Boat = { status: "docked" | "voyage", returnYear: number | null, crew: Pop[] }
```

- **Dispatch** via `dispatchBoat(state)` — takes 2 idle adults (youngest first, best return odds), moves them out of `state.pops` into `boat.crew`. Voyage is 2 years (`BOAT_VOYAGE_YEARS`).
- **While at sea**, crew ages in turn step 0.5 and can die of old age (flavored as "passing during the voyage"). They don't consume food at home.
- **Return** rolls a per-crew `BOAT_CREW_LOSS_CHANCE` (10%), then a weighted refugee count from `BOAT_REFUGEE_WEIGHTS` ([2,4,3,1] for 0/1/2/3). Refugees are spawned via `makeNewcomerPop()` so they arrive as adults.
- **If all crew are lost**, no refugees roll; the ship is considered lost at sea and a mournful log entry fires. `state.boat` resets to docked either way.

Narrative hook: this is how you find the *other* war survivors Cambrera was founded for. Keep it thematic in log text.

### Tile states

```
wild ──assign worker──▶ cultivating ──(1 year)──▶ worked ──(0 workers)──▶ fallow
                               │                        │                   │
                               │                        └─(reserve=0)──▶ exhausted (permanent)
                               │
                               └──pull last worker──▶ wild (cancelled)

fallow ──(2 years)──▶ wild         (grass only; forest/stone can be exhausted instead)
fallow ──assign worker──▶ worked   (re-opened; infrastructure survives grace period)
```

### Yields

Per-worker, only in `worked` state:
- Farmer (grass): `YIELD_PER_WORKER.farmer + tile.fertility` food/year. Base 2; fertile grass tiles add +1.
- Woodcutter (forest): 2 wood/year, drains tile `reserve`
- Quarryman (stone): 1 stone/year, drains tile `reserve`

Forest and stone tiles have a **hidden** `reserve` (forest 30–120, stone 60–240). When reserve hits 0, tile becomes `exhausted` and workers are evicted.

**Grass fertility** (v0.2.3). Each grass tile rolls `fertility: 0 | 1` at generation (`FERTILE_GRASS_CHANCE = 0.3`). Fertile tiles add +1 to per-farmer yield. Visible on discovery (tile info panel + a yellow-green visual marker). The starter town is guaranteed at least one fertile grass tile within `BASE_REACH` via `ensureFertileNearTown` — a bad roll can never leave the player on barren soil alone.

Balance intent: a farmer on normal grass produces exactly as much as an adult eats (2), so farming on baseline grass is break-even. Surplus comes from **fertile tiles + children (who eat half) + events**. Scouting for fertile land is therefore a real strategic driver, not just a cap-expansion lever.

### Capacity

Each workable tile has a random `capacity` (grass 2–8, forest 2–6, stone 1–4) — the max workers it can host. Capacity is visible to the player once the tile is discovered.

### Reach

A tile is workable if it's either:
- within Chebyshev distance `BASE_REACH` (3) of the town, **OR**
- within Chebyshev distance `WORKED_REACH` (1) of any `worked` tile.

This creates territorial sprawl — working the edge of your reach extends your reach by one tile. Roads will formalize this in v0.3.

### Allocator

Player clicks `+Farmer` → the game auto-claims the *nearest* eligible tile (discovered, in-reach, right terrain, has open capacity). `+` disables with a tooltip when nothing is available. `-Farmer` pulls a worker off the *furthest-from-town* tile (preserves close-in productive work).

**Scouts are separate** — they don't occupy tiles, they reveal frontier tiles at `SCOUT_REVEAL_PER_YEAR × scouts` per turn.

### Turn pipeline (src/turn.ts)

```
0.   Age all pops; old-age deaths; log coming-of-age transitions; reconcile
0.5  Boat — age crew; resolve voyage if returnYear reached (crew loss, refugee roll)
1.   Collect yields from worked tiles; drain reserves; exhaust depleted tiles
2.   Scouts reveal frontier
3.   Advance tile states (cultivating→worked, worked→fallow, fallow→wild)
4.   Random event (can change food, pops, or other resources)
5.   Food consumption; famine kills pops (youngest first) if stockpile can't cover it
6.   Reconcile allocation (shed workers if adults died, scout first, then furthest tiles)
7.   Growth check (food ≥ pop × 3 → +1 baby at age 0)
8.   Game-over check; year++
```

**Order matters.**
- Step 0 is first so elder deaths and coming-of-age both happen before anything depending on adult count (yields, reconcile).
- Step 0.5 handles the boat after home aging but before yields. Returning crew + refugees land in `state.pops` in time to be counted for this turn's food consumption (step 5), so a marginal settlement can't dodge the cost of feeding new mouths by timing the return.
- State advance is step 3 so cultivating tiles don't yield this turn but will next turn.
- Event is step 4 — **before** consumption — so food-affecting events (locusts, bountiful, etc.) settle into the stockpile before the famine check, keeping the end-of-turn food display truthful.
- Reconcile runs both at step 0 (for elders) and step 6 (for famine victims) so a single cleanup pass handles each pop delta.

## File-by-file

```
index.html          Topbar, canvas, sidebar (allocator / tile info / log / buttons).
src/main.ts         Entry. Loads save or newGame, wires click handler, calls redraw().
src/types.ts        All shared types + tuning constants. Tune numbers here first —
                    capacity ranges, reserve ranges, reach, yield rates, timing.
src/map.ts          ISLAND[] hand-crafted string map. Capacity/reserve generated
                    randomly per tile on buildIsland(). isInReach / reachableTiles /
                    findEligibleTile / findWorkerToRemove / totalReachableCapacity
                    power the allocator.
src/state.ts        newGame() initial state. Starter workers get placed via
                    placeStarterWorker() directly into `worked` state — they bypass
                    the cultivation year (narratively, settlers prepared ground on
                    arrival). jobCount / idleCount / assignedTotal are summary helpers.
src/events.ts       EventDef table with weighted random roll. Each event mutates
                    state and returns a LogEntry. Add new events here.
src/turn.ts         endYear() is the single turn-resolution pipeline. assignWorker /
                    unassignWorker handle state transitions when the player clicks.
                    reconcileAllocation() is called after famine + events.
src/render.ts       Canvas renderer. baseColor(tile) picks the background based on
                    terrain × state. drawWorkedDecor / drawExhaustedDecor handle the
                    new visual states. drawScaffolding overlays cultivating tiles;
                    drawWeeds overlays fallow tiles.
src/ui.ts           DOM overlay. renderUI() rebuilds topbar, allocator, tile info,
                    log on each state change. attachCanvasClick handles tile selection.
                    Disable logic for + buttons reads findEligibleTile.
src/style.css       Retro palette: muted browns, gold accents, monospace font.
```

## Key design decisions (and why)

- **Single-file hand-crafted map**, not procedural, because the focus is "does the loop feel fun" over replayability. Procedural is a later version.
- **Variable tile capacity** (Master of Orion–style): some tiles are rich, some are poor. Poor tiles should remain useful in later versions (military outposts, watchtowers) — don't design mechanics that make low-capacity land economically worthless.
- **Hidden reserves**, not hidden capacity: the player can count on knowing "this forest holds 5 workers" but not "how much timber is in there." Surprise runs-out is a core tension.
- **Reach via worked-tile adjacency** creates visible territorial sprawl without needing a roads system yet.
- **Starter workers skip cultivation** (placed directly in `worked` state) — year 1 shouldn't be a punishing zero-yield turn.
- **Newest log entry on top** (unshift). Feels like a chronicle being written.
- **Furthest-tile-first shed order** preserves close-in productive work during famine. Close tiles = your real economy.
- **Growth rule: food ≥ pop × 3 → +1 pop.** Requires 1.5 years of food reserve — prevents runaway growth while keeping growth achievable. A newborn is a 4-year productivity debt; the threshold has to be generous enough that the debt is bearable.
- **Pops age in-game instead of being a counter.** Aging creates the food-priority pressure Vicente specifically asked for: babies don't pay back immediately, so growth has to be earned. Lifespan variance (8–12) means pops don't all die in lockstep.
- **Famine kills children first, bandits kill adults.** Children cost less food but no labor (yet); losing one is future debt, not present crisis. Adults are the current economy; bandits taking one bites immediately.
- **Starter lifespan floor (age + 6).** After v0.2.1 playtest showed a whole starter cohort dying Y3–Y5 before the first baby could mature, `makeStarterPop` now guarantees each starter has ≥ 6 years left. Preserves randomness without permitting total collapse by bad roll. Don't remove this floor when tuning other lifespan numbers.
- **Rescue ship as the refugee spigot.** Newcomers-via-event is a random trickle; the ship lets the player *choose* to invest 2 adults + 2 years for a 55% chance of a refugee (based on BOAT_REFUGEE_WEIGHTS). This is the player-agency version of "who gets saved from the old war," consistent with the Cambrera framing.
- **Rate indicators in the topbar** (`projectedYields` in state.ts). Food shows net (prod − cons); wood/stone show gross production. Projection counts *both worked and cultivating* tiles so the UI responds immediately when the player clicks + (treating the projection as steady-state capacity, not this-year's realized yield). Doesn't account for reserves running out or events — it's a capacity estimate.
- **Farming is break-even on baseline grass; surplus requires fertile tiles.** Yield per farmer = 2, consumption per adult = 2 — deliberately tuned so flat grassland can sustain but not grow a settlement. Vicente's v0.2.2 playtest made this obvious (9 farmers, 0 surplus). Growth pressure comes from finding fertile tiles (+1/farmer) via scouting. Don't close this gap by bumping base farmer yield; keep the "good land is a real resource" dynamic intact.
- **No engine** because a turn-based tile game is ~70% UI and ~30% static rendering. An engine would add learning curve and a magic layer without earning its weight.

## Conventions

- No comments unless the WHY is non-obvious. Identifier names should carry the WHAT.
- Prefer editing `types.ts` constants over hardcoding numbers elsewhere.
- Canvas coords are pixel-based (tile at (x,y) is drawn at `x*TILE_SIZE, y*TILE_SIZE`).
- Log entries always carry a `tone: "neutral" | "good" | "bad"` for CSS styling.
- When adding a random event, pick a weight proportional to how often you want to see it.
- When adding mechanics that interact with tiles, respect the state machine — always transition through `cultivating` / `fallow`, never skip.

## Deferred work (roadmap)

See README.md → *Deferred to later versions* and *Roadmap*. Don't add any of these without the user's say-so — scope discipline is deliberate.

## Memory

The user's memory system at `/root/.claude/projects/-mnt-backups-civ-game/memory/` holds:
- **project_civ_game.md** — full design brief and locked-in decisions
- **user_vicente.md** — how Vicente prefers to collaborate
- **feedback_maintain_docs.md** — keep README.md and CLAUDE.md current as development proceeds (that's what you're reading)
- **project_playtest_notes.md** — running log of Vicente's playtest feedback and feature asks

Before making nontrivial changes, skim those. Update CLAUDE.md and README.md in the same turn as any notable change.
