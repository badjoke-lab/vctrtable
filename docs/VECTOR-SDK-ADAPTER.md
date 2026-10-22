# Vector SDK DM dealer adapter (development)

This is the first actual Vector SDK adapter in the repository: a Rust 0.11.0 bot listens for **authenticated NIP-17 direct messages**, relays the message to an adjacent Node dealer process through stdin/stdout (not an open web API), then sends each player an individually encrypted DM with their own cards, the shared board and the current legal move. It is deliberately separate from the WebXDC Mini App for now.

## Boundaries and status

- Real Vector SDK methods used: `VectorBot::builder().nsec(...).build().await`, `on_message(...)`, `msg.message.npub`, `msg.chat_id` and `bot.dm(recipient).send(text).await`. Implemented against SDK **0.11.0**.
- A message is accepted only if received as a DM (never as a group/Community message), the SDK-decoded author is present, the DM chat corresponds to that author, and the author is explicitly registered at the table.
- No player identity may be supplied by the JSON command itself. The dealer worker uses the SDK-authenticated author passed by the Rust process.
- Room commands, server deadlines, optional rebuys, cards, deck order and pauses are owned by the server-side persistent dealer. The dealer's sensitive journal is encrypted at rest.
- Each private seat snapshot is sent only in an encrypted SDK DM to that seat. No WebXDC broadcast carries private cards.
- This is a *development interface*. Received poker state is raw JSON inside DMs rather than drawn on the game table. **WebXDC UI bridging, deployment and real Vector relay login are not verified yet.**
- A single Node worker and one Rust SDK bot process own the room. No exposed HTTP listener, room discovery, automatic account signup or live multiplayer tests are required now.

## Operator inputs (later, not needed for current code development)

Only when deploying: prepare a dedicated Vector Bot identity, a private dealer disk directory and a 32-byte random key from a secure secret store. Never paste the key or NSEC into chat, commit it or put it in a GitHub Actions log.

Environment variables required by the Rust process and inherited by its child:
- `VECTOR_NSEC`: private Vector Bot identity
- `VCTR_ROOM_ID`: arbitrary ASCII room identifier
- `VCTR_PLAYERS_JSON`: JSON list of 2–6 participants, each with `id` (real registered npub) and `name`
- `VCTR_DEALER_KEY_HEX`: exactly 64 hex characters encoding 32 random bytes, held only on the host
- `VCTR_DEALER_FILE`: absolute path for the encrypted dealer journal

Run **from the repo root** (after installing Rust and Node >=20):

    cargo run --manifest-path bots/vector/Cargo.toml

These are future deployment instructions, not something to execute before reviewing environment, secret management, release and the remaining Mini App connector.

## Command structure

A player sends the bot a JSON direct message. Example `propose`:

    {"protocol":1,"roomId":"room-1","requestId":"random-unique-id","expectedRevision":0,"op":{"type":"propose","settings":{"startingChips":1000,"smallBlind":5,"bigBlind":10,"rebuy":true,"actionSeconds":30}}}

Once other seats approve `{"type":"approve","proposalId":1}`, someone may `{"type":"startHand"}`. On turn, the current seat sends `{"type":"act","action":"call"}` or `{"type":"act","action":"raise","target":50}` using the **current** expected revision. The Bot also supports `{"kind":"sync"}` for a direct state refresh. Do not use an old revision or repeat a requestId for a different operation.

The full state DM is JSON with the current room revision, public state and recipient-only `private.ownHole`. It is unreadable as a normal UI for now. Do not distribute user account keys. There is no real-money wagering or cash-out support.

## Outstanding requirements

1. Connect the WebXDC player UI to this authenticated DM channel, with a safe (SDK-supported) return path and card-only rendering for the correct recipient. A Mini App's shared `sendUpdate()` is **not** a substitute.
2. Verify NIP-17 message sender metadata and recipient privacy end to end on real Vector builds. This has not been tested on-device.
3. Audit DMs and decrypted messages for stale/offline delivery, roster admission, app reloads, duplicate events and full reconnect without leaking state into chat logs.
4. Production durability still requires lifecycle management, key rotation, monitoring and redaction. A **same-host, cooperating Rust Bot single-writer lock** is now implemented; direct Node writers and distributed hosts are not guarded.
5. Human multi-device test only when remaining game and UI work is near complete.

