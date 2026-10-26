# WebXDC adoption decisions — 2026-10-26

This is an execution plan, not a promise that a secure Vector PvP match already exists.

## Actual repository inventory

| Capability | Current state | Next action |
| --- | --- | --- |
| Same-chat table create/join, votes, chat | Implemented in `apps/poker/main.js`; **unauthenticated** roster | Keep; do not confuse with secure betting identity |
| Browser-local 2–6-seat full hands | Implemented in `apps/poker/qa.js` | Preserve as rules/UI QA only |
| 2-client WebXDC PvP experimental | `apps/poker/pvp.js`: host-trusted, signed session keys, encrypted per-seat hands in shared payload; guest cannot see plaintext deck | Test hostile clients, dropped messages and Vector-host behavior; **not fair or authenticated by Vector account** |
| Trusted dealer and Vector Rust SDK DM bot | Separate process/DM pipeline under `bots/`; manual app/DM handoff exists | Resolve authorized automatic **private** Mini App ↔ Bot bridge or choose audited alternative; do not broadcast hole cards |
| Standard `sendUpdate` history / listener | Used by lobby, public chat and experimental PvP | Exercise non-contiguous serials, duplicate events, lost updates and late replay |
| Realtime channel | Not a requirement for turn-based correctness | Investigate host support later for presence/latency only |
| WebXDC packaging/browser smoke | Already automated via `scripts/build.mjs` and Playwright | Keep build system; add optional upstream multi-instance simulator; no forced Vite rewrite |

## Transport rules adopted now

1. Standard WebXDC API:
   `webxdc.sendUpdate({payload: event, info: optionalShortNotice}, "")`.
   `payload` is mandatory; `info` and `summary` are distinct UI fields.
   The second deprecated description argument should be an empty string for compatibility.
2. Respect `webxdc.sendUpdateInterval` and `webxdc.sendUpdateMaxSize`. When a host does not provide them, the specification recommends assuming **10,000 ms** and **128,000 bytes**, respectively. These defaults are **not guaranteed delivery latencies** and are not a hard ban on faster calls. Measure Vector's actual latency before choosing a turn clock; never poll every second by broadcasting game state.
3. Maintain one listener *per app page*: `setUpdateListener(callback, lastKnownSerial)`. Registering multiple listeners on the same WebXDC page has undefined behavior. Serial values strictly increase but **can have gaps**. Replay/deduplicate by validated event ID/revision, never assume `serial === previous+1`. Persist only nonsensitive checkpoints appropriate to the owning device.
4. Only validated, replayable authoritative game events and safe public state should be durable. A realtime channel is **experimental, not universally available, ephemeral and non-acknowledged**. Optional heartbeats and presence may use it; **not** dealing, chip balances, hand completion, votes or the only copy of a game action.
5. Current host-trusted game is **not trustless fairness**. Per-seat cryptographic keys alone do not prove Vector-account identity. Host sees complete deck; do not imply wager-grade security. Retain recreational, nonredeemable chips only.
6. A copied `.xdc` in a different Note/DM is **a different instance**. Shared table admission only works when players open the same Mini App **within the same Vector group/message context**.
7. No direct internet/CDN dependency at runtime in WebXDC. Bundle all necessary assets. Do not silently incorporate external game's copyrighted artwork, names or code; check license and trademarks separately.

## Near-term execution gates

### P0 — harden existing vctrtable (this branch)

- Simulated 2-client encrypted-hand test with **non-unit serial gaps, duplicate delivery, WebView/reconnect replay after a deliberately lost settlement update**, and unchanged final result.
- Continue asserting no `hole`, `deck`, keys or private seeds are broadcast in plaintext.
- Run Node tests, create the XDC and execute **both** Chromium mobile/desktop UI and encrypted 2-client smoke before merge.

### P1 — upstream simulator and device behavior

- Optional `npm run dev:webxdc` launches the built `.xdc` in official `webxdc-dev` for independent origins, multiple peers, drop-updates, reload and shared history. This does **not** replace our deterministic CI or prove Vector transport.
- Record a matrix for **Vector Android and desktop**, 2 accounts in one group: create/join, rule approval, own-only cards, wager action, timer at actual measured latency, background/resume, duplicate actions, network loss and restoration, host departure/crash, invitation and localization.
- Gate release on **verified real-device behavior** where feasible. Do not call the shared lobby a production PvP service.

### P2 — security architecture

- Decide between a trusted, authenticated Vector SDK dealer/recipient DM bridge and an explicitly host-trusted recreational-only model. No automatic secret-path integration is proven today.
- For a trusted dealer: authenticate actor against Vector account from SDK (not JSON `by`), serialize dealer revisions, idempotent request IDs, durable encrypted checkpoints, recipient-specific private replies, late replay and timed hand recovery.
- Include abuse cases: identity spoof, stale signatures/revisions, duplicate bets, forged ranks/chips, replay after reconnection, host manipulation and app compromise.

### P3 — independently scoped follow-ups

- **Hanafuda/こいこい** in vctrtable: reuse a small transport contract (versioned event ID, validated turn, replay, idempotency, reconnection) but keep **separate game rules and deck**. Begin with local QA as planned; then 2-human same-group test.
- **vctrmemo** belongs to its own repository: inspect offline pending queue, throttling, `sendUpdateInterval`, `max_serial` history replay and recovery from the observed incomplete text synchronization. No root-cause claim before reproducing.
- **vctrplay** belongs to its own project: build a tiny original WebGL/3D runner proof of concept (touch controls, asset loading, consistent FPS, suspend/resume) and measure *in Vector on desktop/Android*; do not import third-party trademarks or assets. The VectorPrivacy DOOM P2P architecture is a reference, not a poker protocol.
- **Eclipse, Stockfish/WASM and T-Bone**: backlog research only, not an immediate port. Eclipse includes Convex backend assumptions and separate intellectual-property obligations.
- **Vite**: consider only if multi-game asset/bundle complexity outgrows the current simple `zip` build; avoid unnecessary dependency churn. **WebXDC Studio/runner** is not installed or trusted from an unverified community ZIP.

## Upstream references

- `sendUpdate`: https://webxdc.org/docs/spec/sendUpdate.html
- `setUpdateListener`: https://webxdc.org/docs/spec/setUpdateListener.html
- Experimental realtime: https://webxdc.org/docs/spec/joinRealtimeChannel.html
- Simulator and drop-updates: https://github.com/webxdc/webxdc-dev
- Vector DOOM proof of concept: https://github.com/VectorPrivacy/DOOM

### Definition of done for *production* PvP

Real Vector account identities authenticated for each action; undisclosed private hole cards protected per recipient; dealer trust/fairness model explicitly stated; no forged chip mutations; deterministic recovery after network loss and restart; at least one complete real 2-user Vector match verified on Android + desktop; no money wagering or redeemable value. Until all gates pass, preserve the label **Experimental / host-trusted**.
