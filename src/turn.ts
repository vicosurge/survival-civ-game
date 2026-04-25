import { fireScriptedWave, rollEvent } from "./events";
import { currentWorkers, exploreFrontier, findWorkerToRemove, hasUndiscoveredFrontier, isInReach } from "./map";
import { ANATA_BUILD_LINE, ANATA_UNLOCK_LINE, FIRST_HOUSE_LINE, QUARRY_EXHAUSTED_LINE, additionalHouseLine } from "./narratives";
import { adultCount, applyMorale, childCount, fertileCount, idleCount, makeBabyPop, makeNewcomerPop, popCapacity, totalPop } from "./state";
import {
  ADULT_AGE,
  ANATA_DEATH_TRIGGER,
  ANATA_FOUNDER_EXTRA,
  ANATA_OLD_AGE_MORALE,
  BOAT_CREW_LOSS_CHANCE,
  BOAT_CREW_SIZE,
  BOAT_REFUGEE_WEIGHTS,
  BOAT_VOYAGE_YEARS,
  BUILDINGS,
  BuildingId,
  CULTIVATION_YEARS,
  FALLOW_REVERT_YEARS,
  FISHER_YIELD_BASE,
  FISHER_YIELD_RICH,
  FISHING_LOSS_MIN,
  FISHING_XP_GATE,
  FISHING_XP_PER_STEP,
  FOOD_PER_ADULT,
  FOOD_PER_CHILD,
  GameState,
  HOUSE_COST,
  HOUSE_FOOD_YIELD,
  HUNTING_LODGE_HUNTER_BONUS,
  Job,
  LogEntry,
  MAP_H,
  MAP_W,
  MORALE_FOUNDER_EXTRA,
  MORALE_GROWTH_GATE,
  MORALE_OLD_AGE_DEATH,
  Pop,
  SCOUT_REVEAL_PER_YEAR,
  TRADE_MAX_PER_VISIT,
  TradeBasket,
  TradeResource,
  basketGoldDelta,
  basketTotal,
  YIELD_PER_WORKER,
  GRANARY_FARMER_BONUS,
  LONG_HOUSE_MORALE_BONUS,
  LONG_HOUSE_POP_GATE,
  ROAD_COST,
} from "./types";

