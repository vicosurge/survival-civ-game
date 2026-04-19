import { fireScriptedWave, rollEvent } from "./events";
import { currentWorkers, exploreFrontier, findWorkerToRemove } from "./map";
import { adultCount, applyMorale, childCount, makeBabyPop, makeNewcomerPop, totalPop } from "./state";
import {
  ADULT_AGE,
  BOAT_CREW_LOSS_CHANCE,
  BOAT_CREW_SIZE,
  BOAT_REFUGEE_WEIGHTS,
  BOAT_VOYAGE_YEARS,
  BUILDINGS,
  BuildingId,
  CULTIVATION_YEARS,
  FALLOW_REVERT_YEARS,
  FOOD_PER_ADULT,
  FOOD_PER_CHILD,
  GameState,
  Job,
  JOB_TERRAIN,
  LogEntry,
  MAP_H,
  MAP_W,
  MORALE_GROWTH_GATE,
  Pop,
  SCOUT_REVEAL_PER_YEAR,
  TRADE_MAX_PER_VISIT,
  TRADE_RATES,
  TradeAction,
  TradeResource,
  YIELD_PER_WORKER,
  GRANARY_FARMER_BONUS,
} from "./types";

export function endYear(state: GameState): void {
  if (state.gameOver) return;
  const year = state.year;

  // 0. Age everyone, handle natural deaths, count children-coming-of-age.
  const childrenBefore = childCount(state);
  for (const pop of state.pops) pop.age += 1;
  let oldAgeDeaths = 0;
  state.pops = state.pops.filter((p) => {
    if (p.age >= p.lifespan) {
      oldAgeDeaths += 1;
      return false;
    }
    return true;
  });
  const childrenAfter = childCount(state);
  // Lifespans are ≥ 8 and children are <4, so no child ever dies of old age —
  // any drop in child count is purely coming-of-age.
  const comingOfAge = childrenBefore - childrenAfter;

  if (oldAgeDeaths > 0) {
    applyMorale(state, -oldAgeDeaths);
    state.log.unshift({
      year,
      text: `${oldAgeDeaths} elder${oldAgeDeaths === 1 ? "" : "s"} pass${oldAgeDeaths === 1 ? "es" : ""} peacefully this year.`,
      tone: "neutral",
    });
  }
  if (comingOfAge > 0) {
    applyMorale(state, 2 * comingOfAge);
    state.log.unshift({
      year,
      text: `${comingOfAge} child${comingOfAge === 1 ? "" : "ren"} come${comingOfAge === 1 ? "s" : ""} of age. (+${comingOfAge} idle adult${comingOfAge === 1 ? "" : "s"})`,
      tone: "good",
    });
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
  const exhaustionNotes: string[] = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = state.tiles[y][x];
      if (t.state !== "worked" || t.workers <= 0) continue;
      if (t.terrain === "grass") {
        const granaryBonus = state.buildings.granary ? GRANARY_FARMER_BONUS : 0;
        foodGain += t.workers * (YIELD_PER_WORKER.farmer + t.fertility + granaryBonus);
      } else if (t.terrain === "forest") {
        if (t.job === "hunter") {
          // Hunters drain the same forest reserve as woodcutters — game runs out
          // just like timber. Food yield is capped by remaining reserve.
          const desired = t.workers * YIELD_PER_WORKER.hunter;
          const actual = Math.min(desired, t.reserve);
          foodGain += actual;
          t.reserve -= actual;
        } else {
          const desired = t.workers * YIELD_PER_WORKER.woodcutter;
          const actual = Math.min(desired, t.reserve);
          woodGain += actual;
          t.reserve -= actual;
        }
        if (t.reserve <= 0) {
          const wasHunting = t.job === "hunter";
          t.state = "exhausted";
          t.workers = 0;
          t.job = null;
          t.yearsInState = 0;
          exhaustionNotes.push(wasHunting ? `hunting grounds near (${x},${y})` : `a timber stand near (${x},${y})`);
        }
      } else if (t.terrain === "stone") {
        const desired = t.workers * YIELD_PER_WORKER.quarryman;
        const actual = Math.min(desired, t.reserve);
        stoneGain += actual;
        t.reserve -= actual;
        if (t.reserve <= 0) {
          t.state = "exhausted";
          t.workers = 0;
          t.yearsInState = 0;
          exhaustionNotes.push(`a quarry`);
        }
      }
    }
  }
  foodGain = Math.floor(foodGain);
  state.food += foodGain;
  state.wood += woodGain;
  state.stone += stoneGain;

  // 2. Scouts reveal new tiles.
  const revealed = state.scouts > 0
    ? exploreFrontier(state.tiles, state.scouts * SCOUT_REVEAL_PER_YEAR)
    : 0;

  state.log.unshift({
    year,
    text: `Harvest — +${foodGain} food, +${woodGain} wood, +${stoneGain} stone.${
      revealed > 0 ? ` Scouts revealed ${revealed} new tile${revealed === 1 ? "" : "s"}.` : ""
    }`,
    tone: "neutral",
  });

  for (const note of exhaustionNotes) {
    state.log.unshift({
      year,
      text: `Workers abandon ${note} — nothing left to take.`,
      tone: "bad",
    });
  }

  // 3. Advance tile states AFTER yields (so cultivation doesn't count this year).
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
        t.state = "fallow";
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
    // Famine kills children first — a deliberate long-run pressure to keep food
    // a priority before births pay back. Each child "covers" FOOD_PER_CHILD units
    // of the shortfall; each adult covers FOOD_PER_ADULT.
    state.pops.sort((a, b) => a.age - b.age); // youngest first
    while (shortfall > 0 && state.pops.length > 0) {
      const victim = state.pops.shift()!;
      if (victim.age >= ADULT_AGE) {
        adultDeaths += 1;
        shortfall -= FOOD_PER_ADULT;
      } else {
        childDeaths += 1;
        shortfall -= FOOD_PER_CHILD;
      }
    }
    applyMorale(state, -5 * (childDeaths + adultDeaths));
    const parts: string[] = [];
    if (childDeaths > 0) parts.push(`${childDeaths} child${childDeaths === 1 ? "" : "ren"}`);
    if (adultDeaths > 0) parts.push(`${adultDeaths} adult${adultDeaths === 1 ? "" : "s"}`);
    state.log.unshift({
      year,
      text: `Famine strikes. ${parts.join(" and ")} lost to starvation.`,
      tone: "bad",
    });
  }

  // 6. Reconcile assignments with current adult population.
  reconcileAllocation(state);

  // 7. Growth — need 1.5 years of food reserve per pop, and morale above the
  //    growth gate. Low morale means no new babies this year.
  if (
    totalPop(state) > 0 &&
    state.food >= totalPop(state) * 3 &&
    state.morale >= MORALE_GROWTH_GATE
  ) {
    state.pops.push(makeBabyPop());
    applyMorale(state, 2);
    state.log.unshift({
      year,
      text: "A child is born into the settlement. They will not work for some years yet.",
      tone: "good",
    });
  }

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