The Node IPC test suite runs a real Node worker with **fake npub-shaped IDs** and confirms routing and restart behavior. It is not proof of real Nostr/Vector cryptographic integrity.

## DM delivery consistency and reconnection (transport hardening)

The developer Bot uses a single authoritative persistent dealer revision, and a player's **explicit `{"kind":"sync"}` request** retrieves only that verified sender's encrypted private seat snapshot. No other player's hand is returned in a resync response.

A command's stable per-player `requestId` is the idempotency key. If a player retries an already committed command because its original DM acknowledgement was lost, the dealer does **not** run the command twice and now resends the **current private snapshot to that player only** instead of flooding every seat. The receipt also records that it was replayed.

Important race: a late action can cause the dealer to **persist a timeout** before comparing the caller's stale revision. Although the action is rejected with `STALE_REVISION`, the timeout still advances the authoritative room. The worker now sends the new revision to **all seats** with individual encrypted DMs, and the Rust adapter delivers those snapshots even when the command itself failed. If a request was simply rejected without advancing state, only the authenticated sender gets a private snapshot for repair.

These are local protocol and IPC tests, including an encrypted worker restart. They do **not** establish that messages are actually delivered over a live Vector relay: a recipient may still miss an outgoing DM. Clients should request `sync` upon reconnect or after missing/uncertain acknowledgments. The current bot does not implement an automatic WebXDC request/reply channel, durable outbound queues, or automatic worker restart.

## Supervised worker process (October 2026)

The Rust SDK adapter now maintains a `DealerSupervisor` around its **single Node dealer child**. Each IPC request has an 8-second deadline; process startup has a 10-second deadline; handshake and response frames have 4 KiB / 256 KiB strict byte caps. An IPC timeout, malformed frame, EOF or broken pipe disposes of the child (kill-on-drop), rather than leaving the bot stuck on a closed pipe. The 1-second trusted tick loop continues running and attempts a fresh child from the same encrypted on-disk journal.

The Bot **never automatically retries a command with uncertain commit status**. It returns a fixed `DEALER_UNAVAILABLE_RETRY_SAME_REQUEST_ID_OR_SYNC` error when possible. Player requests may be retransmitted only with the original per-player requestId or followed by an authenticated `{"kind":"sync"}` request; the persistent journal already supports idempotent receipt replay.

After recovery, the local Rust supervisor issues a **host-only** `{"kind":"recover"}` request to the Node worker. This is not forwarded from a player's JSON DM. The worker returns the latest committed state as **individual private packets** to all configured seats. These replace (not append to) delivery packets from the preceding request, avoiding duplicate or stale snapshots. A Bot process started with an existing nonzero journal revision also runs this once to repair potentially missed DMs.

Worker reboot and frame-limit tests are now included in CI, including a Node worker crash/restore test using fake npub-shaped IDs. This does not guarantee Nostr relay delivery, detect live app disconnections, or automatically reconnect a WebXDC Mini App to its private Bot; those remain dependent on a safe platform bridge. **Do not run multiple Rust Bot instances against the same dealer journal.** No cross-process single-writer lock has been implemented.

## Prevent stale encrypted DM snapshots (delivery-order gate)

Vector Bot's trusted tick handler and user action handler run asynchronously. Even though the Node dealer serializes authoritative commands, the Rust adapter previously **released the dealer mutex before sending DMs**. A slower older snapshot could therefore be sent *after* a newer revision and make a client appear to move backward.

The Rust adapter now serializes whole **private-delivery batches** with an in-process mutex and uses a per-recipient `DeliveryOrder` monotonic revision gate. Before sending, it parses the internal DM JSON envelope and requires consistent protocol, room ID, seat recipient ID and revision (including the top-level worker revision and embedded public state). Invalid or older packets are discarded **without broadcasting anything**. The same revision is deliberately accepted so an authenticated resync or retry can repair a lost DM.

