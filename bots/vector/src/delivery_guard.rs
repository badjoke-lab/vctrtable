//! Safety gate for ordering per-recipient private dealer snapshots.
//! The source is the trusted local Node dealer, not a WebXDC public update.
//! State is process-local: on restart the client still needs monotonic
//! revision checks on its own private receiver.

use std::collections::HashMap;
use serde_json::Value;

#[derive(Default)]
pub struct DeliveryOrder {
    latest_delivered: HashMap<String,u64>,
}
impl DeliveryOrder {
    /// Validate the claimed private recipient and authoritative revision
    /// and prevent an earlier concurrent response overwriting a newer DM.
    ///
    /// Deliberately allow the SAME revision: manual resync/retry after missed
    /// delivery must not be suppressed as a duplicate.
    pub fn eligible(&self,to:&str,body:&str,reply_revision:Option<u64>)->bool{
        if !to.starts_with("npub1")||to.len()>128{return false;}
        let Some(revision)=reply_revision else{return false;};
        let Ok(packet)=serde_json::from_str::<Value>(body) else{return false;};
        if packet.get("protocol").and_then(Value::as_u64)!=Some(1)
            ||packet.get("kind").and_then(Value::as_str)!=Some("vctrtable-poker-state")
            ||packet.get("revision").and_then(Value::as_u64)!=Some(revision)
            ||packet.pointer("/state/revision").and_then(Value::as_u64)!=Some(revision)
            ||packet.pointer("/private/recipientId").and_then(Value::as_str)!=Some(to)
            ||packet.get("roomId").and_then(Value::as_str).is_none()
            ||packet.get("roomId")!=packet.pointer("/state/roomId")
        {return false;}
        self.latest_delivered.get(to).is_none_or(|last|revision>=*last)
    }
    /// Call only AFTER the SDK reports the DM send succeeded.
    pub fn record_success(&mut self,to:&str,revision:u64){
        let latest=self.latest_delivered.entry(to.to_owned()).or_insert(revision);
        *latest=(*latest).max(revision);
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    fn packet(recipient:&str,revision:u64)->String{
        serde_json::json!({
            "protocol":1,"kind":"vctrtable-poker-state",
            "roomId":"table-test","revision":revision,
            "state":{"roomId":"table-test","revision":revision},
            "private":{"recipientId":recipient,"ownHole":["AS","KH"],"legal":null}
        }).to_string()
    }
    #[test]
    fn older_out_of_order_private_snapshots_cannot_overwrite_newer(){
        let alice="npub1alice";
        let mut gate=DeliveryOrder::default();
        assert!(gate.eligible(alice,&packet(alice,8),Some(8)));
        gate.record_success(alice,8);
        assert!(!gate.eligible(alice,&packet(alice,7),Some(7)));
        assert!(gate.eligible(alice,&packet(alice,8),Some(8)),
            "recipient must be able to request same-revision resync");
        assert!(gate.eligible(alice,&packet(alice,9),Some(9)));
        assert!(gate.eligible("npub1bob",&packet("npub1bob",7),Some(7)),
            "private recipients have independent monotonic sequences");
    }
    #[test]
    fn tampered_recipient_or_worker_revision_mismatch_is_never_sent(){
        let alice="npub1alice";
        let guard=DeliveryOrder::default();
        assert!(!guard.eligible("npub1bob",&packet(alice,8),Some(8)));
        assert!(!guard.eligible(alice,&packet(alice,8),Some(9)));
        assert!(!guard.eligible(alice,&packet(alice,8),None));
        assert!(!guard.eligible(alice,"not-json",Some(8)));
        let altered=packet(alice,8).replace("table-test","different-room");
        // Change ONLY one room field, not both, to fail consistency check.
        let bad=altered.replacen("different-room","table-test",1);
        assert!(!guard.eligible(alice,&bad,Some(8)));
        let wrong=packet(alice,8).replace("vctrtable-poker-state","public-snapshot");
        assert!(!guard.eligible(alice,&wrong,Some(8)));
    }
    #[tokio::test]
    async fn racing_tick_and_player_reply_cannot_roll_back_last_sent_revision(){
        use std::sync::Arc;
        use tokio::sync::{Mutex,Barrier};
        let gate=Arc::new(Mutex::new(DeliveryOrder::default()));
        let release=Arc::new(Barrier::new(2));
        let first_gate=gate.clone();
        let first_release=release.clone();
        // Simulate revision 7 from an action held up before taking its send
        // mutex, while a subsequent tick has already produced revision 8.
        let stale=tokio::spawn(async move{
            first_release.wait().await;
            tokio::task::yield_now().await;
            let mut locked=first_gate.lock().await;
            if locked.eligible("npub1alice",&packet("npub1alice",7),Some(7)){
                // Under a real SDK, this record is only after DM send success.
                locked.record_success("npub1alice",7);
                true
            }else{false}
        });
        let mut latest=gate.lock().await;
        latest.record_success("npub1alice",8);
        release.wait().await;
        drop(latest);
        assert!(!stale.await.unwrap(),"old action cannot overwrite a newer tick snapshot");
        assert!(gate.lock().await.eligible("npub1alice",&packet("npub1alice",8),Some(8)));
    }
    #[test]
    fn failed_delivery_does_not_claim_progress(){
        let mut gate=DeliveryOrder::default();
        let alice="npub1alice";
        assert!(gate.eligible(alice,&packet(alice,4),Some(4)));
        // Simulate a DM failure by not recording a successful send.
        assert!(gate.eligible(alice,&packet(alice,3),Some(3)));
        gate.record_success(alice,4);
        assert!(!gate.eligible(alice,&packet(alice,3),Some(3)));
    }
}