// Shed workers until assigned total ≤ adult count. Scouts first (most flexible),
// then quarryman/woodcutter/farmer from furthest-from-town tiles.
function reconcileAllocation(state: GameState): void {
  const adults = adultCount(state);
  let totalAssigned = state.scouts + currentWorkers(state, "farmer") + currentWorkers(state, "woodcutter") + currentWorkers(state, "quarryman") + currentWorkers(state, "hunter");
  let over = totalAssigned - adults;
  if (over <= 0) return;

  const scoutShed = Math.min(over, state.scouts);
  state.scouts -= scoutShed;
  over -= scoutShed;

  // Shed order: scouts first (done above), then quarrymen, woodcutters, hunters,
  // farmers last — food producers are the last to lose workers in a crisis.
  const prodJobs: Array<Exclude<Job, "scout">> = ["quarryman", "woodcutter", "hunter", "farmer"];
  for (const job of prodJobs) {
    while (over > 0) {
      const slot = findWorkerToRemove(state, job);
      if (!slot) break;
      unassignWorker(state, slot.x, slot.y);
      over -= 1;
    }
  }
}

// Exported for UI button handlers.
export function assignWorker(state: GameState, x: number, y: number, job: Exclude<Job, "scout">): void {
  const t = state.tiles[y][x];
  if (t.workers >= t.capacity) return;
  if (t.workers === 0) t.job = job; // lock in camp mode on first worker
  t.workers += 1;
  if (t.state === "wild") {
    t.state = "cultivating";
    t.yearsInState = 0;
  } else if (t.state === "fallow") {
    t.state = "worked";
    t.yearsInState = 0;
  }
}

