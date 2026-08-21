#!/usr/bin/env python3
"""
Isle of Cambrera — bandit camp + militia simulator (v0.10 combat loop).

Third sim in the series. birth_death_curve.py models demographics with the food
gate assumed to pass; food_storage_cap.py models the food economy with no
adversary. This one adds the adversary and asks the two questions the combat
milestone actually rests on:

  1. Does an IGNORED camp threaten a settlement, or is it background noise?
     A threat you can ignore is not a threat, and the whole milestone exists
     because "nothing can hurt me after the first stable harvest" was the #1
     playtest complaint.

  2. Does a militia big enough to matter COST enough to be a real trade?
     Militia are fertile adults not producing. If defence is nearly free the
     loop degenerates into "raise 10 militia, forget bandits exist."

Inherits the hard-won modelling lesson from food_storage_cap.py: a Cambrera
economy sim is only honest with refugee inflow AND the settlement-level food
sources (chickens, garden, houses, elder labour) included. Both were omitted in
early drafts of that sim and every settlement starved or aged out.

Mirrors the shipped pipeline, with step 4.5 inserted:
    0.   age / old-age deaths / refugee arrivals
    1.   yields
    4.   event roll (only the bandit-camp founding is modelled)
    4.5  camp grows, maybe raids            <-- the mechanic under test
    5.   consumption -> famine
    5.5  spoilage
    7.   growth check

FINDINGS (500 trials x 120 years, 2026-08-21, at the shipped v0.10 constants)

  config                          pop   mats   stolen  raid+  sortie+  burned  m-yrs
  no bandits (v0.9 baseline)     55.3     90        0   0.00     0.00    0.00      0
  ignore the camp                10.7     70      895  17.62     0.00    0.00      0
  palisade only                  43.7     78      784  34.50     0.00    0.00      0
  militia, no sortie             43.3     70       27   0.23     0.00    0.00    315
  militia + sortie               54.6     84       42   0.46     8.07    8.00     40
  militia + sortie, no wall      53.9     83      164   0.49     8.19    7.86     40

  Wipe rate: ignore ~55%, every other strategy 0-1%.

  * The threat is real. Doing nothing at all about an armed camp for a century
    kills the settlement in over half of runs — the first genuine loss condition
    outside famine. A palisade alone converts that into a 21% smaller
    settlement, which is the naive-player outcome and is meant to sting, not end
    the run.
  * Defence and offence cost differently, not identically. "Militia, no sortie"
    lands at the same population as "palisade only" but loses almost no food and
    almost nobody (29 stolen, 0.3 deaths vs 784 and 33.9) — it pays in labour
    instead, 313 fertile-adult-years under arms. That is the trade the milestone
    wanted: you can buy safety with work.
  * Only the sortie recovers the baseline. Burning camps costs ~8 lives across a
    long game and returns 54.6 pop against the no-bandits 55.3. Going out to end
    it is the best answer available and it is still paid for in people.
  * Scout discovery barely moves the neglect cases and clearly rewards the
    engaged ones (lifetime theft under militia+sortie falls 87 -> 42): finding
    the camp early only helps a player who intends to do something about it.

TUNING NOTES — two constants were changed because of this sim, not despite it:

  MILITIA_STRENGTH 1 -> 2. At 1:1 a militiaman cancelled 1 strength = ~3 food
  per raid at ~60% raid odds, under 2 food/year, which is less than a farmer
  grows. Partial militia were strictly worse than farmers and only the exact
  repel threshold was worth buying, so the whole middle of the curve was dead.
  At 2 the gradient pays all the way up. This is why "militia, no sortie" went
  from 21.3 pop (worse than the wall) to 43.8.

  BANDIT_SEVERE_* keyed on PRESSURE with a 0.25 chance. Keyed on raw strength
  with certainty, a maxed camp killed roughly every other year forever — 60+
  lifetime deaths and a guaranteed spiral no amount of defence could stop. The
  point of the severe path is escalation the player can answer, so it now scales
  with what the militia have NOT covered, and even then most raids only steal.
"""

