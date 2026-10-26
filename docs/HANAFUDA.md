# Hanafuda (Koi-Koi) in vctrtable

## Scope / status (2026-10-26)

New standalone game under `apps/hanafuda` and `packages/hanafuda`, intentionally isolated from Poker.

**Local QA prototype only:** One human on one device vs a deterministic-rule, scripted local opponent. It is neither live Vector PvP nor a trustworthy online deal. All 48 card faces and one back use licensed pinned GitHub mirror SVG artwork included in the resulting XDC. Do not call this release-ready.

## Rules profile

- 48 cards, 12 months × 4; two players with 8 cards each, 8 face-up field cards and 24-card draw pile.
- Match cards by month. If the field has two cards of the same month, select exactly one; if the field has three, the fourth wins all four.
- Hand card played first, then one draw-pile card. The rules kernel handles both sub-steps, captures, yaku decisions and turn order.
- Yaku: five/four/rain-four/three brights, boar-deer-butterfly, red/blue ribbons, flower/moon viewing with cup, 5+ seeds, 5+ ribbons, 10+ plain. Cup counts as both seed and plain in scoring.
- Stop versus Koi-Koi decision after forming a new/improved yaku. Opponent scoring after declared Koi-Koi ends the round with a ×2 counter multiplier. Rounds settled at 7+ points have ×2 multiplier.
- First hand containing four cards from one month (teshi), or four month-pairs (kuttsuki), immediately scores 6. Invalid field containing four of a month is redealt.
- Default 12 rounds; QA menu also supports 3 or 6. Dealer initially selected at random; then round winner becomes dealer (or rotates on no-score).
- Local test opponent follows a simple heuristic; no artificial intelligence, matchmaking, real contacts, public rooms, chips or cash stakes.
- Actual local-deal RNG is `Math.random()` and therefore **not suitable for adversarial PvP**.
- Specific regional house-rule variants, Koi-Koi multipliers, end-of-deck handling and disputed yaku stacking must be rechecked before secure online play.

Reference: [Nintendo Koi-Koi rules](https://www.nintendo.com/jp/others/hanafuda_kabufuda/howtoplay/koikoi/).

## Build

```sh
npm test
npm run build:hanafuda
```

Result: `dist/hanafuda.xdc`. Open as a new Mini App in Vector or a WebXDC simulator. The existing Poker `dist/poker.xdc` remains independent. The Hanafuda build downloads licensed source SVGs only at build time; playback needs no network for card art.

## Blocking work before actual Vector PvP

1. Verify all 48 the pinned CC BY-SA GitHub art mirror SVG illustrations visually on real phones/PCs, retain CC BY-SA 4.0 attribution and pin asset hashes for long-term reproducibility.
2. Rules QA: exact official variants, simultaneous special hands, full end-of-deck and replay edge cases. Test on real PC/phone.
3. Trusted dealer: only dealer holds deck order and secret hands, authenticated per-seat moves with revisions, replay/timeout/reconnect, robust shuffle.
4. Verify that the SDK can deliver private per-recipient data into the Mini App without broadcasting it through WebXDC shared update. This is already a blocking issue for Poker, not solved here.
5. Two real Vector accounts and devices: privacy verification, out-of-order delivery, resync, pause consensus; test close to production.

**Privacy:** Never publish `game`, `hands`, `deck`, complete local logs, or RNG seeds through `webxdc.sendUpdate`. Only recipient-private authenticated delivery and safe public projections are viable for online use.

## Card artwork

The 48 recolored SVG faces and one original geometric back are sourced from a fixed GitHub commit of a Louie Mantia derivative recolored by dotty-dev, with an original geometric back by vctrtable, licensed CC BY-SA 4.0. The originals are downloaded at **build time** and packaged inside the XDC, not fetched while playing. See [full art license and sources](HANAFUDA-ASSET-LICENSE.md).

## Beginner-first UI milestone (2026-10-27, Draft PR #46)

The single-device QA interface now uses a **reversible selection state**, separate from the mutable rules engine.

- Hanafuda artwork is displayed using its native 976:1600 aspect, with larger touch targets / horizontally scrollable hand cards on mobile. It is not horizontally stretched.
- Tap a hand card to highlight only its matching field month; switch to another card or cancel without consuming a turn.
- Confirm is disabled until exactly one legal field target is selected when two choices exist. A no-match card stays on the field, one-match cards are paired, and three-match sets capture all four.
- The game engine supports opt-in `deferDraw` after confirmed hand-play so animations can show each visible step. The mandatory deck draw still occurs exactly once; the drawn card may require a separate field-target choice.
- After confirm, cards visually travel from the hand to the field, then to the player's **captured pile** (not back to their hand); a revealed deck card then travels separately. Opponent moves use a face-down source and reveal only the card being played. Actions are blocked during motion.
- A compact yaku-progress indicator uses **only the player's own captured cards**; selection previews explain which completed scoring sets and progress counts can improve immediately with the chosen card and field target. Full guide shows labeled actual card faces and short English/Japanese explanations. No hidden opponent or deck predictions.
- Reduced-motion devices skip flying animations without changing engine state.

Verification completed in the assistant's execution environment: syntax checks on the game UI/rules/guide, 125 locally simulated staged rounds (3,052 engine steps), and a fake-DOM click-through of selection/target confirmation/re-draw. Repository CI adds `tests/hanafuda-ui.test.mjs` and checks that the guide module is actually packaged in the XDC.

**Still pending:** independent browser visual checks at real viewport sizes, real Vector Note PC/mobile tests, and confirmation that the updated XDC release has passed the remote build workflow. Do **not** report full device QA complete or claim actual PvP.
