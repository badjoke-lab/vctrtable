# Experimental host-trusted encrypted multiplayer (not the SDK dealer)

## What works in two independent Chromium browser contexts

This is the first test path that executes **real betting commands** between
two independent browser clients through a simulated WebXDC shared-update
stream. The existing Texas Hold'em engine handles actions and chip settlement.
Tests validate two unique decrypted private hands, signed Fold, updated
public state and matching results at both clients, with no hole-card/deck
plaintext in any shared update.

**This is a host-trusted alpha, not fully secure multiplayer.**

- The **host's WebXDC app** generates the full deck, executes the rules,
  and can therefore see all hole cards and manipulate the deck or outcomes.
  It is inappropriate for wagering, cash, prizes or competitive fairness.
- Signed seat keys prove possession of a session key stored nonextractably
  in IndexedDB when supported. They **DO NOT cryptographically prove the
  Vector/Nostr user**. The first key announced for an unverified seat ID
  may be from an impersonator. Never treat the lobby ID or these keys as
  authentication for the existing trusted SDK dealer.
- The host is now given a **local encrypted recovery checkpoint** before
  each hand-state broadcast. A non-extractable AES-256-GCM key and ciphertext
  remain only in the host's IndexedDB, not the WebXDC shared stream. After
  reopening the SAME XDC on that device, the host decrypts and replays the
  local full-deck journal and compares the entire reconstructed public
  snapshot with the signed shared state, including the same room, players,
  and unanimously approved rules. Mismatches are rejected.
- **The host should still keep the Mini App open for uninterrupted play.**
  Storage can be cleared, become inaccessible, or be unavailable in some
  Vector WebViews. Recovery works only with the same host device/browser
  storage and original signed seat keys. No cross-device host migration,
  arbitrator takeover, automatic turn timeout, or identity proof exists.
  Crash exactly between checkpoint and shared-update delivery is not
  automatically healed; a mismatch intentionally stops the hand.
- The agreed action limit (0 = unlimited) now drives a **host-enforced**
  per-turn clock in this experimental path. On expiry the host checks when
  free or folds when facing a bet. Only unanimous pause freezes the remaining
  time; a pending pause request does not. Resume restores that remainder.
  Every published deadline and pause transition is signed in public state
  and persisted with the host's encrypted local checkpoint. Closing a host
  WebView can delay expiry processing; on reopening the host catches up using
  its persisted deadline. The host owns and can manipulate the wall clock;
  this is NOT an independently enforced or production-fair tournament timer.
  The experiment starts manually after all current players are Ready and
  have approved the same rules.
- All gameplay chips are local, nontransferable and cannot be redeemed.
  No deposits, cash, prizes, wallet connection or wagering.

## User flow in the SAME Vector group chat

1. Open the shared Poker Mini App and choose **Create / Join Table**.
2. Host presses **Create Table**, picks 2–6 seats, and uses Vector's
   group invitation controls to invite the intended users.
3. Each friend joins the **same Vector group**, opens the **same XDC message**,
   and presses **Join Table** (no separate Note posting or room ID entry).
4. Everyone marks Ready. Propose starting chips, blinds, action time and
   rebuy rule. **Every seated player approves the same proposal.**
5. Each player taps **Open experimental PvP** in the lobby.
   When all participants' hand-encryption keys are enrolled the host can
   choose **Host: Deal hand**.
6. Each player sees only their two decrypted card faces, board, stacks
   and their own action controls when it is their turn. The host's browser
   remains open and broadcasts public state after each accepted action.
7. At completion both clients see awards; host can begin another hand.

Changing player seats mid-hand aborts the host-trusted experiment rather
than continuing with stale betting authority.

## Independent SDK dealer — still separate

The existing Rust Vector SDK Bot is an independent trusted dealer with
authenticated DM sender handling and an encrypted server-side journal.
The host-trusted WebXDC experiment **does not replace it**. The long-term
production architecture must bind actual Vector-authenticated identities
and a privacy-preserving recipient DM route to the UI, and remove
host-only control over the full deck.

## Verified versus unverified

Automated Node encryption/engine tests and two-independent-Chromium page
tests with simulated WebXDC update delivery have passed.
**Actual Vector relay transport with two genuine accounts is NOT yet
verified.** Nor is reconnect after the host closes its WebXDC app.

To reproduce:
```sh
npm test
npm run build
npm install --no-save --no-package-lock playwright@1.55.0
npx playwright install chromium
node scripts/pvp-browser-smoke.mjs
```

## Multiway and room-rotation fault matrix (October 27, 2026)

The packaged-XDC Chromium suite now includes `scripts/pvp-multiseat-browser-smoke.mjs`,
which uses **three and six independent browser contexts** within a single
simulated WebXDC update stream. It tests distinct per-seat encrypted hole cards,
multiway Check/Call through a completed five-card showdown, conservation of
recreational chips, identical payouts across peers, intentionally missed updates
followed by WebXDC serial-0 replay, duplicate signed action delivery, and
six-seat host reload from the device-local AES-GCM checkpoint.

The three-seat scenario additionally closes the completed table and creates
another in the same XDC. The UI clears old seat public keys, enrollment flags,
private-card view and old host journal state and starts a new unanimously
approved session using the original device-local identity keys. Keys are **not
proof of Vector account ownership** and never leave the local browser private
key store.

A late *unanimous* pause approval cannot supersede an already expired turn.
The host resolves the previously running turn deadline before applying the
new approved pause state. A pause request without all votes does not freeze
time. The browser's system time is host-controlled, so these tests do **not**
establish a fair independent tournament clock.

Run the extended checks after `npm run build` and Playwright setup:

```sh
node scripts/pvp-browser-smoke.mjs
node scripts/pvp-multiseat-browser-smoke.mjs
```

Limitations: all transport is simulated; no authenticated Vector identities,
actual Vector relay delivery, real-device storage behavior, cross-device host
migration or independently honest shuffling is established. Real Vector device
testing and private trusted-dealer integration remain release blockers.

## Recovering a lost or rejected betting update (PR #55)

An action in the experimental WebXDC table now remains in a **volatile,
single-command outbox** until a newer signed host state revision is received.
The UI shows a *Resend exact action / 同じ操作を再送* button. The resend is
available after a short delay, or immediately if the local WebXDC
`sendUpdate` promise rejected. It reuses the identical cryptographically
signed bytes of the original action (same nonce, revision and target) and
does **not** create a new bet, nonce or command. A second new betting action
is blocked while the first one is unresolved. Table rotation or a newer
signed state clears this volatile outbox.

This is an interactive recovery path, not an acknowledgement guarantee:
`sendUpdate` resolving only means the local API accepted the request.
The host is not authenticated as a Vector account; WebXDC shared delivery
is not necessarily immediate or lossless. If the host actually accepted
the action, the unchanged revision and duplicate nonce prevent its replay
from charging chips twice. If an unrelated newer host revision arrives,
the outbox clears, but that alone does **not** prove which action was
applied. Reloading the XDC discards unsent volatile commands and replays
signed host updates from WebXDC history.

Host publishing now awaits the result of the `sendUpdate` call instead
of immediately presenting an unconfirmed outgoing state as delivered.
A **host-side crash or persistent send rejection after the encrypted
journal was written but before an update was delivered** remains an
unresolved fail-closed scenario: restoring an ahead-of-stream checkpoint
cannot be considered successful without a matching signed shared state.
Do not misrepresent this as full crash recovery.

The packaged-XDC two-client Chromium test covers both an asynchronous
API rejection and a local send call that resolves but is dropped before
peer delivery. Those cases are simulations, **not real Vector relay tests**.
