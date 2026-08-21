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

// Building-unlock chronicle lines — fired the year a gated building's
// requirements first become satisfied. Hidden buildings need this so players
// notice when something new becomes possible (otherwise hidden = invisible).
// Only buildings with non-resource gates appear here; resource-only blockers
// stay visible in the panel and don't need an unlock beat.
//
// The Shrine of Anata has its own dedicated unlock line (ANATA_UNLOCK_LINE,
// fired from the legacy old-age-death path in turn.ts) and is intentionally
// absent from this map.
import type { BuildingId } from "./types";
export const BUILDING_UNLOCK_TEXT: Partial<Record<BuildingId, string>> = {
  long_house:
    "Twenty-five souls now shelter on Cambrera. Voices around the fire speak of a Long House — a roof tall enough to gather under, a place to decide together.",
  muster_field:
    "Word of the camp travels the settlement by nightfall. Someone remembers how the old levies drilled, and says it aloud: we could raise a muster field, and stop being only the people this happens to.",
  dock:
    "With the Long House standing, talk turns to the shore: pilings driven into the surf, a plank pier, a breakwater of dressed stone. A real dock would change how the coastal traders treat us.",
};

// Town-centre upgrade chronicle lines — emitted the turn each upgrade is
// completed. Frame the upgrade as the settlement maturing around the hut,
// not as a discrete building going up.
import type { TownUpgradeId } from "./types";
export const TOWN_UPGRADE_BUILD_LINE: Record<TownUpgradeId, string> = {
  communal_garden:
    "A communal garden is fenced beside the hut. Beans, gourds, and herbs — small hands tend it through the day.",
  workshop_yard:
    "A workshop yard is walled in. Loose timber, kindling, and broken tools find their way here — sorted, mended, kept.",
};

// Civic-decision chronicle lines for the child labour question. Mirror of the
// elder lines in turn.ts; emitted by the governance modal handlers.
export const CHILD_WORK_LINE =
  "The children take up small tasks — gathering kindling, weeding the garden rows, watching the chickens. They are not idle, and the hands are real.";
export const CHILD_FREE_LINE =
  "The children are left to their own days — to play, to learn from the elders, to be children. The settlement is the better for it.";

// Governance-panel flip lines — emitted when an existing law is toggled via
// the Governance panel. Re-application is the friction that keeps reversible
// decisions weighty: each flip costs (or rewards) morale fresh.
export const ELDER_FLIP_TO_WORK_LINE =
  "The elders are called back to small tasks. Some go willingly; some go because they are asked.";
export const ELDER_FLIP_TO_RESPECT_LINE =
  "The elders set down their tools again. The community remembers what they have already given.";
export const CHILD_FLIP_TO_WORK_LINE =
  "The children are called from their games. The work is light, but it is work.";
export const CHILD_FLIP_TO_FREE_LINE =
  "The children are released from chores. The settlement chooses to feed them and ask nothing back.";
export const LEVY_FLIP_TO_ON_LINE =
  "Work gangs are raised and fed from the common stores. They go out at first light for timber and stone.";
export const LEVY_FLIP_TO_OFF_LINE =
  "The work gangs are stood down. The stores are the settlement's own again, and so are the days.";

// Spoilage — the Hamurabi rats. The first year it happens gets the full
// explanation (players need to learn the cap exists and what to do about it);
// every year after gets the short line, since the lesson has landed.
export const SPOILAGE_FIRST_LINE =
  "The stores have outgrown what the settlement can keep. Damp gets into the grain pits, rats into the lofts, and part of the surplus is lost before spring. Food beyond your storage capacity spoils every year — build a granary or houses to hold more, or spend the surplus on trade, building, and work gangs before it rots.";
export const spoilageLine = (lost: number, cap: number): string =>
  `Rats and damp take ${lost} food — the stores hold only ${cap}.`;

// Work levy — the gangs go unfed in any year the stores can't cover the ration.
export const LEVY_UNFED_LINE =
  "There was not enough in the stores to feed the work gangs. They stayed home, and nothing was hauled this year.";
export const levyWorkLine = (food: number, wood: number, stone: number): string =>
  `The work gangs are fed from the stores — ${food} food for ${wood} wood and ${stone} stone.`;

