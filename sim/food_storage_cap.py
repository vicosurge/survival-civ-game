#!/usr/bin/env python3
"""
Isle of Cambrera — food storage cap + spoilage simulator.

Companion to birth_death_curve.py, which models demographics with the food gate
ASSUMED to pass. This one asks the opposite question: once food has a storage
capacity and the overflow spoils, does the settlement still clear the growth
gate (food >= pop * 3), and does the mechanic actually bite the "shove everyone
at food and bank it" strategy the May 2026 playtester described?

Mirrors the shipped turn.ts pipeline order:
    0.  age / old-age deaths / refugee arrivals
    1.  yields   (farmers, fishers, hunters, houses, elder + child labour)
    5.  consumption -> famine (youngest first)
    5.5 spoilage         <-- the mechanic under test
    7.  growth check

Key property under test: spoilage takes a FRACTION of the overflow, not all of
it. The fixed point of  X <- (X + surplus) * (1 - rate)  is
  X = surplus * (1 - rate) / rate,
so the store settles at cap + one year's surplus at rate 0.5 — a soft ceiling,
never a hard clamp at cap. Whether that leaves headroom over pop*3 is the
safety question, and the strict worst case is a settlement running ZERO
surplus, where the store sits exactly at cap.

FINDINGS (500 trials x 120 years, 2026-08-19)

  config                                 final pop   peak food   spoil/yr   materials
  hoarder,  granary, NO spoilage (today)      26.4        1717        0.0           1
  hoarder,  granary, spoilage                 26.4         187       12.9           1
  balanced, granary, spoilage                 55.9         222        0.7          89

  * The 1717 peak food on the no-spoilage line IS the playtester complaint,
    quantified: shove everyone at food, bank seventeen hundred food, finish
    with 26 pops and one unit of material. Nothing to spend it on, nothing
    gained by having it.
  * With spoilage the hoarder's stockpile collapses 1717 -> 187 and they still
    finish at 26 pops. Hoarding stops paying.
  * The balanced player finishes at 56 pops with 89 materials and spoils almost
    nothing (0.7/yr). The mechanic separates the two strategies by 2x final pop
    without touching farmer yield.

  Storage base is a SAFETY knob, not a strength knob: 80 / 100 / 120 all give
  the same hoarder-vs-balanced separation (26.4 vs ~55). Base 100 is chosen
  because it is the smallest value where every zero-surplus (pop, granary,
  houses) combination still clears the pop*3 growth gate; base 80 blocks
  pop 31 / no granary / 1 house.

  Spoilage RATE barely moves spoil/yr (12.5 at 0.25, 12.8 at 0.75) — at
  equilibrium ALL of the surplus spoils regardless of rate; the rate only sets
  how far above cap the store settles (surplus*(1-rate)/rate). So the rate is the soft cosmetic knob and the cap
  is what does the work. Tune the rate, not the cap, if testers find it harsh.
"""

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
FISHER_MEAN_YIELD = 2.2       # [1,3] base, [2,4] on the 20% rich tiles
HUNTER_YIELD = 3              # drains tile reserve; net +1 over a farmer
WOODCUTTER_YIELD = 2
QUARRYMAN_YIELD = 1
INITIAL_HUT_CAPACITY = 25
HOUSE_CAPACITY = 6
HOUSE_FOOD_YIELD = 2
LONG_HOUSE_POP_GATE = 25
GROWTH_FOOD_PER_POP = 3
IDLE_ADULT_BIRTH_CHANCE = 0.05
# Settlement-level food that needs no worker — these are what let a real
# settlement bank a surplus, and their absence is why an earlier draft of this
# sim starved every trial.
CHICKEN_CAP = 20
CHICKEN_EGG_FOOD_RATE = 0.5
CHICKEN_GROWTH_RATE = 0.4
CHICKEN_START_FLOCK = 5
COMMUNAL_GARDEN_FOOD = 1
ELDER_WORK_FOOD_YIELD = 0.5
CHILD_WORK_FOOD_YIELD = 0.5

# Refugee inflow is the real engine of early growth — a 7-pop starter band
# left alone simply ages out. newcomers is weight 6 of the ~68 unblocked
# weight in EVENTS and brings 2 adults; scripted waves bring 2 apiece.
NEWCOMER_CHANCE = 6 / 68
NEWCOMER_REFUGEES = 2
SCRIPTED_WAVE_TARGETS = (5, 10, 20, 35)
SCRIPTED_WAVE_JITTER = 3
SCRIPTED_WAVE_REFUGEES = 2
BOAT_VOYAGE_YEARS = 2
BOAT_MEAN_REFUGEES = 1.3      # weights [2,4,3,1] over 0/1/2/3 finds

