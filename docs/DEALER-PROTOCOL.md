# Authoritative dealer: development contract

This is an **in-memory, transport-independent trusted dealer**, tested without inviting a second person. It is **not yet connected to Vector SDK**.

## Trust boundaries

The dealer process exclusively holds the internal room object, complete deck and every player's secret hand.

- **publicState()**: shared board, chips, bet amounts, agreed rules, current turn, pause state, status and settlement. The private deck and unshown hands are absent. This is the ONLY class of snapshot that may eventually be sent using WebXDC group broadcasts.
- **privateState(authenticatedPlayerId)**: public snapshot plus a single authenticated recipient's own cards and available moves. This MUST use a verified recipient-specific encrypted Vector channel. It is not appropriate for the WebXDC shared-update channel.
- **room / table / hand / local QA journal**: never broadcast. They contain private cards, full deck order and other secrets.

Client-provided sender IDs, usernames, client clocks and WebXDC fields cannot be taken as proof of authorship. A future trusted transport adapter must supply **verified** actor identity and dealer time.

## Protocol behavior

A seated player proposes a session's starting chips, blinds, rebuy permission and per-action limit (0 means unlimited). All other seated players must approve. Chips reset per session, not per hand.

The dealer accepts a unique request ID and the expected state revision with each move. Duplicate retransmission of the *same* operation is idempotent; conflicting request ID reuse and stale revisions are rejected.

The player who requests pause is considered to approve it. All other seats must consent. Once approved, a pause has **no automatic expiry**, and it freezes the action clock; the unused time is restored after a unanimous resume. A pending pause request DOES NOT freeze the turn clock, to prevent spam requests from extending it indefinitely. One rejection cancels a request.

Dealer-side tick handling performs a check when no chips are owed, otherwise a fold, when a timed action expires. It does not create its own background scheduler; an eventual dealer Bot must periodically invoke it.

Cards from players who have not folded are shown only after a completed contested showdown. Folded players' private hands stay hidden.

## Not yet done

1. Vector SDK authenticated Bot adapter and verified private delivery.
2. Persistence of dealer room, command receipts, timeouts and cryptographically bound identities across process restarts.
3. Proper reconnect/resync handling, malicious/duplicate client defense and request limits.
4. Real multi-user Vector integration tests: intentionally postponed until nearer completion.
5. Independent verification of dealer honesty or trustless dealing. Current model requires trusting the dealer.

The tests simulate 2–6 seats **inside a single Node process**. They do not prove that Vector's actual network path is secure or functional.

## Request and message-envelope boundary (second local step)

The message-boundary.js module parses client requests without a client-supplied identity or timestamp. A trusted SDK adapter must pass verifiedActorId and serverNow in a separate trusted context. The return value separates a single public broadcast packet from an array of recipient-specific private envelopes. These envelopes are plain objects and are **not encrypted**. The caller must send each privately to a verified intended recipient, never into WebXDC's group status channel. The tests simulate this separation in one process; no live Vector transport is claimed.

The method assertPacketRouting rejects common mistakes in destination lists and obvious private-field presence in group snapshots. It is defense in depth, **not a security proof**. The real transport is still unimplemented.
