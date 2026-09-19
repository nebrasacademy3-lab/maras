/** Keep encryption keys out of every copied/published directory, before opening database connections. */
import { resolve, dirname, relative, sep, isAbsolute } from "node:path";
import { RecoveryError } from "./crypto.mjs";
import { canonicalDirectory } from "./bundle.mjs";

export async function separateKeyFile(keyPath, roots) {
  const key = resolve(keyPath);
  await canonicalDirectory(dirname(key));
  for (const rootPath of roots) {
    const root = resolve(rootPath);
    await canonicalDirectory(dirname(root));
    const child = relative(root, key);
    if (!child || !child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child)) throw new RecoveryError("KEY_MUST_BE_OUTSIDE_BACKUP_AND_STORAGE");
  }
  return key;
}
