//! Operating-system exclusive lock for exactly one Rust Vector Bot owner of
//! each encrypted dealer journal. The file is deliberately NEVER unlinked:
//! unlinking while another process holds a file lock can allow two writers.
use fs2::FileExt;
use std::fs::{File,OpenOptions};
use std::io::{self,ErrorKind};
use std::path::{Path,PathBuf};

pub struct DealerWriterLease {
    // Holding the file descriptor for the process lifetime holds the OS lock.
    _file:File,
    pub path:PathBuf,
}

impl DealerWriterLease {
    pub fn acquire(journal:&Path)->io::Result<Self>{
        if !journal.is_absolute() || journal.file_name().is_none() {
            return Err(io::Error::new(ErrorKind::InvalidInput,
                "VCTR_DEALER_FILE must be an absolute journal filename"));
        }
        // Same file / same room shares a lock; distinct journals do not.
        // Append, rather than replace, the filename extension.
        let mut lockname=journal.as_os_str().to_os_string();
        lockname.push(".writer.lock");
        let path=PathBuf::from(lockname);
        let mut opts=OpenOptions::new();
        opts.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        // A secure, owner-only parent directory is REQUIRED by the operator.
        // Do not delete lock files to "fix" an active-lock error.
        let file=opts.open(&path)?;
        file.try_lock_exclusive().map_err(|e|{
            if e.kind()==ErrorKind::WouldBlock {
                io::Error::new(ErrorKind::WouldBlock,
                    "Dealer journal is already owned by another Bot; refusing a second writer")
            } else {e}
        })?;
        Ok(Self{_file:file,path})
    }
    pub fn from_env()->io::Result<Self>{
        let file=std::env::var_os("VCTR_DEALER_FILE").ok_or_else(||{
            io::Error::new(ErrorKind::InvalidInput,"VCTR_DEALER_FILE is not configured")
        })?;
        Self::acquire(Path::new(&file))
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    use std::sync::atomic::{AtomicU64,Ordering};
    static ID:AtomicU64=AtomicU64::new(0);
    fn scratch()->PathBuf{
        let id=ID.fetch_add(1,Ordering::SeqCst);
        let path=std::env::temp_dir().join(format!(
            "vctrtable-writer-test-{}-{}",std::process::id(),id));
        std::fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn second_instance_cannot_own_same_journal(){
        let dir=scratch();
        let file=dir.join("dealer.sealed");
        let lease=DealerWriterLease::acquire(&file).unwrap();
        assert_eq!(lease.path,dir.join("dealer.sealed.writer.lock"));
        let second=DealerWriterLease::acquire(&file);
        assert!(second.is_err(),"a concurrent Bot must fail closed");
        assert_eq!(second.err().unwrap().kind(),ErrorKind::WouldBlock);
        drop(lease);
        let resumed=DealerWriterLease::acquire(&file).unwrap();
        drop(resumed);
        // Deliberately retain the on-disk lock until the test dir is removed.
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn different_journals_do_not_block_each_other(){
        let dir=scratch();
        let one=DealerWriterLease::acquire(&dir.join("one.enc")).unwrap();
        let two=DealerWriterLease::acquire(&dir.join("two.enc")).unwrap();
        assert_ne!(one.path,two.path);
        drop(one);
        drop(two);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn missing_relative_and_directory_paths_are_rejected(){
        assert!(DealerWriterLease::acquire(Path::new("relative-file.enc")).is_err());
        assert!(DealerWriterLease::acquire(Path::new("/")).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn newly_created_lock_file_is_private(){
        use std::os::unix::fs::PermissionsExt;
        let dir=scratch();
        let lease=DealerWriterLease::acquire(&dir.join("private.enc")).unwrap();
        let perms=std::fs::metadata(&lease.path).unwrap().permissions().mode();
        assert_eq!(perms&0o077,0,"no group or other permission for writer lock");
        drop(lease);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
