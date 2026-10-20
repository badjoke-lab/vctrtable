# vctrtable

A monorepo for standalone Vector/WebXDC table games. Poker (Texas Hold'em) comes first.

## Status

**Development prototype, NOT a playable or secure poker match.** Initial scope: a multiplayer lobby for non-secret state, chat, rules proposals, unanimous voting, and a pause-request demonstration. A pure Texas Hold'em hand evaluator is independently tested. English UI is the default with a Japanese switch.

**Security boundary:** WebXDC status updates broadcast to the entire table. No hole cards, deck order, seeds, keys, or other private data are transmitted. Sender identities in this lobby are not cryptographically verified, so neither bets nor real dealing are enabled.

No money wagering, chip purchases, transfers or cash-outs.

## Build

Requires Node 20+ and a system zip executable.

    npm test
    npm run build

The output is dist/poker.xdc. Open it in Vector or a WebXDC development simulator. Opening apps/poker/index.html directly gives a single-device interface preview.

See docs/ROADMAP.md for the staged security and game plan.
