/**
 * A queue of async jobs: each starts once the one before it has settled, failed or not. Returns the job's
 * own promise.
 */
export function oneAtATime() {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const next = last.then(job, job);
    last = next.catch(() => {});
    return next;
  };
}
