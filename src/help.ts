// Help-menu content. Sections render as collapsible <details> blocks in
// #help-overlay. Edit prose here without touching ui.ts.
//
// **When you change a mechanic, update the matching section here too.**
// Out-of-date help text is worse than no help text — players will trust it
// and then bounce off mechanics that don't behave as advertised.

export interface HelpSection {
  title: string;
  // HTML allowed — kept simple (paragraphs, lists, <strong>). No event
  // handlers; the modal passes content through innerHTML.
  body: string;
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Settlers & Aging",
    body: `
      <p>Each settler is a <em>pop</em> — an abstract cohort, not a literal person. Pops age through three phases:</p>
      <ul>
        <li><strong>Children</strong> (under 14) eat 1 food/year, don't work, don't reproduce.</li>
        <li><strong>Adults</strong> (14–34) eat 2 food/year, work, can produce children.</li>
        <li><strong>Elders</strong> (35+) eat 2 food/year. Don't reproduce. Whether they work depends on the elder civic decision (see Governance).</li>
      </ul>
      <p>Pops live ~35–55 years. The original founders carry an extra emotional weight — losing one of them hits morale harder than a non-founder death.</p>
      <p><strong>Famine kills children first</strong> (delayed labour debt, not immediate crisis). <strong>Bandits kill adults</strong> (defenders fall in the raid).</p>
    `,
  },
  {
    title: "Tiles & Terrain",
    body: `
      <p>The map is a grid of tiles. Each tile has a <em>terrain</em> (grass, forest, stone, beach, river, water, mountain) and a <em>state</em>:</p>
      <ul>
        <li><strong>Wild</strong> — untouched.</li>
        <li><strong>Cultivating</strong> — a worker has been assigned but the tile takes one year to become productive.</li>
        <li><strong>Worked</strong> — fully converted. Yields each year.</li>
        <li><strong>Fallow</strong> — once-worked but abandoned. Reverts to wild after 2 years.</li>
        <li><strong>Exhausted</strong> — depleted (forests after game runs out, quarries after stone runs out). Permanent.</li>
      </ul>
      <p><strong>Reach</strong>: a tile is workable if it's within 2 tiles of your town, OR within 1 tile of any worked tile or road. Working the edge of reach extends reach by one — your territory grows visibly.</p>
      <p><strong>Tile capacity</strong>: how many workers a tile can hold. Random per tile (visible on discovery).</p>
      <p><strong>Hidden reserves</strong>: forests have a hidden game population (drained by hunters); quarries have hidden stone (drained by quarrymen). Both can run dry. Woodcutters never deplete a forest — timber regrows.</p>
      <p><strong>Fertile grass</strong>: ~30% of grass tiles are fertile (+1 food per farmer). Visible on discovery. <strong>Rich waters</strong>: ~20% of beach/river tiles roll rich (higher fish yield). Visible on discovery.</p>
    `,
  },
  {
    title: "Worker Jobs",
    body: `
      <p>Use the Villagers panel to assign idle adults to jobs. The allocator auto-picks the nearest eligible tile (preferring fertile/rich tiles).</p>
      <ul>
        <li><strong>Farmer</strong> (grass): +2 food/year, +1 more on fertile soil. Sustainable — fields don't run dry.</li>
        <li><strong>Shepherd</strong> (grass): +1 food (milk) and +1 wool/year per worker. Maintains a sheep herd. Mutually exclusive with farmers on the same tile.</li>
        <li><strong>Hunter</strong> (forest): +3 food/year. Drains the forest's game; eventually exhausts.</li>
        <li><strong>Woodcutter</strong> (forest): +2 wood/year. Trees regrow. Coexists with hunters on the same tile.</li>
        <li><strong>Quarryman</strong> (stone): +1 stone/year. Drains the seam; eventually exhausts.</li>
        <li><strong>Fisher</strong> (beach/river): variable yield (1–3 food, or 2–4 on rich waters). Fish replenish.</li>
        <li><strong>Scout</strong>: reveals new tiles at the frontier. Doesn't occupy a tile. Auto-retires when the island is fully mapped.</li>
      </ul>
      <p><strong>Food job triad — keep all three.</strong> Hunter is transitory (drains game), farmer is sustainable, fisher is variable. Each rewards a different rhythm of play.</p>
      <p><strong>During famine</strong>, workers shed in this order: scout → quarryman → shepherd → woodcutter → hunter → fisher → farmer. Furthest-from-town tiles are abandoned first; close-in productive work is preserved.</p>
    `,
  },
  {
    title: "Resources",
    body: `
      <p>Five resources tracked in the topbar:</p>
      <ul>
        <li><strong>Food</strong> — consumed every year by everyone (2/adult, 1/child). Surplus enables growth; deficit causes famine.</li>
        <li><strong>Wood</strong> — building material from forests. Doesn't decay.</li>
        <li><strong>Stone</strong> — building material from quarries. Slowest to accumulate; most quarries run dry eventually.</li>
        <li><strong>Gold</strong> — currency. Earned by trading with merchants.</li>
        <li><strong>Wool</strong> — produced by shepherds. Sell-only commodity at merchant trade.</li>
      </ul>
      <p>The topbar shows the projected yearly net change next to each resource — green = surplus, red = deficit.</p>
    `,
  },
  {
    title: "Buildings",
    body: `
      <p>One-time settlement upgrades. Each blocks a specific negative event or adds a yield bonus:</p>
      <ul>
        <li><strong>Granary</strong> (30f, 15w) — +0.5 food/farmer/year. Blocks locusts.</li>
        <li><strong>Palisade</strong> (20w, 25s) — Blocks bandit raids.</li>
        <li><strong>Well</strong> (10w, 15s) — Blocks wildfires.</li>
        <li><strong>Hunting Lodge</strong> (10w) — +0.5 food/hunter/year. <strong>This is a trap</strong> — once forests exhaust, the lodge is dead weight.</li>
        <li><strong>Long House</strong> (20w, 15s) — Major civic milestone (gated at 25 pops). +8 morale, attracts more newcomers, unlocks roads, houses, and the Governance panel.</li>
        <li><strong>Shrine of Anata</strong> (10w, 15s) — Unlocks after 4 elders have passed. Softens the morale hit from old-age deaths.</li>
        <li><strong>Chicken Coop</strong> (5w, 3s) — Starts a flock that yields eggs each year.</li>
      </ul>
      <p>Buildings whose requirements aren't met yet are <em>hidden</em> from the panel until the gate is satisfied — you'll see a chronicle line announcing each unlock. Long House is the one always-visible exception (it's the goal you're working toward).</p>
    `,
  },
  {
    title: "Town-Centre Upgrades",
    body: `
      <p>A repeatable infrastructure layer separate from the one-time buildings. Two upgrades available from turn 1:</p>
      <ul>
        <li><strong>Communal Garden</strong> (5f, 5w) — +1 food/year passive. Beans, gourds, herbs tended through the day.</li>
        <li><strong>Workshop Yard</strong> (8w, 5s) — +1 wood/year passive. Sticks, kindling, loose timber gathered and sorted.</li>
      </ul>
      <p>No worker required for either. The Workshop Yard exists so a settlement at 100% farming still has <em>some</em> wood trickle — your build economy never flatlines.</p>
      <p>The Long House will eventually unlock tier-2 town upgrades (Market Square, Civic Hall) tied to trade and diplomacy.</p>
    `,
  },
  {
    title: "Houses & Roads",
    body: `
      <p>Both unlock with the Long House.</p>
      <p><strong>Houses</strong> (8w, 3s each) — repeatable. Each adds +6 to the population cap and +2 food/year from a private garden plot. Births stop when pop hits the cap; build more houses to keep growing.</p>
      <p><strong>Roads</strong> (2w, 5s per tile) — laid on individual tiles. Click a tile, then "Build Road." A road tile extends reach the same way a worked tile does, but doesn't need a worker stationed. Roads must be built outward from existing territory — no leapfrogging.</p>
      <p>The town tile auto-roads when the Long House is built — the hall and the first paved path are the same civic moment.</p>
    `,
  },
  {
    title: "Morale",
    body: `
      <p>Settlement-wide stat (0–100, starts at 80). <strong>Lagging indicator — no passive drift.</strong> Morale only moves on concrete events; a quiet year leaves it where it is.</p>
      <p><strong>Major sources:</strong></p>
      <ul>
        <li>Food surplus +2/year, deficit −3/year</li>
        <li>Famine death −5 each, founder death extra −3</li>
        <li>Old-age death −2 (softened by the Shrine of Anata)</li>
        <li>Birth +2, child coming of age +2</li>
        <li>Welcoming refugees +4, turning them away −3</li>
        <li>Civic decisions (elder/child laws): see Governance</li>
        <li>Events: bountiful harvest +5, locusts −4, mild winter +3, etc.</li>
      </ul>
      <p><strong>Gates that morale controls:</strong></p>
      <ul>
        <li>Below 50: <strong>no births fire</strong>. The most important gate to keep above.</li>
        <li>At/above 80: newcomer events fire ×2 more often.</li>
        <li>At/below 30: bandit events fire ×2 more often.</li>
      </ul>
    `,
  },
  {
    title: "Civic Decisions & Governance",
    body: `
      <p>Two civic laws, both surfaced from the Long House.</p>
      <p><strong>The Elder Question</strong> fires once 5 adults have passed into elder. Choose:</p>
      <ul>
        <li><strong>Working</strong>: elders contribute +0.5 food/elder/year, costs −3 morale.</li>
        <li><strong>Respected</strong>: elders teach and rest, +5 morale.</li>
      </ul>
      <p><strong>The Question of the Children</strong> fires once the Long House stands and there are 3+ children. Choose:</p>
      <ul>
        <li><strong>Working</strong>: children gather kindling and tend gardens (+0.5 food, +0.3 wood per child/year, floored), −4 morale.</li>
        <li><strong>Free</strong>: children play and learn, +3 morale.</li>
      </ul>
      <p><strong>Governance panel</strong>: open from the Long House row in the build column. Both laws are revisitable — but every flip re-applies the same morale cost as the original decision. Reversibility doesn't make the choice weightless; the people remember.</p>
    `,
  },
  {
    title: "The Ship",
    body: `
      <p>The vessel that brought you (unless you scrapped or burned her in the departure wizard). Dispatch from the Ship panel.</p>
      <ul>
        <li><strong>Cost</strong>: 2 idle adults aboard for the voyage.</li>
        <li><strong>Voyage</strong>: 2 years. Crew ages at sea; old-age deaths are possible.</li>
        <li><strong>Return</strong>: per-crew chance of being lost (10% base, reduced by your fishing experience). Survivors come back with 0–3 refugees (weighted toward 1–2).</li>
        <li><strong>Lost at sea</strong>: if all crew die, the ship is lost permanently.</li>
      </ul>
      <p><strong>Fishing experience</strong>: each fisher-year accumulates and slowly reduces the per-crew loss chance (down to a 3% floor). Fishing isn't just food — it's maritime literacy.</p>
    `,
  },
  {
    title: "Livestock",
    body: `
      <p><strong>Sheep</strong>: assigned via the Shepherd job. Each grass tile with a shepherd gets a herd that starts at 3 and grows +2/year (cap 12/tile). Shepherds yield +1 food (milk) and +1 wool per year per worker.</p>
      <p><strong>Slaughter standing order</strong> (Livestock panel): set a number of sheep to cull each year for +2 food per sheep. Distributed across all your shepherd tiles, furthest first.</p>
      <p><strong>Chickens</strong>: built once via the Chicken Coop. No worker required. Flock starts at 5, grows ~40%/year, capped at 20 (current building). Eggs yield 0.5 food/bird/year. Surplus birds auto-cull at the cap.</p>
    `,
  },
  {
    title: "Trade & Merchants",
    body: `
      <p>Merchants visit randomly, opening the Trade modal. End Year is blocked while they wait — accept, decline, or trade.</p>
      <p><strong>Cargo model (Patrician-style)</strong>: merchants arrive with a fixed cargo capacity (8–12 slots). Their stock occupies some slots; <strong>buying from them frees slots</strong> so you can sell more in the same visit.</p>
      <p><strong>Rates</strong>: asymmetric — they take their cut.</p>
      <ul>
        <li>Sell food/wood: 1g · stone: 2g · wool: 2g</li>
        <li>Buy food/wood: 2g · stone: 4g · wool: <em>not offered</em> (merchants don't bring fleece to a sheep settlement)</li>
      </ul>
      <p><strong>Wool</strong> is sell-only. It accumulates from shepherds and otherwise has no use yet — stockpiling for a future textile arc.</p>
    `,
  },
  {
    title: "Events",
    body: `
      <p>Each year, one event fires (or one of the four scripted Exarum-survivor waves, on schedule). Random events are weighted by morale and your settlement's situation.</p>
      <p><strong>Good events</strong>: bountiful harvest, mild winter, traders, newcomers, ruins discovered.</p>
      <p><strong>Bad events</strong>: locusts, bandits, forest fire, harsh winter.</p>
      <p><strong>Blocked events</strong>: certain buildings prevent specific bad events. The chronicle still notes the threat — "The locusts are kept out by the granary's seal" — so you see the building earning its keep.</p>
      <p><strong>Refugees</strong>: most refugee arrivals (random newcomers and the four scripted waves) are <em>your choice</em> — accept (+4 morale, food cost) or turn away (−3 morale). Boat-found refugees and your own ship's crew always arrive automatically.</p>
    `,
  },
];
