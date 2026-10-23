# Vector invitation and same-chat shared table (development)

## What a real Vector user does

**Host**

1. Start vctrtable from the approved `poker.xdc` in a Vector chat.
2. Open **Lobby** (the local QA table is still the default start screen).
3. Select **2–6 players** and press **Create Table**.
4. In the **same Vector group chat**, invite friends with Vector's own group invitation UI.
   The `Prepare invitation message` button can also open a **user-controlled**
   `sendToChat` draft describing how to enter. It does NOT invite anyone to
   the group or report that the draft was sent.
5. Your friend opens the **existing Poker XDC message in that same chat** and
   presses **Join Table**.
6. Both should see the same roster, capacity and ready counts. Ready is a
   lobby marker, not a real betting action. Proposed chips/blinds and their
   approval statuses can be seen in the shared lobby.
7. A player can leave; that seat becomes free. The host can close the table.

**Guest**

No GitHub downloads, Note post, or manually typed room IDs. Accept the
host's Vector **group invitation**, open the same Poker Mini App **message**
in that group and press **Join Table**. A different private DM or separately
posted XDC is a different WebXDC update stream — it will NOT join this table.

## What this milestone implements

The `table-lobby.js` reducer and `main.js` UI now implement a non-secret
create/join/leave/ready/close protocol. The active room's ID is generated
internally. The host messenger's increasing `update.serial` orders shared
updates; reopening the **same XDC instance** replays the event history from
serial 0. No private cards or dealer secrets cross the group update stream.
The old QA poker game and independent authenticated dealer remain separate.

New tests include 2–6 seats, duplicates, rejoin, capacity, stale room
events, moderator/host actions and a **two-page Chromium simulator** built
from the packaged XDC. It verifies that host and guest UIs converge after
receiving the same WebXDC updates and that reopening restores the shared
lobby. These are not live Vector relay/device tests.

## Consensus and replay safety (next milestone)

The public lobby now replays **table membership, readiness, rules approvals,
pause requests, and public chat together in the messenger's serial order**.
Previously, a "last rules" lookup and separate history-wide vote scan could
count replies from users who had already left, proposals posted before
admission, or old votes after a member rejoined.

The new reducer requires:
- rules and pause proposals from currently admitted seats only, with the
  **exact present roster** (2–6);
- votes from current seats only, referencing **the currently pending request**,
  arriving after the request in WebXDC serial order;
- membership changes invalidate everyone else's Ready state, prior approved
  rules, pending/approved pause state and old votes — even if someone leaves
  and rejoins under the same name/address;
- a pause requester counts as agreeing; **the clock cannot be considered
  paused until all remaining participants approve**, and resume requires
  a separate unanimous round;
- the schema of all shared updates is allowlisted, including rule settings:
  arbitrary private fields like `ownHole`, `deck` or `nsec` are rejected;
- chat entries from nonmembers and events for old room IDs are ignored.

Node and two-browser Chromium tests cover these transitions using a simulated
WebXDC host and the actual packaged XDC file.

**Security limit remains crucial:** an attacker who can forge the
client-controlled `payload.by` string can still impersonate another seat,
including the nominal host. The standard WebXDC update object does not
expose a verifiable sender signature. These checks prevent state-machine
errors, **not hostile identity impersonation**. Until real Vector SDK sender
authentication and private delivery are integrated, this public lobby MUST
NEVER authorize betting or reveal secret hands.

## Known blockers before playable PvP

- **Not authenticated:** Standard WebXDC payloads include client-authored
  `by` identifiers. The shared-lobby state is UX only. It does NOT prove
  that the actor in a join, close, or rules vote actually owns that identity.
  Do not use this room alone as permission to see hole cards or place bets.
- **Private cards:** WebXDC `sendUpdate` delivers to the whole chat; no
  individual hole cards, deck order, encryption keys or wager-like payments
  may go through it. The existing SDK Bot's NIP-17 private DM route is
  separate. Automating SDK-private responses into an XDC Mini App still
  requires a reviewed host capability or other safe supported transport.
- **Different chats:** `sendToChat` prepares an outgoing draft; its
  completion says nothing about actual sending, joining the group, or joining
  the same table. There is no automatic cross-DM/cross-Note room join.
- **Actual accounts:** No multi-device real Vector relay proof yet.
- **Not betting:** Shared lobby ready/approval does not start the local QA
  simulation, which must remain labelled as scripted opponents.

## Next development acceptance

First: prove on **two actual Vector accounts within one group** that Create,
Join, Ready, Leave and reconnect state work. Then authenticate all actions
through the trusted SDK dealer and establish privacy-preserving individual
hole-card delivery. Only then enable betting actions in the shared UI.

References: https://webxdc.org/docs/spec/sendUpdate.html and
https://webxdc.org/docs/spec/sendToChat.html