function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function endYear(state: GameState): void {
  if (state.gameOver) return;
  const year = state.year;

  // Per-turn population tally — elders passing, children coming of age, and
  //   births are merged into one chronicle entry at the end of the turn.
  //   Famine and bandit deaths stay on their own lines (they belong to those
  //   events, not to the year's quiet turning).
  const tally = {
    oldAgeDeaths: 0,
    founderOldAgeDeaths: 0,
    comingOfAge: 0,
    births: 0,
  };

  // 0. Age everyone, handle natural deaths, count children-coming-of-age.
  const childrenBefore = childCount(state);
  for (const pop of state.pops) pop.age += 1;
  state.pops = state.pops.filter((p) => {
    if (p.age >= p.lifespan) {
      tally.oldAgeDeaths += 1;
      if (p.founder) tally.founderOldAgeDeaths += 1;
      return false;
    }
    return true;
  });
  const childrenAfter = childCount(state);
  // Lifespans are ≥ 25 and children are <14, so no child dies of old age —
  // any drop in child count is purely coming-of-age.
  tally.comingOfAge = childrenBefore - childrenAfter;

  if (tally.oldAgeDeaths > 0) {
    const shrined = state.buildings.shrine_of_anata;
    const perDeath = shrined ? ANATA_OLD_AGE_MORALE : MORALE_OLD_AGE_DEATH;
    const founderExtra = shrined ? ANATA_FOUNDER_EXTRA : MORALE_FOUNDER_EXTRA;
    applyMorale(
      state,
      -(tally.oldAgeDeaths * perDeath + tally.founderOldAgeDeaths * founderExtra),
    );
    const hadUnlocked = state.oldAgeDeathsTotal >= ANATA_DEATH_TRIGGER;
    state.oldAgeDeathsTotal += tally.oldAgeDeaths;
    if (!hadUnlocked
        && !state.buildings.shrine_of_anata
        && state.oldAgeDeathsTotal >= ANATA_DEATH_TRIGGER) {
      state.log.unshift({ year, text: ANATA_UNLOCK_LINE, tone: "neutral" });
    }
  }
  if (tally.comingOfAge > 0) {
    applyMorale(state, 2 * tally.comingOfAge);
  }

  // Reconcile early in case elders were workers.
  reconcileAllocation(state);

  // 0.5 Boat — age crew (they age separately since they aren't in state.pops),
  //      resolve voyage if this is the return year.
  if (state.boat.status === "voyage") {
    let oldAgeAtSea = 0;
    state.boat.crew = state.boat.crew.filter((p) => {
      p.age += 1;
      if (p.age >= p.lifespan) {
        oldAgeAtSea += 1;
        return false;
      }
      return true;
    });
    if (oldAgeAtSea > 0) {
      state.log.unshift({
        year,
        text: `${oldAgeAtSea} sailor${oldAgeAtSea === 1 ? "" : "s"} pass${oldAgeAtSea === 1 ? "es" : ""} during the long voyage.`,
        tone: "bad",
      });
    }
    if (state.boat.returnYear !== null && year >= state.boat.returnYear) {
      resolveVoyage(state);
    }
  }

  // 1. Collect yields from every worked tile, draining reserves where applicable.
  let foodGain = 0, woodGain = 0, stoneGain = 0;
  let fisherCount = 0;
  const exhaustionNotes: string[] = [];
  let quarriesExhausted = 0;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = state.tiles[y][x];
      if (t.state !== "worked" || t.workers <= 0) continue;
      if (t.terrain === "grass") {
        const granaryBonus = state.buildings.granary ? GRANARY_FARMER_BONUS : 0;
        foodGain += t.workers * (YIELD_PER_WORKER.farmer + t.fertility + granaryBonus);
      } else if (t.terrain === "forest") {
        if (t.hunterWorkers > 0) {
          const lodgeBonus = state.buildings.hunting_lodge ? HUNTING_LODGE_HUNTER_BONUS : 0;
          const desired = Math.floor(t.hunterWorkers * (YIELD_PER_WORKER.hunter + lodgeBonus));
          const actual = Math.min(desired, t.reserve);
          foodGain += actual;
          t.reserve -= actual;
          if (t.reserve <= 0) {
            // Game exhausted — close the hunter slot, evict hunters, woodcutters stay.
            t.gameExhausted = true;
            t.workers -= t.hunterWorkers;
            t.hunterWorkers = 0;
            exhaustionNotes.push(`the hunting grounds near (${x},${y})`);
            if (t.workers === 0) { t.state = "fallow"; t.yearsInState = 0; }
          }
        }
        // Timber regrows — woodcutters never drain the reserve.
        const woodcutters = t.workers - t.hunterWorkers;
        if (woodcutters > 0) woodGain += woodcutters * YIELD_PER_WORKER.woodcutter;
      } else if (t.terrain === "stone") {
        const desired = t.workers * YIELD_PER_WORKER.quarryman;
        const actual = Math.min(desired, t.reserve);
        stoneGain += actual;
        t.reserve -= actual;
        if (t.reserve <= 0) {
          t.state = "exhausted";
          t.workers = 0;
          t.yearsInState = 0;
          quarriesExhausted += 1;
        }
      } else if (t.terrain === "beach" || t.terrain === "river") {
        // Variable catch per worker — the flavour mechanic. Baseline waters
        // roll 1–3, rich waters (crab/tuna) roll 2–4. No reserve to drain;
        // fish replenish naturally, unlike forests.
        const [lo, hi] = t.fishRichness > 0 ? FISHER_YIELD_RICH : FISHER_YIELD_BASE;
        let catchTotal = 0;
        for (let w = 0; w < t.workers; w++) catchTotal += randInt(lo, hi);
        foodGain += catchTotal;
        fisherCount += t.workers;
      }
    }
  }
  const houseFood = state.houses * HOUSE_FOOD_YIELD;
  foodGain += houseFood;
  foodGain = Math.floor(foodGain);
  state.food += foodGain;
  state.wood += woodGain;
  state.stone += stoneGain;
  state.fishingYears += fisherCount;

  // 2. Scouts reveal new tiles.
  const revealed = state.scouts > 0
    ? exploreFrontier(state.tiles, state.scouts * SCOUT_REVEAL_PER_YEAR)
    : 0;

  // If the map is now fully known, stand down any remaining scouts — they have
  //   nothing left to survey. They return to the settlement as idle adults.
  let scoutsStoodDown = 0;
  if (state.scouts > 0 && !hasUndiscoveredFrontier(state.tiles)) {
    scoutsStoodDown = state.scouts;
    state.scouts = 0;
  }

  state.log.unshift({
    year,
    text: `Harvest — +${foodGain} food, +${woodGain} wood, +${stoneGain} stone.${
      revealed > 0 ? ` Scouts revealed ${revealed} new tile${revealed === 1 ? "" : "s"}.` : ""
    }`,
    tone: "neutral",
  });

  if (scoutsStoodDown > 0) {
    state.log.unshift({
      year,
      text: `The island is fully mapped. ${scoutsStoodDown} scout${scoutsStoodDown === 1 ? " returns" : "s return"} to the settlement — there is nothing left to chart.`,
      tone: "neutral",
    });
  }

  for (const note of exhaustionNotes) {
    state.log.unshift({
      year,
      text: `Workers abandon ${note} — nothing left to take.`,
      tone: "bad",
    });
  }
  for (let i = 0; i < quarriesExhausted; i++) {
    state.log.unshift({ year, text: QUARRY_EXHAUSTED_LINE, tone: "bad" });
  }

  // 3. Advance tile states AFTER yields (so cultivation doesn't count this year).
  //    Fisher tiles (beach/river) skip the cultivating and fallow phases —
  //    fishing leaves no infrastructure to wait for or preserve, so the tile
  //    transitions straight wild↔worked.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = state.tiles[y][x];
      if (t.state === "cultivating") {
        t.yearsInState += 1;
        if (t.yearsInState >= CULTIVATION_YEARS) {
          t.state = "worked";
          t.yearsInState = 0;
        }
      } else if (t.state === "worked" && t.workers === 0) {
        if (t.terrain === "beach" || t.terrain === "river") {
          t.state = "wild";
        } else {
          t.state = "fallow";
        }
        t.yearsInState = 0;
      } else if (t.state === "fallow") {
        t.yearsInState += 1;
        if (t.yearsInState >= FALLOW_REVERT_YEARS) {
          t.state = "wild";
          t.yearsInState = 0;
        }
      }
    }
  }

  // 4. Event roll — scripted wave fires instead of random event on its target year.
  //    Before consumption so refugees are counted in this turn's food (same
  //    convention as rescue-ship returns and the `newcomers` random event).
  if (totalPop(state) > 0) {
    const pending = state.scriptedWaves.find((w) => !w.fired && w.year === year);
    if (pending) {
      state.log.unshift(fireScriptedWave(state, pending.id));
      pending.fired = true;
    } else {
      state.log.unshift(rollEvent(state));
    }
  }

  // 5. Food consumption. Adults eat twice what children do.
  const adults = adultCount(state);
  const kids = childCount(state);
  const eaten = adults * FOOD_PER_ADULT + kids * FOOD_PER_CHILD;
  const foodNet = state.food - eaten;
  if (foodNet > 0) applyMorale(state, 2);
  else if (foodNet < 0) applyMorale(state, -3);
  state.food -= eaten;
  if (state.food < 0) {
    let shortfall = -state.food;
    state.food = 0;
    let childDeaths = 0;
    let adultDeaths = 0;
    let founderDeaths = 0;
    // Famine kills children first — a deliberate long-run pressure to keep food
    // a priority before births pay back. Each child "covers" FOOD_PER_CHILD units
    // of the shortfall; each adult covers FOOD_PER_ADULT.
    state.pops.sort((a, b) => a.age - b.age); // youngest first
    while (shortfall > 0 && state.pops.length > 0) {
      const victim = state.pops.shift()!;
      if (victim.founder) founderDeaths += 1;
      if (victim.age >= ADULT_AGE) {
        adultDeaths += 1;
        shortfall -= FOOD_PER_ADULT;
      } else {
        childDeaths += 1;
        shortfall -= FOOD_PER_CHILD;
      }
    }
    applyMorale(
      state,
      -(5 * (childDeaths + adultDeaths) + founderDeaths * MORALE_FOUNDER_EXTRA),
    );
    const parts: string[] = [];
    if (childDeaths > 0) parts.push(`${childDeaths} child${childDeaths === 1 ? "" : "ren"}`);
    if (adultDeaths > 0) parts.push(`${adultDeaths} adult${adultDeaths === 1 ? "" : "s"}`);
    const founderNote = founderDeaths > 0
      ? ` ${founderDeaths === 1 ? "One was" : `${founderDeaths} were`} of the original founding band.`
      : "";
    state.log.unshift({
      year,
      text: `Famine strikes. ${parts.join(" and ")} lost to starvation.${founderNote}`,
      tone: "bad",
    });
  }

  // 6. Reconcile assignments with current adult population.
  reconcileAllocation(state);

  // 7. Growth — need 1.5 years of food reserve per pop, morale above the growth
  //    gate, and a home to put the newborn in. Low morale, empty larder, or a
  //    full settlement all stop births. Pop cap is starter huts (20) plus each
  //    built house (6 each); the cap is hard — babies aren't born without room.
  //    Newcomers/refugees arrive regardless, so pop can exceed cap; only births
  //    are gated.
  if (
    totalPop(state) > 0 &&
    totalPop(state) < popCapacity(state) &&
    state.food >= totalPop(state) * 3 &&
    state.morale >= MORALE_GROWTH_GATE
  ) {
    state.pops.push(makeBabyPop());
    applyMorale(state, 2);
    tally.births += 1;
  }

  // Combined population tally — one chronicle line for the quiet turning of
  //   the year (elders, coming-of-age, births). Famine/bandit deaths remain on
  //   their own lines so they stay narratively distinct.
  emitPopulationTally(state, year, tally);

  // 8. Game-over check and year advance.
  if (totalPop(state) <= 0) {
    state.gameOver = true;
    state.log.unshift({
      year,
      text: "The last of your settlers perish. The isle reclaims the clearing.",
      tone: "bad",
    });
  } else {
    state.year += 1;
  }

  if (state.log.length > 120) state.log.length = 120;
}

