//! Recipient-scoped, single-use DM round-trip diagnostic.
//! A human can validate receiving the Bot's private reply by returning a
//! short-lived challenge in the same SDK-authenticated, allowlisted DM.
//! This never touches the dealer, private cards, or shared WebXDC updates.
use std::collections::HashMap;
use std::time::{Duration, Instant};

const PROBE_TTL:Duration=Duration::from_secs(120);

#[derive(Debug,PartialEq,Eq)]
pub enum ProbeInput {
    Start,
    Ack(String),
}

/// None means ordinary poker syntax (including the existing JSON mode).
pub fn parse(text:&str)->Result<Option<ProbeInput>,&'static str>{
    let words=text.split_whitespace().collect::<Vec<_>>();
    if words.len()<2 || !words[0].eq_ignore_ascii_case("poker"){
        return Ok(None);
    }
    if words[1].eq_ignore_ascii_case("probe"){
        return if words.len()==2 {Ok(Some(ProbeInput::Start))}
            else {Err("Usage: poker probe")};
    }
    if words[1].eq_ignore_ascii_case("ack"){
        if words.len()!=3 || words[2].len()!=32 ||
            !words[2].bytes().all(|c|c.is_ascii_hexdigit()) {
            return Err("Usage: poker ack TOKEN (32 hexadecimal characters)");
        }
        return Ok(Some(ProbeInput::Ack(words[2].to_ascii_lowercase())));
    }
    Ok(None)
}

#[derive(Debug,PartialEq,Eq)]
pub enum AckResult {
    Confirmed,
    MissingOrExpired,
    Incorrect,
}

struct Challenge {
    token:String,
    event_id:String,
    expires_at:Instant,
}

/// At most one unexpired probe per registered seat; the configured roster
/// bounds this HashMap to 2–6 entries. No persistence or logging of tokens.
#[derive(Default)]
pub struct ProbeManager {
    by_seat:HashMap<String,Challenge>,
}
impl ProbeManager {
    /// The internal Vector message id is stable across event redeliveries.
    /// A duplicate probe reuses the challenge; a NEW probe replaces it.
    pub fn start(&mut self,seat:&str,event_id:&str,now:Instant)->Result<String,&'static str>{
        if event_id.len()!=64 || !event_id.bytes().all(|b|b.is_ascii_hexdigit()){
            return Err("Invalid SDK message ID");
        }
        if let Some(previous)=self.by_seat.get(seat){
            if previous.event_id==event_id && now<previous.expires_at {
                return Ok(format!("Private DM delivery test. Reply here with:\npoker ack {}\nThis challenge expires in 120 seconds; no cards or bets are changed.",previous.token));
            }
        }
        let mut bytes=[0u8;16];
        getrandom::fill(&mut bytes).map_err(|_|"Secure random generation failed")?;
        let mut token=String::with_capacity(32);
        for byte in bytes {token.push_str(&format!("{byte:02x}"));}
        self.by_seat.insert(seat.to_owned(),Challenge{
            token:token.clone(),event_id:event_id.to_ascii_lowercase(),
            expires_at:now+PROBE_TTL
        });
        Ok(format!("Private DM delivery test. Reply here with:\npoker ack {token}\nThis challenge expires in 120 seconds; no cards or bets are changed."))
    }
    /// Wrong actor, stale, expired or reused challenges cannot acknowledge
    /// another player's private receive event.
    pub fn acknowledge(&mut self,seat:&str,token:&str,now:Instant)->AckResult{
        let Some(pending)=self.by_seat.get(seat) else{return AckResult::MissingOrExpired;};
        if now>=pending.expires_at {
            self.by_seat.remove(seat);
            return AckResult::MissingOrExpired;
        }
        if pending.token!=token {return AckResult::Incorrect;}
        self.by_seat.remove(seat);
        AckResult::Confirmed
    }
}
pub fn response(result:AckResult)->&'static str{
    match result{
        AckResult::Confirmed=>
          "DM round-trip confirmed: your registered Vector identity sent the matching one-time reply to this Bot. This is not a network latency measurement and does not prove poker moves, card privacy, other players, or WebXDC integration.",
        AckResult::MissingOrExpired=>
          "DM probe missing, expired, or already used. Send poker probe to request a fresh challenge.",
        AckResult::Incorrect=>
          "DM probe token does not match your current challenge. Check the latest private Bot reply or send poker probe.",
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    const ONE:&str="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const TWO:&str="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    fn token(reply:&str)->String{
        reply.lines().find_map(|line|line.strip_prefix("poker ack "))
            .unwrap().to_owned()
    }

    #[test]
    fn parser_is_strict_and_never_confuses_game_actions(){
        assert_eq!(parse("PoKeR probe").unwrap(),Some(ProbeInput::Start));
        assert_eq!(parse("poker ack 00112233445566778899aabbccddeeff").unwrap(),
            Some(ProbeInput::Ack("00112233445566778899aabbccddeeff".to_owned())));
        assert!(parse("poker ack broken").is_err());
        assert!(parse("poker probe extra").is_err());
        assert!(parse("poker 7 raise 200").unwrap().is_none());
        assert!(parse(r#"{"kind":"sync"}"#).unwrap().is_none());
    }
    #[test]
    fn one_time_delivery_confirmation_is_bound_to_authenticated_seat(){
        let time=Instant::now();
        let mut manager=ProbeManager::default();
        let reply=manager.start("npub1alice",ONE,time).unwrap();
        let token=token(&reply);
        assert_eq!(token.len(),32);
        assert!(token.bytes().all(|x|x.is_ascii_hexdigit()));
        assert_eq!(manager.acknowledge("npub1bob",&token,time),AckResult::MissingOrExpired);
        assert_eq!(manager.acknowledge("npub1alice",&"f".repeat(32),time),AckResult::Incorrect);
        assert_eq!(manager.acknowledge("npub1alice",&token,time),AckResult::Confirmed);
        assert_eq!(manager.acknowledge("npub1alice",&token,time),AckResult::MissingOrExpired);
    }
    #[test]
    fn duplicate_sdk_event_resends_same_token_new_event_replaces_it(){
        let time=Instant::now();
        let mut manager=ProbeManager::default();
        let first=manager.start("npub1alice",ONE,time).unwrap();
        let repeated=manager.start("npub1alice",ONE,time+Duration::from_secs(5)).unwrap();
        assert_eq!(first,repeated);
        let next=manager.start("npub1alice",TWO,time+Duration::from_secs(6)).unwrap();
        assert_ne!(first,next);
        assert_eq!(manager.acknowledge("npub1alice",&token(&first),time+Duration::from_secs(7)),
            AckResult::Incorrect);
        assert_eq!(manager.acknowledge("npub1alice",&token(&next),time+Duration::from_secs(7)),
            AckResult::Confirmed);
        assert!(manager.start("npub1alice","invalid",time).is_err());
    }
    #[test]
    fn expired_challenges_cannot_be_acked_even_at_exact_boundary(){
        let time=Instant::now();
        let mut manager=ProbeManager::default();
        let reply=manager.start("npub1alice",ONE,time).unwrap();
        assert_eq!(manager.acknowledge("npub1alice",&token(&reply),
            time+Duration::from_secs(120)),AckResult::MissingOrExpired);
        assert_eq!(manager.acknowledge("npub1alice",&token(&reply),
            time+Duration::from_secs(1)),AckResult::MissingOrExpired);
    }
}