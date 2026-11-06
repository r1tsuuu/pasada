// Runs async work one at a time per key (an account's public key, or a tranche id).
// Two Stellar transactions from the same account at once fail with a bad sequence number.
const tails = new Map<string, Promise<unknown>>();

export function withAccountLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
