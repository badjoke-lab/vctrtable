# Crash recovery for the trusted Poker dealer

This milestone implements a **Node.js dealer backend component**. No live Vector SDK Bot integration is claimed. The user can continue testing solo; multi-user Vector tests remain deferred.

## What is persisted

An append-only, replayable record of accepted dealer commands, identity as passed by the future verified transport adapter, authoritative server timestamps, timeouts, and the full initial deck of each hand.

**This is highly sensitive material:** the journal contains every private hole card via its deck sequence, all hands, all participants and their betting behavior.

The persisted journal is encrypted with AES-256-GCM using a caller-supplied 32-byte key. The key is *never* generated or checked into the repository by the app. The saved file is written via a temporary file and atomic rename, with restrictive file permissions.

- The **private key belongs in the operator's secrets manager**, not GitHub, a source file, a client WebXDC update, or a public environment log.
- The journal is **NOT** encrypted against a compromised host process, a stolen key, or an active malicious dealer.
- The recovery store currently assumes **one dealer process/writer**. No distributed lock, high availability, database lease or cross-host coordination is implemented.
- No GitHub Actions artifact includes any live saved journal or dealer secret.

## Restart model

1. The trusted dealer bridge supplies an authenticated room roster and the same persistent encryption key.
2. PersistentDealer.open decrypts the existing file (or initializes a new room) and replays every recorded operation.
3. After replay, the dealer has the exact same hand, bets, turn, saved vote approvals, pause state, outstanding request receipts and remaining deck as before.
4. The scheduler must call tick with an authoritative current clock after startup. If not paused and an action deadline has passed, the engine applies its configured check-or-fold timeout. **An already approved pause remains indefinite across restart.**
5. Commands are accepted in memory and **persisted before acknowledgments** can be returned. If saving fails, the in-memory broker faults and blocks further commands until it is discarded and reopened from the last durable record.

The recovery log stores revisions and failed requests only when they cause authoritative timeouts. Ordinary invalid commands do not change state and are not included.

## Usage contract

Import PersistentDealer from packages/poker/persistent-dealer.js in a Node 20+ trusted dealer application (not inside an XDC Mini App). Supply an absolute private filename, roomId, 2-6 seated players, a secret 32-byte key, and an appropriate trusted server clock. For testing, the injectable deckFactory can return a fixed permutation.

This component makes **no networking claims**. An SDK adapter must verify actual Vector authorship before assigning actorId. Any privateState output must only travel through a verified recipient-encrypted SDK channel. Public WebXDC updates may contain only the separate redacted public view.

## Important future work

- Actual Vector SDK 0.11.0 Rust Bot adapter, authentication and recipient-specific encrypted private messages.
- Secure process boundary between a Rust SDK adapter and the Node.js trusted dealer (or port the dealer logic to Rust).
- Host-exclusive writer lock, durable transaction/queue handling across multiple processes and monitored key rotation.
- Reconnection and resync policies; reconciliation with clients after a restored authoritative session.
- Independent adversarial review and eventual multi-device Vector test only near feature completion.

This is a **trusted centralized dealer** architecture for non-redeemable entertainment chips, not trustless cryptographic poker.
