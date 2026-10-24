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
- The action time setting is agreed in the lobby but the **real betting
  timeout is not yet enforced**; pause approval blocks controls only.
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
