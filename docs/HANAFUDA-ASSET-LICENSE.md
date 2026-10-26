# Hanafuda card artwork — attribution and reproducible packaging

## Source and license

The game includes **48 illustrated Hanafuda card faces** reproduced from:
- **Original illustrations:** Louie Mantia, Wikimedia Commons [Hanafuda SVGs](https://commons.wikimedia.org/wiki/Category:SVG_Hanafuda).
- **Recolor/derivative set:** [dotty-dev/Hanafuda-Louie-Recolor](https://github.com/dotty-dev/Hanafuda-Louie-Recolor), commit `a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992`.
- **Face art license:** [Creative Commons Attribution–ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).
- **Card back:** an original geometric back made for the vctrtable Hanafuda QA prototype; it is **not** part of the original artwork set.

The derived card faces retain the creators' copyright and the CC BY-SA license terms. No affiliation or endorsement by the original artists is implied. The game's JavaScript logic is separately licensed according to this repository's policy; any adaptations of the CC BY-SA artwork remain subject to the applicable CC BY-SA obligations.

## Exact mapping and change statement

The authoritative 48-file manifest is `scripts/hanafuda-card-assets.mjs`. Source filenames are of the form `svg/Hanafuda_January_Hikari.svg`; the game copies the SVG bytes without modifying illustrations into `cards/1-1.svg`, continuing through `cards/12-4.svg` (1 = January, 12 = December). Images scale automatically via CSS. The accompanying tests check all 48 unique card IDs and key role-specific subjects.

The face artwork is a recolor of Louie Mantia's original deck, as documented and attributed by the derivative set creator, dotty-dev. This is **not** the `Alt` black-border series previously considered from Wikimedia Commons. The change to the pinned mirror was made after a source-CDN HTTP 429 rate limit prevented deterministic 49-file acquisition. This attribution reflects **the art that is actually packaged**, not the unshipped candidate.

Individual card links follow:

`https://github.com/dotty-dev/Hanafuda-Louie-Recolor/blob/a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992/svg/Hanafuda_<Month>_<CardKind>.svg`

Examples:
- [松に鶴](https://github.com/dotty-dev/Hanafuda-Louie-Recolor/blob/a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992/svg/Hanafuda_January_Hikari.svg)
- [桜に幕](https://github.com/dotty-dev/Hanafuda-Louie-Recolor/blob/a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992/svg/Hanafuda_March_Hikari.svg)
- [菊に盃](https://github.com/dotty-dev/Hanafuda-Louie-Recolor/blob/a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992/svg/Hanafuda_September_Tane.svg)
- [柳に小野道風](https://github.com/dotty-dev/Hanafuda-Louie-Recolor/blob/a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992/svg/Hanafuda_November_Hikari.svg)

## Offline build/privacy

CI checks out the *exact* pinned commit of the source repository into `external/hanafuda-art` and packages the SVG bytes with `dist/hanafuda.xdc`. Local builds without that checkout can download a **single GitHub source archive** pinned to the same immutable commit. No runtime network connection is used for loading card images. Cards, private deck order and unshown hands remain local in this QA build.

Do not reintroduce per-file pulls from Wikimedia Commons during CI. Recheck visual output on real PC/phone before merging.
