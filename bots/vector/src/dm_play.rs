//! Optional DM-first poker controls for Vector clients.
//! Never treats command text as proof of identity: the SDK DM author must be
//! authenticated before Rust forwards the generated request to Node.
//! An incoming Vector message ID becomes a stable dealer requestId, so Nostr
//! redelivery/replay of the *same message* cannot execute a second action.
use serde_json::{json, Value};

pub enum TextCommand {
    Help,
    JsonMode,
    Sync,
    Action(Value),
}
const HELP: &str = "\
vctrtable poker — private Vector DM mode\n\
poker status           show your table / switch to readable replies\n\
poker json             switch back to raw JSON replies for WebXDC manual import\n\
poker help             show commands\n\
poker probe            request a private DM delivery challenge\n\
poker ack TOKEN        acknowledge a one-use private reply\n\
poker REV propose CHIPS SB BB SECONDS yes|no\n\
poker REV approve PROPOSAL_ID\n\
poker REV start        deal next hand\n\
poker REV check|call|fold|rebuy\n\
poker REV raise TOTAL  total chips committed in this betting round\n\
poker REV pause|resume request unanimous timer pause/resume\n\
poker REV vote REQUEST_ID yes|no\n\
REV is the revision shown in your latest private status DM.\n\
Use poker status after reconnect or an uncertain reply. \n\
Never send nsec/seed/private keys to the Bot.";

pub fn help() -> &'static str { HELP }

fn num(s: &str) -> Result<u64, &'static str> {
    s.parse::<u64>().map_err(|_|"Invalid number. Send poker help.")
}
fn vote(s: &str) -> Result<bool, &'static str> {
    if s.eq_ignore_ascii_case("yes") {Ok(true)}
    else if s.eq_ignore_ascii_case("no") {Ok(false)}
    else {Err("Expected yes or no. Send poker help.")}
}

/// Only messages beginning with "poker" enter the text protocol. Old
/// developer JSON messages are still forwarded byte-for-byte.
pub fn parse(input: &str, message_id: &str) -> Result<Option<TextCommand>, &'static str> {
    let words: Vec<&str> = input.split_whitespace().collect();
    if words.first().is_none_or(|w|!w.eq_ignore_ascii_case("poker")) {
        return Ok(None);
    }
    if words.len()==1 || (words.len()==2 && words[1].eq_ignore_ascii_case("help")) {
        return Ok(Some(TextCommand::Help));
    }
    if words.len()==2 && words[1].eq_ignore_ascii_case("json") {
        return Ok(Some(TextCommand::JsonMode));
    }
    if words.len()==2 && (words[1].eq_ignore_ascii_case("status") ||
                          words[1].eq_ignore_ascii_case("text")) {
        return Ok(Some(TextCommand::Sync));
    }
    if words.len()<3 {return Err("Expected poker REV ACTION. Send poker help.");}
    let revision=num(words[1])?;
    // Inner, SDK-verified NIP-17 message id: stable across redeliveries.
    if message_id.len()!=64 || !message_id.bytes().all(|b|b.is_ascii_hexdigit()) {
        return Err("Incoming Vector message ID is invalid; command rejected.");
    }
    let action=words[2].to_ascii_lowercase();
    let op=match (action.as_str(),&words[3..]) {
        ("start",[])=>json!({"type":"startHand"}),
        ("check",[])=>json!({"type":"act","action":"check"}),
        ("call",[])=>json!({"type":"act","action":"call"}),
        ("fold",[])=>json!({"type":"act","action":"fold"}),
        ("rebuy",[])=>json!({"type":"rebuy"}),
        ("raise",[target])=>json!({"type":"act","action":"raise","target":num(target)?}),
        ("approve",[id])=>json!({"type":"approve","proposalId":num(id)?}),
        ("pause",[])=>json!({"type":"requestPause","mode":"pause"}),
        ("resume",[])=>json!({"type":"requestPause","mode":"resume"}),
        ("vote",[id,answer])=>json!({"type":"votePause","pauseId":num(id)?,"approve":vote(answer)?}),
        ("propose",[chips,sb,bb,seconds,rebuy])=>json!({"type":"propose","settings":{
            "startingChips":num(chips)?,"smallBlind":num(sb)?,"bigBlind":num(bb)?,
            "actionSeconds":num(seconds)?,"rebuy":vote(rebuy)?
        }}),
        _=>return Err("Unknown poker command or argument count. Send poker help."),
    };
    Ok(Some(TextCommand::Action(json!({
        "protocol":1,
        "roomId":null,
        "requestId":format!("dm-{}",message_id.to_ascii_lowercase()),
        "expectedRevision":revision,
        "op":op,
    }))))
}