import math
import random
import statistics
from dataclasses import dataclass

YEARS = 120
TRIALS = 500
SEED = 42

# ─── shipped constants (types.ts) ─────────────────────────────────────────────
ADULT_AGE = 14
ELDER_AGE = 35
LIFESPAN_RANGE = (35, 55)
STARTER_AGE_RANGE = (15, 22)
STARTER_LIFESPAN_FLOOR_BONUS = 10
STARTER_CHILD_AGE_RANGE = (0, 4)
NEWCOMER_AGE_RANGE = (15, 22)
FOOD_PER_ADULT = 2
FOOD_PER_CHILD = 1
FARMER_BASE_YIELD = 2
FERTILE_GRASS_CHANCE = 0.3
GRANARY_FARMER_BONUS = 0.5
FISHER_MEAN_YIELD = 2.2
HUNTER_YIELD = 3
WOODCUTTER_YIELD = 2
QUARRYMAN_YIELD = 1
INITIAL_HUT_CAPACITY = 25
HOUSE_CAPACITY = 6
HOUSE_FOOD_YIELD = 2
LONG_HOUSE_POP_GATE = 25
GROWTH_FOOD_PER_POP = 3
IDLE_ADULT_BIRTH_CHANCE = 0.05
CHICKEN_CAP = 20
CHICKEN_EGG_FOOD_RATE = 0.5
CHICKEN_GROWTH_RATE = 0.4
CHICKEN_START_FLOCK = 5
COMMUNAL_GARDEN_FOOD = 1
ELDER_WORK_FOOD_YIELD = 0.5
FOOD_STORAGE_BASE = 100
GRANARY_STORAGE_BONUS = 80
HOUSE_STORAGE_BONUS = 10
FOOD_SPOILAGE_RATE = 0.5

NEWCOMER_CHANCE = 6 / 68
NEWCOMER_REFUGEES = 2
SCRIPTED_WAVE_TARGETS = (5, 10, 20, 35)
SCRIPTED_WAVE_JITTER = 3
SCRIPTED_WAVE_REFUGEES = 2
BOAT_VOYAGE_YEARS = 2
BOAT_MEAN_REFUGEES = 1.3

# ─── v0.10 constants under test ───────────────────────────────────────────────
# The bandits event is weight 7 of ~68 unblocked weight, and drops to 0 while a
# camp already stands — so this is the per-year chance of a NEW camp appearing.
BANDIT_EVENT_CHANCE = 7 / 68
BANDIT_CAMP_GROWTH = 1
BANDIT_CAMP_MAX_STRENGTH = 6
BANDIT_RAID_CHANCE_BASE = 0.35
BANDIT_RAID_CHANCE_PER_STRENGTH = 0.05
BANDIT_RAID_CHANCE_CAP = 0.85
BANDIT_THEFT_PER_STRENGTH = 3
BANDIT_THEFT_JITTER = (0, 10)
PALISADE_HOLD_STRENGTH = 3
PALISADE_THEFT_REDUCTION = 0.5
BANDIT_KNOWN_AFTER_RAIDS = 2
# Scouts walking onto the camp's tile is the primary discovery route; the
# raid-tracking fallback is for a charted island. Approximated as a flat annual
# chance, since this sim has no map.
BANDIT_SCOUT_FIND_CHANCE = 0.2
BANDIT_SEVERE_STRENGTH = 5      # compared against PRESSURE, so militia hold it off
BANDIT_SEVERE_CHANCE = 0.25
BANDIT_SEVERE_MAX_KILLS = 2
BANDIT_SEVERE_KILL_DIVISOR = 5
MILITIA_STRENGTH = 2
MILITIA_SORTIE_MIN = 2
SORTIE_LOSS_DIVISOR = 3
SORTIE_LOOT_PER_STRENGTH = 3


