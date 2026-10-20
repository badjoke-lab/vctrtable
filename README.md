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

The output is dist/poker.xdc. Open it in Vector or a WebXDC development simulator. Opening apps/poker/index.html directly gives a single-device interface preview.

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
