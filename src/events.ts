import { exploreFrontier } from "./map";
import { makeNewcomerPop } from "./state";
import { GameState, LogEntry } from "./types";

interface EventDef {
  id: string;
  weight: number;
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
    apply: (s) => {
      const lost = Math.min(8, s.food);
      s.food -= lost;
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
      const cost = Math.min(3, s.food);
      s.food -= cost;
      s.gold += 5;
      return {
        year: s.year,
        text: `Travelling merchants pass through. They buy provisions. (-${cost} food, +5 gold)`,
        tone: "neutral",
      };
    },
  },
  {
    id: "mild_winter",
    weight: 7,
    apply: (s) => ({
      year: s.year,
      text: "A mild winter. Spirits are high around the hearths.",
      tone: "good",
    }),
  },
  {
    id: "bandits",
    weight: 7,
    apply: (s) => {
      const goldLost = Math.min(5, s.gold);
      s.gold -= goldLost;
      const adults = s.pops.filter((p) => p.age >= 4).length;
      const popLost = adults > 2 ? removePops(s, 1, "adult") : 0;
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
    apply: (s) => {
      const lost = Math.min(8, s.wood);
      s.wood -= lost;
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

export function rollEvent(state: GameState): LogEntry {
  const totalWeight = EVENTS.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const ev of EVENTS) {
    r -= ev.weight;
    if (r <= 0) return ev.apply(state);
  }
  return EVENTS[EVENTS.length - 1].apply(state);
}