interface PopTally {
  oldAgeDeaths: number;
  founderOldAgeDeaths: number;
  comingOfAge: number;
  births: number;
}

function emitPopulationTally(state: GameState, year: number, t: PopTally): void {
  if (t.oldAgeDeaths === 0 && t.comingOfAge === 0 && t.births === 0) return;
  const parts: string[] = [];
  if (t.births > 0) {
    parts.push(`${t.births} birth${t.births === 1 ? "" : "s"}`);
  }
  if (t.comingOfAge > 0) {
    parts.push(`${t.comingOfAge} come${t.comingOfAge === 1 ? "s" : ""} of age`);
  }
  if (t.oldAgeDeaths > 0) {
    const founderNote = t.founderOldAgeDeaths > 0
      ? ` (${t.founderOldAgeDeaths} of the founders)`
      : "";
    parts.push(
      `${t.oldAgeDeaths} elder${t.oldAgeDeaths === 1 ? "" : "s"} pass${t.oldAgeDeaths === 1 ? "es" : ""}${founderNote}`,
    );
  }
  // Tone leans "good" if a birth dominates, "neutral" if mixed, and "bad" only
  //   when a founder passes (the chronicle should note the loss).
  const tone: "good" | "bad" | "neutral" =
    t.founderOldAgeDeaths > 0 ? "bad"
    : t.births > 0 && t.oldAgeDeaths === 0 ? "good"
    : "neutral";
  state.log.unshift({
    year,
    text: `The year turns — ${parts.join(", ")}.`,
    tone,
  });
}