Up to six distinct recipients are dispatched **concurrently within one batch**, each with a bounded SDK send wait, to avoid serial head-of-line delays between players. A per-seat last-delivered revision is recorded only when the SDK's send call reports success. Failure is not treated as delivery; the player can request a new private sync. Rust tests check out-of-order tick/action races, other-seat/malformed packets, replayed revisions, and failed-send behavior.

Limitations: SDK send success is **not** proof of relay/device receipt, and a timeout/cancellation may not stop an already accepted network message. Clients must independently reject older revisions, as the manual seat parser already does. This gate is per running Rust process; it is **not a distributed lock or durable outbound DM queue**. Do not deploy two Bot processes against the same journal.

## Exclusive dealer journal ownership (single host, October 2026)

The **Rust SDK adapter** now acquires an OS-level exclusive advisory file lock on
`VCTR_DEALER_FILE.writer.lock` **before** connecting a Vector identity or
starting its Node dealer child. It holds the descriptor for the Bot process's
entire lifetime, across Node child crashes and journal recovery. A second Rust
Bot using the same journal fails immediately rather than simultaneously
dealing or modifying a stale copy. A different journal has an independent lock.

The lock is backed by an operating-system `flock`-style primitive
(`fs2::FileExt::try_lock_exclusive`) on the **same host and filesystem**,
not a best-effort heartbeat or PID lease. Crashes/SIGKILL close the
descriptor so a restarted Bot can acquire the lock automatically. The empty
lock file deliberately remains on disk after exit: **do not delete it** to
work around an already-running Bot. On Unix a newly created file is mode
0600. The directory holding the journal and lock **must be private** to the
operator, and the journal path must be absolute.

Limitations: this is **advisory and only enforced by the Rust adapter**.
Someone running `node bots/poker/dealer-worker.mjs` directly, a noncooperating
writer, a shared/distributed filesystem with unreliable locks, or multiple
machines pointed at mirrored paths can bypass it. Production operators must
run one Rust adapter and one local Node child on a single host, and
must not open the same journal through another independent process.
It does **not** implement Vector WebXDC↔Bot private transport, a
durable outbound DM queue, or live multi-user relay verification.

Automated Rust tests cover collision, release/re-acquire, independent
journals, invalid paths and Unix file permissions. This improves safe
deployment of the dealer, but must never be described as live PvP completion.

## Local single-writer protection for the dealer journal

The Node dealer **worker entrypoint** now obtains an exclusive, process-lifetime
single-host lease **before** opening/creating the encrypted journal. It uses a
deterministic port bound only to 127.0.0.1, derived from a canonical journal
path. This is an OS-released lease (not a stale PID file): if the worker exits,
crashes or is SIGKILLed, its port is released and the Rust supervisor can
safely relaunch the worker with the same encrypted room state. A second
worker with the same local journal is refused before any journal write or
private card delivery. Real two-process tests cover takeover attempts,
preserving the committed journal, symlinked directory aliases and restart.

**Operational boundaries:** this protects one machine only. It is not a
distributed lock, does not protect a journal concurrently accessed on
different machines over NFS and is not a substitute for process isolation.
A conflicting local service on the derived port causes a safe startup failure
rather than authorizing two writers. Applications importing
`PersistentDealer.open()` directly bypass the worker's lease and must not be
used as independent production writers. No network API is exposed on the
loopback listener; connections are closed immediately, and secrets are never
placed on the network socket. Real Vector transport integration is still
pending.

## Bounded private DM acknowledgments

All private SDK DM sends, including dealer-unavailable notices after uncertain persistence, now use the same five-second bounded wait. A stalled relay must not keep a player callback waiting without a deadline. Send failure or timeout is logged without message content, keys or cards. SDK send success still does **not** establish recipient delivery. After uncertainty, a client must retry the *exact same* requestId or send its authenticated private `sync`; the Bot must not replay an unknown committed action automatically. This is a transport-liveness correction, **not** a Mini App private-channel implementation or real multiplayer proof.
