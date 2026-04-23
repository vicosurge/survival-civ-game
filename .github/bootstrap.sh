#!/usr/bin/env bash
# One-shot repo setup: labels, milestones, and initial issues for Isle of Cambrera.
#
# Prerequisites:
#   brew install gh            # or see https://cli.github.com/
#   gh auth login              # authenticate against GitHub
#
# Usage:
#   cd /path/to/survival-civ-game
#   bash .github/bootstrap.sh
#
# Safe to re-run: label/milestone creates fail soft if they already exist.
# Issues WILL be duplicated on re-run, so only run the "Initial issues" section once.

set -euo pipefail

REPO="vicosurge/survival-civ-game"

# ─── Labels ────────────────────────────────────────────────────────────────────
# GitHub's defaults include bug / documentation / enhancement / etc. We use
#   explicit colours so the label list reads cleanly at a glance.

create_label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null \
    || gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc"
}

create_label bug          d73a4a "Something broken in the game"
create_label feature      0e8a16 "New mechanic, building, event, or system"
create_label balance      fbca04 "Tuning numbers — yields, weights, thresholds"
create_label polish       c5def5 "UX / chronicle / flavour refinement"
create_label chronicle    d4c5f9 "Log text, event narration, tone"
create_label ux           bfd4f2 "UI interactions, controls, readability"
create_label docs         0075ca "README, CLAUDE.md, memory/"
create_label deferred     cccccc "Acknowledged — not scheduled yet"
create_label needs-info   d876e3 "Reporter input needed before we can act"
create_label playtest     f9d0c4 "Raw playtest session feedback"

# ─── Milestones ────────────────────────────────────────────────────────────────

create_milestone() {
  local title="$1" description="$2"
  # Milestones API: POST /repos/{owner}/{repo}/milestones. Idempotent by title.
  if ! gh api "repos/$REPO/milestones" --jq '.[].title' | grep -Fxq "$title"; then
    gh api "repos/$REPO/milestones" \
      -f title="$title" \
      -f description="$description" \
      -f state=open \
      > /dev/null
    echo "  created milestone: $title"
  else
    echo "  milestone exists: $title"
  fi
}

echo "Milestones:"
create_milestone "v0.5" "Next version. Mid-game balance, narrative hooks, playtest-driven fixes."
create_milestone "Backlog" "Acknowledged ideas without a target version yet."

# ─── Initial issues ────────────────────────────────────────────────────────────
# Run ONLY ONCE. If you re-run this script, comment this section out.

file_issue() {
  local title="$1" milestone="$2" labels="$3" body="$4"
  gh issue create --repo "$REPO" \
    --title "$title" \
    --milestone "$milestone" \
    --label "$labels" \
    --body "$body"
}

echo ""
echo "Filing initial issues..."

file_issue "Idle adults should nudge birth rate, capped" \
  "v0.5" "feature,balance" \
"From playtester feedback: \"Does leaving adults idle alter the number of children born?\"

Current behaviour: no — births are gated purely by \`food >= pop * 3\` and morale. Idle adults have no direct effect.

Proposal (per Vicente): small positive influence on birth chance proportional to idle adult count, capped at some ceiling so the player can't just park everyone idle to churn babies.

Open questions:
- Where does the cap land? (e.g. +10% birth chance per idle adult, capped at 40%?)
- Does this bypass the food × 3 threshold, or just tilt the post-threshold roll?
- Should it interact with morale (e.g. only applies above MORALE_GROWTH_GATE)?

Design intent to preserve:
- Growth still needs earned food surplus. Idle bonus is a tilt, not a shortcut."

file_issue "25-pop Long House gate feels grindy in long sessions" \
  "v0.5" "balance,playtest" \
"Playtester hit 307 turns bouncing between 11–19 population, never reaching the 25-pop Long House gate.

Possible levers:
- Lower the pop gate (e.g. 20?)
- Add a second boat / rescue fleet (see separate issue)
- Buff newcomers event weight for small settlements
- Raise baseline newcomer frequency in the first N years
- Tune birth rate via idle-adult nudge (see separate issue)

Needs a playtest after each lever to check it doesn't collapse into easy-mode."

file_issue "Second rescue boat / fleet option" \
  "v0.5" "feature,balance" \
"Playtester feedback: \"You only have one boat, but why not two?\"

Ties to the Long House 25-pop grind (voyages are the main refugee spigot). A second boat would double the rate of inbound newcomers and give the player a second investment choice (who crews it).

Design questions:
- Is it a buildable? (e.g. Dock building unlocks boat 2, costs wood+stone)
- Or a Long House civic upgrade?
- Does it share the fishing XP bonus?

Should stay thematically grounded — a fleet of ships feels off for a refugee camp, two boats feels right."

file_issue "Seasons: four turns per year instead of one" \
  "Backlog" "feature,deferred" \
"Playtester feedback: \"One turn is one year? They don't do much in a year eh. I think seasons is a more appropriate turn length, gives an urgency to farming in the spring/summer before winter.\"

Already noted in CLAUDE.md as a planned later feature. Deferred because it's a full pipeline rewrite:
- Yield timing changes (spring plant, autumn harvest)
- Food consumption by season (winter costs more?)
- Aging/births/events all need to be quartered or moved to annual rollup
- SAVE_KEY breakage guaranteed

Don't tackle until mid-game (combat) is more settled."

file_issue "Long House unlocks Frostpunk-style civic decisions" \
  "Backlog" "feature,deferred" \
"CLAUDE.md notes this as a future hook tied to the Long House:
\"Future Frostpunk-style decisions (who leads, what values Cambrera holds) should be triggered by the Long House as the civic anchor.\"

A decision system separate from the random-event weight table — one-shot or scheduled civic choices with durable state effects. Needs design work before implementation."

file_issue "Mountain pass road unlock" \
  "Backlog" "feature,deferred" \
"CLAUDE.md notes roads currently can't be built over mountain tiles. A future unlock should let the player construct a mountain pass at significantly higher cost, acting as the narrative moment of contact with settlement(s) on the far side of the range.

Design questions:
- What's on the other side? (Ties to the Exarum-survivor arc)
- Is the pass a construction or a scripted narrative event?
- Does it unlock a trade route, a new biome, or both?"

file_issue "Hunting Lodge — clarify the 'you start with a lodge' confusion" \
  "Backlog" "needs-info,ux" \
"Playtester wrote: \"You start with the hunting lodge, but it isn't super obvious, perhaps set a check for whether the existing hunting lodge is at full capacity and if no then prompt user not to build the hunting lodge.\"

Players do NOT start with a Hunting Lodge — they start with 3 hunters working forest tiles, which provides food without the lodge. The lodge is a +0.5 food/hunter buff available for 10 wood.

Likely sources of confusion:
- Hunters produce food immediately, so the player assumes the infrastructure must already exist
- The Buildings panel shows 'Hunting Lodge' available to build and the player isn't sure if it's already there or not

Options:
- Clearer tooltip on the Hunting Lodge build button (\"Boosts hunters by +0.5 food — not required for hunting\")
- Tutorial line on turn 1 explaining that hunters work out of the box
- Ask the reporter for more context before acting

Tagged needs-info until we hear back from the reporter."

echo ""
echo "Done. Review the new issues at https://github.com/$REPO/issues"
