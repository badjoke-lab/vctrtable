# Hanafuda — PvE and friend PvP (QA)

## Modes

- **PvE / computer**: `index.html`, the existing 3/6/12-round local Koi-Koi interface, with all the current animations, beginner guides and solo bot. Remains available without WebXDC networking.
- **PvP / friend**: `pvp.html`, two human players from the **same .xdc message in the same Vector chat**, using `webxdc.joinRealtimeChannel()` and ephemeral session encryption. No account, paid service, or external server required. `webxdc.js` is provided by Vector, not bundled.
- The modes use the **same Koi-Koi scoring and capture rules**. PvP has a separate simplified UI. Its animation parity with PvE, robust device reconnection, and host-independent fairness are still unfinished.

## How to test a friendly two-player match

1. Paste the **PvE + PvP QA .xdc URL** as one Mini App message in an existing Vector chat shared by exactly two friends.
2. Both players open that **same message**, and choose **友人と対戦 / PvP**.
3. One person taps **卓を作る / Create table**; the other taps **友人の卓に参加 / Join**.
4. Each sees the same six-digit pairing code. Confirm it verbally before tapping **番号が一致した / Codes match**. **If codes disagree, do not continue.**
5. The host chooses 3, 6 or 12 rounds and starts. Both should see 8 own cards, 8 opponent backs, 8 public field cards, and a draw pile.
6. On your turn, select a hand card. If it matches two field cards, choose the desired target. Confirm the move. When the deck draw matches two cards, tap the field target. After scoring, choose Stop or Koi-Koi.
7. The host starts each new round after the previous round settles.

## Trust and privacy limits (mandatory)

**Not cheat-proof multiplayer.** The hosting player creates and holds the entire ordered deck and both hands. They can inspect opponent cards through developer tools. The first version is **friendly trusted-host**, not fair multiparty card shuffling. For competitive play this needs a cryptographic multi-party deck or a trusted independent dealer.

**Encryption scope:** Both users create ephemeral P-256 ECDH keys in their browser. Peer keys are included in a six-digit code that must be compared verbally. The host encrypts the guest's own hand plus a redacted public snapshot with AES-GCM, authenticated to the intended peer, room, and sender. The plaintext realtime broadcast does **not** include the whole deck, both hands or secret keys. Guest moves are also encrypted and authenticated. Since a chat member could actively impersonate an initial pairing, users MUST compare codes out-of-band.

**Reliability limits:** WebXDC realtime messages are ephemeral and can be lost. Guest requests have sequence numbers and repeat until a host response; the host deduplicates them. Sync can resupply the latest redacted state **while the host's app remains running**. Reloading/closing the hosting app destroys its unpersisted game and private keys; that match cannot resume. Sender identity is keyed to the ephemeral handshake, **not attested to a Vector identity**. This is a **two-player QA release**, not production PvP.

**No gambling:** No cash, token purchases, payments, wagering, trading, or chip conversion.

## Test gates

- All existing PvE and poker regression tests remain unchanged.
- Kernel tests verify per-recipient hand privacy, illegal moves, legal target choices and complete matches.
- ECDH/AES-GCM tests verify identical pairing codes, fresh IVs, wrong room/recipient rejection and tamper prevention.
- Two real Chromium tab sessions linked by a simulated WebXDC realtime channel verify actual pairing, encrypted snapshots, a few PvP moves, and 1-screen mobile/desktop layouts. This is **not** evidence of a successful real Vector two-account test.
- The `hanafuda-pve-pvp-qa-latest` prerelease is published only after all checks pass, separate from the original stable PvE-only QA tag.

## Outstanding gates

1. Real 2-account Vector test on Android and PC: pairing UX, peer discovery, actual realtime delivery, timer/suspension and permission errors.
2. Verify long 12-round matches and transitions visually on both devices, including network loss and reconnect.
3. Replace trusted-host dealing with verifiably fair or independently audited dealer if competitive PvP is needed.
4. Add reliable host-side restore and encrypted per-recipient rebinding before claiming resumable PvP.
5. Improve PvP choreography and bring the full beginner guide visual parity with PvE.
