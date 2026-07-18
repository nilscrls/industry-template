// Mirror the uploads bucket (mc mirror --overwrite --remove, run inside a
// one-shot minio/mc container) into $BACKUP_DIR/files/<bucket>. The mirror
// is incremental: snapshot BACKUP_DIR externally for point-in-time copies.
import { composeRun, ensureBackupDir } from "./lib.mjs";

ensureBackupDir("files");
composeRun("backup-files");
