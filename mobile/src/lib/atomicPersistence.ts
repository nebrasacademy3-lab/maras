/** Commits in-memory state only after durable persistence succeeds. */
export async function persistThenCommit(
  persist: () => Promise<void>,
  commit: () => void,
  rollback: () => void,
) {
  try {
    await persist();
    commit();
  } catch (reason) {
    rollback();
    throw reason;
  }
}
