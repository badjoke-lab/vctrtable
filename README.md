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
