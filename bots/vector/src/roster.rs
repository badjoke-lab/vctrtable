//! Fail-closed roster admission for the private poker Bot.
//! A DM's *author* is supplied by the SDK, never by command text.
//! Parsing the exact configured roster before any Vector login prevents
//! accidental private-state routing to a malformed/duplicate seat.
use bech32::decode;
use serde::Deserialize;
use std::collections::HashSet;
use std::env;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Seat {
    id: String,
    name: String,
}

#[derive(Clone, Debug)]
pub struct PlayerRoster {
    ids: HashSet<String>,
}

fn valid_npub(id: &str) -> bool {
    if id.len() != 63 || !id.starts_with("npub1") || id.chars().any(|ch|ch.is_ascii_uppercase()) {
        return false;
    }
    matches!(decode(id),Ok((hrp,decoded)) if hrp.as_str()=="npub" && decoded.len()==32)
}

impl PlayerRoster {
    pub fn from_json(raw: &str) -> Result<Self, &'static str> {
        let seats: Vec<Seat> = serde_json::from_str(raw)
            .map_err(|_|"VCTR_PLAYERS_JSON must be a JSON array of {id,name} objects")?;
        if !(2..=6).contains(&seats.len()) {
            return Err("VCTR_PLAYERS_JSON requires exactly 2 to 6 seated players");
        }
        let mut ids = HashSet::new();
        for seat in seats {
            if !valid_npub(&seat.id) {
                return Err("Each seat must have a valid lowercase NIP-19 npub (not nsec)");
            }
            if seat.name.trim().is_empty() || seat.name.chars().count()>60 ||
                seat.name.chars().any(char::is_control) {
                return Err("Seat names must be 1-60 visible characters, without controls");
            }
            if !ids.insert(seat.id) {
                return Err("Duplicate poker npub in VCTR_PLAYERS_JSON");
            }
        }
        Ok(Self { ids })
    }

    pub fn from_env() -> Result<Self, &'static str> {
        let raw=env::var("VCTR_PLAYERS_JSON")
            .map_err(|_|"VCTR_PLAYERS_JSON is missing")?;
        Self::from_json(&raw)
    }

    /// Must be called for *every* incoming DM before parsing, replying,
    /// or attempting an IPC call. Chat metadata must match the SDK author.
    pub fn accepts_dm(&self, author: &str, chat_id: &str) -> bool {
        author==chat_id && self.ids.contains(author)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bech32::{Bech32, Hrp};

    fn npub(byte: u8) -> String {
        bech32::encode::<Bech32>(Hrp::parse("npub").unwrap(), &[byte;32]).unwrap()
    }
    fn players(ids: &[String]) -> String {
        serde_json::to_string(&ids.iter().enumerate().map(|(i,id)|
            serde_json::json!({"id":id,"name":format!("Player {}",i+1)}))
            .collect::<Vec<_>>()).unwrap()
    }
    #[test]
    fn two_to_six_valid_players_pass_and_only_matched_dm_sender_is_allowed() {
        let a=npub(1);
        let b=npub(2);
        for count in 2..=6 {
            let ids=(0..count).map(|i|npub((i+1) as u8)).collect::<Vec<_>>();
            let roster=PlayerRoster::from_json(&players(&ids)).unwrap();
            assert!(roster.accepts_dm(&a,&a));
            assert!(!roster.accepts_dm(&a,&b));
            assert!(!roster.accepts_dm(&npub(80),&npub(80)));
        }
    }
    #[test]
    fn bad_roster_fails_before_sdk_login_or_dealer_start() {
        let a=npub(1);
        assert!(PlayerRoster::from_json(&players(&[a.clone()])).is_err());
        assert!(PlayerRoster::from_json(&players(&vec![a.clone();7])).is_err());
        assert!(PlayerRoster::from_json(&players(&[a.clone(),a.clone()])).is_err());
        assert!(PlayerRoster::from_json(&players(&[a.clone(),"nsec1secret".into()])).is_err());
        assert!(PlayerRoster::from_json(&players(&[a.clone(),format!("{}x",&a[0..62])])).is_err());
        assert!(PlayerRoster::from_json("not json").is_err());
        assert!(PlayerRoster::from_json(&serde_json::json!([
            {"id":a,"name":"Player 1","privateKey":"bad"},
            {"id":npub(2),"name":"Player 2"}
        ]).to_string()).is_err());
    }
    #[test]
    fn rejects_controls_and_blank_names() {
        let a=npub(1);
        let b=npub(2);
        for bad in ["","  ","a\nb","a\tb",&"q".repeat(61)] {
            let json=serde_json::json!([
                {"id":a,"name":"Alice"},
                {"id":b,"name":bad}
            ]).to_string();
            assert!(PlayerRoster::from_json(&json).is_err());
        }
    }
}
