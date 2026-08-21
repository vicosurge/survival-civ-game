import { fireScriptedWave, merchantTierFromReputation, rollEvent, rollMerchantVisit } from "./events";
import { currentWorkers, exploreFrontier, findWorkerToRemove, hasUndiscoveredFrontier, isInReach } from "./map";
import {
  ANATA_BUILD_LINE,
  ANATA_UNLOCK_LINE,
  BUILDING_UNLOCK_TEXT,
  CHILD_FLIP_TO_FREE_LINE,
  CHILD_FLIP_TO_WORK_LINE,
  CHILD_FREE_LINE,
  CHILD_WORK_LINE,
  CAMP_FOUND_BY_RAID_LINE,
  CAMP_FOUND_BY_SCOUTS_LINE,
  ELDER_FLIP_TO_RESPECT_LINE,
  ELDER_FLIP_TO_WORK_LINE,
  FIRST_HOUSE_LINE,
  LEVY_FLIP_TO_OFF_LINE,
  LEVY_FLIP_TO_ON_LINE,
  LEVY_UNFED_LINE,
  QUARRY_EXHAUSTED_LINE,
  RAID_AVERTED_LINE,
  RAID_HELD_NOTE,
  RAID_INTRO,
  RAID_OVER_WALL_NOTE,
  founderLossNote,
  raidDeathsLine,
  raidEmptyLine,
  raidRepelledLine,
  raidTheftLine,
  sortieLostLine,
  sortieWonLine,
  SPOILAGE_FIRST_LINE,
  TOWN_UPGRADE_BUILD_LINE,
  additionalHouseLine,
  levyWorkLine,
  spoilageLine,
} from "./narratives";
import { adultCount, applyMorale, childCount, elderCount, fertileCount, foodCapacity, idleCount, makeBabyPop, makeNewcomerPop, popCapacity, spoilageFor, totalPop } from "./state";
import {
  ADULT_AGE,
  ANATA_SACRIFICE_DECLINE_MORALE,
  ANATA_SACRIFICE_FOOD_COST,
  ANATA_SACRIFICE_MORALE_GAIN,
  ELDER_AGE,
  ELDER_DECISION_TRIGGER,
  ELDER_WORK_FOOD_YIELD,
  MORALE_ELDER_WORK_CHOICE,
  MORALE_ELDER_RESPECTED_CHOICE,
  BANDIT_CAMP_GROWTH,
  BANDIT_CAMP_MAX_STRENGTH,
  BANDIT_KNOWN_AFTER_RAIDS,
  BANDIT_RAID_CHANCE_BASE,
  BANDIT_RAID_CHANCE_CAP,
  BANDIT_RAID_CHANCE_PER_STRENGTH,
  BANDIT_SEVERE_CHANCE,
  BANDIT_SEVERE_KILL_DIVISOR,
  BANDIT_SEVERE_MAX_KILLS,
  BANDIT_SEVERE_STRENGTH,
  BANDIT_THEFT_PER_STRENGTH,
  BANDIT_THEFT_JITTER,
  ANATA_DEATH_TRIGGER,
  ANATA_FOUNDER_EXTRA,
  ANATA_OLD_AGE_MORALE,
  BOAT_CREW_LOSS_CHANCE,
  BOAT_CREW_SIZE,
  BOAT_REFUGEE_WEIGHTS,
  BOAT_VOYAGE_YEARS,
  BUILDINGS,
  BuildingId,
  CHICKEN_CAP_INITIAL,
  CHICKEN_EGG_FOOD_RATE,
  CHICKEN_GROWTH_RATE,
  CHICKEN_SLAUGHTER_FOOD,
  CHICKEN_STARTING_FLOCK,
  BONUS_BIRTH_CAP,
  CHILD_DECISION_TRIGGER,
  CHILD_WORK_FOOD_YIELD,
  CHILD_WORK_WOOD_YIELD,
  CULTIVATION_YEARS,
  DIRT_PATH_COST,
  FALLOW_REVERT_YEARS,
  FISHER_YIELD_BASE,
  FISHER_YIELD_RICH,
  FISHING_LOSS_MIN,
  FISHING_XP_GATE,
  FISHING_XP_PER_STEP,
  FOOD_PER_ADULT,
  FOOD_PER_CHILD,
  GameState,
  GRANARY_FARMER_BONUS,
  HOUSE_COST_BASE,
  HOUSE_COST_INCREMENT,
  HOUSE_FOOD_YIELD,
  HUNTING_LODGE_HUNTER_BONUS,
  IDLE_ADULT_BIRTH_CHANCE,
  Job,
  TileJob,
  LogEntry,
  LONG_HOUSE_MORALE_BONUS,
  LONG_HOUSE_POP_GATE,
  LUMBER_CAMP_WOODCUTTER_BONUS,
  MAP_H,
  MAP_W,
  MASON_WORKSHOP_QUARRYMAN_BONUS,
  MerchantTier,
  MILITIA_SORTIE_MIN,
  MILITIA_STRENGTH,
  MORALE_BANDIT_DEATH,
  MORALE_BANDIT_EMPTY,
  MORALE_BANDIT_THEFT,
  MORALE_CHILD_FREE_CHOICE,
  MORALE_CHILD_WORK_CHOICE,
  MORALE_FOUNDER_EXTRA,
  MORALE_GROWTH_GATE,
  MORALE_LAW_CHANGE_COST,
  MORALE_OLD_AGE_DEATH,
  MORALE_REFUGEE_ACCEPT,
  MORALE_SORTIE_LOSS,
  MORALE_SORTIE_WIN,
  MORALE_REFUGEE_REJECT,
  MORALE_WORK_LEVY_OFF,
  MORALE_WORK_LEVY_ON,
  Pop,
  RoadType,
  PALISADE_HOLD_STRENGTH,
  PALISADE_THEFT_REDUCTION,
  SCOUT_REVEAL_PER_YEAR,
  SORTIE_LOOT_PER_STRENGTH,
  SORTIE_LOSS_DIVISOR,
  STONE_ROAD_COST,
  TOWN_UPGRADES,
  TownUpgradeDef,
  TownUpgradeId,
  TradeBasket,
  TradeResource,
  WORK_LEVY_FOOD_COST,
  WORK_LEVY_STONE_YIELD,
  WORK_LEVY_WOOD_YIELD,
  YIELD_PER_WORKER,
  basketGoldDelta,
} from "./types";