@dataclass
class Config:
    name: str
    defence: str               # "ignore" | "palisade" | "militia" | "militia+sortie"
    palisade: bool = False
    bandits: bool = True
    granary: bool = True
    farm_slots: int = 14
    water_slots: int = 8
    forest_slots: int = 8
    stone_slots: int = 4
    # Cap on how much of the fertile workforce may stand under arms. The
    # question this sim exists to answer is what this number costs.
    militia_share: float = 0.35


def food_capacity(cfg: Config, houses: int) -> int:
    return (FOOD_STORAGE_BASE
            + (GRANARY_STORAGE_BONUS if cfg.granary else 0)
            + houses * HOUSE_STORAGE_BONUS)


def roll_lifespan() -> int:
    return random.randint(*LIFESPAN_RANGE)


def make_adult() -> list[int]:
    age = random.randint(*NEWCOMER_AGE_RANGE)
    return [age, max(roll_lifespan(), age + 1)]


def starter_pops() -> list[list[int]]:
    pops = []
    for _ in range(5):
        age = random.randint(*STARTER_AGE_RANGE)
        pops.append([age, max(roll_lifespan(), age + STARTER_LIFESPAN_FLOOR_BONUS)])
    for _ in range(2):
        pops.append([random.randint(*STARTER_CHILD_AGE_RANGE), roll_lifespan()])
    return pops


def wave_years() -> list[int]:
    years, last = [], -99
    for t in SCRIPTED_WAVE_TARGETS:
        y = max(last + 3, t + random.randint(-SCRIPTED_WAVE_JITTER, SCRIPTED_WAVE_JITTER))
        years.append(y)
        last = y
    return years


def kill_defenders(pops: list[list[int]], militia: int, count: int) -> tuple[int, int]:
    """Militia die first — the whole point of standing one. Returns (deaths, militia)."""
    deaths = 0
    for _ in range(count):
        if len(pops) <= 1:
            break
        idx = [i for i, p in enumerate(pops) if ADULT_AGE <= p[0] < ELDER_AGE]
        if not idx:
            break
        pops.pop(random.choice(idx))
        militia = max(0, militia - 1)
        deaths += 1
    return deaths, militia


