#!/usr/bin/env python3
"""
Isle of Cambrera — birth/death curve simulator.

Monte Carlo demographic model. Runs multiple scenarios side-by-side so we can
compare birth/death curves under different rules before committing to game-code
changes.

Food and morale gates are ASSUMED to pass every turn (optimistic ceiling).
Random events, scripted refugee waves, famine, and bandit deaths are OFF —
the question is purely "does the birth rule sustain growth against old-age
deaths alone?"

Three age phases:
  child  (0            .. adult_age)   eats 1, no work, no fertility
  adult  (adult_age    .. elder_age)   eats 2, works, fertile
  elder  (elder_age    .. lifespan)    eats 2, no work, no fertility

Set elder_age >= lifespan_max to disable the elder phase (matches shipped game).
"""

import csv
import random
import statistics
from dataclasses import dataclass, field
from pathlib import Path

YEARS = 200
TRIALS = 500
SEED = None
MAX_POP_SAFETY = 2000


@dataclass
class Scenario:
    name: str
    adult_age: int
    elder_age: int
    lifespan_min: int
    lifespan_max: int
    starter_adult_age_min: int
    starter_adult_age_max: int
    starter_lifespan_floor_bonus: int
    starter_child_age_min: int
    starter_child_age_max: int
    starter_adults: int = 5
    starter_children: int = 2
    birth_rule: str = "fixed"  # "fixed" | "fixed_plus_idle"
    idle_fraction: float = 0.20
    idle_per_bonus: int = 3
    require_fertile_for_birth: bool = True


SCENARIOS = [
    Scenario(
        name="shipped",
        adult_age=4, elder_age=999,
        lifespan_min=10, lifespan_max=15,
        starter_adult_age_min=4, starter_adult_age_max=7,
        starter_lifespan_floor_bonus=6,
        starter_child_age_min=0, starter_child_age_max=2,
        birth_rule="fixed",
    ),
    Scenario(
        name="long_lifespan",
        adult_age=14, elder_age=25,
        lifespan_min=25, lifespan_max=40,
        starter_adult_age_min=15, starter_adult_age_max=22,
        starter_lifespan_floor_bonus=10,
        starter_child_age_min=0, starter_child_age_max=4,
        birth_rule="fixed",
    ),
    Scenario(
        name="long_lifespan_idle_bonus",
        adult_age=14, elder_age=25,
        lifespan_min=25, lifespan_max=40,
        starter_adult_age_min=15, starter_adult_age_max=22,
        starter_lifespan_floor_bonus=10,
        starter_child_age_min=0, starter_child_age_max=4,
        birth_rule="fixed_plus_idle",
        idle_fraction=0.20,
        idle_per_bonus=4,
    ),
]


def roll_lifespan(s: Scenario) -> int:
    return random.randint(s.lifespan_min, s.lifespan_max)


def starter_pops(s: Scenario) -> list[list[int]]:
    pops: list[list[int]] = []
    for _ in range(s.starter_adults):
        age = random.randint(s.starter_adult_age_min, s.starter_adult_age_max)
        lifespan = max(roll_lifespan(s), age + s.starter_lifespan_floor_bonus)
        pops.append([age, lifespan])
    for _ in range(s.starter_children):
        age = random.randint(s.starter_child_age_min, s.starter_child_age_max)
        pops.append([age, roll_lifespan(s)])
    return pops


def births_this_year(s: Scenario, fertile_adults: int) -> int:
    if s.require_fertile_for_birth and fertile_adults == 0:
        return 0
    if s.birth_rule == "fixed":
        return 1
    if s.birth_rule == "fixed_plus_idle":
        idle = fertile_adults * s.idle_fraction
        expected_extras = idle / s.idle_per_bonus
        full = int(expected_extras)
        frac = expected_extras - full
        extras = full + (1 if random.random() < frac else 0)
        return 1 + extras
    raise ValueError(f"unknown birth_rule {s.birth_rule!r}")


def simulate(s: Scenario, years: int):
    pops = starter_pops(s)
    pop_series, adult_series, child_series, elder_series = [], [], [], []
    birth_series, death_series = [], []

    for _ in range(years):
        for p in pops:
            p[0] += 1
        before = len(pops)
        pops = [p for p in pops if p[0] < p[1]]
        deaths = before - len(pops)

        fertile = sum(1 for p in pops if s.adult_age <= p[0] < s.elder_age)
        births = births_this_year(s, fertile) if len(pops) < MAX_POP_SAFETY else 0
        for _b in range(births):
            pops.append([0, roll_lifespan(s)])

        adults = sum(1 for p in pops if s.adult_age <= p[0] < s.elder_age)
        children = sum(1 for p in pops if p[0] < s.adult_age)
        elders = sum(1 for p in pops if p[0] >= s.elder_age)
        pop_series.append(len(pops))
        adult_series.append(adults)
        child_series.append(children)
        elder_series.append(elders)
        birth_series.append(births)
        death_series.append(deaths)

    return pop_series, adult_series, child_series, elder_series, birth_series, death_series