function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function endYear(state: GameState): void {
  if (state.gameOver) return;
  const year = state.year;
  state.sortieUsedThisYear = false;

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
  // Count pops crossing into elder phase this year (age was ELDER_AGE-1, now ELDER_AGE).
  const newElderCrossings = state.pops.filter((p) => p.age === ELDER_AGE - 1).length;
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
  // Lifespans are ≥ ELDER_AGE and children are <ADULT_AGE, so no child dies of old age —
  // any drop in child count is purely coming-of-age.
  tally.comingOfAge = childrenBefore - childrenAfter;

  // Elder decision gate — fires the first time 5 adults have crossed into elder.
  if (newElderCrossings > 0 && state.elderPolicy === null) {
    state.elderTransitions += newElderCrossings;
    if (state.elderTransitions >= ELDER_DECISION_TRIGGER && !state.pendingElderDecision) {
      state.pendingElderDecision = true;
    }
  }

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
        if (woodcutters > 0) {
          const lumberBonus = state.buildings.lumber_camp ? LUMBER_CAMP_WOODCUTTER_BONUS : 0;
          woodGain += woodcutters * (YIELD_PER_WORKER.woodcutter + lumberBonus);
        }
      } else if (t.terrain === "stone") {
        const masonBonus = state.buildings.mason_workshop ? MASON_WORKSHOP_QUARRYMAN_BONUS : 0;
        const desired = Math.floor(t.workers * (YIELD_PER_WORKER.quarryman + masonBonus));
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

  // Elder labour policy — working elders contribute light tasks (garden, repair).
  if (state.elderPolicy === "working") {
    const elders = elderCount(state);
    foodGain += Math.floor(elders * ELDER_WORK_FOOD_YIELD);
  }

  // Child labour policy — working children gather kindling, weed gardens, sort
  // small things. Floored, deliberately stingy (see types.ts comment).
  if (state.childPolicy === "working") {
    const kids = childCount(state);
    foodGain += Math.floor(kids * CHILD_WORK_FOOD_YIELD);
    woodGain += Math.floor(kids * CHILD_WORK_WOOD_YIELD);
  }

  // Town-centre upgrades — small passive yields, no worker required. Iterate
  // the table so adding a new upgrade auto-extends the harvest pipeline.
  for (const id of Object.keys(TOWN_UPGRADES) as TownUpgradeId[]) {
    if (!state.townUpgrades[id]) continue;
    const y = TOWN_UPGRADES[id].yield;
    foodGain += y.food ?? 0;
    woodGain += y.wood ?? 0;
    stoneGain += y.stone ?? 0;
  }

  // Chicken coop — eggs, flock growth, auto-cull at capacity cap.
  if (state.buildings.chicken_coop && state.chickens > 0) {
    const eggs = Math.floor(state.chickens * CHICKEN_EGG_FOOD_RATE);
    foodGain += eggs;
    const growth = Math.max(1, Math.floor(state.chickens * CHICKEN_GROWTH_RATE));
    state.chickens += growth;
    if (state.chickens > state.chickenCapacity) {
      const culled = state.chickens - state.chickenCapacity;
      const meatFood = culled * CHICKEN_SLAUGHTER_FOOD;
      foodGain += meatFood;
      state.chickens = state.chickenCapacity;
      if (!state.chickenSacrificeNotified) {
        state.chickenSacrificeNotified = true;
        state.log.unshift({
          year,
          text: `The coop is full — ${culled} chicken${culled === 1 ? "" : "s"} culled to keep the flock at ${state.chickenCapacity} (+${meatFood} food). This will happen automatically each year; build a larger coop to raise the cap.`,
          tone: "neutral",
        });
      }
    }
  }

  // Work levy — gangs fed out of the stores in exchange for timber and stone.
  // Guarded on current stores *including* this year's harvest: the levy must
  // never be able to push food negative and trigger the famine in step 5.
  if (state.workLevy) {
    const storesAfterHarvest = state.food + Math.floor(foodGain);
    if (storesAfterHarvest >= WORK_LEVY_FOOD_COST) {
      foodGain -= WORK_LEVY_FOOD_COST;
      woodGain += WORK_LEVY_WOOD_YIELD;
      stoneGain += WORK_LEVY_STONE_YIELD;
      state.log.unshift({
        year,
        text: levyWorkLine(WORK_LEVY_FOOD_COST, WORK_LEVY_WOOD_YIELD, WORK_LEVY_STONE_YIELD),
        tone: "neutral",
      });
    } else {
      state.log.unshift({ year, text: LEVY_UNFED_LINE, tone: "bad" });
    }
  }

  foodGain = Math.floor(foodGain);
  woodGain = Math.floor(woodGain);
  state.food += foodGain;
  state.wood += woodGain;
  state.stone += stoneGain;
  state.fishingYears += fisherCount;

  // 2. Scouts reveal new tiles.
  const revealed = state.scouts > 0
    ? exploreFrontier(state.tiles, state.scouts * SCOUT_REVEAL_PER_YEAR)
    : 0;

  // Scouts walking onto the camp's tile is the intended discovery route — the
  // raid-tracking fallback exists only for a fully-charted island.
  if (state.banditCamp && !state.banditCamp.known
      && state.tiles[state.banditCamp.y][state.banditCamp.x].discovered) {
    noteCampFound(state, year, CAMP_FOUND_BY_SCOUTS_LINE);
  }

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

  // 4.5 Bandit camp — grow, then maybe raid. Sits between the event roll and
  //     consumption for the same reason events do: theft settles before the
  //     famine check, so the food display never lies about what was eaten.
  resolveBanditCamp(state, year);

  // 5. Food consumption. Adults eat twice what children do.
  const adults = adultCount(state);
  const kids = childCount(state);
  const eaten = adults * FOOD_PER_ADULT + kids * FOOD_PER_CHILD;
  const foodNet = state.food - eaten;
  if (foodNet > 0) applyMorale(state, 2);
  else if (foodNet < 0) applyMorale(state, -3);
  state.food -= eaten;
  {
    const parts: string[] = [];
    if (adults > 0) parts.push(`${adults} adult${adults === 1 ? "" : "s"} (${adults * FOOD_PER_ADULT} food)`);
    if (kids > 0) parts.push(`${kids} child${kids === 1 ? "" : "ren"} (${kids * FOOD_PER_CHILD} food)`);
    state.log.unshift({
      year,
      text: `Consumed ${eaten} food: ${parts.join(", ")}.`,
      tone: "neutral",
    });
  }
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

  // 5.5 Spoilage. Runs AFTER eating so nobody starves beside grain that rotted
  // the same year, and BEFORE the growth check so a surplus that won't survive
  // the winter can't buy a birth. Takes a fraction of the overflow, not all of
  // it — the store settles just above cap rather than being clamped hard,
  // which is what keeps the pop × 3 birth gate reachable (sim/food_storage_cap.py).
  {
    const lost = spoilageFor(state, state.food);
    if (lost > 0) {
      state.food -= lost;
      const line = spoilageLine(lost, foodCapacity(state));
      if (!state.spoilageNotified) {
        state.spoilageNotified = true;
        state.log.unshift({ year, text: `${line} ${SPOILAGE_FIRST_LINE}`, tone: "bad" });
      } else {
        state.log.unshift({ year, text: line, tone: "bad" });
      }
    }
  }

  // 6. Reconcile assignments with current adult population.
  reconcileAllocation(state);

  // 7. Growth — need 1.5 years of food reserve per pop, morale above the growth
  //    gate, and a home to put the newborn in. Low morale, empty larder, or a
  //    full settlement all stop births. Pop cap is starter huts (20) plus each
  //    built house (6 each); the cap is hard — babies aren't born without room.
  //    Newcomers/refugees arrive regardless, so pop can exceed cap; only births
  //    are gated.
  const growthGatesMet =
    totalPop(state) > 0 &&
    totalPop(state) < popCapacity(state) &&
    state.food >= totalPop(state) * 3 &&
    state.morale >= MORALE_GROWTH_GATE;
  if (growthGatesMet) {
    state.pops.push(makeBabyPop());
    applyMorale(state, 2);
    tally.births += 1;
  }

  // Idle-adult birth bonus — prosperity multiplier on top of the standard
  // rule. Each idle adult independently rolls; total capped. Same gates as
  // the standard birth (re-checked because the standard rule may have just
  // pushed pop to the cap or eaten the food reserve isn't an issue here, but
  // morale + cap can shift mid-step).
  const idleAdults = idleCount(state);
  if (growthGatesMet && idleAdults > 0 && totalPop(state) < popCapacity(state)) {
    let bonus = 0;
    for (let i = 0; i < idleAdults && bonus < BONUS_BIRTH_CAP; i++) {
      if (Math.random() < IDLE_ADULT_BIRTH_CHANCE) bonus += 1;
    }
    for (let i = 0; i < bonus && totalPop(state) < popCapacity(state); i++) {
      state.pops.push(makeBabyPop());
      applyMorale(state, 2);
      tally.births += 1;
    }
  }

  // Combined population tally — one chronicle line for the quiet turning of
  //   the year (elders, coming-of-age, births). Famine/bandit deaths remain on
  //   their own lines so they stay narratively distinct.
  emitPopulationTally(state, year, tally);

  // Civic gates — child-labour decision triggers once the Long House exists
  // (so the governance panel is available for follow-up flips) and there are
  // enough children to put the question on the table. One-shot — after the
  // first decision, the policy is revisitable from the Governance panel.
  if (
    state.buildings.long_house
    && state.childPolicy === null
    && !state.pendingChildDecision
    && childCount(state) >= CHILD_DECISION_TRIGGER
  ) {
    state.pendingChildDecision = true;
  }

  // Building-unlock chronicle — fires once when each gated building's gate
  // becomes satisfied. Hidden buildings need this announcement so players
  // notice when the world has just opened up.
  checkBuildingUnlocks(state, year);

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

  if (state.log.length > 2000) state.log.length = 2000;
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

// ─── Bandit camp ──────────────────────────────────────────────────────────────
// The camp is a persistent adversary, not an event: it grows every year it is
// left alone, and raids on its own schedule. Everything the player can do about
// it lives on the tile (a sortie) or in the allocator (militia).

// Violent deaths, taken militia-first. The militia count is abstract, so a
// militiaman dying is one fertile adult removed and the count decremented —
// which is exactly what makes standing a militia protective rather than merely
// deterrent. Children are never taken: famine owns that role, and lifting it
// here would stack two demographic punishments on the same cohort.
function killDefenders(state: GameState, count: number): { deaths: number; founders: number } {
  let deaths = 0;
  let founders = 0;
  for (let i = 0; i < count; i++) {
    if (state.pops.length <= 1) break;
    const candidates = state.pops
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.age >= ADULT_AGE && p.age < ELDER_AGE);
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (pick.p.founder) founders += 1;
    state.pops.splice(pick.idx, 1);
    if (state.militia > 0) state.militia -= 1;
    deaths += 1;
  }
  return { deaths, founders };
}

