import { exploreFrontier } from "./map";
import { applyMorale, makeNewcomerPop } from "./state";
import {
  ALARM_RESPONSES,
  BANDIT_PURSUIT_YEARS,
  BuildingId,
  DEPARTURE_TIMINGS,
  GameState,
  LogEntry,
  MORALE_ATTRACT_THRESHOLD,
  MORALE_PREY_THRESHOLD,
  SCRIPTED_WAVE_REFUGEES,
  ScriptedWaveId,
  SHIP_FATES,
} from "./types";

interface EventDef {
  id: string;
  weight: number;
  blockedBy?: BuildingId;
  blockedText?: string;
  apply: (state: GameState) => LogEntry;
}

// Remove one pop, preferring adults (they die defending) or children (they starve).
// Returns the number actually removed.
function removePops(state: GameState, count: number, prefer: "adult" | "child"): number {
  const pops = state.pops;
  pops.sort((a, b) => {
    if (prefer === "child") return a.age - b.age; // youngest first
    return b.age - a.age; // oldest first
  });
  const actual = Math.min(count, pops.length);
  pops.splice(0, actual);
  return actual;
}

const EVENTS: EventDef[] = [
  {
    id: "bountiful",
    weight: 10,
    apply: (s) => {
      s.food += 10;
      applyMorale(s, 5);
      return {
        year: s.year,
        text: "A bountiful harvest. Granaries overflow. (+10 food)",
        tone: "good",
      };
    },
  },
  {
    id: "locusts",
    weight: 8,
    blockedBy: "granary",
    blockedText: "Locusts descend on the fields, but the granary stores hold firm. (Averted)",
    apply: (s) => {
      const lost = Math.min(6, s.food);
      s.food -= lost;
      applyMorale(s, -4);
      return {
        year: s.year,
        text: `Locusts ravage the fields. (-${lost} food)`,
        tone: "bad",
      };
    },
  },
  {
    id: "merchants",
    weight: 9,
    apply: (s) => {
      s.pendingMerchant = true;
      return {
        year: s.year,
        text: "Travelling merchants lay out their wares at the edge of the clearing. They await your decision before moving on.",
        tone: "neutral",
      };
    },
  },
  {
    id: "mild_winter",
    weight: 7,
    apply: (s) => {
      applyMorale(s, 3);
      return {
        year: s.year,
        text: "A mild winter. Spirits are high around the hearths.",
        tone: "good",
      };
    },
  },
  {
    id: "bandits",
    weight: 7,
    blockedBy: "palisade",
    blockedText: "Bandits from the highlands test the new palisade and withdraw empty-handed. (Averted)",
    apply: (s) => {
      const goldLost = Math.min(5, s.gold);
      s.gold -= goldLost;
      const adults = s.pops.filter((p) => p.age >= 4).length;
      const popLost = adults > 2 ? removePops(s, 1, "adult") : 0;
      applyMorale(s, popLost > 0 ? -7 : -2);
      return {
        year: s.year,
        text: popLost > 0
          ? `Bandits from the highlands raid the settlement. A defender falls. (-${goldLost} gold, -${popLost} adult)`
          : `Bandits circle but find little. (-${goldLost} gold)`,
        tone: "bad",
      };
    },
  },
  {
    id: "ruins",
    weight: 5,
    apply: (s) => {
      s.stone += 10;
      const revealed = exploreFrontier(s.tiles, 3);
      return {
        year: s.year,
        text: `Scouts stumble on ancient ruins. Worked stone lies everywhere. (+10 stone, ${revealed} tiles revealed)`,
        tone: "good",
      };
    },
  },
  {
    id: "newcomers",
    weight: 6,
    apply: (s) => {
      s.pops.push(makeNewcomerPop(), makeNewcomerPop());
      applyMorale(s, 4);
      return {
        year: s.year,
        text: "Two wanderers arrive seeking refuge. You take them in. (+2 adults)",
        tone: "good",
      };
    },
  },
  {
    id: "forest_fire",
    weight: 5,
    blockedBy: "well",
    blockedText: "A blaze threatens the timber yards, but bucket crews from the well douse it before it spreads. (Averted)",
    apply: (s) => {
      const lost = Math.min(6, s.wood);
      s.wood -= lost;
      applyMorale(s, -3);
      return {
        year: s.year,
        text: `Wildfire sweeps the timber yards. (-${lost} wood)`,
        tone: "bad",
      };
    },
  },
  {
    id: "strange_lights",
    weight: 3,
    apply: (s) => ({
      year: s.year,
      text: "Strange lights dance above the mountains for three nights. Elders whisper of the old magic, now almost gone.",
      tone: "neutral",
    }),
  },
  {
    id: "quiet_year",
    weight: 8,
    apply: (s) => ({
      year: s.year,
      text: "A quiet year. The chronicle records little of note.",
      tone: "neutral",
    }),
  },
];