/// Render ONLY a per-recipient packet already checked against the SDK DM
/// destination and dealer revision. Never use this for shared WebXDC updates.
pub fn render_private(packet: &str) -> Option<String> {
    let p:Value=serde_json::from_str(packet).ok()?;
    if p.get("kind")?.as_str()?!="vctrtable-poker-state" {return None;}
    let public=p.get("state")?;
    let private=p.get("private")?;
    let revision=p.get("revision")?.as_u64()?;
    let room=p.get("roomId")?.as_str()?;
    let recipient=private.get("recipientId")?.as_str()?;
    if public.get("revision")?.as_u64()!=Some(revision) ||
       public.get("roomId")?.as_str()!=Some(room) {return None;}
    let mut out=format!("🃏 vctrtable | room {} | rev {}\n",room,revision);
    if let Some(members)=public.get("members").and_then(Value::as_array) {
        out.push_str("Seats: ");
        for (i,m) in members.iter().enumerate() {
            if i>0 {out.push_str(" · ");}
            out.push_str(m.get("name").and_then(Value::as_str).unwrap_or("?"));
            if m.get("id").and_then(Value::as_str)==Some(recipient) {out.push_str(" (you)");}
        }
        out.push('\n');
    }
    if let Some(settings)=public.get("settings").filter(|s|!s.is_null()) {
        out.push_str(&format!("Blinds {}/{} · turn {}s\n",
            settings["smallBlind"].as_u64().unwrap_or(0),
            settings["bigBlind"].as_u64().unwrap_or(0),
            settings["actionSeconds"].as_u64().unwrap_or(0)));
    }
    if let Some(proposal)=public.get("proposal").filter(|s|!s.is_null()) {
        let id=proposal["id"].as_u64().unwrap_or(0);
        let s=&proposal["settings"];
        let approvals=proposal["approvals"].as_array().map_or(0,Vec::len);
        out.push_str(&format!("Proposal #{}: {} chips, blinds {}/{}, {}s, rebuy {} · {} approved\n",
            id,s["startingChips"],s["smallBlind"],s["bigBlind"],s["actionSeconds"],
            s["rebuy"],approvals));
        if public.get("settings").is_none_or(Value::is_null) {
            let approved=proposal["approvals"].as_array().is_some_and(|a|
                a.iter().any(|v|v.as_str()==Some(recipient)));
            if approved {out.push_str("Waiting for other seats to approve\n");}
            else {out.push_str(&format!("Approve: poker {} approve {}\n",revision,id));}
        }
    }
    if let Some(hand)=public.get("hand").filter(|h|!h.is_null()) {
        let status=hand["status"].as_str().unwrap_or("unknown");
        let street=hand["street"].as_str().unwrap_or("-");
        let number=hand["number"].as_u64().unwrap_or(0);
        out.push_str(&format!("Hand #{} · {} · {}\n",number,street,status));
        let cards=hand["board"].as_array().map(|a|a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" ")).unwrap_or_default();
        out.push_str(&format!("Board: {}\n",if cards.is_empty(){"(hidden)"}else{&cards}));
        let own=private["ownHole"].as_array().map(|a|a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" ")).unwrap_or_default();
        out.push_str(&format!("Your cards: {}\n",if own.is_empty(){"—"}else{&own}));
        out.push_str(&format!("Pot: {}\n",hand["pot"]));
        if let Some(players)=hand["players"].as_array() {
            for seat in players {
                let you=seat["id"].as_str()==Some(recipient);
                out.push_str(&format!("{}{}: {} chips{}\n",
                    seat["name"].as_str().unwrap_or("Seat"),if you{" (you)"}else{""},
                    seat["stack"],if seat["folded"].as_bool()==Some(true){" (folded)"}else{""}));
            }
        }
        if status=="betting" {
            let turn=hand["playerToAct"].as_str().unwrap_or("");
            if turn==recipient {out.push_str("YOUR TURN\n");}
            else if !turn.is_empty() {out.push_str("Waiting for another seat\n");}
        } else if status=="complete" {
            out.push_str(&format!("Next hand: poker {} start\n",revision));
        }
    } else if !public.get("settings").is_none_or(Value::is_null) {
        out.push_str(&format!("Deal: poker {} start\n",revision));
    } else {
        out.push_str(&format!("Propose: poker {} propose 1000 5 10 30 yes\n",revision));
    }
    let pause=&public["pause"];
    if pause["paused"].as_bool()==Some(true) {out.push_str("PAUSED (timer frozen)\n");}
    if let Some(req)=pause.get("request").filter(|r|!r.is_null()) {
        out.push_str(&format!("{} requested: poker {} vote {} yes|no\n",
            req["mode"].as_str().unwrap_or("Pause"),
            revision,req["id"].as_u64().unwrap_or(0)));
    } else if public.get("hand").and_then(|h|h.get("status")).and_then(Value::as_str)==Some("betting") {
        if pause["paused"].as_bool()==Some(true) {out.push_str(&format!("Resume: poker {} resume\n",revision));}
        else {out.push_str(&format!("Pause: poker {} pause\n",revision));}
    }
    if let Some(legal)=private.get("legal").filter(|l|!l.is_null()) {
        out.push_str("Your actions: ");
        let mut cmds=vec!["fold".to_string()];
        if legal["canCheck"].as_bool()==Some(true) {cmds.push("check".into());}
        if legal["canCall"].as_bool()==Some(true) {
            cmds.push(format!("call ({} owed)",legal["toCall"]));
        }
        if legal["canRaise"].as_bool()==Some(true) {
            if legal["shortAllInOnly"].as_bool()==Some(true){
                cmds.push(format!("raise {} (short all-in only)",legal["maxRaiseTo"]));
            } else {
                cmds.push(format!("raise TOTAL (min {} / max {})",legal["minRaiseTo"],legal["maxRaiseTo"]));
            }
        }
        out.push_str(&cmds.join(" · "));
        let suggested=if legal["canCheck"].as_bool()==Some(true) {"check"}
            else if legal["canCall"].as_bool()==Some(true) {"call"}
            else {"fold"};
        out.push_str(&format!("\nSend: poker {} {} (or another legal action above)\n",revision,suggested));
    }
    out.push_str("For fresh state: poker status");
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID:&str="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    #[test]
    fn text_actions_preserve_event_based_idempotency_and_revision(){
        let Some(TextCommand::Action(a))=parse("POKER 13 raise 450",ID).unwrap() else{panic!("not action")};
        let Some(TextCommand::Action(b))=parse("POKER 13 raise 450",ID).unwrap() else{panic!("not action")};
        assert_eq!(a,b);
        assert_eq!(a["expectedRevision"],13);
        assert_eq!(a["requestId"],format!("dm-{}",ID));
        assert_eq!(a["op"]["target"],450);
        assert!(parse("poker 13 call","bad id").is_err());
        assert!(parse("poker 13 raise -1",ID).is_err());
        assert!(parse("poker 13 raise",ID).is_err());
        assert!(parse("poker 13 call extra",ID).is_err());
        assert!(parse("{\"protocol\":1}",ID).unwrap().is_none());
    }
    #[test]
    fn full_player_command_vocabulary(){
        for cmd in ["poker 1 start","poker 2 check","poker 2 call","poker 3 fold",
           "poker 4 rebuy","poker 0 propose 1000 5 10 30 yes",
           "poker 1 approve 1","poker 3 pause","poker 4 resume","poker 5 vote 1 no"]{
            assert!(matches!(parse(cmd,ID),Ok(Some(TextCommand::Action(_)))), "{cmd}");
        }
        assert!(matches!(parse("poker status",ID),Ok(Some(TextCommand::Sync))));
        assert!(matches!(parse("poker json",ID),Ok(Some(TextCommand::JsonMode))));
    }
    #[test]
    fn human_rendering_shows_only_own_hole_cards(){
        let p=json!({
          "kind":"vctrtable-poker-state","roomId":"room1","revision":7,
          "state":{"roomId":"room1","revision":7,
             "members":[{"id":"npub1alice","name":"Alice"},{"id":"npub1bob","name":"Bob"}],
             "settings":{"smallBlind":5,"bigBlind":10,"actionSeconds":30},
             "pause":{"paused":false,"request":null},
             "hand":{"number":1,"status":"betting","street":"flop",
               "board":["2H","3H","4H"],"pot":30,"playerToAct":"npub1alice",
               "players":[{"id":"npub1alice","name":"Alice","stack":990,"folded":false},
                          {"id":"npub1bob","name":"Bob","stack":980,"folded":false}] }},
          "private":{"recipientId":"npub1alice","ownHole":["AS","KS"],
             "legal":{"canCheck":false,"canCall":true,"toCall":10,
                       "canRaise":true,"minRaiseTo":30,"maxRaiseTo":990}}
        });
        let text=render_private(&p.to_string()).unwrap();
        assert!(text.contains("AS KS"));
        assert!(text.contains("poker 7 call"));
        assert!(text.contains("YOUR TURN"));
        assert!(!text.contains("npub1bob"));
        assert!(!text.contains("deck"));
    }
    #[test]
    fn check_and_short_all_in_hints_never_advise_an_illegal_call_or_minimum(){
        let p=json!({
            "kind":"vctrtable-poker-state","roomId":"a","revision":12,
            "state":{"roomId":"a","revision":12,"pause":{"paused":false,"request":null},
                "hand":{"number":1,"status":"betting","street":"turn","board":["AS"],"pot":50,
                    "playerToAct":"npub1alice","players":[]}},
            "private":{"recipientId":"npub1alice","ownHole":["QC","JD"],
                "legal":{"canCheck":true,"canCall":false,"toCall":0,"canRaise":true,
                    "shortAllInOnly":true,"minRaiseTo":200,"maxRaiseTo":75}}
        });
        let text=render_private(&p.to_string()).unwrap();
        assert!(text.contains("poker 12 check"));
        assert!(text.contains("raise 75 (short all-in only)"));
        assert!(!text.contains("poker 12 call"));
        assert!(!text.contains("raise TOTAL (min 200"));
    }
}