export function unassignWorker(state: GameState, x: number, y: number): void {
  const t = state.tiles[y][x];
  if (t.workers <= 0) return;
  t.workers -= 1;
  if (t.workers === 0) {
    t.job = null; // release camp mode so the tile can be re-opened as either type
    if (t.state === "cultivating") {
      t.state = "wild";
      t.yearsInState = 0;
    }
  }
}

export function currentJobCount(state: GameState, job: Job): number {
  if (job === "scout") return state.scouts;
  return currentWorkers(state, job);
}

export { JOB_TERRAIN };

export function canExecuteTrade(
  state: GameState,
  action: TradeAction,
  resource: TradeResource,
  qty: number,
): boolean {
  if (qty <= 0 || qty > TRADE_MAX_PER_VISIT) return false;
  const rate = TRADE_RATES[action][resource];
  if (action === "sell") return state[resource] >= qty;
  return state.gold >= qty * rate;
}

export function executeTrade(
  state: GameState,
  action: TradeAction,
  resource: TradeResource,
  qty: number,
): LogEntry {
  const rate = TRADE_RATES[action][resource];
  const goldDelta = qty * rate;
  if (action === "sell") {
    state[resource] -= qty;
    state.gold += goldDelta;
  } else {
    state.gold -= goldDelta;
    state[resource] += qty;
  }
  state.pendingMerchant = false;
  const verb = action === "sell" ? "sell" : "buy";
  const goldSign = action === "sell" ? `+${goldDelta}` : `-${goldDelta}`;
  const resSign = action === "sell" ? `-${qty}` : `+${qty}`;
  return {
    year: state.year,
    text: `You ${verb} ${qty} ${resource} to the merchants. (${resSign} ${resource}, ${goldSign} gold)`,
    tone: action === "sell" ? "good" : "neutral",
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

export function canBuild(state: GameState, id: BuildingId): boolean {
  if (state.gameOver) return false;
  if (state.buildings[id]) return false;
  const cost = BUILDINGS[id].cost;
  if ((cost.food ?? 0) > state.food) return false;
  if ((cost.wood ?? 0) > state.wood) return false;
  if ((cost.stone ?? 0) > state.stone) return false;
  if ((cost.gold ?? 0) > state.gold) return false;
  return true;
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
  state.log.unshift({
    year: state.year,
    text: `${def.name} complete — ${def.description}`,
    tone: "good",
  });
}

export function canDispatchBoat(state: GameState): boolean {
  if (state.gameOver) return false;
  if (state.boat.status !== "docked") return false;
  // Dispatch costs 2 adults immediately — so we need 2 idle adults available.
  const idleAdults = adultCount(state) - (
    state.scouts +
    currentWorkers(state, "farmer") +
    currentWorkers(state, "woodcutter") +
    currentWorkers(state, "quarryman")
  );
  return idleAdults >= BOAT_CREW_SIZE;
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

function resolveVoyage(state: GameState): void {
  const year = state.year;
  let lostAtSea = 0;
  const survivors: Pop[] = [];
  for (const p of state.boat.crew) {
    if (Math.random() < BOAT_CREW_LOSS_CHANCE) {
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

  state.boat = { status: "docked", returnYear: null, crew: [] };
}
