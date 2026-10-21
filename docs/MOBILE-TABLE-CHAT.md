# Mobile table UI: six seats and chat modes

Status: **implemented in the single-device QA app**, not yet integrated with real Vector PvP. This spec follows the October 2026 mobile-portrait mock and remains the default layout for eventual authenticated PvP.

## Six player table

- A self-contained emerald oval table accommodates one local seat and up to five opponent seats.
- Opponent layouts adapt deterministically to 2, 3, 4, 5 or 6 occupied seats.
- The five possible non-local positions are top-left, top, top-right, mid-left and mid-right. The local player's hole cards are centered at the bottom.
- The pot, street and five community-card positions are central. The player's action timer and stack sit below their cards.
- Action buttons remain sticky near the bottom. Folds/checks/calls are offered according to engine legality; raise presets set **raise-to amounts**, not additional contribution. Pot-size preset uses current street bet plus existing pot plus call, clamped to the actual allowed maximum.
- History and test save/resume are under expandable sections, off the main game surface.
- 52 cards use local vector/HTML artwork without remote image dependencies. J/Q/K have illustrated royal figures, A an oversized pip and numbers 2–10 conventional distributed pip layouts.

## Chat is selectable, never a side panel on phone

**Inline (常設):** a compact chat panel in normal document flow below the table and above the sticky actions. It shows a bounded message list, input and quick replies. Messages scroll *inside* the panel and cannot cover the actions. The table keeps its full width.

**Drawer (ドロワー):** chat panel is hidden until opened by a floating button. When closed, the button shows the unread count, and new messages show a short toast preview for roughly five seconds. When opened, a bottom overlay is positioned **above the sticky action controls**, not over them. Opening clears unread. A close button collapses the overlay.

The user's mode choice is stored per browser, but message text is not persisted in localStorage. Each mode uses the **same** in-memory chat model, keeping chat continuity when switching modes. Incoming messages in inline or open drawer are immediately visible rather than counted unread. Own outgoing messages never increment unread. Quick replies do not send external HTTP requests.

## Translation

The toggle in the QA screen translates **only seven fixed demonstration phrases**, locally, to English/Japanese while leaving originals intact. It does not imply that arbitrary natural-language chat has been translated or transmitted to a third-party API. Production chat needs a provider/on-device translation design with consent and privacy review.

## Current QA scope and next steps

The single-device screen includes **simulated chat messages** from scripted opponent seats and a local-only message composer. This is for one-person visual, notification and interaction testing. It is not live table chat, a production PvE system, or proof of multi-client Vector synchronization.

The existing separate lobby has rudimentary shared WebXDC chat. Before production, consolidate its shared public chat transport with this UI model, then integrate the authenticated PvP hand/command channel once a safe private Vector transport is available. Never publish secret hands, deck or dealer journal through WebXDC status updates.

Real-device usability still needs checking on Android and narrow screen sizes; automated code/unit checks alone do not prove the layout visually correct.
