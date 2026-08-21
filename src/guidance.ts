// Early-game guidance — the "direction" half of the onboarding answer (v0.10.1).
//
// The May 2026 playtester wrote: "the game throws way too many options at you
// out the gate... I dont really know what it lacks", and then played a fine
// second run. That is a priority problem, not a comprehension one — the help
// modal and the job tooltips already answer "what does a fisher do". What was
// missing is "which of these sixteen controls matters this year".
//
// So: one line at a time, naming one thing to do, retired for good by the time
// the Long House stands. This file owns *when* a step is shown; the JSON owns
// *what it says*; ui.ts owns how it looks — same split as cutscenes.ts.

import guidanceData from "./content/guidance.json";
import type { GameState } from "./types";

export interface GuidanceStep {
  title: string;
  body: string;
}

type GuidanceId = "first_year" | "first_building" | "find_stone" | "toward_long_house";

const STEPS: Record<GuidanceId, GuidanceStep> = guidanceData;

interface GuidanceTrigger {
  id: GuidanceId;
  done: (state: GameState) => boolean;
  from: number;              // first year this step may appear
  until: number;             // last year it may appear; Infinity for the closer
}

// Declarative step table, the same shape as TRIGGERS in cutscenes.ts: the
// current hint is the first row that is neither done nor past its window.
// Adding a step is one row plus a JSON entry — nothing in the turn pipeline or
// the UI knows the list exists.
//
// EVERY `done` PREDICATE MUST BE MONOTONIC. This is the constraint the whole
// design rests on. Guidance holds no state on GameState — it is derived fresh
// on each render — which is what lets this milestone ship without a SAVE_KEY
// bump. The price is that a predicate which can go back to false would bring a
// year-1 hint back in year 40: `idleCount(state) === 0` reverses the moment an
// adult dies, `pops.length >= 25` reverses in a famine. Year, discovery, and
// built-flags never reverse. Check any new row against that before adding one.
//
// THE WINDOWS ARE NOT DECORATION. Without them a step that is never completed
// blocks every later step forever: a player who simply never builds anything
// sat on the "build something" hint for the entire game and was never shown the
// stone hint — on the two landings where stone is NOT visible at turn 1, which
// is precisely where the original tester got stuck. A step stands down when its
// window closes whether or not the player did the thing. Windows also bound the
// nag: no line can follow you for more than a few years.
const TRIGGERS: GuidanceTrigger[] = [
  { id: "first_year", from: 1, until: 1, done: (s) => s.year > 1 },
  {
    id: "first_building",
    from: 2,
    until: 8,
    done: (s) =>
      Object.values(s.buildings).some(Boolean) ||
      Object.values(s.townUpgrades).some(Boolean) ||
      s.houses > 0,
  },
  {
    id: "find_stone",
    from: 2,
    until: 25,
    // Discovery is permanent, so this never un-satisfies. Deliberately keyed on
    // *seeing* stone rather than on reaching or working it: the point of the
    // step is to send the scout, and it should stand down the moment it worked.
    done: (s) => s.tiles.some((row) => row.some((t) => t.discovered && t.terrain === "stone")),
  },
  // from:2, not later — the windows must leave no gap, or a player who has
  // already done everything gets a silent stretch and then a hint appearing out
  // of nowhere. Years 1 and 2+ are covered end to end.
  { id: "toward_long_house", from: 2, until: Infinity, done: (s) => s.buildings.long_house },
];

function isActive(trigger: GuidanceTrigger, state: GameState): boolean {
  if (state.year < trigger.from || state.year > trigger.until) return false;
  return !trigger.done(state);
}

const SKIP_GUIDANCE_KEY = "isle-of-cambrera-skip-guidance";

export function skipGuidance(): boolean {
  return localStorage.getItem(SKIP_GUIDANCE_KEY) === "1";
}

export function dismissGuidance(): void {
  localStorage.setItem(SKIP_GUIDANCE_KEY, "1");
}

// The current hint, or null when there is nothing left to say. Guidance retires
// permanently at the Long House — the last row's condition is also the whole
// table's stopping point, so a settled player is never nagged.
export function currentGuidanceStep(state: GameState): GuidanceStep | null {
  if (state.gameOver || skipGuidance()) return null;
  for (const trigger of TRIGGERS) {
    if (isActive(trigger, state)) return STEPS[trigger.id];
  }
  return null;
}

// How far through the sequence the settlement has actually got, ignoring
// windows entirely. This is deliberately NOT "which step is on screen": a step
// whose window has not opened yet is a future step, and treating it as a
// finished one made this read 4 in year 2 and 3 in year 4. Progress is a
// function of the `done` predicates alone, which is exactly the thing the
// monotonicity rule constrains — so this is what the harness asserts on.
export function guidanceProgress(state: GameState): number {
  for (let i = 0; i < TRIGGERS.length; i++) {
    if (!TRIGGERS[i].done(state)) return i;
  }
  return TRIGGERS.length;
}
