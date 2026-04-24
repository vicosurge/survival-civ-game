# CLAUDE.md

Context for future Claude sessions working on this project. Read this first.

## What this is

**Isle of Cambrera** — a single-player, turn-based, browser-based 2D civ-builder. The player founds a settlement on **Cambrera**, a small northern island chosen by refugees fleeing a continent-destroying war. Grows toward a kingdom over time. Inspired by *Hamurabi* (1968), *Civilization*, *Lords of the Realm II*, and *Master of Orion* (poor tiles should still matter).

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
- localStorage saves, single slot. Current key: `isle-of-cambrera-save-v18`. **Bump on any breaking state-shape change.** Old saves must fail loud (parse/validation error → `newGame()`), not load silently with `NaN`/`undefined` fields.
- **No engine, no UI framework.** If UI complexity demands it, React can layer in — don't reach for Phaser/Pixi/Godot.

Version history lives in git log + README. This file describes current state only.

## Mechanics

### Pops

A pop is a `{ age, lifespan, founder? }` record, not a counter. See `Pop` in `types.ts`.

- `ADULT_AGE = 4` — under this, pops can't work and eat less (`FOOD_PER_CHILD = 1` vs `FOOD_PER_ADULT = 2`).
- `LIFESPAN_RANGE = [10, 15]` — rolled per pop; they die of old age at `age >= lifespan`.
- `STARTER_AGE_RANGE = [4, 7]` — five starter adults staggered. Lifespan floored at `age + 6` so the founding cohort can't all die before babies mature. **Don't remove this floor** when tuning lifespan.
- Starter settlement also includes **2 children** (age 0–2) via `makeStarterChild()` for second-generation runway.
- **Turn-1 allocation is 3 farmers + 1 scout; the 5th adult is intentionally idle.** The player picks where to put the 4th worker.
- `NEWCOMER_AGE_RANGE = [4, 7]` — newcomers/refugees (event, boat, scripted waves) arrive as adults.
- Babies born at age 0 via `makeBabyPop()` when growth fires.
- **Founder flag is starter-only.** `makeStarterPop`/`makeStarterChild` set `founder: true`. Newcomers, refugees, and babies are **not** founders. Founder death applies `MORALE_FOUNDER_EXTRA = -3` on top of base death morale at three sites: old-age, famine, bandits. One-generation premium that decays naturally as the original band ages out.

**Famine kills the youngest first.** Greedy loop in `endYear` sorts pops by age ascending and pops off while accumulating `FOOD_PER_CHILD`/`FOOD_PER_ADULT` worth of shortfall per death. A dead child is 4 years of future labor lost — delayed productivity debt, not immediate crisis. Keeps food as the perpetual priority during growth bursts.

**Bandits kill adults**, not children (defenders fall). `removePops(state, 1, "adult")` in `events.ts`.

### Tiles — states, yields, reach, allocator

**State machine:**
```
wild ──assign worker──▶ cultivating ──(1 year)──▶ worked ──(0 workers)──▶ fallow
                               │                        │                   │
                               │                        └─(reserve=0)──▶ exhausted (permanent)
                               │
                               └──pull last worker──▶ wild (cancelled)

fallow ──(2 years)──▶ wild         (grass only; forest/stone can be exhausted instead)
fallow ──assign worker──▶ worked   (re-opened; infrastructure survives grace period)
```

Respect the state machine — always transition through `cultivating` / `fallow`, never skip. Two exceptions:
- **Starter workers** (`placeStarterWorker`) drop directly into `worked` — settlers prepared ground on arrival.
- **Fishers** go `wild → worked` on assign and `worked → wild` on last-fisher-removed. Water doesn't care if you show up. Don't reintroduce cultivating/fallow for fishers as "consistency" — the mechanical variance and the narrative ("you cast nets, you don't till them") are the features.

**Yields per worker in `worked` state:**
- **Farmer** (grass): `2 + tile.fertility` food/year. Base 2; fertile grass adds +1. Break-even on baseline grass (farmer eats 2) — surplus requires fertile tiles, children (who eat 1), or events. **Don't close this gap** by bumping base farmer yield; "good land is a real resource" is load-bearing.
- **Woodcutter** (forest): 2 wood/year. Does **not** drain reserve — timber regrows.
- **Hunter** (forest): 3 food/year, drains `tile.reserve` (game population). Net +1 surplus. Finite — when reserve hits 0, `tile.gameExhausted = true` evicts hunters permanently.
- **Fisher** (beach/river): random per harvest — `FISHER_YIELD_BASE = [1,3]` baseline, `FISHER_YIELD_RICH = [2,4]` on `fishRichness: 1` tiles (`FISH_RICH_CHANCE = 0.2`). No reserve, no cultivation. Projection uses the average.
- **Quarryman** (stone): 1 stone/year, drains reserve.