// `known` is the hinge for the sortie, the Muster Field, the map marker and the
// severe path, so it flips in exactly one place. The lifetime counter exists
// because `banditCamp` is transient: a camp discovered and burned in the same
// turn would otherwise never satisfy a cutscene trigger.
function noteCampFound(state: GameState, year: number, text: string): void {
  const camp = state.banditCamp;
  if (!camp || camp.known) return;
  camp.known = true;
  state.banditCampsFound += 1;
  state.log.unshift({ year, text, tone: "neutral" });
}

function resolveBanditCamp(state: GameState, year: number): void {
  const camp = state.banditCamp;
  if (!camp) return;
  // A camp never raids the year it appears — the founding line is that year's beat.
  if (camp.yearFounded === year) return;

  camp.strength = Math.min(camp.strength + BANDIT_CAMP_GROWTH, BANDIT_CAMP_MAX_STRENGTH);

  const raidChance = Math.min(
    BANDIT_RAID_CHANCE_BASE + camp.strength * BANDIT_RAID_CHANCE_PER_STRENGTH,
    BANDIT_RAID_CHANCE_CAP,
  );
  if (Math.random() >= raidChance) return;

  camp.raidsSuffered += 1;
  if (camp.raidsSuffered >= BANDIT_KNOWN_AFTER_RAIDS) {
    noteCampFound(state, year, CAMP_FOUND_BY_RAID_LINE);
  }

  // The palisade is a buffer, not a shield. It stops a small band outright;
  // a band that has outgrown it gets through, carrying off half as much.
  if (state.buildings.palisade && camp.strength <= PALISADE_HOLD_STRENGTH) {
    state.log.unshift({ year, text: RAID_AVERTED_LINE, tone: "good" });
    return;
  }

  const defence = state.militia * MILITIA_STRENGTH;
  const intro = RAID_INTRO[Math.floor(Math.random() * RAID_INTRO.length)];

  if (defence >= camp.strength) {
    state.log.unshift({ year, text: raidRepelledLine(intro), tone: "good" });
    return;
  }

  const pressure = camp.strength - defence;
  const jitter = randInt(BANDIT_THEFT_JITTER[0], BANDIT_THEFT_JITTER[1]);
  let desired = pressure * BANDIT_THEFT_PER_STRENGTH + jitter;
  if (state.buildings.palisade) desired = Math.floor(desired * PALISADE_THEFT_REDUCTION);
  const stolen = Math.min(desired, state.food);
  state.food -= stolen;

  const heldNote = defence > 0 ? RAID_HELD_NOTE : "";
  const wallNote = state.buildings.palisade ? RAID_OVER_WALL_NOTE : "";

  if (stolen <= 0) {
    applyMorale(state, MORALE_BANDIT_EMPTY);
    state.log.unshift({ year, text: raidEmptyLine(intro, wallNote, MORALE_BANDIT_EMPTY), tone: "bad" });
  } else {
    applyMorale(state, MORALE_BANDIT_THEFT);
    state.log.unshift({
      year,
      text: raidTheftLine(intro, wallNote, heldNote, stolen, MORALE_BANDIT_THEFT),
      tone: "bad",
    });
  }

  // Severe path — a separate escalation, never a mutation of the base raid
  // (CLAUDE.md). Three guardrails, all load-bearing: the camp must be KNOWN
  // (the player saw it coming), the *unopposed* pressure must be severe (a
  // standing militia holds the killing off entirely), and even then most raids
  // still only take food.
  if (!camp.known || pressure < BANDIT_SEVERE_STRENGTH) return;
  if (Math.random() >= BANDIT_SEVERE_CHANCE) return;
  const toll = Math.min(
    Math.ceil(pressure / BANDIT_SEVERE_KILL_DIVISOR),
    BANDIT_SEVERE_MAX_KILLS,
  );
  const { deaths, founders } = killDefenders(state, toll);
  if (deaths === 0) return;
  applyMorale(state, MORALE_BANDIT_DEATH * deaths + MORALE_FOUNDER_EXTRA * founders);
  state.log.unshift({
    year,
    text: raidDeathsLine(deaths, founderLossNote(founders)),
    tone: "bad",
  });
  reconcileAllocation(state);
}