def simulate(cfg: Config):
    pops = starter_pops()
    waves = wave_years()
    boat_returns = None
    food = 20.0
    materials = 0.0
    houses = 0
    chickens = CHICKEN_START_FLOCK
    militia = 0

    camp = None                # dict(strength, known, raids) or None
    stolen_total = 0.0
    raid_deaths = 0
    sortie_deaths = 0
    camps_burned = 0
    militia_years = 0          # fertile-adult-years spent under arms

    fertility = sorted((1 if random.random() < FERTILE_GRASS_CHANCE else 0
                        for _ in range(cfg.farm_slots)), reverse=True)

    for year in range(YEARS):
        # 0. age + old-age deaths
        for p in pops:
            p[0] += 1
        pops = [p for p in pops if p[0] < p[1]]
        if not pops:
            break

        if year in waves:
            pops += [make_adult() for _ in range(SCRIPTED_WAVE_REFUGEES)]
        elif random.random() < NEWCOMER_CHANCE:
            pops += [make_adult() for _ in range(NEWCOMER_REFUGEES)]
        fertile_now = sum(1 for p in pops if ADULT_AGE <= p[0] < ELDER_AGE)
        if boat_returns is None and fertile_now >= 6:
            boat_returns = year + BOAT_VOYAGE_YEARS
        elif boat_returns is not None and year >= boat_returns:
            found = int(BOAT_MEAN_REFUGEES) + (1 if random.random() < BOAT_MEAN_REFUGEES % 1 else 0)
            pops += [make_adult() for _ in range(found)]
            boat_returns = None

        children = sum(1 for p in pops if p[0] < ADULT_AGE)
        fertile = sum(1 for p in pops if ADULT_AGE <= p[0] < ELDER_AGE)
        elders = sum(1 for p in pops if p[0] >= ELDER_AGE)
        pop = len(pops)
        need = (fertile + elders) * FOOD_PER_ADULT + children * FOOD_PER_CHILD

        # ── militia policy ───────────────────────────────────────────────────
        # A defending player keeps just enough spears to answer the camp, inside
        # a hard share of the workforce. Everything here is a fertile adult NOT
        # farming, which is the cost the sim is measuring.
        if cfg.defence in ("militia", "militia+sortie") and camp and camp["known"]:
            want = math.ceil(camp["strength"] / MILITIA_STRENGTH)
            militia = min(want, max(0, int(fertile * cfg.militia_share)))
        else:
            militia = 0
        militia = min(militia, fertile)
        militia_years += militia

        # ── allocation ───────────────────────────────────────────────────────
        workers = fertile - militia

        def food_from(n_workers: int) -> float:
            gain, left = 0.0, n_workers
            take = min(left, cfg.farm_slots)
            for i in range(take):
                gain += FARMER_BASE_YIELD + fertility[i] + (GRANARY_FARMER_BONUS if cfg.granary else 0)
            left -= take
            take = min(left, cfg.water_slots)
            gain += take * FISHER_MEAN_YIELD
            left -= take
            take = min(left, cfg.forest_slots)
            gain += take * HUNTER_YIELD
            return gain

        food_slots = cfg.farm_slots + cfg.water_slots + cfg.forest_slots
        food_workers = 0
        while food_workers < min(workers, food_slots):
            if food_from(food_workers) + houses * HOUSE_FOOD_YIELD >= need + GROWTH_FOOD_PER_POP:
                break
            food_workers += 1
        food_workers = min(food_workers, max(1, int(workers * 0.75)))
        builders = max(0, workers - food_workers)

        # 1. yields
        gain = food_from(food_workers) + houses * HOUSE_FOOD_YIELD + COMMUNAL_GARDEN_FOOD
        gain += int(elders * ELDER_WORK_FOOD_YIELD)
        if chickens > 0:
            gain += int(chickens * CHICKEN_EGG_FOOD_RATE)
            chickens += max(1, int(chickens * CHICKEN_GROWTH_RATE))
            if chickens > CHICKEN_CAP:
                gain += chickens - CHICKEN_CAP
                chickens = CHICKEN_CAP
        food += int(gain)
        materials += min(builders, cfg.stone_slots) * QUARRYMAN_YIELD \
            + max(0, builders - cfg.stone_slots) * WOODCUTTER_YIELD

        # 4. event roll — only the camp founding is modelled
        if cfg.bandits and camp is None and random.random() < BANDIT_EVENT_CHANCE:
            camp = {"strength": 1, "known": False, "raids": 0, "founded": year}

        # 4.5 camp grows, maybe raids
        if camp and not camp["known"] and random.random() < BANDIT_SCOUT_FIND_CHANCE:
            camp["known"] = True
        if camp and camp["founded"] != year:
            camp["strength"] = min(camp["strength"] + BANDIT_CAMP_GROWTH, BANDIT_CAMP_MAX_STRENGTH)
            chance = min(BANDIT_RAID_CHANCE_BASE + camp["strength"] * BANDIT_RAID_CHANCE_PER_STRENGTH,
                         BANDIT_RAID_CHANCE_CAP)
            if random.random() < chance:
                camp["raids"] += 1
                if camp["raids"] >= BANDIT_KNOWN_AFTER_RAIDS:
                    camp["known"] = True
                blocked = cfg.palisade and camp["strength"] <= PALISADE_HOLD_STRENGTH
                if not blocked and militia * MILITIA_STRENGTH < camp["strength"]:
                    pressure = camp["strength"] - militia * MILITIA_STRENGTH
                    want = pressure * BANDIT_THEFT_PER_STRENGTH + random.randint(*BANDIT_THEFT_JITTER)
                    if cfg.palisade:
                        want = int(want * PALISADE_THEFT_REDUCTION)
                    took = min(want, food)
                    food -= took
                    stolen_total += took
                    if (camp["known"] and pressure >= BANDIT_SEVERE_STRENGTH
                            and random.random() < BANDIT_SEVERE_CHANCE):
                        toll = min(math.ceil(pressure / BANDIT_SEVERE_KILL_DIVISOR),
                                   BANDIT_SEVERE_MAX_KILLS)
                        d, militia = kill_defenders(pops, militia, toll)
                        raid_deaths += d
                        if not pops:
                            break

            # the player's own move, resolved the same year
            if (cfg.defence == "militia+sortie" and camp and camp["known"]
                    and militia >= MILITIA_SORTIE_MIN):
                if random.random() < (militia * MILITIA_STRENGTH) / (militia * MILITIA_STRENGTH + camp["strength"]):
                    food += camp["strength"] * SORTIE_LOOT_PER_STRENGTH
                    camps_burned += 1
                    camp = None
                else:
                    losses = random.randint(1, max(1, math.ceil(militia / SORTIE_LOSS_DIVISOR)))
                    d, militia = kill_defenders(pops, militia, losses)
                    sortie_deaths += d
                    camp["strength"] = max(1, camp["strength"] - 1)
                    if not pops:
                        break

        # 5. consumption -> famine (youngest first)
        food -= need
        if food < 0:
            shortfall, food = -food, 0.0
            pops.sort(key=lambda p: p[0])
            while shortfall > 0 and pops:
                v = pops.pop(0)
                shortfall -= FOOD_PER_ADULT if v[0] >= ADULT_AGE else FOOD_PER_CHILD
            if not pops:
                break

        # 5.5 spoilage
        cap = food_capacity(cfg, houses)
        if food > cap:
            food -= int((food - cap) * FOOD_SPOILAGE_RATE)

        # 7. growth
        pop = len(pops)
        pop_cap = INITIAL_HUT_CAPACITY + houses * HOUSE_CAPACITY
        if 0 < pop < pop_cap and food >= pop * GROWTH_FOOD_PER_POP:
            pops.append([0, roll_lifespan()])
            if random.random() < min(1.0, builders * IDLE_ADULT_BIRTH_CHANCE) and len(pops) < pop_cap:
                pops.append([0, roll_lifespan()])

        if pop >= LONG_HOUSE_POP_GATE and materials >= 40 + houses * 15:
            materials -= 40 + houses * 15
            houses += 1

    return {
        "final_pop": len(pops),
        "materials": materials,
        "stolen": stolen_total,
        "raid_deaths": raid_deaths,
        "sortie_deaths": sortie_deaths,
        "camps_burned": camps_burned,
        "militia_years": militia_years,
        "end_strength": camp["strength"] if camp else 0,
    }