**Forest tile dual slots.** `tile.hunterWorkers` tracks hunters; `tile.workers - tile.hunterWorkers` = woodcutters. Both coexist up to capacity. Game exhaustion closes the hunter slot only; woodcutters keep going. Tile state is driven by `tile.workers`, so a game-exhausted tile with woodcutters stays `worked`.

**Food-job triad must stay differentiated.** Hunter = transitory (drains game), farmer = sustainable + compounding via fertility, fisher = variable + scaling. If a change lets hunters refill game or gives fishers a reserve, the triad collapses into three ways to do the same thing.

**Shed order in famine:** scout → quarryman → woodcutter → hunter → fisher → farmer. Food producers protected last; between food jobs, farmers (lowest-variance, sustainable) are the last to go.

**Hidden reserves.** Forest reserve 30–120, stone 60–240. Invisible to the player — surprise exhaustion is for hunters and quarrymen only; woodcutters work a forest indefinitely.

**Grass fertility** (`FERTILE_GRASS_CHANCE = 0.3`): each grass tile rolls `fertility: 0 | 1` at generation. +1 food/farmer on fertile tiles. Visible on discovery. `ensureFertileNearTown` guarantees at least one fertile grass tile within `BASE_REACH` — a bad roll can't leave the player barren.

**Rivers:** five tiles threaded through the island. Any grass tile within Chebyshev-1 of a river is set fertile via `applyRiverFertility` at build time. Rivers themselves are workable by fishers (capacity 1–2). Keep `applyRiverFertility` as a post-tile-creation sweep — don't bolt conditions on.

**Capacity.** Random per tile (grass 2–8, forest 2–6, stone 1–4, river 1–2). Visible on discovery.

**Reach.** A tile is workable if it's within Chebyshev distance `BASE_REACH = 2` of the town, OR within `WORKED_REACH = 1` of any `worked` or road tile. Working the edge of reach extends reach by one — visible territorial sprawl. Each tile = ~10 hectares ≈ 316 m; 2 tiles ≈ 630 m is the honest unassisted walking range. Central mountains are the narrative reason reach needs infrastructure to extend further.

**Allocator.** `+Farmer` auto-claims the nearest eligible tile. `findEligibleTile` sorts by `tileBonusForJob` DESC (fertility for farmer, fishRichness for fisher, 0 otherwise), then distance ASC. Fertile land wins over nearer baseline grass. `-Farmer` pulls from the **furthest** tile — close-in productive work is preserved. Player never manually places farmers/hunters/fishers/quarrymen/woodcutters.

**Scouts are separate** — they don't occupy tiles. They reveal frontier tiles at `SCOUT_REVEAL_PER_YEAR × scouts` per turn. `+Scout` is disabled via `hasUndiscoveredFrontier(state.tiles)`. When the last frontier tile is revealed, `turn.ts` auto-retires any active scouts with a chronicle line ("The island is fully mapped.").

**Starter guarantees.** Turn-1 view includes at least one forest tile (`ensureForestNearTown`) and at least one beach/river tile (`ensureFishingNearTown`) — settlers picked a site with game and water.

### Morale

Settlement-wide 0–100 stat (`state.morale`, `MORALE_START = 80`). **Lagging indicator — no passive drift; morale only moves on concrete events.** A quiet year leaves it where it is. This is the deliberate anti-Sim-decay-meter choice; don't add passive drain without a fresh conversation.

**Deltas (clamped 0–100 via `applyMorale` in state.ts):**
- Food surplus: +2 / deficit: −3 per year.
- Famine death: −5 per pop.
- Old-age death: `MORALE_OLD_AGE_DEATH = 2` per pop, +`MORALE_FOUNDER_EXTRA = 3` per founder.
- Coming-of-age: +2. Birth: +2.
- Events: bountiful +5, locusts −4, mild_winter +3, bandits (−7 on death + founder extras, else −2), newcomers +4, forest_fire −3. Scripted waves: +2 per refugee.
- Long House build: +8 one-time.

