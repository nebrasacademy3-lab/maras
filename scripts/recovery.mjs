/** Explicit operator CLI; no .env loading and no production writes or service activation. */
import { readKey, RecoveryError } from "./recovery/crypto.mjs";
import { createBackup, restoreBackup, bundleDigest } from "./recovery/bundle.mjs";
import { separateKeyFile } from "./recovery/preflight.mjs";
function required(name) { if (!process.env[name]) throw new RecoveryError(`MISSING_${name}`); return process.env[name]; }
let key;
try {
  const action = process.argv[2];
  if (!["backup", "restore"].includes(action) || process.argv.length !== 3) throw new RecoveryError("USAGE_node_scripts_recovery_mjs_backup_or_restore");
  const bundleDir = required("RECOVERY_BUNDLE_DIR"), uploadDir = required("RECOVERY_UPLOAD_DIR");
  const keyPath = await separateKeyFile(required("RECOVERY_KEY_FILE"), [bundleDir, uploadDir]);
  key = await readKey(keyPath);
  const common = { key, bundleDir, uploadDir, binDir: process.env.RECOVERY_PG_BIN_DIR };
  const result = action === "backup" ? await createBackup({ ...common, databaseUrl: required("BACKUP_DATABASE_URL"), releaseSha: required("RECOVERY_RELEASE_SHA"), storageMode: required("RECOVERY_STORAGE_MODE"), writesPaused: process.env.RECOVERY_WRITES_PAUSED === "true" })
    : await restoreBackup({ ...common, adminUrl: required("RESTORE_ADMIN_URL"), databaseName: required("RESTORE_DATABASE_NAME"), trustedBackup: process.env.RECOVERY_TRUSTED_BACKUP === "true" });
  console.info(JSON.stringify({ ok: true, action, ...result, bundleSha256: await bundleDigest(common.bundleDir) }));
} catch (error) {
  // Database/OS errors can contain passwords, paths or student records. Do not log raw errors.
  console.error(JSON.stringify({ ok: false, code: error instanceof RecoveryError ? error.code : "RECOVERY_OPERATION_FAILED" }));
  process.exitCode = 1;
} finally { key?.fill(0); }