// Shed workers until assigned total ≤ fertile adult count. Elders are past
// working age — they don't count as labor supply. Scouts first (most flexible),
// then quarryman/woodcutter/hunter/fisher/farmer from furthest-from-town tiles.
function reconcileAllocation(state: GameState): void {
  const fertile = fertileCount(state);
  let totalAssigned =
    state.scouts +
    currentWorkers(state, "farmer") +
    currentWorkers(state, "woodcutter") +
    currentWorkers(state, "quarryman") +
    currentWorkers(state, "hunter") +
    currentWorkers(state, "fisher");
  let over = totalAssigned - fertile;
  if (over <= 0) return;

  const scoutShed = Math.min(over, state.scouts);
  state.scouts -= scoutShed;
  over -= scoutShed;

  // Shed order: scouts first (done above), then quarrymen, woodcutters, hunters,
  // fishers, farmers last — food producers drop in increasing order of
  // long-term reliability. Hunters go before fishers (forests exhaust, fish
  // replenish); fishers go before farmers (fisher yields are variable).
  const prodJobs: Array<Exclude<Job, "scout">> = ["quarryman", "woodcutter", "hunter", "fisher", "farmer"];
  for (const job of prodJobs) {
    while (over > 0) {
      const slot = findWorkerToRemove(state, job);
      if (!slot) break;
      unassignWorker(state, slot.x, slot.y, job);
      over -= 1;
    }
  }
}