**Gates and biases:**
- `MORALE_GROWTH_GATE = 50` — births only fire at or above. **Load-bearing effect** — the mechanical consequence the player plans around is "no new babies if morale cracks."
- `MORALE_ATTRACT_THRESHOLD = 80` — `newcomers` event weight doubles.
- `MORALE_PREY_THRESHOLD = 30` — `bandits` event weight doubles.

Event biases are flavour; **don't add more gates** (production, build, trade) without a fresh conversation — morale should stay narrow. Extension path for religion/shrines: new helpers or a periodic step in `turn.ts` — don't wire into the events table.

**UI:** "Mood" chip in topbar (`.mood-good` ≥70 green, `.mood-mid` 40–69 gold, `.mood-bad` <40 red) with a tooltip summary.

### Rescue boat

Settlers arrived by ship; it's still there. `state.boat: { status, returnYear, crew }`.

- **Status:** `"docked" | "voyage" | "scrapped" | "lost"`. `"scrapped"` is set by the departure wizard ship-choice; `"lost"` is terminal after all crew die at sea. Don't regress `"lost"` back to `"docked"`.
- **Dispatch** via `dispatchBoat(state)` — takes 2 idle adults (youngest first, best return odds). Voyage is `BOAT_VOYAGE_YEARS = 2`.
- **At sea**, crew ages in turn step 0.5. Old-age deaths possible ("passing during the voyage"). They don't eat at home.
- **Return:** per-crew `effectiveCrewLossChance(state)` roll (see fishing XP), then weighted refugee count from `BOAT_REFUGEE_WEIGHTS = [2,4,3,1]` for 0/1/2/3. Refugees arrive as adults via `makeNewcomerPop()`.
- **All crew lost** → `status: "lost"`, no refugees, mournful log.

Narrative hook: this is how you find the *other* war survivors Cambrera was founded for. Keep log text thematic.

### Fishing XP

`state.fishingYears` accumulates the current fisher count each turn (yield loop). Cumulative count reduces ship crew-loss chance:
- `FISHING_XP_GATE = 2`: no bonus below this.
- `FISHING_XP_PER_STEP = 3`: each additional 3 fisher-years adds 1% reduction.
- `FISHING_LOSS_MIN = 0.03`: absolute floor on effective crew loss — no amount of fishing makes voyages guaranteed safe.
- Base `BOAT_CREW_LOSS_CHANCE = 0.10`; bonus caps at −7% (20+ yrs → 3%).
- `fishingLossReduction(years)` and `effectiveCrewLossChance(state)` exported from turn.ts for the ship panel to surface the current bonus.

Design intent: fishing was previously a pure-food variable source with no other strategic use. The bonus is a maritime-literacy investment; farmers still produce more reliably, so fishing doesn't become the dominant food job.

### Buildings

One-time purchases in `types.ts:BUILDINGS`. `state.buildings: Record<BuildingId, boolean>`. `build()` in turn.ts subtracts resources and flips the flag.

| Building | Cost | Gate | Bonus | Blocks |
|---|---|---|---|---|
| Granary | 30 food, 15 wood | — | +0.5 food/farmer/year (floored at harvest) | locusts |
| Palisade | 20 wood, 25 stone | — | — | bandits |
| Well | 10 wood, 15 stone | — | — | forest_fire |
| Hunting Lodge | 10 wood | — | +0.5 food/hunter/year (while forest lasts) | — |
| Long House | 20 wood, 15 stone | 25 pops | +8 morale (one-time); `newcomers` weight ×3 with attract threshold | — |

**Blocker mechanism:** events carry optional `blockedBy: BuildingId` + `blockedText: string`. `rollEvent` picks normally, then if blocked, returns `blockedText` as a "good" tone log and skips `apply`. The blocked roll still consumes the year's event slot — the "averted" chronicle line *is* the event. Narratively satisfying and keeps the turn pipeline unchanged.

**Granary cost uses food deliberately.** Early-game surplus needs somewhere to go. Palisade + Well use wood+stone, forcing farmers to redeploy as woodcutters/quarrymen.

**Hunting Lodge is a trap.** +0.5 food/hunter only useful while forests last; once game is exhausted, the lodge is dead weight and the 10 wood is gone. Cheap on purpose — the trap only works if the player is tempted.

**One-time purchase, no durability.** Buildings don't wear out. Don't add durability unless raid-escalation specifically targets structures.

