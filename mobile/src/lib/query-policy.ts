/** Only one retry for a transient read failure. Never replay account/policy errors. */
export function retryQuery(failureCount: number, error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  return failureCount < 1 && (status === 0 || status === 408 || status >= 500 && status <= 599);
}
