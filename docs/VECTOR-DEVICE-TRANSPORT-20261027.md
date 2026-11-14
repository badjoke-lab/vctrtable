# Vector device communication acceptance and native bridge audit — 2026-10-27

## Public Vector source checked

Repositories/docs checked:
- Vector client: https://github.com/VectorPrivacy/Vector/blob/master/src-tauri/src/miniapps/scheme.rs
- Vector Mini App command allowlist: https://github.com/VectorPrivacy/Vector/blob/master/src-tauri/src/miniapps/commands.rs
- Android native Mini App IPC: https://github.com/VectorPrivacy/Vector/blob/master/src-tauri/gen/android/app/src/main/java/io/vectorapp/miniapp/MiniAppIpc.kt
- Official WebXDC: https://webxdc.org/docs/spec/api.html
- Updates: https://webxdc.org/docs/spec/sendUpdate.html
- User-mediated drafts: https://webxdc.org/docs/spec/sendToChat.html

At the inspected upstream **master** snapshot, the desktop Mini App
`webxdc` shim exposes `sendUpdate`, `setUpdateListener`, and a
`sendToChat` function that **rejects with 'Not implemented'**.
The Tauri Mini App allowed-command list names get/send shared updates,
realtime channels and permission lookup; it does **not** authorize an
authenticated, recipient-specific Mini App → Vector SDK Bot private DM
request/reply. The separate Android native IPC similarly exposes
Mini App update bridge functions, not a documented JS Bot DM API.

This is a **source-level capability audit**, not proof of every released
Android or desktop binary's behavior. It is not appropriate to bypass
the Mini App sandbox through arbitrary native Tauri commands. A new
audited, host-supported permission-gated bridge would be required for
the current SDK dealer's automatic private seat snapshots.

## Actual new test feature

The poker XDC contains **Development diagnostics / 開発用通信診断**
at the very bottom of `lobby.html` (collapsed by default). It opens
`diagnostics.html`, independent of the Poker betting UI and lobby.

The page:
1. Displays whether basic standard WebXDC shared update functions are
   exposed, the supplied `sendUpdateInterval` and
   `sendUpdateMaxSize` (spec fallback 10000 ms / 128000 bytes),
   and whether a realtime method is advertised — *not proof of function*.
2. A voluntarily presses **Send test** on its own device.
3. B opens the exact SAME shared XDC message on a second Vector account,
   sees a public probe and voluntarily presses **Acknowledge**.
4. A receives a matching acknowledgement and shows local-clock
   round-trip duration. This test does **not** compare the devices'
   wall clocks or verify the actual account behind `selfAddr`.
5. A second test and duplicate/non-contiguous serial replay are accepted.
   Duplicate acknowledgements do not count twice.

No automatic pings, no timers broadcasting at one-second intervals, no
private cards, credentials, `nsec`, dealer journals, wallet data, DMs
or table transcript are included in any diagnostic packet. A probe
is sent only by pressing the test button, and an acknowledgement only
after the receiver presses its button. Old probe history may replay
after reopening; it is NOT authenticated and MUST NOT affect a game.

## Actual Vector device acceptance protocol (not yet executed)

Use a dedicated two-account testing group, one real Android Vector
client and one real desktop Vector client (or two independent real
clients), with the **same .xdc message** visible on both.

| Check | Device A | Device B | Evidence to record |
| --- | --- | --- | --- |
| API availability | Open Diagnostics | Open Diagnostics | Installed client versions, platform, interval/max size as displayed |
| A→B | Press Send test once | Confirm inbound status | Whether B actually saw probe; wait for host delivery (no assumed instant delivery) |
| B→A | Observe | Press Acknowledge | Whether A displays round-trip result |
| Replay | Close/open same XDC | Do not press anything | Fresh page receives historical public updates but does not invent a new result |
| No peer | Press Send test | Closed or offline | A stays waiting; no false success |
| Same instance | Open another XDC post | Keep first one open | Other message MUST NOT be treated as same table |
| Private Bot | Verify manual DM bridge | N/A | No claim of automatic Bot/private-card transfer |

Observe host backgrounding, connection loss and app reopening separately.
No unattended test is claimed to have happened just because Playwright
passes. Record *only redacted diagnostics*, no npubs, real keys or DM
contents. If the ping never arrives, record the host version, OS and
whether sending was disabled, but do not infer that all WebXDC traffic
fails without separate lobby tests.

## CI scope

