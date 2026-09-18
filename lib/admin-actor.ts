/** A client expectation can only reduce access; it never authenticates or grants a role. */
export function adminActorMatches(headers: Headers, userId: number): boolean {
  const expected = headers.get("x-meras-acting-user");
  return expected === null || /^[1-9]\d{0,15}$/.test(expected) && Number.isSafeInteger(Number(expected)) && Number(expected) === userId;
}
