// Player-facing prose — chronicle lines, unlock messages, narrative flavour.
//
// Kept separate from turn.ts / state.ts so someone can tune voice without
// touching game logic. If you add a new mechanic that writes to the chronicle,
// put the copy here and import the constant rather than hardcoding strings
// inline. Prose that's already clearly placed (intro papyrus in index.html,
// SCRIPTED_WAVE_TEXT in events.ts, WIZARD_NARRATIVES in ui.ts) can stay put —
// the rule is "one obvious home per piece of prose," not "everything in one
// file." This file is the home for chronicle text that was otherwise leaking
// into turn.ts.

// Emitted the year the settlement's `oldAgeDeathsTotal` first crosses
// ANATA_DEATH_TRIGGER. Anata governs the whole life cycle (farmers, plenty,
// birth, and the kind end); the line frames the shrine as a response to
// accumulated loss, not a tech unlock.
export const ANATA_UNLOCK_LINE =
  "Elders counsel that the pyres deserve a place of their own. Anata — goddess of the green field and the kind dusk — may now be honoured at a shrine.";

// Emitted the turn the Shrine of Anata is built. Per lore: pyres replace
// silent graves, and an elder is named keeper of the names (oral tradition).
export const ANATA_BUILD_LINE =
  "The shrine to Anata is raised at the edge of the settlement. The next pyre sings her passage — and an elder is named keeper of the names.";

// Emitted when the first private house goes up. Frames the transition from
// communal starter hut to a proper village.
export const FIRST_HOUSE_LINE =
  "The first private house is raised — timber frame, thatch, a plot beside it. The settlement is no longer one shared hut.";

// Subsequent houses — templated with the running count.
export function additionalHouseLine(totalHouses: number): string {
  return `Another house is raised — ${totalHouses} now stand beside the hall.`;
}

// Quarry exhaustion — emitted in turn.ts step 1 when a stone tile drains its
// hidden reserve. Replaces the old "abandon a quarry" generic line; calls out
// the quarrymen explicitly so the disappearing worker is connected to the
// chronicle line (#24).
export const QUARRY_EXHAUSTED_LINE =
  "The quarry runs dry. Quarrymen abandon the seam and return to the settlement — there is nothing left to take here.";

// Tooltip copy on each row of the villager allocator (#20). Players new to the
// game don't know what each job does, what tile it claims, or why a + button is
// grayed out. One sentence each — terse, mechanical, but voice-consistent. The
// food-job triad (sustainable / transitory / variable) must come through:
// farmer rewards good land, hunter is finite, fisher is variable.
export const JOB_TOOLTIPS: Record<string, string> = {
  farmer:
    "Works grass tiles. +2 food/year per worker, +1 more on fertile soil. Sustainable — fields don't run dry.",
  shepherd:
    "Works grass tiles — exclusive with farmers. +1 food/year (milk) and +1 wool/year per worker. The flock grows each year; set a slaughter order in the Livestock panel for extra food. Fertile tiles make better pasture.",
  woodcutter:
    "Works forest tiles. +2 wood/year per worker. Trees regrow — a forest never exhausts to woodcutters.",
  hunter:
    "Works forest tiles alongside woodcutters. +3 food/year per worker, but drains the forest's game. When the herd is gone, hunters move on; the forest still yields timber.",
  fisher:
    "Works beach or river tiles. Variable yield — 1–3 food per worker, 2–4 on rich waters. Fish replenish; no reserve to drain.",
  quarryman:
    "Works stone tiles. +1 stone/year per worker. The seam holds a finite amount of stone; eventually the quarry runs dry.",
  scout:
    "Reveals new tiles at the frontier. Doesn't occupy a tile. Auto-retires once the island is fully charted.",
};