**Long House:**
- Pop gate is **total pops** including children — 25 people is a real community. Adults-only would feel arbitrary.
- Persists even if population drops below 25 — institutions don't unlearn governance.
- Unlocks roads and future civic buildings (gate in `canBuild`).
- Newcomer multiplier stacks with `MORALE_ATTRACT_THRESHOLD` bonus (×3 combined vs ×2 for either alone).
- Future Frostpunk-style civic decisions should trigger off the Long House as the civic anchor — **don't wire those into the random events table**; add a dedicated decision system.

**Extension path:** new building = add `BuildingId`, append to BUILDINGS, optionally tag an event with `blockedBy` + `blockedText`. No turn.ts or UI churn. Blocking is one possible effect — don't couple the system to it.

### Roads

First tile-targeted construction. Click tile → "Build Road" button in tile info panel. Cost: 2 wood + 5 stone. Instant, permanent.

- Requires **Long House** (civic gate, `canBuildRoad`).
- Tile must be in reach — no leapfrogging. Keeps road networks legible.
- Not on water or mountain.
- Road tiles extend reach identically to worked tiles (`WORKED_REACH`), **without** needing a worker stationed.
- Town tile auto-roads when Long House is built — the hall and the first paved path are the same civic moment.
- Render: packed-earth crosshatch drawn over all other tile layers.

**Roads extend reach, not production.** Don't add yield bonuses to road tiles without a fresh design conversation. Cost is stone-heavy because stone is the slowest resource — a long road is a real commitment, not a free terrain hack. Future mountain-pass road will cost significantly more and be the narrative unlock for contact with the far settlement.

### Merchant trade modal

The `merchants` event sets `state.pendingMerchant = true` instead of auto-trading. `maybeShowTradeModal` (called from `redraw()` in main.ts) opens `#trade-overlay`.

**Trade basket.** A single visit can combine sells and buys. `TradeBasket = Record<TradeAction, Record<TradeResource, number>>` in types.ts; `canExecuteTradeBasket`/`executeTradeBasket` in turn.ts. UI is three rows (food/wood/stone) × two steppers (sell/buy). Global cap `TRADE_MAX_PER_VISIT = 5` applies to the **combined** unit count across all six steppers. `+Sell` disables when capped or when player has none; `+Buy` disables when capped or when the basket's net would leave gold negative. Confirm disabled unless basket is non-empty and valid.

**Rates** (`TRADE_RATES`): sell food/wood at 1 gold, stone at 2 gold; buy food/wood at 2 gold, stone at 4 gold. Asymmetric — merchants take their cut. Stone is double because it's the slowest to produce.

**End Year is blocked while `pendingMerchant` is true.** Button re-labels "Merchants waiting…". Keeps chronicle ordering clean; prevents silent skip via End Year spam.

**Per-visit cap is the strategic constraint.** The basket lets the player express a two-sided swap ("sell 3 wood, buy 1 stone") instead of choosing one — but doesn't uncap liquidity. Don't add "trade again."

**Decline costs nothing.** Strategic tension is "spend gold on stone now, or wait for a cheaper visit that may never come."

**Flag-based pause, not async/await.** Keeps the turn pipeline synchronous and saves as plain JSON. If future events need the same semantics (e.g. raid-or-tribute choice), add a similar flag — don't introduce a Promise-driven turn loop.

### Scripted Exarum-survivor waves

Three one-shot narrative events scheduled at `newGame()`. Target years `SCRIPTED_WAVE_TARGETS = [5, 10, 20]` with ±`SCRIPTED_WAVE_JITTER = 3`, ordering enforced by `SCRIPTED_WAVE_MIN_GAP = 3`. Fire-years live on `state.scriptedWaves: ScriptedWave[]`.

At turn pipeline step 4, if a wave's year matches and `fired === false`, it **replaces** the random event roll, spawns `SCRIPTED_WAVE_REFUGEES = 2` adults, and writes a lore-length log entry. Narrative in `events.ts:SCRIPTED_WAVE_TEXT` — don't drift from the canonical names in `memory/project_cambrera_lore.md` (Exarum, Klon, Destum, Cuarecam, Duras/Vizqe/Drazna/Harab/Bludris, Bura, Captain Amezcua, draconians).

- Waves **replace**, not augment — avoids mixing "survivors + locusts" in one chronicle turn.
- Refugee count (2 adults) matches the random `newcomers` event so the arc doesn't secretly snowball the economy.
- `fired` flag (not a cleared array) is required because save/load must persist which played.
- Extension: new scripted event = new `ScriptedWaveId`, append to targets, write text. No turn.ts or state.ts churn.

