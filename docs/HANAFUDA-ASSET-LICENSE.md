# Hanafuda card artwork — source, attribution and license

## Provenance

The `hanafuda.xdc` package contains **48 genuine illustrated Hanafuda card faces and one back**, taken from the coherent *traditional colors, black border* SVG set hosted on Wikimedia Commons.

- **Original illustrations:** Louie Mantia (Wikimedia Commons: [Louiemantia](https://commons.wikimedia.org/wiki/User:Louiemantia)).
- **Traditional-color adaptations:** すけじょ (Wikimedia Commons contributor; credited on original image pages).
- **Some later source revisions and card back:** Spenĉjo.
- **Source category:** https://commons.wikimedia.org/wiki/Category:SVG_Hanafuda_with_traditional_colors_(black_border)
- **License:** [Creative Commons Attribution–ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
- **Changes made in this project:** Source SVG face drawings are downloaded unchanged; the app scales them to fit the game UI. File renaming from Commons to local `cards/<month>-<ordinal>.svg` is only for packaging. The build does not alter vector art.

Copyright in the original artwork remains with the respective creators. This project's code is separate; use and modification of the illustrated cards are subject to CC BY-SA 4.0, including attribution and share-alike on adapted artwork. These authors do not endorse this game.

## Exact artwork/file list and URLs

`scripts/hanafuda-card-assets.mjs` defines a one-to-one card manifest. It uses each Wikimedia Commons original SVG filename, its corresponding `cards/1-1.svg` through `cards/12-4.svg` local name, and the `cards/back.svg` image. Tests ensure no image is omitted or duplicated and audit the key yaku subjects.

Each original source page is independently accessible from the filename:

`https://commons.wikimedia.org/wiki/File:<filename>`

For example:

- Pine with crane (松に鶴): https://commons.wikimedia.org/wiki/File:Hanafuda_January_Hikari_Alt.svg
- Cherry with curtain (桜に幕): https://commons.wikimedia.org/wiki/File:Hanafuda_March_Hikari_Alt.svg
- Bush clover with boar (萩に猪): https://commons.wikimedia.org/wiki/File:Hanafuda_July_Tane_Alt.svg
- Peony with butterfly (牡丹に蝶): https://commons.wikimedia.org/wiki/File:Hanafuda_June_Tane_Alt.svg
- Pampas with moon (芒に月): https://commons.wikimedia.org/wiki/File:Hanafuda_August_Hikari_Alt.svg
- Chrysanthemum with sake cup (菊に盃): https://commons.wikimedia.org/wiki/File:Hanafuda_September_Tane_Alt.svg
- Maple with deer (紅葉に鹿): https://commons.wikimedia.org/wiki/File:Hanafuda_October_Tane_Alt.svg
- Willow with Ono no Michikaze (柳に小野道風): https://commons.wikimedia.org/wiki/File:Hanafuda_November_Hikari_Alt.svg
- Paulownia with phoenix (桐に鳳凰): https://commons.wikimedia.org/wiki/File:Hanafuda_December_Hikari_Alt.svg
- Back: https://commons.wikimedia.org/wiki/File:Hanafuda_card_back_Alt.svg

See the category for the full credits on each of the 48 pages (a small minority may have different derivative contributors). The copyright/license attribution link is also visible inside the Mini App.

## Distribution / privacy

`npm run build:hanafuda` downloads the source artwork **at build time only**, validates SVG shapes, and packages the 49 files in `dist/hanafuda.xdc`. Card rendering then uses only local paths `cards/<id>.svg`: no runtime requests to Wikimedia, no remote card art leakage, and no requirement for players to be online for images.

The build intentionally fails on failed or suspicious source acquisition rather than shipping a partly blank deck or replacing correct images with emoji placeholders. Therefore build machines need HTTPS access to `upload.wikimedia.org`; once the XDC is built, game art is entirely self-contained.

The project should eventually vendor the verified assets with pinned hashes to remove its build-time network dependency. Current version is a QA prototype, not a security-reviewed production release.
