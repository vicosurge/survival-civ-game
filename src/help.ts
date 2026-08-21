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
      <p><strong>Famine kills children first</strong> (delayed labour debt, not immediate crisis). Bandit raids take food, not children — though a camp you let grow strong will start taking lives too, and your militia are the ones who pay first.</p>
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
      <p><strong>Reach</strong>: a tile is workable if it's within 2 tiles of your town, within 1 tile of any worked tile or dirt path, or within 2 tiles of any stone road. Working the edge of reach extends reach by one — your territory grows visibly.</p>
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
        <li><strong>Hunter</strong> (forest): +3 food/year. Drains the forest's game; eventually exhausts.</li>
        <li><strong>Woodcutter</strong> (forest): +2 wood/year. Trees regrow. Coexists with hunters on the same tile.</li>
        <li><strong>Quarryman</strong> (stone): +1 stone/year. Drains the seam; eventually exhausts.</li>
        <li><strong>Fisher</strong> (beach/river): variable yield (1–3 food, or 2–4 on rich waters). Fish replenish.</li>
        <li><strong>Scout</strong>: reveals new tiles at the frontier. Doesn't occupy a tile. Auto-retires when the island is fully mapped.</li>
        <li><strong>Militia</strong> (needs a Muster Field): doesn't occupy a tile and produces nothing. Each militiaman answers for <strong>2 points</strong> of a bandit camp's strength — enough of them turns a raid back with nothing taken, and they're who you send on a sortie. See <em>Bandits &amp; Defence</em>.</li>
      </ul>
      <p><strong>Food job triad — keep all three.</strong> Hunter is transitory (drains game), farmer is sustainable, fisher is variable. Each rewards a different rhythm of play.</p>
      <p><strong>During famine</strong>, workers shed in this order: scout → militia → quarryman → woodcutter → hunter → fisher → farmer. Furthest-from-town tiles are abandoned first; close-in productive work is preserved.</p>
    `,
  },
  {
    title: "Resources",
    body: `
      <p>Four resources tracked in the topbar:</p>
      <ul>
        <li><strong>Food</strong> — consumed every year by everyone (2/adult, 1/child). Surplus enables growth; deficit causes famine. <strong>Food does not keep forever</strong> — see storage below.</li>
        <li><strong>Wood</strong> — building material from forests. Doesn't decay.</li>
        <li><strong>Stone</strong> — building material from quarries. Slowest to accumulate; most quarries run dry eventually.</li>
        <li><strong>Gold</strong> — currency. Earned by trading with merchants.</li>
      </ul>
      <p>The topbar shows the projected yearly net change next to each resource — green = surplus, red = deficit.</p>
      <p><strong>Food storage.</strong> The Food chip reads <em>held / capacity</em>. Your pits and lofts start at 100. A granary adds 80; each house adds 10 more. At the end of every year, half of whatever you hold <em>above</em> capacity spoils — damp in the grain, rats in the loft.</p>
      <p>This means a food surplus is something to <strong>spend</strong>, not bank. Trade it to merchants, put it into houses and buildings, raise a work levy, or offer it at the shrine. Piling farmers onto every field past the point you can store the harvest just feeds the rats. The projected net change already accounts for spoilage, so what the topbar shows is what you actually keep.</p>
    `,
  },
  {
    title: "Buildings",
    body: `
      <p>One-time settlement upgrades. Each blocks a specific negative event or adds a yield bonus:</p>
      <ul>
        <li><strong>Granary</strong> (30f, 15w) — +0.5 food/farmer/year, and <strong>+80 food storage capacity</strong> (100 → 180), which is its real job. Blocks locusts.</li>
        <li><strong>Palisade</strong> (20w, 25s) — Turns back raiders from a camp of strength 3 or less. Above that the band is too big for the wall, and it only halves what they carry off.</li>
        <li><strong>Well</strong> (10w, 15s) — Blocks wildfires.</li>
        <li><strong>Hunting Lodge</strong> (10w) — +0.5 food/hunter/year. <strong>This is a trap</strong> — once forests exhaust, the lodge is dead weight.</li>
        <li><strong>Lumber Camp</strong> (10w, 10s) — +0.5 wood/woodcutter/year. Saw pits and drying stacks lift the timber ceiling.</li>
        <li><strong>Mason's Workshop</strong> (15w, 10s) — +0.5 stone/quarryman/year. Splitting wedges and a yard for dressing stone — but seams still run finite.</li>
        <li><strong>Long House</strong> (20w, 15s) — Major civic milestone (gated at 25 pops). +8 morale, attracts more newcomers, unlocks stone roads, houses, and the Governance panel.</li>
        <li><em>Houses</em> (repeatable, Long House gated) — besides +6 pop capacity and +2 food/year, each house adds <strong>+10 food storage</strong> from its own larder.</li>
        <li><strong>Shrine of Anata</strong> (10w, 15s) — Unlocks after 4 elders have passed. Softens the morale hit from old-age deaths. Once built, the priests may occasionally call for a great offering — accept (food → morale) or decline (morale cost).</li>
        <li><strong>Chicken Coop</strong> (5w, 3s) — Starts a flock that yields eggs each year.</li>
        <li><strong>Muster Field</strong> (15w, 10s) — Appears once you know where the bandits camp. Lets you raise militia from your idle adults.</li>
        <li><strong>Dock</strong> (12w, 15s) — Long House gated. Pilings, plank pier, stone breakwater. Two benefits: visiting merchants pay you +1 gold per unit sold (food and wood at 2g; stone at 3g), and your fishers reach one ring further out — beach and river tiles within 3 tiles of town become workable. Doesn't affect buy rates.</li>
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
      <p><strong>Houses</strong> (8w, 3s for the first; +2w, +1s per house thereafter) — Long House gated, repeatable. Each adds +6 to the population cap and +2 food/year from a private garden plot. Births stop when pop hits the cap; build more houses to keep growing. Cost escalates so you feel the next house before getting it.</p>
      <p><strong>Roads</strong> come in two tiers, each placed on individual tiles. Both must be built outward from existing territory — no leapfrogging.</p>
      <ul>
        <li><strong>Dirt Path</strong> (3w) — available from turn 1, no Long House gate. Acts as a +1 reach anchor (same as a worked tile). Cheap fix when an outlying stone or fertile tile is just barely out of reach.</li>
        <li><strong>Stone Road</strong> (2w, 5s) — Long House gated. Acts as a +2 reach anchor — a highway, pulling distant tiles into your territory. Can be paved over an existing dirt path.</li>
      </ul>
      <p>The town tile auto-paves with stone road when the Long House is built — the hall and the first paved highway are the same civic moment.</p>
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
        <li>Bandit raid: −3 if they take food, −2 if your stores were empty; −6 per villager killed in a severe raid</li>
        <li>Sortie against the camp: +6 if you burn it, −4 if it goes badly</li>
        <li>Civic decisions (elder/child laws): see Governance</li>
        <li>Events: bountiful harvest +5, locusts −4, mild winter +3, etc.</li>
      </ul>
      <p><strong>Gates that morale controls:</strong></p>
      <ul>
        <li>Below 50: <strong>no births fire</strong>. The most important gate to keep above.</li>
        <li>At/above 80: newcomer events fire ×2 more often.</li>
        <li>At/below 30: a new bandit band is ×2 as likely to settle nearby.</li>
      </ul>
    `,
  },
  {
    title: "Civic Decisions & Governance",
    body: `
      <p>Three civic laws, all surfaced from the Long House.</p>
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
      <p><strong>The Work Levy</strong> is available from the Governance panel as soon as the Long House stands — nobody forces the question, you raise it when you want it. While it's raised, the settlement feeds work gangs out of the common stores: <strong>−12 food for +3 wood and +2 stone every year</strong>. It's skipped automatically in any year the stores can't cover the ration, so it can never starve you. This is your own lever on the stone bottleneck — steady and predictable, unlike waiting for a merchant, and the natural place for a food surplus to go before it spoils.</p>
      <p><strong>Governance panel</strong>: open from the Long House row in the build column. All three laws are revisitable — but changing a standing law costs <strong>−3 morale on top of</strong> the new policy's own effect, in both directions. Reversibility doesn't make the choice weightless; the people remember, and no amount of flipping back and forth wins you morale.</p>
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
      <p><strong>Chickens</strong>: built once via the Chicken Coop. No worker required. Flock starts at 5, grows ~40%/year, capped at 20 (current building). Eggs yield 0.5 food/bird/year. Surplus birds auto-cull at the cap.</p>
    `,
  },
  {
    title: "Trade & Merchants",
    body: `
      <p>Merchants visit randomly, opening the Trade modal. End Year is blocked while they wait — accept, decline, or trade.</p>
      <p><strong>Cargo model (Patrician-style)</strong>: merchants arrive with a fixed cargo capacity. Their stock occupies some slots; <strong>buying from them frees slots</strong> so you can sell more in the same visit.</p>
      <p><strong>Port reputation</strong>: each completed trade adds to your settlement's reputation. The more often you strike a deal, the bigger the wagons that come:</p>
      <ul>
        <li><strong>Tier 0</strong> (0–2 trades): cargo 8–12 slots, single resource at 2–4 units.</li>
        <li><strong>Tier 1</strong> (3+ trades): cargo 10–15 slots, stock 3–5 units. "Word of your port has spread."</li>
        <li><strong>Tier 2</strong> (7+ trades): cargo 12–18 slots, stock 4–6 units. Occasionally <strong>two ships</strong> make port the same season.</li>
      </ul>
      <p>Declining a visit doesn't count toward reputation — only deals do. The counter never resets.</p>
      <p><strong>Rates</strong>: asymmetric — they take their cut.</p>
      <ul>
        <li>Sell food/wood: 1g · stone: 2g</li>
        <li>Buy food/wood: 2g · stone: 4g</li>
      </ul>
      <p><strong>Dock</strong>: building the dock adds +1 gold per unit on every <em>sell</em> (food/wood fetch 2g, stone fetches 3g). Buy rates are unchanged — the dock makes you a better seller, not a savvier buyer. It also extends fisher reach (see Buildings).</p>
    `,
  },
  {
    title: "Events",
    body: `
      <p>Each year, one event fires (or one of the four scripted Exarum-survivor waves, on schedule). Random events are weighted by morale and your settlement's situation.</p>
      <p><strong>Good events</strong>: bountiful harvest, mild winter, traders, newcomers, ruins discovered.</p>
      <p><strong>Bad events</strong>: locusts, bandits (Exarum stragglers — the roll founds a camp that then stays; see <em>Bandits &amp; Defence</em>), forest fire, harsh winter.</p>
      <p><strong>Blocked events</strong>: certain buildings prevent specific bad events. The chronicle still notes the threat — "The locusts are kept out by the granary's seal" — so you see the building earning its keep.</p>
      <p><strong>Refugees</strong>: most refugee arrivals (random newcomers and the four scripted waves) are <em>your choice</em> — accept (+4 morale, food cost) or turn away (−3 morale). Boat-found refugees and your own ship's crew always arrive automatically.</p>
      <p><strong>Anata's offering</strong>: once the shrine stands, the priests may call for a sacrifice. Accept costs food but lifts spirits; decline costs morale.</p>
    `,
  },
  {
    title: "Bandits & Defence",
    body: `
      <p>Bandits are other survivors of the Exarum war — the same crossing, the same charts — who came ashore somewhere worse and ran out of season before they ran out of hunger. They are not monsters and they are not an army.</p>
      <p><strong>They do not raid and leave.</strong> When the bandit event fires it founds a <em>camp</em> somewhere on the island, and that camp stays until you deal with it. Every year it goes untouched it gains a point of strength, and every year it may come down on your stores. There is only ever one camp at a time.</p>
      <p><strong>Finding it.</strong> The camp is usually pitched on ground you haven't charted — send scouts. Failing that, after the second raid your people follow them home. Either way the camp appears on the map, and the tile panel shows its strength.</p>
      <p><strong>What it takes.</strong> A raid steals roughly 3 food for every point of camp strength your militia don't answer for, plus a few more. A grown camp against no militia is a bad winter, every other year, forever.</p>
      <p><strong>Three ways to answer it:</strong></p>
      <ul>
        <li><strong>Palisade</strong> — turns a small band away outright (strength 3 or less). Once the camp outgrows the wall, it halves the theft instead. A wall is a buffer, not a permanent answer.</li>
        <li><strong>Militia</strong> — build a Muster Field, then raise militia in the Villagers panel. Each militiaman is worth <strong>2 defence</strong>; when your defence <em>matches or exceeds</em> the camp's strength, the raid is turned back with nothing taken, and it can't kill anyone. Three spears answer a camp at full strength. They cost no food beyond their own meals — what they cost is the work they aren't doing.</li>
        <li><strong>Sortie</strong> — click the camp tile and march on it. Your odds are militia against camp strength, shown on the button. Win and the camp is burned and its stores come home. Lose and people don't come back. One sortie per year.</li>
      </ul>
      <p><strong>Raids can kill.</strong> Once a known camp's strength runs 5 or more points <em>past your defence</em>, a raid may take lives as well as food — up to two. Most raids still only take food. <strong>Militia die first</strong>, and enough of them stops the killing outright: that is the point of having them. Children are never taken in a raid.</p>
      <p>Burning a camp doesn't end the story. Another band may come ashore later and start over at strength 1.</p>
    `,
  },
  {
    title: "Remembrances",
    body: `
      <p>At a handful of milestones the game stops and tells you a story — the landing, the first news from the war across the strait, the raising of the Long House, the founding of the shrine. These are <em>remembrances</em>: three or four paragraphs of world, with no mechanical effect whatsoever.</p>
      <p>Every one has a <strong>Skip</strong> button, and skipping costs you nothing — no resources, no morale, no missed content. The ticking parts of the game are all in the panels around the map; a remembrance is purely for the players who want to know what this place is.</p>
      <p><strong>Remembrances</strong> (in the chronicle strip, top left) re-opens any you have already reached, listed by the year it happened in <em>your</em> settlement. Ones you haven't reached yet don't appear — no spoilers. If you skipped something, that's where to go and read it.</p>
      <p>To turn them off entirely, tick <strong>Skip cutscenes on future games</strong> on the opening scroll. They'll still be collected in Remembrances for later.</p>
    `,
  },
];
