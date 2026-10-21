# Bundled playing-card artwork

The 52 illustrated card faces are generated offline from the self-contained **CardMeister FULL** JavaScript deck.

- Upstream: https://github.com/cardmeister/cardmeister.github.io
- Source file: `elements.cardmeister.full.js` from the upstream `master` branch.
- Local vendored copy: `apps/poker/cardmeister.full.js` (unchanged upstream asset).
- License: **Unlicense** (public-domain dedication, permissive fallback); see upstream README and https://unlicense.org/.
- Its FULL variant has **12 separate J/Q/K SVG courts**, rather than the minified one-portrait-per-rank variant.
- All 52 faces, back graphics and their color/shape details are provided locally, with no remote fetches or Google fonts.
- `cards.js` is our thin wrapper for the game's two-letter rank-and-suit codes and accessibility descriptions. It does not draw fake portraits or add duplicate pip glyphs.
- Browser CI decodes the 52 SVG face images and the face-down card; packaging tests verify the asset is included in `poker.xdc`.

Do not remove this file from the `.xdc` bundling list. Avoid external CDN dependencies for private offline Vector games.

## Presentation rules after settlement

While a hand is betting, show pot and each live contribution. Once complete, label the pot **Paid out / 精算済み**, show winners' awarded chips (otherwise contributions as historical amounts), mark the round **Showdown / 決着** and hide the obsolete action clock. The actual payout breakdown is in the result panel.

## Phone six-seat layout

On 320–390 px screens, seats must never obscure actual community-card faces, the hero's hole cards or the action dock. Two side seats are lowered on the felt, and the top seats stay within the table. In automatic Chromium QA, rectangles for all seats, board cards and hero are checked on narrow viewports. Final acceptance still requires a Vector Android WebView screenshot.
