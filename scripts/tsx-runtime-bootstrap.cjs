// tsx derives its cache directory from process.geteuid() on Unix and os.userInfo()
// elsewhere. Some locked-down Windows hosts cannot read userInfo; a stable,
// process-local uid keeps the worker runnable there without affecting Unix.
if (typeof process.geteuid !== "function") {
  Object.defineProperty(process, "geteuid", { value: () => 0, configurable: true });
}