// Exported for UI button handlers.
export function assignWorker(state: GameState, x: number, y: number, job: Exclude<Job, "scout">): void {
  const t = state.tiles[y][x];
  if (t.workers >= t.capacity) return;
  if (job === "hunter") t.hunterWorkers += 1;
  t.workers += 1;
  if (t.state === "wild") {
    // Fishing starts immediately — nets cast, not fields tilled. All other jobs
    // take a year of cultivation before they produce.
    if (t.terrain === "beach" || t.terrain === "river") {
      t.state = "worked";
    } else {
      t.state = "cultivating";
    }
    t.yearsInState = 0;
  } else if (t.state === "fallow") {
    t.state = "worked";
    t.yearsInState = 0;
  }
}

export function unassignWorker(state: GameState, x: number, y: number, job: Exclude<Job, "scout">): void {
  const t = state.tiles[y][x];
  if (t.workers <= 0) return;
  if (job === "hunter" && t.terrain === "forest") t.hunterWorkers = Math.max(0, t.hunterWorkers - 1);
  t.workers -= 1;
  if (t.workers === 0 && t.state === "cultivating") {
    t.state = "wild";
    t.yearsInState = 0;
  }
}

export function currentJobCount(state: GameState, job: Job): number {
  if (job === "scout") return state.scouts;
  return currentWorkers(state, job);
}

export function canExecuteTradeBasket(state: GameState, basket: TradeBasket): boolean {
  const total = basketTotal(basket);
  if (total <= 0 || total > TRADE_MAX_PER_VISIT) return false;
  const resources: TradeResource[] = ["food", "wood", "stone"];
  for (const r of resources) {
    if (basket.sell[r] < 0 || basket.buy[r] < 0) return false;
    // Must have enough of each resource to sell.
    if (basket.sell[r] > state[r]) return false;
  }
  // Net gold delta must leave gold non-negative.
  const delta = basketGoldDelta(basket);
  if (state.gold + delta < 0) return false;
  return true;
}

export function executeTradeBasket(state: GameState, basket: TradeBasket): LogEntry {
  const resources: TradeResource[] = ["food", "wood", "stone"];
  for (const r of resources) {
    state[r] += basket.buy[r] - basket.sell[r];
  }
  const delta = basketGoldDelta(basket);
  state.gold += delta;
  state.pendingMerchant = false;

  // Build a compact summary: "sold 3 wood, bought 2 stone, +X gold".
  const parts: string[] = [];
  for (const r of resources) {
    if (basket.sell[r] > 0) parts.push(`sold ${basket.sell[r]} ${r}`);
  }
  for (const r of resources) {
    if (basket.buy[r] > 0) parts.push(`bought ${basket.buy[r]} ${r}`);
  }
  const goldSign = delta >= 0 ? `+${delta}` : `${delta}`;
  return {
    year: state.year,
    text: `You strike a deal with the merchants: ${parts.join(", ")}. (${goldSign} gold)`,
    tone: delta >= 0 ? "good" : "neutral",
  };
}

export function declineTrade(state: GameState): LogEntry {
  state.pendingMerchant = false;
  return {
    year: state.year,
    text: "You wave the merchants on. They pack their wares and continue up the coast.",
    tone: "neutral",
  };
}

