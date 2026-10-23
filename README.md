# vctrtable

A monorepo for standalone Vector/WebXDC table games. Poker (Texas Hold'em) comes first.

## Status

**Development prototype: local poker hands are playable in QA mode, but online PvP is NOT active.** Initial scope: a multiplayer lobby for non-secret state, chat, rules proposals, unanimous voting, and a pause-request demonstration. A pure Texas Hold'em hand evaluator is independently tested. English UI is the default with a Japanese switch.

**Security boundary:** WebXDC status updates broadcast to the entire table. No hole cards, deck order, seeds, keys, or other private data are transmitted. Sender identities in this lobby are not cryptographically verified, so neither bets nor real dealing are enabled.

No money wagering, chip purchases, transfers or cash-outs.

## Build

Requires Node 20+ and a system zip executable.

    npm test
    npm run build

The output is dist/poker.xdc. Open it in Vector or a WebXDC development simulator. Opening apps/poker/index.html directly opens the mobile single-device poker UI; apps/poker/lobby.html preserves the experimental shared WebXDC lobby.

See docs/ROADMAP.md for the staged security and game plan.

## Shared Vector group invitation lobby (PR #35)

The **Create / Join Table** link at the top of the local QA screen now opens
the group-shared lobby. A host presses **Create Table**, chooses a 2–6-seat
capacity, and invites contacts into the **same Vector group chat** using
Vector's own group invitation controls. The guest accepts the group invite,
opens the **same Poker Mini App message in that group**, and presses **Join
Table**. Nobody needs to post their own Note or enter a room ID.

Create, Join, Ready, Leave, Close, rule proposals and public chat use nonsecret
WebXDC updates scoped to that exact Mini App instance. A **Prepare invitation
message** button uses `sendToChat` only to draft explanatory text; it does not
add anyone to a group, send automatically, or connect another DM/Note to the
same table. See [Invite and join details](docs/INVITE-TABLE.md).

**This is still lobby-only.** WebXDC-supplied sender claims are not verified
for actual dealing/betting, no private cards are broadcast, and there is no
automatic Mini App↔SDK dealer transport. Two-browser simulated WebXDC tests
do not prove two real Vector devices. The current QA poker game still uses
scripted opponents and remains available for local rules testing.

## One-person QA poker table

Use **Open local poker test** from the packaged WebXDC Mini App to play complete hands against 1–5 scripted seats (not a commercial PvE mode). This QA mode supports chip settings, blinds, action timer, local simulated pause, rebuy, fold/check/call/raise/all-in, board streets and multiway side pots. It does not send its private cards or deck over WebXDC. Testing one device does NOT validate player identity, trusted dealer, multiplayer delivery or real unanimous pause votes.

**Next:** keep improving single-device poker reliability, then integrate authenticated PvP and encrypted private dealing. Real-device multi-person tests are deferred until the game is near completion.

## Solo QA save and resume

On the test table, **Save session** writes an explicit opt-in journal to this device's browser localStorage; **Resume saved session** reconstructs the hand by replaying recorded moves, and **Delete saved session** removes the journal. Resume restarts the local action clock, not a networked turn clock. The journal includes the **entire private deck order and all players' cards**. It is not encrypted and should never be shared or treated as a live PvP record. No autosave or WebXDC broadcast is used.

Heads-up dealing order and odd-chip distribution (first surviving winner to the dealer's left) now have regression tests. This remains an offline QA table, not authenticated network poker.

## Trusted dealer prototype

A server-side, transport-independent authoritative dealer is under development in packages/poker/dealer-room.js. It enforces authenticated-caller *contracts* (identity is supplied by a future trusted SDK adapter), session-wide rule approvals, revision checking, turn authority, timeouts, unanimous indefinite pause/resume and strict public/private state separation. See docs/DEALER-PROTOCOL.md. It has no Vector SDK transport adapter, private message channel or persistence yet, and must not be presented as secure online PvP.

The additional message-envelope boundary (packages/poker/message-boundary.js) constructs separate public and per-recipient payloads. This is tested locally but **does not implement actual SDK messaging or encryption**. A verified Vector transport adapter remains a mandatory precondition for real PvP.

## Durable trusted dealer (Node backend, in progress)

`packages/poker/dealer-journal.js`, `dealer-store.js`, and `persistent-dealer.js` implement server-side, deterministic replay after process restart, AES-256-GCM encrypted storage with externally provided key, and persistence-before-acknowledgment. The engine survives mid-hand crashes without broadcasting hidden cards. `npm test` includes crash-recovery, pause and tamper tests. See [dealer recovery](docs/DEALER-RECOVERY.md).

**Not a Vector SDK connector yet.** The Vector Rust Bot-to-Node dealer bridge, authenticated sender identity, encrypted private-hand delivery, secure single-writer deployment and eventual multi-human test remain open work. No user setup needed for this development milestone.

## Vector SDK DM dealer bridge (development)

A new Rust **Vector SDK 0.11.0** bot (`bots/vector/`) receives authenticated NIP-17 DMs and forwards them over private local stdin/stdout to the Node trusted dealer (`bots/poker/dealer-worker.mjs`). Recipient-specific state is returned by individual encrypted DMs; secrets are not written to WebXDC group updates. The Node worker has a real-process regression test. See [Vector SDK adapter](docs/VECTOR-SDK-ADAPTER.md). **The WebXDC table UI is NOT wired to this bridge yet, and no real relay connection/real user test has been performed.**

## Manual Bot DM poker seat (development only)

The new `dm.html` inside `poker.xdc` renders a complete **per-player seat** using manually imported JSON DM snapshots: own cards, public board, pots, stacks, legal actions, settings approval, pause voting, rebuy and resync. It can generate versioned Bot DM commands for copying into an authenticated 1:1 Vector DM. It **cannot** automatically exchange DMs from inside a standard WebXDC sandbox. Private snapshots are held only in memory; they are never shared through `sendUpdate()`. Import checks the intended recipient ID, but cannot cryptographically verify the sender of manually pasted text. See [the WebXDC/DM transport decision](docs/WEBXDC-DM-BRIDGE.md). The existing `qa.html` remains the recommended one-person full-game tester.


## Mobile Poker table visual refresh

Single-device QA now renders a compact 2–6-seat oval poker table, premium self-contained card artwork (illustrated J/Q/K faces and distributed number-card pips), and a sticky legal-action dock. On mobile, chat mode is user-selectable: **Always on** places a small scrollable chat below the table; **Drawer** leaves the table expanded with an unread badge and a brief new-message preview. Both modes share one message stream and offer quick replies. The QA demo has local scripted chat only, and its optional English/Japanese translation covers **predefined demonstration phrases**, not unrestricted real translation. No actual encrypted Vector PvP/DM bridge is implemented in the Mini App yet.

See [the mobile table and chat specification](docs/MOBILE-TABLE-CHAT.md). This UI is an implementation to test visually on one phone, not a completed multi-person game.

## Start screen / corrected entry point

From this update forward, **index.html launches the mobile solo poker UI directly** (the new six-seat table is shown after pressing Start local session). The old shared multiplayer prototype has moved to `lobby.html`, accessible via the header's Lobby link; `qa.html` remains a direct alias for single-device testing, and `dm.html` links back to the preserved lobby. Existing already-opened Vector Mini App messages may continue showing the older embedded app bundle. Open a newly shared updated `.xdc` to see the changed entry point. Never assume that editing a GitHub release asset live-upgrades old messages.

## Optional public Vector text chat on the game table

The mobile test table now supports a **separate opt-in public text-chat mode**. Without opting in, scripted demo chat stays local. When enabled inside a Vector WebXDC app, text messages alone are published through the standard WebXDC shared-update API. Everyone in the same Vector chat can read them. The UI reuses the existing always-on/drawer modes, unread badge, local phrase translations and quick replies.

This is **not an authenticated PvP command channel**. No cards, decks, chip balances, dealer state or hand actions are sent through group chat. Unsolicited historic chat updates are rendered without new-message notification when their sender timestamp is old. Real multi-account Vector sync is still unverified, as requested.

See [mobile chat specification](docs/MOBILE-TABLE-CHAT.md).

## Poker betting and showdown clarity

The mobile QA screen now shows the **actual number of chips payable** for short-stack calls, including an all-in call when facing a larger wager. All-in chooses a legal raise when available, otherwise an all-in call when that is the only all-in action. The Min / Half Pot / Pot / Max presets use shared raise-to calculations instead of duplicated UI arithmetic.

After each hand, the local-only results list the main pot, each side pot, any uncalled bet returned, the recipients of split pots (including odd chips), net winnings/losses after contributions, and English/Japanese hand ranking at contested showdown. Folded hands are never revealed as part of the result. These are **local result views**, not data published over WebXDC shared updates.


## Automatic real-browser mobile QA

The repository includes a separate, credential-free headless Chromium workflow (.github/workflows/browser-smoke.yml) that extracts the built poker.xdc and loads its actual index.html through a local HTTP server. It checks 320px and 390px mobile viewports, two- and six-seat rendering, the correct initial page, all five community-card positions, own cards, chat drawer/inline switching, local messages, fixed betting-dock visibility, horizontal overflow, save/reload/resume, and a real fold action. Screenshot artifacts are uploaded for review.

This checks UI runtime without requiring the user to open Vector. It is NOT an Android Vector WebView test, real Nostr identity test or multi-user network test. Playwright and Chromium are installed only in CI, never in the packaged poker.xdc.


## Browser-tested six-seat layout and complete hands

Mobile browser CI now checks 6 seats at widths **320, 360, 390 pixels**, 2 seats at 320px, all five opponent elements staying inside the screen/table and free of overlap with each other, community cards and the hero hand. It drives a **complete hold'em hand** through the visible Check/Call/Fold actions, verifies itemized showdown pots, checks that betting controls hide after settlement, and starts the next hand when chips allow. The tests also retain previously added save/restore and both chat UI modes. Captured PNGs remain GitHub Actions artifacts. These browser tests still use scripted seats; actual Vector multi-user tests are intentionally deferred.

## Manual Bot DM status

The developer Bot DM seat has visible EN/JA handoff states and safe exact-command retry. Generated JSON is NEVER described as an automatically sent message. The user can mark a DM as manually sent, re-use its original requestId after delivery uncertainty, and prepare a private resync. Imported older and same-revision-conflicting responses cannot replace the displayed state. The local delayed indicator does not establish a live Vector connection. A credential-free Chromium test checks these controls.

## Dealer process safety

The development Vector Bot's Node dealer worker now enforces a
**single-host, OS-released journal lease**, preventing accidental second
workers from corrupting the same encrypted room file. Crash/restart and
duplicate-process attempts are tested on real child processes. This is NOT a
distributed file lock or a completed Vector Mini App↔Bot private transport;
the current in-app game still uses its single-player QA simulator.

## Private DM text poker (development)

For users who want to play using only **authenticated Vector Bot DMs** while
standard WebXDC still lacks an automatic private per-seat reply bridge, the
Rust SDK Bot now accepts English-first commands. Send **poker status** to the
operator-provisioned Bot in a one-to-one DM, then use **poker REV call**,
**poker REV raise 100**, **poker REV fold**, plus unanimous rules/pause voting.
The Bot returns a readable private state to each opted-in seat, not the other
players' hole cards. Every mutation uses the visible revision and stable
incoming Vector message ID for idempotency. **poker json** restores raw state
for existing developer manual WebXDC import. See
[DM-first poker development guide](docs/DM-FIRST-POKER.md).

This is a separate *text DM player interface*, **not automatic Mini App PvP**.
It still requires Bot deployment with a static roster, and real Vector relay
and multi-device end-to-end tests are not complete. Do not send private keys.

## Approved 53-card PNG deck — source of truth

The user's approved deck is stored as
[`vctrtable-approved-deck-53-png.zip`](vctrtable-approved-deck-53-png.zip)
in this repository, with exactly 52 card fronts (`2D.png`, `5C.png`,
`JS.png`, etc.) and a blue `BACK.png` image. They are complete **240×336**
PNG images, including all twelve J/Q/K courts. **No third-party PNG art is
downloaded during the build or at runtime.** The approved ZIP is checked against
SHA-256 `6612233288e54d73ee1c144e59b5f984bdde7979eef4c4755cb264263c074c36`.
The previously defective 2♦/5♣ images are pinned individually as well.

Run `npm test && npm run build` to validate the unchanged approved ZIP,
extract all 53 embedded PNGs, and produce `dist/poker.xdc`. Missing, altered,
duplicated or incorrectly sized images **fail the build** rather than silently
falling back to incorrect card designs. Mobile browser CI checks that cards
decode at their original 240×336 dimensions and that 2♦, 5♣ and BACK resolve
to their approved filenames.

**Important:** an older `poker.xdc` in Vector messages never updates itself.
Open a newly published XDC package to see the corrected deck.

## Vector Poker dealer — offline setup and portable binaries

The SDK Bot for private 1:1 dealer DMs is now independently packageable for
Intel macOS and Linux x64 via `.github/workflows/vector-bot-package.yml`.
It uses a dedicated Bot identity and **never requires a player's nsec**.

On a trusted operator machine, from an extracted matching portable package
(or from this repository with Rust installed), with Node.js 20+:

```sh
npm run vector:init
# Edit ~/.config/vctrtable/private.json locally:
# enter PUBLIC Vector npub values for 2–6 players. Never share this file.
npm run vector:check
npm run vector:start
```

`init` generates a dedicated Nostr Bot nsec and a new journal encryption key
locally, prints **only the Bot npub**, writes a private `0600` config and
`0700` journal directory, and refuses to overwrite the saved identity/key.
`check` runs offline. `start` holds the dealer exclusive-writer lock and
runs in the foreground; Ctrl+C stops it. Keep the identity/key and the journal
safe between restarts.

The Bot can receive registered players' encrypted `poker probe` /
`poker ack TOKEN` DMs and versioned poker text commands. A successful local
compile **is not evidence** that a real player/device has received a DM.
The XDC UI still cannot automatically send or receive those private DMs.
See [DM-first poker](docs/DM-FIRST-POKER.md) and
[same-chat invitations](docs/INVITE-TABLE.md).