### Departure wizard

Six-step pre-game wizard. `state.departure: DepartureChoices` persists the picks for future event hooks. Narrative copy in `ui.ts:WIZARD_NARRATIVES`.

| Step | Choices | Effect |
|------|---------|--------|
| 1 What did you bring? | seeds / fishing / provisions | Resource bonus |
| 2 Who came with you? | craftsman (+6w +4s) / wisewoman (+2f +5 morale) / nobody (+5f) | — |
| 3 Departure timing | prepared (+5w +3s) / hasty | Sets `pursuedRisk` if prepared |
| 4 The alarm bells | grab (+7f) / cast off | Sets `pursuedRisk` if grab |
| 5 The ship | keep / salvage (+12w, scrapped) / burn (+4w, scrapped, clears pursuit) | Sets `Boat.status = "scrapped"` |
| 6 Where do you land? | western_shore (6,6) / southern_cove (6,10) / northern_strand (7,3) | `buildIsland(landingPos)` |

**Bandit pursuit:** `isPursued(state)` true if `(timing===prepared OR alarm===grab) AND shipFate!==burn`. Doubles bandit weight years 1–5. Burning the ship clears the trail narrative-mechanically.

`DepartureChoices` is intentionally open-ended — future hooks (e.g. wisewoman tempering certain events) read from it without data-shape churn.

### Intro papyrus

`#intro-overlay` in index.html is a parchment overlay with the Cambrera backstory. Hidden by default (`hidden` class). `maybeShowIntro()` in ui.ts un-hides it on first load and after New Game, unless `localStorage["isle-of-cambrera-skip-intro"] === "1"`. "Skip on future games" checkbox toggles that key. No game-state impact; CSS-only styling.

### Chronicle (log)

- Newest entry on top (unshift). Feels like a chronicle being written.
- Entries carry `tone: "neutral" | "good" | "bad"` for CSS styling.
- `renderLog` brackets consecutive same-year entries in `.year-group` with a `.year-header` ("— Year N —").
- **Single population tally per turn.** Elder deaths, coming-of-age, and births route through a `tally` object in `endYear` and emit one combined line via `emitPopulationTally`. **Don't fold famine/bandit/event deaths into the tally** — those belong to the event that caused them and want their own tonal emphasis. The tally is for the quiet turning of the year.

## Turn pipeline (src/turn.ts)

```
0.   Age all pops; old-age deaths; log coming-of-age; reconcile
0.5  Boat — age crew; resolve voyage if returnYear reached (crew loss, refugee roll)
1.   Collect yields from worked tiles; drain reserves; exhaust depleted tiles;
     accumulate fishingYears
2.   Scouts reveal frontier; auto-retire scouts if no frontier remains
3.   Advance tile states (cultivating→worked, worked→fallow, fallow→wild)
4.   Scripted wave (if due) OR random event
5.   Food consumption; famine kills pops (youngest first)
6.   Reconcile allocation (shed workers if adults died — scout first, then furthest)
7.   Growth check (food ≥ pop × 3 AND morale ≥ MORALE_GROWTH_GATE → +1 baby)
8.   Emit population tally; game-over check; year++
```

**Order matters.**
- Step 0 first: elder deaths + coming-of-age happen before anything depending on adult count (yields, reconcile).
- Step 0.5: boat resolves after home aging but before yields, so returning crew + refugees count toward this turn's food consumption. A marginal settlement can't dodge feeding new mouths by timing the return.
- Step 3 before 4: cultivating tiles don't yield this turn but will next turn.
- Step 4 **before** step 5: food-affecting events (locusts, bountiful) settle into the stockpile before the famine check, keeping the end-of-turn food display truthful.
- Reconcile runs at step 0 (elders) and step 6 (famine) so one cleanup pass handles each pop delta.

## File-by-file

