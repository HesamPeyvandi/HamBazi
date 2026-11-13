/**
 * Request de-duplication for the browser: while a request with the same key is still running, callers share its promise
 * instead of starting another identical request (double clicks, visibilitychange + timer overlap, re-renders).
 */
const inflight = new Map<string, Promise<unknown>>();
export function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key);
  if (hit) return hit as Promise<T>;
  const p = run().finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}