# ─── proposed constants (under test) ──────────────────────────────────────────
FOOD_STORAGE_BASE = 100
GRANARY_STORAGE_BONUS = 80
HOUSE_STORAGE_BONUS = 10
FOOD_SPOILAGE_RATE = 0.5


@dataclass
class Config:
    name: str
    strategy: str              # "hoarder" | "balanced"
    granary: bool
    spoilage: bool
    storage_base: int = FOOD_STORAGE_BASE
    spoilage_rate: float = FOOD_SPOILAGE_RATE
    farm_slots: int = 14       # workable grass in reach
    water_slots: int = 8       # beach + river capacity
    forest_slots: int = 8      # hunter slots (woodcutters share the tile)
    stone_slots: int = 4
    coop: bool = True          # chicken coop is cheap (5w 3s) — assume it gets built
    garden: bool = True        # communal garden likewise (5f 5w)
    elders_work: bool = True
    children_work: bool = False


def food_capacity(cfg: Config, houses: int) -> int:
    return (cfg.storage_base
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


def simulate(cfg: Config):
    pops = starter_pops()
    waves = wave_years()
    boat_returns = None
    food = 20.0
    materials = 0.0            # wood + stone pooled — this sim tracks the total
    houses = 0
    chickens = CHICKEN_START_FLOCK if cfg.coop else 0
    spoiled_total = 0.0
    year_hit_gate = None
    peak_food = 0.0

    fertility = sorted((1 if random.random() < FERTILE_GRASS_CHANCE else 0
                        for _ in range(cfg.farm_slots)), reverse=True)

    for year in range(YEARS):
        # 0. age + old-age deaths
        for p in pops:
            p[0] += 1
        pops = [p for p in pops if p[0] < p[1]]
        if not pops:
            break

        # refugee inflow
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
        adults = fertile + elders
        need = adults * FOOD_PER_ADULT + children * FOOD_PER_CHILD

        if year_hit_gate is None and pop >= LONG_HOUSE_POP_GATE:
            year_hit_gate = year

        # ── allocation ───────────────────────────────────────────────────────
        # Food jobs are filled best-first: farms, then water, then hunting.
        def food_from(n_workers: int) -> tuple[float, int]:
            """Yield from putting n_workers on food jobs, best slots first."""
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
            left -= take
            return gain, left

        food_slots = cfg.farm_slots + cfg.water_slots + cfg.forest_slots
        if cfg.strategy == "hoarder":
            # The tester's strategy: shove everyone at food.
            food_workers = min(fertile, food_slots)
        else:
            # Cover consumption plus a growth buffer, then go build things.
            food_workers = 0
            while food_workers < min(fertile, food_slots):
                g, _ = food_from(food_workers)
                if g + houses * HOUSE_FOOD_YIELD >= need + GROWTH_FOOD_PER_POP:
                    break
                food_workers += 1
        if cfg.strategy == "balanced":
            # Never starve the build economy completely — a real player keeps
            # roughly a quarter of their hands on wood and stone.
            food_workers = min(food_workers, max(1, int(fertile * 0.75)))
        builders = max(0, fertile - food_workers)

        # 1. yields
        gain, _ = food_from(food_workers)
        gain += houses * HOUSE_FOOD_YIELD
        if cfg.garden:
            gain += COMMUNAL_GARDEN_FOOD
        if cfg.elders_work:
            gain += int(elders * ELDER_WORK_FOOD_YIELD)
        if cfg.children_work:
            gain += int(children * CHILD_WORK_FOOD_YIELD)
        if chickens > 0:
            gain += int(chickens * CHICKEN_EGG_FOOD_RATE)
            chickens += max(1, int(chickens * CHICKEN_GROWTH_RATE))
            if chickens > CHICKEN_CAP:
                gain += chickens - CHICKEN_CAP     # auto-cull, 1 food/bird
                chickens = CHICKEN_CAP
        food += int(gain)
        materials += min(builders, cfg.stone_slots) * QUARRYMAN_YIELD \
            + max(0, builders - cfg.stone_slots) * WOODCUTTER_YIELD

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

        # 5.5 spoilage — the mechanic under test
        if cfg.spoilage:
            cap = food_capacity(cfg, houses)
            if food > cap:
                lost = int((food - cap) * cfg.spoilage_rate)
                food -= lost
                spoiled_total += lost
        peak_food = max(peak_food, food)

        # 7. growth
        pop = len(pops)
        pop_cap = INITIAL_HUT_CAPACITY + houses * HOUSE_CAPACITY
        if 0 < pop < pop_cap and food >= pop * GROWTH_FOOD_PER_POP:
            pops.append([0, roll_lifespan()])
            if random.random() < min(1.0, builders * IDLE_ADULT_BIRTH_CHANCE) and len(pops) < pop_cap:
                pops.append([0, roll_lifespan()])

        # houses go up past the Long House gate as materials allow
        if pop >= LONG_HOUSE_POP_GATE and materials >= 40 + houses * 15:
            materials -= 40 + houses * 15
            houses += 1

    return {
        "final_pop": len(pops),
        "hit_gate": year_hit_gate,
        "spoiled": spoiled_total,
        "materials": materials,
        "houses": houses,
        "peak_food": peak_food,
    }


CONFIGS = [
    Config("hoarder,  granary, NO spoilage (today)", "hoarder",  granary=True,  spoilage=False),
    Config("hoarder,  granary, spoilage",            "hoarder",  granary=True,  spoilage=True),
    Config("balanced, granary, spoilage",            "balanced", granary=True,  spoilage=True),
    Config("hoarder,  no granary, spoilage",         "hoarder",  granary=False, spoilage=True),
    Config("balanced, no granary, spoilage",         "balanced", granary=False, spoilage=True),
]


def main() -> None:
    print(f"Trials: {TRIALS}   Years: {YEARS}")
    print(f"Proposed: base {FOOD_STORAGE_BASE}, granary +{GRANARY_STORAGE_BONUS}, "
          f"house +{HOUSE_STORAGE_BONUS}, spoilage {FOOD_SPOILAGE_RATE:.0%} of overflow")
    print()
    print(f"{'config':<36} {'reach 25':<9} {'med yr':<8} {'final pop':<10} "
          f"{'peak food':<10} {'spoil/yr':<9} {'materials':<9}")
    print("-" * 94)

    for cfg in CONFIGS:
        random.seed(SEED)
        rows = [simulate(cfg) for _ in range(TRIALS)]
        reached = [r for r in rows if r["hit_gate"] is not None]
        pct = 100 * len(reached) / TRIALS
        med = f"y{statistics.median([r['hit_gate'] for r in reached]):.0f}" if reached else "—"
        print(f"{cfg.name:<36} {pct:>5.0f}%   {med:<8} "
              f"{statistics.mean([r['final_pop'] for r in rows]):<10.1f} "
              f"{statistics.mean([r['peak_food'] for r in rows]):<10.0f} "
              f"{statistics.mean([r['spoiled'] for r in rows]) / YEARS:<9.1f} "
              f"{statistics.mean([r['materials'] for r in rows]):<9.0f}")

    print()
    print("Growth-gate headroom — worst case is a settlement running ZERO surplus,")
    print("where food sits exactly at cap. Spoilage takes only part of the overflow,")
    print("so any real surplus S settles at cap + S*(1-rate)/rate (= cap + S at rate 0.5).")
    print()
    print(f"{'pop':<6} {'granary':<9} {'houses':<8} {'needs':<8} {'cap':<7} "
          f"{'@0 surplus':<12} {'@+10/yr':<10}")
    print("-" * 66)
    for pop, granary, houses in [(25, False, 0), (25, True, 0), (31, False, 1),
                                 (31, True, 1), (43, True, 3), (49, True, 4)]:
        cfg = Config("x", "balanced", granary=granary, spoilage=True)
        cap = food_capacity(cfg, houses)
        needs = pop * GROWTH_FOOD_PER_POP
        eq = cap + 10 * (1 - FOOD_SPOILAGE_RATE) / FOOD_SPOILAGE_RATE
        print(f"{pop:<6} {str(granary):<9} {houses:<8} {needs:<8} {cap:<7} "
              f"{('ok' if cap >= needs else 'BLOCKED'):<12} {('ok' if eq >= needs else 'BLOCKED'):<10}")


if __name__ == "__main__":
    main()