```
index.html          Topbar, canvas, sidebar (allocator / tile info / log / buttons),
                    intro overlay, departure wizard, trade modal.
src/main.ts         Entry. Loads save or newGame, wires click handler, calls redraw().
src/types.ts        All shared types + tuning constants. Tune numbers here first.
                    VERSION + AUTHOR live here too.
src/map.ts          ISLAND[] hand-crafted string map. Capacity/reserve rolled per
                    tile on buildIsland(landingPos). isInReach / reachableTiles /
                    findEligibleTile / findWorkerToRemove / hasUndiscoveredFrontier.
src/state.ts        newGame(departure) initial state. placeStarterWorker() drops
                    starters directly into `worked`. applyMorale clamps 0–100.
                    jobCount / idleCount / assignedTotal / projectedYields summaries.
src/events.ts       EventDef table + weighted roll. adjustedWeight applies morale,
                    Long House, pursuit, and ruins-gating biases. SCRIPTED_WAVE_TEXT
                    holds narrative copy. isPursued() reads departure choices.
src/turn.ts         endYear() is the turn pipeline. assignWorker / unassignWorker
                    handle state transitions. reconcileAllocation after famine/events.
                    Trade basket API; fishingLossReduction / effectiveCrewLossChance.
src/render.ts       Canvas renderer. baseColor per terrain × state. Decor layers
                    for cultivating/worked/fallow/exhausted; river shimmer; foam
                    flecks for fish-rich water; road crosshatch over everything.
src/ui.ts           DOM overlay. renderUI() rebuilds topbar/allocator/tile info/log.
                    Intro + departure wizard + trade basket overlays.
                    renderStaticCredits sets version chip + byline.
src/style.css       Retro palette: muted browns, gold accents, monospace font.
```

## Key design decisions (and why)

- **Single-file hand-crafted map**, not procedural. Focus is "does the loop feel fun" over replayability. Procedural is a later version.
- **Variable tile capacity** (Master of Orion–style): poor tiles should remain useful in later versions (outposts, watchtowers). Don't design mechanics that make low-capacity land economically worthless.
- **Hidden reserves for hunters and quarrymen**, not woodcutters: capacity is known ("5 workers max"); game population is not. Surprise exhaustion is for hunters and quarrymen only.
- **Reach via worked-tile adjacency + roads** creates visible territorial sprawl without needing a full district system.
- **Starter workers skip cultivation.** Year 1 shouldn't be a punishing zero-yield turn.
- **Furthest-tile-first shed order** preserves close-in productive work during famine. Close tiles = your real economy.
- **Growth rule: food ≥ pop × 3 AND morale ≥ 50 → +1 pop.** Requires 1.5 years of food reserve. A newborn is a 4-year productivity debt; the threshold has to be generous enough that the debt is bearable.
- **Pops age instead of being a counter.** Aging creates the food-priority pressure — babies don't pay back immediately, so growth has to be earned.
- **Famine kills children first, bandits kill adults.** Children are future debt; adults are the current economy.
- **Starter lifespan floor (age + 6).** Preserves randomness without permitting total collapse by bad roll.
- **Rescue ship as the refugee spigot.** Newcomers-via-event is a random trickle; the ship lets the player *choose* to invest 2 adults + 2 years.
- **Rate indicators in the topbar** (`projectedYields` in state.ts). Food net (prod − cons), wood/stone gross. Counts worked + cultivating tiles so UI responds immediately to +button clicks. Doesn't account for reserves running out or events — capacity estimate.
- **Farming is break-even on baseline grass; surplus requires fertile tiles.** Don't close this gap by bumping farmer yield; keep the "good land is a real resource" dynamic intact.
- **No engine.** Turn-based tile game is ~70% UI, ~30% static rendering. An engine would add learning curve without earning its weight.

## Conventions

- No comments unless the WHY is non-obvious. Identifier names carry the WHAT.
- Prefer editing `types.ts` constants over hardcoding numbers elsewhere.
- Canvas coords are pixel-based — tile at (x,y) draws at `x*TILE_SIZE, y*TILE_SIZE`.
- When adding an event, weight it proportional to desired frequency.
- When adding tile-interacting mechanics, respect the state machine — never skip `cultivating`/`fallow`.
- Every state-shape change bumps `SAVE_KEY`. Old saves fail loud → `newGame()`.

## Deferred work (roadmap)

See README.md → *Roadmap*, and open GitHub issues on `vicosurge/survival-civ-game` for scheduled items. Don't add roadmap work without the user's say-so — scope discipline is deliberate.

## Memory

The user's memory system at `/root/.claude/projects/-mnt-backups-civ-game/memory/` holds:
- **project_civ_game.md** — full design brief and locked-in decisions
- **user_vicente.md** — how Vicente prefers to collaborate
- **feedback_maintain_docs.md** — keep README.md and CLAUDE.md current as development proceeds
- **project_playtest_notes.md** — running log of playtest feedback and feature asks
- **project_cambrera_lore.md** — canonical names, places, factions

Before making nontrivial changes, skim those. Update CLAUDE.md and README.md in the same turn as any notable change.
