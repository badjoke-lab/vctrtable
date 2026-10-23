# Vector DM-first poker (development)

## Goal

Standard WebXDC group updates cannot privately return per-seat cards from the
trusted Vector Bot. Instead, this milestone enables text commands using the
existing NIP-17 private Vector DM route, without modifying Vector itself.
It is not yet an interactive graphical multi-user Mini App.

## Player flow (English-first)

The operator must first deploy the dedicated Bot with a fixed roster of 2–6
known participant npubs and server-held dealer journal/encryption key.
Players do not enter an nsec or seed phrase.

1. Send POKER STATUS in a private DM to the Bot to enable readable state.
2. Send POKER 0 PROPOSE 1000 5 10 30 YES for a new session with 1000 chips,
   5/10 blinds, 30-second turn limit and rebuys; values are configurable.
3. Other participants send POKER REV APPROVE 1 using the latest state revision.
4. After unanimous approval send POKER REV START to deal.
5. On each turn the verified seat receives only its own private hole cards,
   public board, stack, pot, timer-related status and legal actions; commands
   include POKER REV CALL, CHECK, FOLD or RAISE 100 (raise-to total).
6. POKER REV PAUSE / RESUME and POKER REV VOTE 1 YES or NO allow unanimous
   indefinite pause/resume. A pending vote does not stop the timer.
7. POKER JSON switches back to raw JSON responses for the WebXDC manual
   DM-import developer seat. POKER STATUS enables text replies again.
   POKER HELP lists all commands.

REV is the authoritative room revision shown in the previous private reply.
This prevents unexpected actions caused by a delayed message from an earlier
turn or street. The verified incoming Vector message ID is reused as the
dealer requestId so redelivering the same message does not double-apply a bet.

## 日本語の説明

Botへの個別DMで POKER STATUS と送ると、自分のカード、公開カード、
チップ、現在の手番を読みやすい形式で確認できます。行動は POKER 番号
CALL / CHECK / FOLD / RAISE 金額。番号には最新返信の rev を使用します。
POKER HELP で全コマンドを確認できます。コマンドは英語ファーストの
開発版です。Mini App の日本語UIは変更しません。

## Security, remaining work

- All own-card state travels via SDK recipient-specific encrypted DMs only;
  no secret state is sent using WebXDC sendUpdate.
- SDK-authenticated sender identity, never a claimed actor in user text,
  controls who can act and see their cards.
- Bot text/JSON display preference lives only in its current process;
  send POKER STATUS again after restart.
- A replayed DM has the same idempotency key; two newly sent DMs are two
  different operations, even if they contain identical command text.
- The trusted dealer is not verifiably fair to the participants.
- SDK send success is not evidence of recipient delivery. On uncertainty,
  resync before trying another action.
- Still missing: real relay and multi-device validation; deployment; static
  roster replacement with user onboarding; automated WebXDC private bridge,
  full bilingual Bot text and chat translation.
- No wagering with money, redemption, or transferable chip value.

Rust cargo check/test plus existing Node tests and XDC build must pass.
These are development tests, not real Vector account/relay integration.
## Operator preflight (before any actual relay test)

The static roster must contain **2–6 actual Vector npubs** (public only), one
per player. The Rust Bot now checks canonical lowercase NIP-19 bech32 keys and
requires a matching authenticated SDK author and DM channel **before** any
command, help reply or dealer request. Unregistered senders receive nothing.

On the operator's trusted machine, load the dedicated Bot identity and a
32-byte dealer journal encryption key from a private environment. Keep keys out
of Git, messages, shell history and CI. The Bot requires `VECTOR_NSEC`,
`VCTR_ROOM_ID`, `VCTR_PLAYERS_JSON`, `VCTR_DEALER_FILE` and
`VCTR_DEALER_KEY_HEX` as already documented in VECTOR-SDK-ADAPTER.md. The
parent of the absolute journal path must exist, belong to the running user and
be private (Unix mode `0700`); an existing journal must be `0600`.

