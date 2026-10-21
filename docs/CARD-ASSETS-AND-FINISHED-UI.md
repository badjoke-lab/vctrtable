# Offline PNG playing-card artwork

The Poker Mini App now displays **53 actual PNG files** (52 faces + one blue back) instead of CardMeister SVG custom elements.

The card source is [saulspatz/SVGCards](https://github.com/saulspatz/SVGCards), directory Decks/Vertical2/pngs. These assets are published as **public domain** by the author. The source commit is pinned to f8df28774736ea2545fc8e7fb693eb55ce031945. Cards are mapped exactly to the game engine's rank/suit names.

Only during a packaging build, scripts/poker-png-assets.mjs downloads 53 files from the pinned commit. It checks the PNG signature, dimensions and item count and places every file inside poker.xdc. In Vector there are NO card image network requests: the images are local paths inside the .xdc.

**Build caveat:** a checkout without Internet currently cannot build its first PNG package (source assets are fetched at build time). Runtime is entirely offline for images. This is not falsely described as an offline source build.

## UI / regression policy

The Android screenshots showed side seats covering board cards, and a bottom action dock covering inline chat. Narrow-screen positioning now reserves room for five centered PNG board cards and shrinks the two edge seat panels. Chromium checks collisions AFTER revealing the full river, not merely when five placeholders are empty.

In chat focus, both drawer and inline composer use a separate full-height panel with a compact live local hand/timer HUD and hide the betting dock. In ordinary inline mode, the compact chat follows the table and reserves dock-height scroll space.

Only ONE betting dock exists in the DOM. Some full-page screenshot capture methods paint a fixed element twice, but an extra painted copy is not necessarily a duplicated interactive element. Test both the DOM count and live view positions.

The Android Vector WebView and real soft keyboard still require device verification; Chromium cannot guarantee the same viewport behavior.