- `tests/transport-probe.test.mjs`: strict public packet allowlist,
  fresh nonces, peer filters, replay/dedup, serial gaps, wrong references.
- `scripts/transport-probe-browser-smoke.mjs`: two isolated Chromium
  browser contexts share a simulated WebXDC transport via the actual
  packaged `poker.xdc`; intentional manual ping and ack both ways.
- Existing Node, lobby, 2/3/6 seat poker and mobile Chromium CI preserved.

CI does **not** establish actual Vector relay behavior, host sandbox
permission behavior, real account identity, encrypted Bot DM reception,
secure dealing or production readiness.

## Next implementation gate

- First complete and document the real-client matrix above.
- Request/verify an audited, capability-scoped Mini App ↔ authenticated
  Bot private DM API, including per-recipient routing, sender and room
  binding, versioned actions, review of the host security boundary.
- Do not spoof `selfAddr` as an Nostr identity or leak encrypted hand
  data into public updates as a workaround.
- Keep host-trusted gameplay clearly marked experimental.

## Vector v0.5.1 transport audit — 2026-11-14

Confirmed against the tagged release **v0.5.1** (2026-11-07):
- [Release](https://github.com/VectorPrivacy/Vector/releases/tag/v0.5.1)
- [Vigil v0.5.0 changes](https://github.com/VectorPrivacy/Vector/releases/tag/v0.5.0)
- [Realtime peer channel draft](https://github.com/VectorPrivacy/Vector/blob/v0.5.1/docs/webxdc-realtime.md)
- [Desktop WebXDC bridge](https://github.com/VectorPrivacy/Vector/blob/v0.5.1/src-tauri/src/miniapps/scheme.rs)
- [Android Mini App IPC](https://github.com/VectorPrivacy/Vector/blob/v0.5.1/src-tauri/gen/android/app/src/main/java/io/vectorapp/miniapp/MiniAppIpc.kt)

**New capability:** `webxdc.joinRealtimeChannel()` can return a realtime
channel with `setListener(callback)`, `send(Uint8Array)` and `leave()`.
Vector documents an Iroh gossip topic per shared XDC message with
peer discovery inside the chat; payloads are ephemeral, capped at
128,000 bytes. Vector v0.5 defaults multiplayer to relayed routes rather
than exposing peers' IP addresses. Privacy permissions and different
routing modes must still be checked in the actual client.

**NOT enabled for betting or private dealing:** a realtime message does
not represent a durable `sendUpdate` event, an authoritative host state,
a signed turn journal, a verified Nostr identity, or an authenticated
SDK-Bot DM. The release still shows `sendToChat()` as *Not implemented*
in the desktop Mini App shim and no reviewed private DM Bot messaging
command in the Mini App allowlist. No secret dealer data, deck, cards,
keys, or gameplay events are sent through realtime in this project.

The optional `diagnostics.html` page now permits TWO SEPARATE tests:
(1) old manual persistent shared `sendUpdate` ping/ack; (2) new
manual realtime-channel ping/ack, with independent random per-page
pseudonyms (never `webxdc.selfAddr` in the realtime packets).
The realtime test starts **only** after pressing **Join**, which
allows the Vector host to display network permission prompts. Each
subsequent ping and response is explicitly requested. Sending to the
local API is *not* labeled as proof of peer delivery. Round-trip times
are measured on the sender's local clock.

### Required real-device matrix

| Vector host | Persistent sendUpdate | Realtime join + ping | Notes |
|---|---|---|---|
| Android v0.5.1 | Not yet tested | Not yet tested | Native WebView / background |
| Desktop v0.5.1 | Not yet tested | Not yet tested | Widescreen game WebView |
| Vector Web v0.5.1 | Not yet tested | Not yet tested | Browser storage and permissions |
| Tor/I2P mode | Not yet tested | Not yet tested | Prompt and networking caveats |

Run the same XDC message on two independent accounts. For realtime
test press Join on both, Send on A, Acknowledge on B, then check A's
locally observed result. Test after suspension and reopen, and test
network refusal. Cross-chat XDC copies must not intermix signals.
Compare delivery with and without realtime peer access. Never infer a
working authenticated player identity from an unauthenticated echo.

`scripts/transport-probe-browser-smoke.mjs` adds two simulated
Chromium realtime channels alongside the old persisted transport tests.
This is a regression test for our JS protocol only, not proof that
actual Android/desktop/web Vector multiplayer works. Merge only after
packaged-XDC CI succeeds and real-device tests can be recorded separately.