From the repository root:

```sh
npm run vector:preflight
# Only on a trusted, configured host after the preflight succeeds:
cargo run --manifest-path bots/vector/Cargo.toml
```

Preflight checks key **format**, checksum, duplicates, player names, Node,
working directory and filesystem permissions **without printing keys or
connecting to any relay**. It does not prove possession of participant keys,
delivery to any actual device, relay authentication, unattended uptime or
successful multi-person play. Never provide the Bot's nsec to a player; the
players send `poker status` to the Bot from their own Vector accounts.

The Node worker's local IPC regression now also completes 2-, 3- and 6-seat
hands, with unanimous pause/resume, recipient-private snapshots and showdown
chip accounting. These fake test identities do not replace real Vector tests.

## Real Vector DM round-trip probe (new, not yet run on relay)

The Rust SDK Bot now supports a **private, game-state-independent** diagnostic
for checking that a registered Vector seat can both receive and send DMs:

1. On a trusted operator host, use the existing preflight and launch
   instructions. The Bot must be configured with 2–6 registered public npubs.
2. From a **registered player's own Vector DM** to the dedicated Bot, send
   `poker probe`. The Bot returns a random, single-use, 32-hex challenge
   privately to that exact SDK-verified sender.
3. Within **120 seconds**, copy the line `poker ack TOKEN` from the Bot's
   DM response and send it back in the same DM.
4. The Bot verifies that the token is fresh, matches the sender and has never
   been used, then replies with a clear confirmation. A wrong sender,
   expired/replayed token or incorrect challenge cannot succeed.

The Bot never asks the user for an nsec, password, seed or wallet signature.
The probe never calls the Node dealer, changes a revision, bets or deals a
card; no challenge or private cards are broadcast through `sendUpdate()`.
The Bot does not persist the challenge (a restart invalidates it) and does
not print it to logs. Repeated delivery of the *same Vector probe event*
resends its identical outstanding challenge rather than issuing a new one.
A newly submitted probe replaces that sender's previous challenge.

**Meaning of a successful result:** the Bot accepted a matching reply from
the expected SDK-authenticated DM sender after generating a private reply.
This is useful evidence of one account's **application-level DM round-trip**.
It does **not** establish the performance or availability of all relays,
automated WebXDC integration, proper dealing or other players' message
receipt. The elapsed human interaction time is not measured as network
latency. Source-level and CI tests cannot replace a real Vector-device run.

### Real-device acceptance record (fill in only after actual testing)

- Bot starts on a trusted host with secrets kept outside chat/Git.
- Player A probe challenge received and acknowledged in their Vector DM.
- Player B independently receives and acknowledges *their own* challenge.
- Unknown sender receives no Bot response; Player B cannot acknowledge
  Player A's challenge.
- Registered players can obtain `poker status` after probe with independent
  seat-specific private cards once a hand starts.
- On device reconnect, `poker status` resyncs to the current room revision.
- Only then consider testing full two-person hands on the actual Vector relay.

No test record above is marked successful until the evidence exists.

## Credential-safe first run

In the source repository or an Intel macOS/Linux Bot package, run
`npm run vector:init`. A dedicated Bot Nostr signing keypair and the dealer
journal encryption key are generated **on your local trusted computer only**.
Only the public Bot npub is displayed. Edit the newly generated
`~/.config/vctrtable/private.json` to enter the 2–6 invited players'
**public npubs**. Preserve both generated secret values and the encrypted
journal between restarts. Never use your personal account's nsec, paste
the private config into chat, or store the config in GitHub.

Run `npm run vector:check`, then `npm run vector:start`. The Bot remains
in the foreground. Send `poker probe` and `poker ack TOKEN` from each
registered Vector account to the Bot in a separate private DM; no hidden
cards should reach WebXDC group updates. The operator still needs two
real Vector accounts to prove real encrypted delivery.