// ─── Sortie ───────────────────────────────────────────────────────────────────
// The player's half of the combat loop. Resolves immediately, like build() —
// no pause modal, no end-of-year wait. One per year so the camp can't be ground
// down by repeated same-turn attacks.

export function militiaDefence(state: GameState): number {
  return state.militia * MILITIA_STRENGTH;
}

// Straight contest of strengths, so the displayed odds are the whole story.
export function sortieOdds(state: GameState): number {
  const camp = state.banditCamp;
  if (!camp) return 0;
  const attack = militiaDefence(state);
  return attack / (attack + camp.strength);
}

export function sortieBlockerReason(state: GameState): string | null {
  if (state.gameOver) return "Game over.";
  const camp = state.banditCamp;
  if (!camp) return "There is no camp to march on.";
  if (!camp.known) return "You do not know where they camp.";
  if (state.sortieUsedThisYear) return "Your militia have already marched this year.";
  if (state.militia < MILITIA_SORTIE_MIN) {
    return `Needs ${MILITIA_SORTIE_MIN} militia (${state.militia} now).`;
  }
  return null;
}

export function canSortie(state: GameState): boolean {
  return sortieBlockerReason(state) === null;
}

export function executeSortie(state: GameState): LogEntry | null {
  if (!canSortie(state)) return null;
  const camp = state.banditCamp!;
  const year = state.year;
  state.sortieUsedThisYear = true;

  if (Math.random() < sortieOdds(state)) {
    const loot = camp.strength * SORTIE_LOOT_PER_STRENGTH;
    state.food += loot;
    state.banditCamp = null;
    state.sortiesWon += 1;
    applyMorale(state, MORALE_SORTIE_WIN);
    const entry: LogEntry = { year, text: sortieWonLine(loot, MORALE_SORTIE_WIN), tone: "good" };
    state.log.unshift(entry);
    return entry;
  }

  const losses = randInt(1, Math.ceil(state.militia / SORTIE_LOSS_DIVISOR));
  const { deaths, founders } = killDefenders(state, losses);
  camp.strength = Math.max(1, camp.strength - 1);
  applyMorale(state, MORALE_SORTIE_LOSS + MORALE_FOUNDER_EXTRA * founders);
  reconcileAllocation(state);
  const entry: LogEntry = {
    year,
    text: sortieLostLine(deaths, founderLossNote(founders), MORALE_SORTIE_LOSS),
    tone: "bad",
  };
  state.log.unshift(entry);
  return entry;
}