// Lore-heavy one-shot events fired at scripted years (see SCRIPTED_WAVE_TARGETS).
// Each brings SCRIPTED_WAVE_REFUGEES adult refugees plus a chronicle-length log
// entry revealing another chapter of Exarum's fall.
const SCRIPTED_WAVE_TEXT: Record<ScriptedWaveId, string> = {
  wave1:
    "Battered travellers beach on Cambrera's shore. They speak of Exarum — " +
    "the south of the continent ravaged, the draconian host marching without " +
    "pause. Emperor Klon himself leads the defence of Destum, the capital, " +
    "now under siege. None, they say, have found a way to stop the advance. " +
    "(+2 adults)",
  wave2:
    "More survivors reach the isle, carrying darker news. Emperor Klon is " +
    "dead. The Empire has nearly crumbled beneath the draconian advance. " +
    "Villages burn; a handful still stand. Destum, the old capital of the " +
    "South, now lies in complete ruins — and Cuarecam has been claimed as " +
    "the new draconian capital. (+2 adults)",
  wave3:
    "A gaunt band stumbles ashore with the dirge of Exarum on their lips. " +
    "The Empire has fallen — Duras, Vizqe, Drazna, Harab, and Bludris all " +
    "under the draconian banner. Only Bura holds, far to the north, where " +
    "Captain Amezcua rallies what remains of Klon's army beneath the old " +
    "imperial colours. How long the city stands, none can say. Worse still: " +
    "some among the newcomers whisper that the draconians may know of " +
    "Cambrera now — that we may be next. (+2 adults)",
};

export function fireScriptedWave(state: GameState, id: ScriptedWaveId): LogEntry {
  for (let i = 0; i < SCRIPTED_WAVE_REFUGEES; i++) state.pops.push(makeNewcomerPop());
  applyMorale(state, 2 * SCRIPTED_WAVE_REFUGEES);
  return { year: state.year, text: SCRIPTED_WAVE_TEXT[id], tone: "neutral" };
}

function isPursued(state: GameState): boolean {
  const { timing, alarm, shipFate } = state.departure;
  if (SHIP_FATES[shipFate].clearsPursuit) return false;
  return DEPARTURE_TIMINGS[timing].pursuedRisk || ALARM_RESPONSES[alarm].pursuedRisk;
}

function adjustedWeight(ev: EventDef, state: GameState): number {
  if (ev.id === "newcomers") {
    let mult = 1;
    if (state.morale >= MORALE_ATTRACT_THRESHOLD) mult++;
    if (state.buildings.long_house) mult++;
    return ev.weight * mult;
  }
  if (ev.id === "bandits") {
    let mult = 1;
    if (state.morale <= MORALE_PREY_THRESHOLD) mult++;
    if (isPursued(state) && state.year <= BANDIT_PURSUIT_YEARS) mult++;
    return ev.weight * mult;
  }
  return ev.weight;
}

export function rollEvent(state: GameState): LogEntry {
  const weights = EVENTS.map((ev) => adjustedWeight(ev, state));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * totalWeight;
  let chosen: EventDef = EVENTS[EVENTS.length - 1];
  for (let i = 0; i < EVENTS.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      chosen = EVENTS[i];
      break;
    }
  }
  if (chosen.blockedBy && state.buildings[chosen.blockedBy]) {
    return { year: state.year, text: chosen.blockedText!, tone: "good" };
  }
  return chosen.apply(state);
}
