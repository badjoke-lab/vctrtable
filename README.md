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