def percentile(xs: list[float], p: float) -> float:
    xs = sorted(xs)
    if not xs:
        return 0.0
    k = (len(xs) - 1) * p
    f = int(k)
    c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def ascii_chart(series: dict[str, list[float]], width: int = 70, height: int = 18,
                y_min: float | None = None, y_max: float | None = None) -> str:
    all_vals = [v for s in series.values() for v in s]
    lo = y_min if y_min is not None else min(all_vals)
    hi = y_max if y_max is not None else max(all_vals)
    if hi == lo:
        hi = lo + 1

    n = max(len(s) for s in series.values())
    step = max(1, n // width)

    markers = {
        "shipped": "s",
        "long_lifespan": "L",
        "long_lifespan_idle_bonus": "I",
    }

    rows = []
    rows.append("Legend: s = shipped   L = long_lifespan   I = long_lifespan_idle_bonus   * = overlap")
    for r in range(height, 0, -1):
        threshold = lo + (hi - lo) * r / height
        line = f"{threshold:6.1f} |"
        for col in range(0, min(n, width * step), step):
            glyphs: list[str] = []
            for name, vals in series.items():
                v = vals[col] if col < len(vals) else 0
                prev_thr = lo + (hi - lo) * (r - 1) / height
                if prev_thr < v <= threshold:
                    glyphs.append(markers.get(name, "?"))
            if len(glyphs) == 0:
                line += " "
            elif len(glyphs) == 1:
                line += glyphs[0]
            else:
                line += "*"
        rows.append(line)
    rows.append("       +" + "-" * min(n, width))
    rows.append(f"       0 {'':<{min(n, width) - 10}} {n} yrs")
    return "\n".join(rows)


def run_scenario(s: Scenario):
    pop_by_year: list[list[int]] = [[] for _ in range(YEARS)]
    adult_by_year: list[list[int]] = [[] for _ in range(YEARS)]
    child_by_year: list[list[int]] = [[] for _ in range(YEARS)]
    elder_by_year: list[list[int]] = [[] for _ in range(YEARS)]
    birth_by_year: list[list[int]] = [[] for _ in range(YEARS)]
    death_by_year: list[list[int]] = [[] for _ in range(YEARS)]
    trial_final: list[int] = []
    extinction = 0
    year_to_25: list[int] = []

    for _ in range(TRIALS):
        pop, adult, child, elder, birth, death = simulate(s, YEARS)
        if any(v == 0 for v in pop):
            extinction += 1
        trial_final.append(pop[-1])
        hit_25 = next((y for y, v in enumerate(pop) if v >= 25), None)
        if hit_25 is not None:
            year_to_25.append(hit_25)
        for y in range(YEARS):
            pop_by_year[y].append(pop[y])
            adult_by_year[y].append(adult[y])
            child_by_year[y].append(child[y])
            elder_by_year[y].append(elder[y])
            birth_by_year[y].append(birth[y])
            death_by_year[y].append(death[y])

    mean_pop = [statistics.mean(pop_by_year[y]) for y in range(YEARS)]
    median_pop = [statistics.median(pop_by_year[y]) for y in range(YEARS)]
    p10_pop = [percentile(pop_by_year[y], 0.10) for y in range(YEARS)]
    p90_pop = [percentile(pop_by_year[y], 0.90) for y in range(YEARS)]
    mean_adults = [statistics.mean(adult_by_year[y]) for y in range(YEARS)]
    mean_children = [statistics.mean(child_by_year[y]) for y in range(YEARS)]
    mean_elders = [statistics.mean(elder_by_year[y]) for y in range(YEARS)]
    mean_births = [statistics.mean(birth_by_year[y]) for y in range(YEARS)]
    mean_deaths = [statistics.mean(death_by_year[y]) for y in range(YEARS)]

    tail_start = YEARS // 2
    tail = [v for y in range(tail_start, YEARS) for v in pop_by_year[y]]
    trials_reach_25 = sum(1 for p in pop_by_year[YEARS - 1] if p >= 25)  # placeholder — but year_to_25 is the real one

    return {
        "scenario": s,
        "mean_pop": mean_pop,
        "median_pop": median_pop,
        "p10_pop": p10_pop,
        "p90_pop": p90_pop,
        "mean_adults": mean_adults,
        "mean_children": mean_children,
        "mean_elders": mean_elders,
        "mean_births": mean_births,
        "mean_deaths": mean_deaths,
        "tail_mean": statistics.mean(tail),
        "tail_median": statistics.median(tail),
        "tail_stdev": statistics.stdev(tail) if len(tail) > 1 else 0,
        "tail_p10": percentile(tail, 0.10),
        "tail_p90": percentile(tail, 0.90),
        "tail_min": min(tail),
        "tail_max": max(tail),
        "extinction": extinction,
        "final_mean": statistics.mean(trial_final),
        "final_median": statistics.median(trial_final),
        "year_to_25": year_to_25,
        "trials_ever_hit_25": len(year_to_25),
    }


def main() -> None:
    if SEED is not None:
        random.seed(SEED)

    print(f"Trials per scenario: {TRIALS}    Years: {YEARS}")
    print(f"Food / morale gate: assumed to pass (optimistic demographic ceiling)")
    print()

    results = []
    for s in SCENARIOS:
        random.seed(SEED if SEED is not None else 42)  # same seed across scenarios for cleaner comparison
        r = run_scenario(s)
        results.append(r)

    print(f"{'scenario':<30} {'lifespan':<10} {'birth rule':<24} {'steady mean':<12} {'p10-p90':<10} {'never 25?':<10} {'first 25':<10}")
    print("-" * 120)
    for r in results:
        s = r["scenario"]
        lifespan = f"[{s.lifespan_min},{s.lifespan_max}]"
        rule = s.birth_rule
        if rule == "fixed_plus_idle":
            rule = f"fixed+idle/{s.idle_per_bonus}({int(s.idle_fraction*100)}%)"
        reach = r["trials_ever_hit_25"]
        never = TRIALS - reach
        first25 = f"y{statistics.median(r['year_to_25']):.0f}" if r["year_to_25"] else "—"
        p_range = f"{r['tail_p10']:.0f}-{r['tail_p90']:.0f}"
        print(f"{s.name:<30} {lifespan:<10} {rule:<24} {r['tail_mean']:<12.2f} {p_range:<10} {never:<10} {first25:<10}")
    print()

    all_means = {r["scenario"].name: r["mean_pop"] for r in results}
    y_max = max(max(v) for v in all_means.values()) * 1.1
    print("Mean population trajectory (all three scenarios overlaid)")
    print(ascii_chart(all_means, y_min=0, y_max=y_max))
    print()

    for r in results:
        s = r["scenario"]
        print(f"--- {s.name} ---")
        print(f"  lifespan [{s.lifespan_min},{s.lifespan_max}] (mean {(s.lifespan_min+s.lifespan_max)/2:.1f})"
              f"  |  child<{s.adult_age}  adult<{s.elder_age}  elder<lifespan")
        print(f"  birth rule: {s.birth_rule}"
              + (f" (base 1 + idle/{s.idle_per_bonus}, idle = {int(s.idle_fraction*100)}% of fertile)"
                 if s.birth_rule == "fixed_plus_idle" else " (+1/year)"))
        print(f"  steady state (y{YEARS//2}-{YEARS-1}): mean {r['tail_mean']:.2f}, "
              f"median {r['tail_median']:.0f}, p10-p90 {r['tail_p10']:.0f}-{r['tail_p90']:.0f}, "
              f"range {r['tail_min']}-{r['tail_max']}")
        print(f"  extinctions: {r['extinction']}/{TRIALS}")
        print(f"  reached 25 pops: {r['trials_ever_hit_25']}/{TRIALS}"
              + (f"  (median first hit: year {statistics.median(r['year_to_25']):.0f})"
                 if r['year_to_25'] else ""))
        if s.elder_age < s.lifespan_max:
            tail_adults = statistics.mean(r["mean_adults"][YEARS//2:])
            tail_children = statistics.mean(r["mean_children"][YEARS//2:])
            tail_elders = statistics.mean(r["mean_elders"][YEARS//2:])
            total = tail_adults + tail_children + tail_elders
            print(f"  phase mix (steady): "
                  f"{100*tail_children/total:.0f}% child, "
                  f"{100*tail_adults/total:.0f}% adult, "
                  f"{100*tail_elders/total:.0f}% elder")
        print()

    for r in results:
        out = Path(__file__).parent / f"birth_death_{r['scenario'].name}.csv"
        with out.open("w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["year", "mean_pop", "median_pop", "p10_pop", "p90_pop",
                        "mean_children", "mean_adults", "mean_elders",
                        "mean_births", "mean_deaths"])
            for y in range(YEARS):
                w.writerow([y, f"{r['mean_pop'][y]:.3f}", f"{r['median_pop'][y]:.3f}",
                            f"{r['p10_pop'][y]:.3f}", f"{r['p90_pop'][y]:.3f}",
                            f"{r['mean_children'][y]:.3f}", f"{r['mean_adults'][y]:.3f}",
                            f"{r['mean_elders'][y]:.3f}",
                            f"{r['mean_births'][y]:.3f}", f"{r['mean_deaths'][y]:.3f}"])
        print(f"CSV: {out.name}")


if __name__ == "__main__":
    main()
