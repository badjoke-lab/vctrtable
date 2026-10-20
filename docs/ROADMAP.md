# Roadmap — vctrtable

## Decisions preserved

First game: **PvP Texas Hold'em**, private tables before public discovery; later add independently packaged table games in this same repository.

Casual games: starting chips, blinds, action timer (or unlimited), and between-hand rebuy policy are proposed anew for each session and require the players' agreement. Chips reset between sessions, not every hand. Unlimited pause after unanimous approval, with later support for sit-out and reconnection.

English first; Japanese UI per player. Chat is part of the table, with original messages preserved and translation on demand or optionally automatic after safe integration. Freeform conversational AI/PvE is supplementary, not the main launch target.

Chips are purely recreational: no real money, purchases, transfers, redemption or betting for value.

Season/competitive mode (later): possible fixed defaults include 2,000 chips, 10/20 blinds, 20-second actions and 30-second time bank. NOT imposed on casual games.

## PR 1 — Foundation (this PR)

- WebXDC lobby for only non-secret join, chat, rule proposals, approvals and pause agreement demonstration.
- English/Japanese UI; deterministic poker 5-to-7-card hand evaluator and showdown tests.
- Package poker.xdc, automate unit tests and archive build in CI.
- WARNING: not an authenticated protocol, and not a playable PvP game yet.

## PR 2 — Security-gated private hands and complete 2-player match

- Verify actual Vector SDK Bot/XDC bridge and authenticated per-player private message transport on physical devices.
- Determine trust model for dealer, shuffling, randomness, commitments, turn sequencing and replay.
- Prevent all private hand cards, remaining deck, private randomness and credentials from broadcast updates.
- Enforce author authentication before accepting bets or move decisions.
- Then implement first complete heads-up hand with proper blind/button order, moves, showdown, reconnect tests.

## PR 3 — Real casual rules and robust poker

- Session-configurable chip values, blind amount, action time and rebuy mode, unanimous approval.
- All-ins, side pots, tied pots/odd chips, min raises, timeouts, sit-out, pause/resume and crash recovery.
- Versioned authoritative action log with reproducible deterministic replay.

## PR 4 — 2–6-person PvP

- Private invites, multiway pots, chat/moderation, beginner hints about permitted actions, testing on Vector.
- Public lobby/matchmaking later.

## PR 5 — Privacy-aware chat translation

- EN/JA display per user; translation on tap and optional per-user automatic view.
- Identify translation provider or on-device translation, consent, costs, retention and fallback.
- Never silently send confidential chat text to an outside provider.

## After PvP

- PvE/LLM free conversation, optional AI seats.
- Seasonal/ranked competition.
- More card/board/table games.

## Protocol concern

Standard WebXDC sendUpdate sends to all peers and is not a secure channel for private hole cards; its UI-supplied sender ID is not itself proof of authorship. This early lobby is for developer validation of harmless state only. Fair dealing and move authentication remain blocking work.

## Solo QA gameplay implementation (additional milestone)

The project is now being tested by one person; coordinated multi-user Vector testing is deliberately postponed until near completion. A self-contained QA interface exercises 2–6-seat poker using scripted opponents, client-local card state and the production-intended rules engine. It supports dealing, standard betting actions, blinds, streets, side pots, chip accounting, rebuy between hands, and a local action timer. The QA pause button *simulates* unanimous agreement and does not authenticate live remote votes.

Blocking later PvP tasks remain: secure per-recipient hole cards, authenticated action sender, authoritative dealer and turn ordering, reconnect and resync, hand replay, and multi-client tests. Do not broadcast any secrets. The QA simulation is not real PvP and not an AI-chat product.

## Additional milestone — deterministic local session replay and correctness

Before any multi-human test, provide explicit local QA save/load/delete. Journal complete private deck order and actions locally to allow deterministic restoration; never send the journal to the shared WebXDC room or any external service. Action-clock resets on restore. Add golden tests for the heads-up first-card recipient and for ties with odd chips (seat left of dealer), plus short all-in non-reopening and mid-hand recovery.

**Still not implemented:** secure Vector player identities, trusted dealer/private card transport, actual network turn clocks/consent, full reconnect, real multiplayer and translation provider.

## PvP dealer protocol milestone (local-only simulation)

Implement in-memory dealer orchestration for authenticated caller *assumptions*, per-session unanimous settings, revisioned commands, idempotent requests, dealer-managed turn deadlines, unanimous no-limit pauses, redacted public snapshots and per-player private snapshots. Test 2–6 simulated seats in one process. Then add a **separate, verifiably authenticated Vector SDK Bot adapter** and persistence; real multi-user testing remains deferred. The in-memory core by itself does not prove network confidentiality or authentication. See DEALER-PROTOCOL.md.

## Durable dealer checkpoint (single-developer, no Vector accounts needed)

Implemented encrypted-at-rest local trusted-dealer journal and deterministic recovery of shuffled decks, turn revisions, previous command receipts, pauses and deadlines. ACK only after persistent save; a disk failure disables new actions until restart. Tests cover encrypted file corruption, wrong key, complete and partial hand recovery, timeout replay and single-process sequential writes.

Remaining: live Rust SDK adapter with NIP identity verification, Rust↔Node process boundary (or engine port), audited recipient encryption, production exclusive-write lease, deployed bot identity/key storage, and deferred real Vector multi-user tests.

## Vector SDK DM adapter milestone

Rust SDK v0.11.0 `VectorBot::on_message` + `bot.dm(npub).send` integrated into a local Node dealer over pipes. Trusted author comes from SDK DM metadata, not JSON. The Node worker receives commands, persists them, and returns recipient-scoped snapshots; a 1-second trusted tick drives action deadlines. Dedicated per-player DM resync is possible. Test with child process and fake identities, compile Rust through a CI check. Currently the WebXDC client is NOT connected to DM transport; raw JSON in DMs is developer-only. Real end-to-end Vector multiplayer is deferred as requested.

## Manual WebXDC/Vector DM UI milestone

A per-player table view in `dm.html` displays imported, recipient-specific Bot state and creates actions for manual sending via Vector's 1:1 Bot DM. It supports gameplay and consent controls, English/Japanese UI, rejects cross-seat/stale/malformed snapshots, and does not broadcast secrets or persist the DM contents. The actual standardized WebXDC API has no automatic recipient-specific DM receive bridge; `sendToChat` only invokes a user-mediated chat compose action. Therefore true in-app automatic SDK ↔ Mini App messaging remains a **verified integration blocker** and cannot be marked complete. Continue developer-only simulator/CI tests; do not require multi-human testing yet.
