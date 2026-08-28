export type StringForm = Record<string, string>;
export type DirtyFormEdits<T extends StringForm> = Partial<T>;

/** Fresh server values hydrate every field except those edited locally. */
export function mergeServerFormWithEdits<T extends StringForm>(server: T, edits: DirtyFormEdits<T>): T {
  return { ...server, ...edits };
}

export function updateDirtyForm<T extends StringForm>(current: DirtyFormEdits<T>, patch: Partial<T>): DirtyFormEdits<T> {
  return { ...current, ...patch };
}
