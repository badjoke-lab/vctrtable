# WebXDC / Vector Bot UI transport decision (PR #9)

## Confirmed WebXDC constraint

The standardized Mini App API supports **sendUpdate()** and **setUpdateListener()** for shared updates delivered to **all** members of that chat. It does not provide arbitrary, recipient-specific encrypted Bot direct messaging from JavaScript.

The optional **sendToChat()** prepares a user-mediated chat message and can open a chat composer, but it does not report that the message was sent or deliver the Bot's DM reply back into the Mini App. It is not a reliable authenticated request/reply transport.

References:
- https://webxdc.org/docs/spec/sendUpdate.html
- https://webxdc.org/docs/spec/api.html
- https://webxdc.org/docs/spec/sendToChat.html

This is an architectural blocker for **automatic** poker action delivery from a standard WebXDC app to a private SDK dealer. Do not solve it by posting a player's own cards, opaque private encrypted data, or Bot DMs to the public WebXDC update stream.

## Development-only manual seat UI

In `poker.xdc` choose **Bot DM seat / Bot DM操作席** (`dm.html`).

1. Enter the agreed room ID and your **public** `npub1...` address. **Never enter nsec or seed words.** Verify the dedicated dealer Bot identity in Vector itself.
2. Click **Request state sync**. Copy the generated `{"kind":"sync"}` into a **one-to-one DM** with the verified dealer Bot.
3. Copy the Bot's reply JSON from that DM into **Import reply**. The Mini App checks the room ID, seat recipient ID, revision, legal turn, and basic card validity.
4. The table then displays shared board, chips, opponents, your **own** private cards and available betting actions. Click an allowed action to create a versioned JSON command; copy it to the Bot's 1:1 DM. Repeat importing the Bot's replies to refresh.
5. Rules proposal, unanimous approvals, start-hand, betting, rebuy, pause/resume votes and per-seat resync are available. This manual seat is a developer bridge, **not a polished playable PvP experience**.

The imported private state is kept only in volatile JavaScript memory; the UI clears the raw paste after a successful import. It never calls `sendUpdate()` and does not persist an unencrypted full deck in browser storage.

**Security limitation**: the WebXDC app cannot cryptographically establish which account sent a JSON string pasted by a human. The user must check the source of the DM in Vector. Packet-shape validation is helpful for mistakes, not proof against malicious altered contents. Recipient ID is now placed in every Bot DM envelope and is checked against the user's public npub.

## Next genuine integration dependency

An actual automatic bridge requires **Vector host-client support** for Mini App ↔ Bot authenticated private actions/responses, or another peer-reviewed design that preserves source authentication, confidentiality, and user consent within the Mini App sandbox. It must not depend on leaking private cards to a group update.

Before a real Vector session: verify the feature exists on each supported Vector platform, design capability scoping per app and room, protect native bridges from unauthorized Mini Apps, and complete SDK/device integration. This milestone does **not** require coordinating real users; it gives the single developer a full end-to-end message format and UI to test later.

## Manual private sync status (UI milestone)

The development-only DM seat now has explicit EN/JA local handoff states: no private state, command prepared, awaiting manually pasted reply, delayed reply, imported current snapshot and sync required.

Preparing a command is NOT sending it. Clicking "I sent the DM" acknowledges only the user's own action, and the 15-second delay label is a UI heuristic, NOT a verified Vector relay state.

"Reuse same DM command" preserves the EXACT original requestId. Preparing a new sync can supersede the local draft but cannot cancel an action already sent to the dealer.

Incoming state is accepted only for the entered room and public npub. An older revision or a conflicting payload at the SAME revision is refused without changing displayed private cards. An identical same-revision snapshot does not claim to acknowledge a pending action. A pasted error such as STALE_REVISION requires a fresh sync before another action.

This remains a manual developer bridge. A pasted string cannot cryptographically prove who sent the original Vector DM. No automatic private bridge, WebXDC group broadcast of secrets or localStorage persistence was added. Browser CI tests basic status progression.
