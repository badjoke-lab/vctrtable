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