// Shed workers until assigned total ≤ fertile adult count. Elders are past
// working age — they don't count as labor supply. The two tileless roles go
// first (scouts, then militia — neither produces anything), then
// quarryman/woodcutter/hunter/fisher/farmer from furthest-from-town tiles.
function reconcileAllocation(state: GameState): void {
  const fertile = fertileCount(state);
  let totalAssigned =
    state.scouts +
    state.militia +
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

  const militiaShed = Math.min(over, state.militia);
  state.militia -= militiaShed;
  over -= militiaShed;

  // Shed order: quarryman (no food) → woodcutter (no food) → hunter (food,
  // finite) → fisher (food, variable) → farmer (food, most reliable) last.
  const prodJobs: Array<TileJob> = ["quarryman", "woodcutter", "hunter", "fisher", "farmer"];
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
export function assignWorker(state: GameState, x: number, y: number, job: TileJob): void {
  const t = state.tiles[y][x];
  if (t.workers >= t.capacity) return;
  if (job === "hunter") t.hunterWorkers += 1;
  t.workers += 1;
  if (t.state === "wild") {
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

export function unassignWorker(state: GameState, x: number, y: number, job: TileJob): void {
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
  if (job === "militia") return state.militia;
  return currentWorkers(state, job);
}

// Patrician cargo model: the player can sell up to
//   cargoCapacity - stockTotal + buyTotal units total.
// Additionally, can't buy more than the merchant's stock of each resource.
export function canExecuteTradeBasket(state: GameState, basket: TradeBasket): boolean {
  const visit = state.merchantVisit;
  if (!visit) return false;
  const resources: TradeResource[] = ["food", "wood", "stone"];
  for (const r of resources) {
    if (basket.sell[r] < 0 || basket.buy[r] < 0) return false;
    const playerStock = (state as unknown as Record<string, number>)[r];
    if (basket.sell[r] > playerStock) return false;
    if (basket.buy[r] > visit.sellStock[r]) return false;
  }
  const stockTotal = resources.reduce((s, r) => s + visit.sellStock[r], 0);
  const buyTotal = resources.reduce((s, r) => s + basket.buy[r], 0);
  const sellTotal = resources.reduce((s, r) => s + basket.sell[r], 0);
  if (sellTotal > visit.cargoCapacity - stockTotal + buyTotal) return false;
  if (sellTotal + buyTotal === 0) return false;
  const delta = basketGoldDelta(state, basket);
  if (state.gold + delta < 0) return false;
  return true;
}

// Second-ship handoff: at tier 2, the `merchants` event may set the
// merchantSecondShipPending flag. When the current visit resolves (deal or
// decline), we immediately re-open the modal with a fresh roll. Reputation is
// re-read at roll time, so a tier-crossing trade can level up the second ship.
function maybeArrangeSecondShip(state: GameState, log: LogEntry[]): void {
  if (!state.merchantSecondShipPending) return;
  state.merchantSecondShipPending = false;
  state.merchantVisit = rollMerchantVisit(state);
  log.push({
    year: state.year,
    text: "A second ship makes port the same season. A different captain unpacks his wares beside the first wagon's tracks.",
    tone: "neutral",
  });
}

// Crossing a tier should land as a chronicle beat (single +1 cargo is invisible
// per-trade, but the threshold crossing is a real moment).
function noteTierUp(state: GameState, before: MerchantTier, log: LogEntry[]): void {
  const after = merchantTierFromReputation(state.tradeReputation);
  if (after === before) return;
  const beats: Record<MerchantTier, string> = {
    0: "",
    1: "Coastal traders have begun naming your settlement on their routes. Their wagons arrive heavier now.",
    2: "Cambrera is a port of call. Whole ships now plot courses to your harbour — and sometimes two at once.",
  };
  if (beats[after]) {
    log.push({ year: state.year, text: beats[after], tone: "good" });
  }
}

export function executeTradeBasket(state: GameState, basket: TradeBasket): LogEntry {
  const resources: TradeResource[] = ["food", "wood", "stone"];
  for (const r of resources) {
    const net = basket.buy[r] - basket.sell[r];
    if (net === 0) continue;
    (state as unknown as Record<string, number>)[r] += net;
  }
  const delta = basketGoldDelta(state, basket);
  state.gold += delta;
  state.merchantVisit = null;

  const tierBefore = merchantTierFromReputation(state.tradeReputation);
  state.tradeReputation += 1;

  const parts: string[] = [];
  for (const r of resources) {
    if (basket.sell[r] > 0) parts.push(`sold ${basket.sell[r]} ${r}`);
  }
  for (const r of resources) {
    if (basket.buy[r] > 0) parts.push(`bought ${basket.buy[r]} ${r}`);
  }
  const goldSign = delta >= 0 ? `+${delta}` : `${delta}`;
  const dealLog: LogEntry = {
    year: state.year,
    text: `You strike a deal with the merchants: ${parts.join(", ")}. (${goldSign} gold)`,
    tone: delta >= 0 ? "good" : "neutral",
  };

  const extras: LogEntry[] = [];
  noteTierUp(state, tierBefore, extras);
  maybeArrangeSecondShip(state, extras);
  if (extras.length > 0) state.log.unshift(...extras);

  return dealLog;
}

export function declineTrade(state: GameState): LogEntry {
  state.merchantVisit = null;
  const main: LogEntry = {
    year: state.year,
    text: "You wave the merchants on. They pack their wares and continue up the coast.",
    tone: "neutral",
  };
  const extras: LogEntry[] = [];
  maybeArrangeSecondShip(state, extras);
  if (extras.length > 0) state.log.unshift(...extras);
  return main;
}

// Logic for building the chicken coop — initialises the flock.
export function buildChickenCoop(state: GameState): void {
  state.buildings.chicken_coop = true;
  state.chickens = CHICKEN_STARTING_FLOCK;
  state.chickenCapacity = CHICKEN_CAP_INITIAL;
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
  if (id === "dock" && !state.buildings.long_house) {
    return "Requires the Long House.";
  }
  // "Requires" is load-bearing: isBuildingHidden keys off that prefix, so the
  // Muster Field stays hidden until there is a camp to raise a militia against,
  // then announces itself through the normal building-unlock chronicle.
  if (id === "muster_field" && !state.banditCamp?.known) {
    return "Requires word of a bandit camp.";
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
    // The civic anchor and the first paved highway are the same moment.
    state.tiles[state.town.y][state.town.x].roadType = "stone";
  }
  if (id === "chicken_coop") {
    state.chickens = CHICKEN_STARTING_FLOCK;
    state.chickenCapacity = CHICKEN_CAP_INITIAL;
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
// Cost escalates per existing house: house N costs base + N×increment.
export function nextHouseCost(state: GameState): { wood: number; stone: number } {
  return {
    wood:  HOUSE_COST_BASE.wood  + state.houses * HOUSE_COST_INCREMENT.wood,
    stone: HOUSE_COST_BASE.stone + state.houses * HOUSE_COST_INCREMENT.stone,
  };
}

export function houseBlockerReason(state: GameState): string | null {
  if (state.gameOver) return "Game over.";
  if (!state.buildings.long_house) return "Requires the Long House.";
  const cost = nextHouseCost(state);
  const short: string[] = [];
  if (cost.wood > state.wood) short.push(`${cost.wood - state.wood} wood`);
  if (cost.stone > state.stone) short.push(`${cost.stone - state.stone} stone`);
  if (short.length > 0) return `Short: ${short.join(", ")}.`;
  return null;
}

export function canBuildHouse(state: GameState): boolean {
  return houseBlockerReason(state) === null;
}

export function buildHouse(state: GameState): void {
  if (!canBuildHouse(state)) return;
  const cost = nextHouseCost(state);
  state.wood -= cost.wood;
  state.stone -= cost.stone;
  state.houses += 1;
  const text = state.houses === 1 ? FIRST_HOUSE_LINE : additionalHouseLine(state.houses);
  state.log.unshift({ year: state.year, text, tone: "good" });
}

// Road tiers — dirt path is cheap and ungated; stone road requires the Long
// House but reaches further. Both are placed on individual tiles, both are
// permanent. Calling buildRoad with kind="stone" upgrades a dirt path.
export function roadCost(kind: RoadType): { wood: number; stone: number } {
  if (kind === "stone") return { wood: STONE_ROAD_COST.wood, stone: STONE_ROAD_COST.stone };
  if (kind === "dirt")  return { wood: DIRT_PATH_COST.wood,  stone: DIRT_PATH_COST.stone  };
  return { wood: 0, stone: 0 };
}

export function canBuildRoad(state: GameState, x: number, y: number, kind: "dirt" | "stone"): boolean {
  if (state.gameOver) return false;
  const t = state.tiles[y][x];
  if (!t.discovered) return false;
  if (t.terrain === "water" || t.terrain === "mountain") return false;
  if (!isInReach(state, x, y)) return false;
  if (kind === "stone" && !state.buildings.long_house) return false;
  // Dirt path: only on bare ground. Stone road: bare ground OR upgrade an
  // existing dirt path on the same tile.
  if (kind === "dirt" && t.roadType !== "none") return false;
  if (kind === "stone" && t.roadType === "stone") return false;
  const cost = roadCost(kind);
  if (state.wood < cost.wood) return false;
  if (state.stone < cost.stone) return false;
  return true;
}

export function buildRoad(state: GameState, x: number, y: number, kind: "dirt" | "stone"): void {
  if (!canBuildRoad(state, x, y, kind)) return;
  const cost = roadCost(kind);
  state.wood -= cost.wood;
  state.stone -= cost.stone;
  const tile = state.tiles[y][x];
  const upgrading = kind === "stone" && tile.roadType === "dirt";
  tile.roadType = kind;
  const text = kind === "stone"
    ? (upgrading
        ? `The dirt path through (${x},${y}) is paved over with cut stone. Wagons will not bog here again.`
        : `A stone road is laid through (${x},${y}) — quarried, dressed, and set deep. It will outlast us.`)
    : `A dirt path is trodden through (${x},${y}). Boots and wheels will keep it open.`;
  state.log.unshift({ year: state.year, text, tone: "good" });
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

export function acceptRefugees(state: GameState): LogEntry {
  const { count, year } = state.pendingRefugees!;
  for (let i = 0; i < count; i++) state.pops.push(makeNewcomerPop());
  applyMorale(state, MORALE_REFUGEE_ACCEPT);
  state.pendingRefugees = null;
  return {
    year,
    text: `The ${count === 1 ? "wanderer is" : `${count} refugees are`} welcomed. They eat with you from this day. (+${count} adult${count === 1 ? "" : "s"}, +${MORALE_REFUGEE_ACCEPT} morale)`,
    tone: "good",
  };
}

export function declineRefugees(state: GameState): LogEntry {
  const { count, year } = state.pendingRefugees!;
  applyMorale(state, MORALE_REFUGEE_REJECT);
  state.pendingRefugees = null;
  return {
    year,
    text: `The ${count === 1 ? "wanderer is" : "wanderers are"} turned away. It weighs on the settlement. (${MORALE_REFUGEE_REJECT} morale)`,
    tone: "bad",
  };
}

export function acceptElderWork(state: GameState): LogEntry {
  state.elderPolicy = "working";
  state.pendingElderDecision = false;
  applyMorale(state, MORALE_ELDER_WORK_CHOICE);
  return {
    year: state.year,
    text: `The elders take up their tools once more — bent-backed but willing. Their hands remember the work. (${MORALE_ELDER_WORK_CHOICE} morale; elders contribute +${ELDER_WORK_FOOD_YIELD} food/year each)`,
    tone: "neutral",
  };
}

export function respectElders(state: GameState): LogEntry {
  state.elderPolicy = "respected";
  state.pendingElderDecision = false;
  applyMorale(state, MORALE_ELDER_RESPECTED_CHOICE);
  return {
    year: state.year,
    text: `The elders set down their burdens. They will teach, counsel, and keep the oral record. Their wisdom is the settlement's inheritance. (+${MORALE_ELDER_RESPECTED_CHOICE} morale)`,
    tone: "good",
  };
}

// Child-labour first-decision handlers. Mirror of the elder pair above.
export function setChildrenWorking(state: GameState): LogEntry {
  state.childPolicy = "working";
  state.pendingChildDecision = false;
  applyMorale(state, MORALE_CHILD_WORK_CHOICE);
  return {
    year: state.year,
    text: `${CHILD_WORK_LINE} (${MORALE_CHILD_WORK_CHOICE} morale; children contribute small floored food/wood yields each year)`,
    tone: "neutral",
  };
}

export function setChildrenFree(state: GameState): LogEntry {
  state.childPolicy = "free";
  state.pendingChildDecision = false;
  applyMorale(state, MORALE_CHILD_FREE_CHOICE);
  return {
    year: state.year,
    text: `${CHILD_FREE_LINE} (+${MORALE_CHILD_FREE_CHOICE} morale)`,
    tone: "good",
  };
}

// Governance-panel toggles. Changing a standing law costs morale on top of the
// destination policy's own delta, in BOTH directions — reversibility must not
// make the choice weightless. Frostpunk's pattern: laws can change, but every
// change carries friction. Without the flat cost the elder law was a free
// morale pump: respected (+5) then working (-3) nets +2 per round trip, so a
// player could sit in the Governance panel clicking back and forth. The
// Frostpunk framing is that every change carries friction — this is that
// friction, and it makes no cycle of flips net-positive.
export function lawChangeDelta(policyDelta: number): number {
  return policyDelta + MORALE_LAW_CHANGE_COST;
}

function moraleNote(delta: number): string {
  return delta >= 0 ? `(+${delta} morale)` : `(${delta} morale)`;
}

export function toggleElderPolicy(state: GameState): LogEntry | null {
  if (state.elderPolicy === null) return null;
  if (state.elderPolicy === "working") {
    state.elderPolicy = "respected";
    const delta = lawChangeDelta(MORALE_ELDER_RESPECTED_CHOICE);
    applyMorale(state, delta);
    return {
      year: state.year,
      text: `${ELDER_FLIP_TO_RESPECT_LINE} ${moraleNote(delta)}`,
      tone: delta >= 0 ? "good" : "neutral",
    };
  }
  state.elderPolicy = "working";
  const delta = lawChangeDelta(MORALE_ELDER_WORK_CHOICE);
  applyMorale(state, delta);
  return {
    year: state.year,
    text: `${ELDER_FLIP_TO_WORK_LINE} ${moraleNote(delta)}`,
    tone: "neutral",
  };
}

export function toggleWorkLevy(state: GameState): LogEntry {
  state.workLevy = !state.workLevy;
  const delta = lawChangeDelta(state.workLevy ? MORALE_WORK_LEVY_ON : MORALE_WORK_LEVY_OFF);
  applyMorale(state, delta);
  return {
    year: state.year,
    text: `${state.workLevy ? LEVY_FLIP_TO_ON_LINE : LEVY_FLIP_TO_OFF_LINE} ${moraleNote(delta)}`,
    tone: delta >= 0 ? "good" : "neutral",
  };
}

// Anata sacrifice — pause-style food-sink event. Fired from events.ts when the
// shrine is built; resolves via these handlers from the modal in ui.ts.
export function acceptAnataSacrifice(state: GameState): LogEntry {
  state.pendingAnataSacrifice = false;
  const offered = Math.min(ANATA_SACRIFICE_FOOD_COST, state.food);
  state.food -= offered;
  applyMorale(state, ANATA_SACRIFICE_MORALE_GAIN);
  return {
    year: state.year,
    text: `The pyres burn with offerings — bread, salt fish, the season's first stores. The settlement gathers in the shrine's shadow and feels her favour. (-${offered} food, +${ANATA_SACRIFICE_MORALE_GAIN} morale)`,
    tone: "good",
  };
}

export function declineAnataSacrifice(state: GameState): LogEntry {
  state.pendingAnataSacrifice = false;
  applyMorale(state, ANATA_SACRIFICE_DECLINE_MORALE);
  return {
    year: state.year,
    text: `The priests are sent away empty-handed. They leave the shrine quietly, but the silence is a kind of judgement. (${ANATA_SACRIFICE_DECLINE_MORALE} morale)`,
    tone: "bad",
  };
}

export function toggleChildPolicy(state: GameState): LogEntry | null {
  if (state.childPolicy === null) return null;
  if (state.childPolicy === "working") {
    state.childPolicy = "free";
    const delta = lawChangeDelta(MORALE_CHILD_FREE_CHOICE);
    applyMorale(state, delta);
    return {
      year: state.year,
      text: `${CHILD_FLIP_TO_FREE_LINE} ${moraleNote(delta)}`,
      tone: delta >= 0 ? "good" : "neutral",
    };
  }
  state.childPolicy = "working";
  const delta = lawChangeDelta(MORALE_CHILD_WORK_CHOICE);
  applyMorale(state, delta);
  return {
    year: state.year,
    text: `${CHILD_FLIP_TO_WORK_LINE} ${moraleNote(delta)}`,
    tone: "neutral",
  };
}

// Town-centre upgrade construction. Same shape as the one-time BUILDINGS API
// (canBuild / build / blockerReason) but stored on state.townUpgrades.
export function townUpgradeBlockerReason(state: GameState, id: TownUpgradeId): string | null {
  if (state.gameOver) return "Game over.";
  if (state.townUpgrades[id]) return "Already built.";
  const def: TownUpgradeDef = TOWN_UPGRADES[id];
  const cost = def.cost;
  const short: string[] = [];
  if ((cost.food ?? 0) > state.food) short.push(`${(cost.food ?? 0) - state.food} food`);
  if ((cost.wood ?? 0) > state.wood) short.push(`${(cost.wood ?? 0) - state.wood} wood`);
  if ((cost.stone ?? 0) > state.stone) short.push(`${(cost.stone ?? 0) - state.stone} stone`);
  if (short.length > 0) return `Short: ${short.join(", ")}.`;
  return null;
}

export function canBuildTownUpgrade(state: GameState, id: TownUpgradeId): boolean {
  return townUpgradeBlockerReason(state, id) === null;
}

export function buildTownUpgrade(state: GameState, id: TownUpgradeId): void {
  if (!canBuildTownUpgrade(state, id)) return;
  const def = TOWN_UPGRADES[id];
  state.food -= def.cost.food ?? 0;
  state.wood -= def.cost.wood ?? 0;
  state.stone -= def.cost.stone ?? 0;
  state.townUpgrades[id] = true;
  state.log.unshift({
    year: state.year,
    text: TOWN_UPGRADE_BUILD_LINE[id],
    tone: "good",
  });
}

// Hide rule for the buildings panel. Gate-blocked buildings (pop, prereq,
// death-trigger) disappear entirely — players were confused by buildings they
// couldn't construct yet. The Long House is the one exception: it's the major
// civic milestone and players need to see it as a goal, even pre-25-pops.
export function isBuildingHidden(state: GameState, id: BuildingId): boolean {
  if (state.buildings[id]) return false;
  if (id === "long_house") return false;
  const reason = buildBlockerReason(state, id);
  if (!reason) return false;
  return reason.startsWith("Requires") || reason.startsWith("Needs");
}

// Building-unlock chronicle hook. Iterates the gated buildings; fires the
// unlock line the year each gate flips from blocked to satisfiable (resource
// shortages don't count — that's not "unlocked," that's "saving up").
function checkBuildingUnlocks(state: GameState, year: number): void {
  const ids: BuildingId[] = ["long_house", "shrine_of_anata", "dock"];
  for (const id of ids) {
    if (state.unlockedBuildings[id]) continue;
    if (state.buildings[id]) {
      state.unlockedBuildings[id] = true;
      continue;
    }
    const reason = buildBlockerReason(state, id);
    const gateBlocked = !!reason && (reason.startsWith("Requires") || reason.startsWith("Needs"));
    if (gateBlocked) continue;
    state.unlockedBuildings[id] = true;
    // Anata already has its own dedicated unlock line (legacy path). Don't
    // double-fire — only emit a generic unlock line for buildings without one.
    if (id === "shrine_of_anata") continue;
    const text = BUILDING_UNLOCK_TEXT[id];
    if (text) state.log.unshift({ year, text, tone: "good" });
  }
}