CONFIGS = [
    Config("no bandits (v0.9 baseline)", "ignore", bandits=False),
    Config("ignore the camp",            "ignore"),
    Config("palisade only",              "palisade", palisade=True),
    Config("militia, no sortie",         "militia",  palisade=True),
    Config("militia + sortie",           "militia+sortie", palisade=True),
    Config("militia + sortie, no wall",  "militia+sortie", palisade=False),
]


def main() -> None:
    print(f"Trials: {TRIALS}   Years: {YEARS}\n")
    hdr = (f"{'config':<30} {'pop':>6} {'mats':>7} {'stolen':>8} "
           f"{'raid+':>6} {'sortie+':>8} {'burned':>7} {'m-yrs':>6}")
    print(hdr)
    print("-" * len(hdr))
    for cfg in CONFIGS:
        random.seed(SEED)
        rows = [simulate(cfg) for _ in range(TRIALS)]
        m = lambda k: statistics.mean(r[k] for r in rows)
        print(f"{cfg.name:<30} {m('final_pop'):>6.1f} {m('materials'):>7.0f} "
              f"{m('stolen'):>8.0f} {m('raid_deaths'):>6.2f} {m('sortie_deaths'):>8.2f} "
              f"{m('camps_burned'):>7.2f} {m('militia_years'):>6.0f}")
    print("\npop/mats = final population and pooled wood+stone; stolen = lifetime food lost to")
    print("raids; raid+/sortie+ = lifetime deaths; m-yrs = fertile-adult-years spent under arms.")


if __name__ == "__main__":
    main()