// ─── Bandits, raids, and the sortie (v0.10) ───────────────────────────────────
// The camp arc carries more prose than any other mechanic, so all of it lives
// here rather than in turn.ts. Keep them human and desperate — per the lore
// memory, bandits are displaced Exarum survivors, never draconians.

export const CAMP_FOUNDING_LINE = [
  "Smoke rises from somewhere inland that should have no fire under it. Others came out of the war and did not choose the plough.",
  "A fisher comes back white-faced: a camp, out past the charted ground. Exarum faces, Exarum tongue, and spears cut from your own island's wood.",
  "They are your own kind — survivors of the same crossing — and they have made a camp out where nobody is watching. That is all anyone knows yet.",
];
export const CAMP_NOWHERE_TO_HIDE_LINE =
  "Strangers are sighted along the shoreline at dusk, and are gone by morning. There is nowhere on this island they could not be watched.";
export const CAMP_ALREADY_CHARTED_NOTE =
  " Their camp stands on ground you have already charted.";

export const CAMP_FOUND_BY_SCOUTS_LINE =
  "Scouts crest a rise and go flat against the heather. Cook fires, lean-tos, a picket. The camp is on the map now.";
export const CAMP_FOUND_BY_RAID_LINE =
  "This time the villagers follow them back. The camp is on the map now — everyone knows where they sleep.";

export const RAID_INTRO = [
  "A band of Exarum stragglers — washed up on a different beach, lean and angry — come down on the storehouses.",
  "Other survivors of the war, who landed elsewhere on Cambrera and turned to taking what they need, slip in at dusk.",
  "Refugees from the war who chose the road of the knife over the road of the plough come for your stores.",
];
export const RAID_AVERTED_LINE =
  "Raiders test the palisade in the night and withdraw empty-handed. The wall holds. (Averted)";
export const RAID_HELD_NOTE =
  " Your militia bloody them on the way out, but there are not enough spears.";
export const RAID_OVER_WALL_NOTE =
  " They are over the palisade before anyone reaches the gate.";
export const raidRepelledLine = (intro: string): string =>
  `${intro} Your militia meet them at the treeline and turn them back with nothing.`;
export const raidEmptyLine = (intro: string, wallNote: string, morale: number): string =>
  `${intro}${wallNote} They find the storehouses empty and leave with nothing — but the village sleeps poorly. (${morale} morale)`;
export const raidTheftLine = (intro: string, wallNote: string, heldNote: string, stolen: number, morale: number): string =>
  `${intro}${wallNote}${heldNote} They make off with stores before dawn. (-${stolen} food, ${morale} morale)`;

// Violent deaths keep their own line and their own tone — never folded into the
// year's population tally.
export const raidDeathsLine = (deaths: number, founderNote: string): string =>
  `This band no longer only takes food. ${deaths === 1 ? "One villager is" : `${deaths} villagers are`} killed in the yard defending the stores.${founderNote}`;

export const sortieWonLine = (loot: number, morale: number): string =>
  `Your militia march out at first light and burn the camp. What was taken from you over the years comes back on your own backs. (+${loot} food, +${morale} morale)`;
export const sortieLostLine = (deaths: number, founderNote: string, morale: number): string =>
  `The sortie goes badly. The camp was ready for you, and ${deaths === 1 ? "one does" : `${deaths} do`} not come home — though the raiders are bloodied too.${founderNote} (${morale} morale)`;

// Shared by the famine, raid, and sortie death lines.
export const founderLossNote = (founders: number): string =>
  founders > 0
    ? ` ${founders === 1 ? "One was" : `${founders} were`} of the original founding band.`
    : "";

// Tooltip copy on each row of the villager allocator (#20). Players new to the
// game don't know what each job does, what tile it claims, or why a + button is
// grayed out. One sentence each — terse, mechanical, but voice-consistent. The
// food-job triad (sustainable / transitory / variable) must come through:
// farmer rewards good land, hunter is finite, fisher is variable.
export const JOB_TOOLTIPS: Record<string, string> = {
  farmer:
    "Works grass tiles. +2 food/year per worker, +1 more on fertile soil. Sustainable — fields don't run dry.",
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
  militia:
    "Spears kept by the door. Doesn't occupy a tile and produces nothing — but militia blunt bandit raids, turn one back entirely when they outnumber the camp's strength, and are who you send if you march on the camp itself.",
};
