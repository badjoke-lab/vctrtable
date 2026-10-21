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
4. Production durability requires a single-writer lock, lifecycle management, key rotation, monitoring and redaction.
5. Human multi-device test only when remaining game and UI work is near complete.

The Node IPC test suite runs a real Node worker with **fake npub-shaped IDs** and confirms routing and restart behavior. It is not proof of real Nostr/Vector cryptographic integrity.

## DM delivery consistency and reconnection (transport hardening)

The developer Bot uses a single authoritative persistent dealer revision, and a player's **explicit `{"kind":"sync"}` request** retrieves only that verified sender's encrypted private seat snapshot. No other player's hand is returned in a resync response.

A command's stable per-player `requestId` is the idempotency key. If a player retries an already committed command because its original DM acknowledgement was lost, the dealer does **not** run the command twice and now resends the **current private snapshot to that player only** instead of flooding every seat. The receipt also records that it was replayed.

Important race: a late action can cause the dealer to **persist a timeout** before comparing the caller's stale revision. Although the action is rejected with `STALE_REVISION`, the timeout still advances the authoritative room. The worker now sends the new revision to **all seats** with individual encrypted DMs, and the Rust adapter delivers those snapshots even when the command itself failed. If a request was simply rejected without advancing state, only the authenticated sender gets a private snapshot for repair.

These are local protocol and IPC tests, including an encrypted worker restart. They do **not** establish that messages are actually delivered over a live Vector relay: a recipient may still miss an outgoing DM. Clients should request `sync` upon reconnect or after missing/uncertain acknowledgments. The current bot does not implement an automatic WebXDC request/reply channel, durable outbound queues, or automatic worker restart.
