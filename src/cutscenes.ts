// Cutscene system — milestone narrative interludes ("feelies").
//
// The mechanical game is deliberately spare. Cutscenes are where Cambrera gets
// to be richly weird without bloating the core loop: three or four paragraphs
// of world flavour at a milestone, a Skip button that costs nothing, and an
// archive so a player who skipped can come back for them later.
//
// Prose lives in `src/content/cutscenes.json` so a writer can work on voice
// without touching TypeScript. This file owns *when* a cutscene fires; the JSON
// owns *what it says*; ui.ts owns how it looks.

import cutsceneData from "./content/cutscenes.json";
import type { CutsceneId, GameState } from "./types";

export interface CutsceneDef {
  title: string;
  // Filename inside `public/cutscenes/`, or null while the slot is unfilled.
  // The overlay renders a placeholder panel when absent, so an artist can drop
  // a file in and add the name here without any code change.
  image: string | null;
  // Authored HTML — inline <em>/<span> only. This is repo content, never
  // player input, so it goes through innerHTML the same way HELP_SECTIONS does.
  paragraphs: string[];
  _note?: string;
}

export const CUTSCENES: Record<CutsceneId, CutsceneDef> = cutsceneData;

export const CUTSCENE_IMAGE_DIR = "/cutscenes/";

// Declarative trigger table. Adding a cutscene is: write the JSON entry, add
// the id to CutsceneId, append a row here. No switch statement in the turn
// pipeline, and no trigger logic scattered across build()/endYear().
//
// Order is queue priority for the rare turn where two become eligible at once —
// they fire one at a time, the next queuing after the previous is dismissed.
const TRIGGERS: { id: CutsceneId; when: (state: GameState) => boolean }[] = [
  // `founding` is presented by the pre-game intro overlay, before a GameState
  // exists to hold a pending flag — so newGame() marks it seen immediately and
  // this row never fires. It stays in the table so the archive and the content
  // file have one complete list of cutscenes rather than two partial ones.
  { id: "founding", when: () => true },
  { id: "siege_of_destum", when: (s) => s.scriptedWaves.some((w) => w.id === "wave1" && w.fired) },
  { id: "long_house_built", when: (s) => s.buildings.long_house },
  { id: "shrine_of_anata_built", when: (s) => s.buildings.shrine_of_anata },
  { id: "bandit_camp_found", when: (s) => s.banditCampsFound > 0 },
  // The camp is gone by the time this fires, so it triggers off the lifetime
  // counter rather than off any surviving camp state.
  { id: "first_sortie", when: (s) => s.sortiesWon > 0 },
];

export function hasSeenCutscene(state: GameState, id: CutsceneId): boolean {
  return state.seenCutscenes.some((entry) => entry.id === id);
}

// Queues the first unseen cutscene whose condition is now met. Called from the
// redraw loop, so a milestone reached by any route — building, event, load —
// gets picked up without each of those sites knowing about cutscenes.
export function checkCutsceneTriggers(state: GameState): void {
  if (state.gameOver || state.pendingCutscene) return;
  for (const trigger of TRIGGERS) {
    if (hasSeenCutscene(state, trigger.id)) continue;
    if (trigger.when(state)) {
      state.pendingCutscene = trigger.id;
      return;
    }
  }
}

// Skipping and reading both mark seen — a skipped cutscene is still "spent",
// and the archive is where a player goes to read what they waved past.
export function markCutsceneSeen(state: GameState, id: CutsceneId): void {
  if (!hasSeenCutscene(state, id)) {
    state.seenCutscenes.push({ id, year: state.year });
  }
  if (state.pendingCutscene === id) state.pendingCutscene = null;
}

// Archive listing: chronological by the year the cutscene actually triggered,
// so it reads as the settlement's own history rather than as a content index.
// Unseen entries are absent — the archive must never spoil what's coming.
export function cutsceneArchive(state: GameState): { id: CutsceneId; year: number; def: CutsceneDef }[] {
  return state.seenCutscenes
    .filter((entry) => entry.id in CUTSCENES)
    .map((entry) => ({ id: entry.id, year: entry.year, def: CUTSCENES[entry.id] }))
    .sort((a, b) => a.year - b.year);
}