// Why a build is gated, or null if it's buildable. Used by canBuild *and* by
// the UI to show a specific tooltip on a disabled button (fixes #26 — disabled
// buttons used to be silent about what you needed).
export function buildBlockerReason(state: GameState, id: BuildingId): string | null {
  if (state.gameOver) return "Game over.";
  if (state.buildings[id]) return "Already built.";
  if (id === "long_house" && state.pops.length < LONG_HOUSE_POP_GATE) {
    return `Requires ${LONG_HOUSE_POP_GATE} people (${state.pops.length} now).`;
  }
  if (id === "shrine_of_anata" && state.oldAgeDeathsTotal < ANATA_DEATH_TRIGGER) {
    return `Needs ${ANATA_DEATH_TRIGGER} elders to have passed (${state.oldAgeDeathsTotal} so far).`;
  }
  const cost = BUILDINGS[id].cost;
  const short: string[] = [];
  if ((cost.food ?? 0) > state.food) short.push(`${(cost.food ?? 0) - state.food} food`);
  if ((cost.wood ?? 0) > state.wood) short.push(`${(cost.wood ?? 0) - state.wood} wood`);
  if ((cost.stone ?? 0) > state.stone) short.push(`${(cost.stone ?? 0) - state.stone} stone`);
  if ((cost.gold ?? 0) > state.gold) short.push(`${(cost.gold ?? 0) - state.gold} gold`);
  if (short.length > 0) return `Short: ${short.join(", ")}.`;
  return null;
}

export function canBuild(state: GameState, id: BuildingId): boolean {
  return buildBlockerReason(state, id) === null;
}

export function build(state: GameState, id: BuildingId): void {
  if (!canBuild(state, id)) return;
  const def = BUILDINGS[id];
  const cost = def.cost;
  state.food -= cost.food ?? 0;
  state.wood -= cost.wood ?? 0;
  state.stone -= cost.stone ?? 0;
  state.gold -= cost.gold ?? 0;
  state.buildings[id] = true;
  if (id === "long_house") {
    applyMorale(state, LONG_HOUSE_MORALE_BONUS);
    state.tiles[state.town.y][state.town.x].road = true;
  }
  if (id === "shrine_of_anata") {
    state.log.unshift({ year: state.year, text: ANATA_BUILD_LINE, tone: "good" });
    return;
  }
  state.log.unshift({
    year: state.year,
    text: `${def.name} complete — ${def.description}`,
    tone: "good",
  });
}

// Houses are repeatable, so they live outside the one-time BUILDINGS flags.
export function houseBlockerReason(state: GameState): string | null {
  if (state.gameOver) return "Game over.";
  if (!state.buildings.long_house) return "Requires the Long House.";
  const short: string[] = [];
  if (HOUSE_COST.wood > state.wood) short.push(`${HOUSE_COST.wood - state.wood} wood`);
  if (HOUSE_COST.stone > state.stone) short.push(`${HOUSE_COST.stone - state.stone} stone`);
  if (short.length > 0) return `Short: ${short.join(", ")}.`;
  return null;
}

export function canBuildHouse(state: GameState): boolean {
  return houseBlockerReason(state) === null;
}

export function buildHouse(state: GameState): void {
  if (!canBuildHouse(state)) return;
  state.wood -= HOUSE_COST.wood;
  state.stone -= HOUSE_COST.stone;
  state.houses += 1;
  const text = state.houses === 1 ? FIRST_HOUSE_LINE : additionalHouseLine(state.houses);
  state.log.unshift({ year: state.year, text, tone: "good" });
}

export function canBuildRoad(state: GameState, x: number, y: number): boolean {
  if (state.gameOver) return false;
  if (!state.buildings.long_house) return false;
  const t = state.tiles[y][x];
  if (!t.discovered) return false;
  if (t.road) return false;
  if (t.terrain === "water" || t.terrain === "mountain") return false;
  if (!isInReach(state, x, y)) return false;
  if (state.wood < ROAD_COST.wood) return false;
  if (state.stone < ROAD_COST.stone) return false;
  return true;
}

export function buildRoad(state: GameState, x: number, y: number): void {
  if (!canBuildRoad(state, x, y)) return;
  state.wood -= ROAD_COST.wood;
  state.stone -= ROAD_COST.stone;
  state.tiles[y][x].road = true;
  state.log.unshift({
    year: state.year,
    text: `A road is laid through (${x},${y}). The path holds.`,
    tone: "good",
  });
}

