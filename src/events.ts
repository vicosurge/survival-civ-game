import { exploreFrontier, hasUndiscoveredFrontier } from "./map";
import { applyMorale } from "./state";
import {
  ADULT_AGE,
  ALARM_RESPONSES,
  BANDIT_PURSUIT_YEARS,
  BuildingId,
  DEPARTURE_TIMINGS,
  GameState,
  LogEntry,
  MERCHANT_CARGO_RANGE,
  MERCHANT_STOCK_UNITS,
  MerchantVisit,
  MORALE_ATTRACT_THRESHOLD,
  MORALE_FOUNDER_EXTRA,
  MORALE_PREY_THRESHOLD,
  SCRIPTED_WAVE_REFUGEES,
  ScriptedWaveId,
  SHIP_FATES,
  TradeResource,
} from "./types";

function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function rollMerchantVisit(): MerchantVisit {
  const cargoCapacity = randInt(MERCHANT_CARGO_RANGE[0], MERCHANT_CARGO_RANGE[1]);
  const stockResources: TradeResource[] = ["food", "wood", "stone"];
  const picked = stockResources[randInt(0, stockResources.length - 1)];
  const qty = randInt(MERCHANT_STOCK_UNITS[0], MERCHANT_STOCK_UNITS[1]);
  return {
    cargoCapacity,
    sellStock: { food: 0, wood: 0, stone: 0, wool: 0, [picked]: qty },
  };
}

interface EventDef {
  id: string;
  weight: number;
  blockedBy?: BuildingId;
  blockedText?: string;
  apply: (state: GameState) => LogEntry;
}

// Remove one pop, preferring adults (they die defending) or children (they starve).
// Returns the removed pops so callers can inspect flags (e.g. founder status).
function removePops(state: GameState, count: number, prefer: "adult" | "child"): import("./types").Pop[] {
  const pops = state.pops;
  pops.sort((a, b) => {
    if (prefer === "child") return a.age - b.age; // youngest first
    return b.age - a.age; // oldest first
  });
  const actual = Math.min(count, pops.length);
  return pops.splice(0, actual);
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
      s.merchantVisit = rollMerchantVisit();
      const stock = s.merchantVisit.sellStock;
      const offering = (["food", "wood", "stone"] as const)
        .filter((r) => stock[r] > 0)
        .map((r) => `${stock[r]} ${r}`)
        .join(", ");
      const offeringText = offering ? ` They have ${offering} to sell.` : "";
      return {
        year: s.year,
        text: `Travelling merchants lay out their wares at the edge of the clearing.${offeringText} They await your decision before moving on.`,
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
    blockedText: "Bandits from the highlands test the palisade and withdraw empty-handed. (Averted)",
    apply: (s) => {
      const goldLost = Math.min(5, s.gold);
      s.gold -= goldLost;
      const adults = s.pops.filter((p) => p.age >= ADULT_AGE).length;
      const lost = adults > 2 ? removePops(s, 1, "adult") : [];
      const founderLost = lost.filter((p) => p.founder).length;
      const moraleLost = lost.length > 0
        ? -(7 + founderLost * MORALE_FOUNDER_EXTRA)
        : -2;
      applyMorale(s, moraleLost);
      const founderNote = founderLost > 0 ? " One of the founders is among the dead." : "";
      return {
        year: s.year,
        text: lost.length > 0
          ? `Bandits from the highlands raid the settlement. A defender falls.${founderNote} (-${goldLost} gold, -${lost.length} adult)`
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
      const revealNote = revealed > 0
        ? `, ${revealed} tile${revealed === 1 ? "" : "s"} revealed`
        : "";
      return {
        year: s.year,
        text: `Scouts stumble on ancient ruins. Worked stone lies everywhere. (+10 stone${revealNote})`,
        tone: "good",
      };
    },
  },
  {
    id: "newcomers",
    weight: 6,
    apply: (s) => {
      s.pendingRefugees = {
        count: 2,
        text: "Two wanderers arrive at your gates, gaunt and road-worn, asking for shelter.",
        year: s.year,
      };
      return {
        year: s.year,
        text: "Two wanderers arrive seeking refuge — they wait at the gate for your word.",
        tone: "neutral",
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
// Each brings SCRIPTED_WAVE_REFUGEES adult refugees. The player must accept or
// decline; the full narrative text is shown in the decision modal, and a brief
// pending line goes into the chronicle while awaiting the choice.
const SCRIPTED_WAVE_TEXT: Record<ScriptedWaveId, string> = {
  wave1:
    "Battered travellers beach on Cambrera's shore. They speak of Exarum — " +
    "the south of the continent ravaged, the draconian host marching without " +
    "pause. Emperor Klon himself leads the defence of Destum, the capital, " +
    "now under siege. None, they say, have found a way to stop the advance.",
  wave2:
    "More survivors reach the isle, carrying darker news. Emperor Klon is " +
    "dead. The Empire has nearly crumbled beneath the draconian advance. " +
    "Villages burn; a handful still stand. Destum, the old capital of the " +
    "South, now lies in complete ruins — and Cuarecam has been claimed as " +
    "the new draconian capital.",
  wave3:
    "A gaunt band stumbles ashore with the dirge of Exarum on their lips. " +
    "The Empire has fallen — Duras, Vizqe, Drazna, Harab, and Bludris all " +
    "under the draconian banner. Only Bura holds, far to the north, where " +
    "Captain Amezcua rallies what remains of Klon's army beneath the old " +
    "imperial colours. How long the city stands, none can say. Worse still: " +
    "some among the newcomers whisper that the draconians may know of " +
    "Cambrera now — that we may be next.",
};

const SCRIPTED_WAVE_PENDING: Record<ScriptedWaveId, string> = {
  wave1: "Survivors from across the sea arrive at your shores — they await your word at the gate.",
  wave2: "More survivors of the Exarum war reach Cambrera — they wait for your decision.",
  wave3: "A gaunt band stumbles ashore with the dirge of Exarum on their lips — they await your word.",
};

export function fireScriptedWave(state: GameState, id: ScriptedWaveId): LogEntry {
  state.pendingRefugees = {
    count: SCRIPTED_WAVE_REFUGEES,
    text: SCRIPTED_WAVE_TEXT[id],
    year: state.year,
  };
  return { year: state.year, text: SCRIPTED_WAVE_PENDING[id], tone: "neutral" };
}

function isPursued(state: GameState): boolean {
  const { timing, alarm, shipFate } = state.departure;
  if (SHIP_FATES[shipFate].clearsPursuit) return false;
  return DEPARTURE_TIMINGS[timing].pursuedRisk || ALARM_RESPONSES[alarm].pursuedRisk;
}

function adjustedWeight(ev: EventDef, state: GameState): number {
  if (ev.id === "ruins") {
    // Ruins is a scout-flavoured find. If nobody's out surveying, or the map is
    //   already fully known, it shouldn't fire — the event text and reveal are
    //   both wasted.
    if (state.scouts <= 0) return 0;
    if (!hasUndiscoveredFrontier(state.tiles)) return 0;
    return ev.weight;
  }
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
