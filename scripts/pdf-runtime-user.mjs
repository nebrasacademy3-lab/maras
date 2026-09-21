import { chown, lstat, realpath } from "node:fs/promises";
import { basename, resolve } from "node:path";

/** Hosting may override Docker USER for volume access. Only this scrubbed renderer
 * drops privilege; application/volume ownership and Chromium's sandbox are unchanged. */
export async function dropPdfRootPrivileges(directory, runtime = process) {
  if (runtime.platform !== "linux" || runtime.getuid?.() !== 0) return;
  const absolute = resolve(directory || "");
  const info = await lstat(absolute);
  if (absolute !== directory || absolute !== runtime.cwd() || directory !== runtime.env.HOME || directory !== runtime.env.TMPDIR ||
      !/^maras-pdf-[A-Za-z0-9_-]+$/.test(basename(directory)) || !info.isDirectory() || info.isSymbolicLink() ||
      info.uid !== 0 || (info.mode & 0o077) !== 0 || await realpath(absolute) !== absolute) {
    throw new Error("Unsafe PDF working directory");
  }
  // A dedicated unprivileged identity, not the application user that owns uploads.
  await chown(absolute, 65534, 65534);
  runtime.setgroups([]);
  runtime.setgid(65534);
  runtime.setuid(65534);
  if (runtime.getuid() !== 65534 || runtime.getgid() !== 65534 || runtime.getgroups().some(group => group !== 65534)) {
    throw new Error("PDF privilege isolation failed");
  }
}