export function canDispatchBoat(state: GameState): boolean {
  if (state.gameOver) return false;
  if (state.boat.status !== "docked") return false;
  // Dispatch costs 2 adults immediately — so we need 2 idle adults available.
  return idleCount(state) >= BOAT_CREW_SIZE;
}

export function dispatchBoat(state: GameState): void {
  if (!canDispatchBoat(state)) return;
  // Pick the youngest adults — best odds of returning before old age takes them.
  const adultIndexes = state.pops
    .map((p, i) => ({ p, i }))
    .filter((e) => e.p.age >= ADULT_AGE)
    .sort((a, b) => a.p.age - b.p.age)
    .slice(0, BOAT_CREW_SIZE)
    .map((e) => e.i);
  const crewSet = new Set(adultIndexes);
  const crew: Pop[] = [];
  const remaining: Pop[] = [];
  state.pops.forEach((p, i) => {
    if (crewSet.has(i)) crew.push(p);
    else remaining.push(p);
  });
  state.pops = remaining;
  state.boat = {
    status: "voyage",
    returnYear: state.year + BOAT_VOYAGE_YEARS,
    crew,
  };
  state.log.unshift({
    year: state.year,
    text: `The ship puts to sea, bound for distant shores in search of our kin. ${BOAT_CREW_SIZE} crew aboard; expected back in ${BOAT_VOYAGE_YEARS} year${BOAT_VOYAGE_YEARS === 1 ? "" : "s"}.`,
    tone: "neutral",
  });
  // Dispatched adults may have held jobs — shed them.
  reconcileAllocation(state);
}

// How much fishing experience reduces per-crew loss odds. Scales slowly: after
//   FISHING_XP_GATE fisher-years the first 1% kicks in, then a further 1% per
//   FISHING_XP_PER_STEP more years, capped so the effective chance can't drop
//   below FISHING_LOSS_MIN.
export function fishingLossReduction(years: number): number {
  if (years < FISHING_XP_GATE) return 0;
  const steps = 1 + Math.floor((years - FISHING_XP_GATE) / FISHING_XP_PER_STEP);
  const maxReduction = BOAT_CREW_LOSS_CHANCE - FISHING_LOSS_MIN;
  return Math.min(maxReduction, steps * 0.01);
}

export function effectiveCrewLossChance(state: GameState): number {
  return Math.max(FISHING_LOSS_MIN, BOAT_CREW_LOSS_CHANCE - fishingLossReduction(state.fishingYears));
}

function resolveVoyage(state: GameState): void {
  const year = state.year;
  let lostAtSea = 0;
  const survivors: Pop[] = [];
  const lossChance = effectiveCrewLossChance(state);
  for (const p of state.boat.crew) {
    if (Math.random() < lossChance) {
      lostAtSea += 1;
    } else {
      survivors.push(p);
    }
  }

  let refugees = 0;
  if (survivors.length > 0) {
    const total = BOAT_REFUGEE_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < BOAT_REFUGEE_WEIGHTS.length; i++) {
      r -= BOAT_REFUGEE_WEIGHTS[i];
      if (r <= 0) {
        refugees = i;
        break;
      }
    }
  }

  for (let i = 0; i < refugees; i++) state.pops.push(makeNewcomerPop());
  state.pops.push(...survivors);

  let text: string;
  let tone: "good" | "bad" | "neutral";
  if (survivors.length === 0) {
    text = "The ship never returns. Watchers on the cliffs keep vigil for weeks, then stop.";
    tone = "bad";
  } else {
    const parts: string[] = [];
    if (refugees > 0) parts.push(`${refugees} refugee${refugees === 1 ? "" : "s"} brought home`);
    if (lostAtSea > 0) parts.push(`${lostAtSea} lost at sea`);
    if (parts.length === 0) {
      text = "The ship returns, empty-handed. The coast is barren of survivors.";
      tone = "neutral";
    } else {
      text = `The ship returns from its voyage — ${parts.join(", ")}.`;
      tone = refugees > 0 ? "good" : "bad";
    }
  }
  state.log.unshift({ year, text, tone });

  // If all crew died, the ship is lost — no further voyages possible. Otherwise
  //   she returns to her mooring and can sail again.
  state.boat = survivors.length === 0
    ? { status: "lost", returnYear: null, crew: [] }
    : { status: "docked", returnYear: null, crew: [] };
}
