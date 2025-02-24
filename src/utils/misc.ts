/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ensures that an environment variable is set, and returns its value.
 *
 * If the variable is not set, it will log an error and exit the process.
 *
 * @param {string} key - The name of the environment variable to check.
 * @param {(value: string) => T} [parse] - An optional function to parse the environment variable value.
 * @return {T} The value of the environment variable, or the result of parsing it if a parse function is provided.
 */
export const ensureEnv = <T = string>(key: string, parse?: (value: string) => T): T => {
  const ret = process.env[key];
  if (!ret) {
    console.error("Error: Environment variable not set:", key);
    setTimeout(() => process.exit(1), 0); // Check more variables before exiting
    return "" as T;
  }
  return parse ? parse(ret) : (ret as T);
};

/**
 * Calls the provided function and catches any errors that occur, logging them to the console and exiting the process after a short delay.
 *
 * @param {() => Promise<unknown>} f - The function to call.
 * @return {Promise<unknown>} A promise that rejects with the caught error.
 */
export const failFast = (f: () => Promise<unknown>) =>
  f().catch((e) => {
    console.error(e?.toString());
    setTimeout(() => process.exit(1), 1000).unref();
    return Promise.reject(e);
  });

/**
 * Creates a memoized function that lazily refreshes its value when it is called after a specified interval.
 *
 * @param {number} refreshMs - The time interval in milliseconds to refresh the value asynchronously after the memoized function is called.
 * @param {number} invalidMs - The time interval in milliseconds to invalidate the value, after which the function will not return cached value.
 * @param {(...args: Args) => Promise<T>} getter - A function that retrieves the value.
 * @return {() => Promise<T>} A memoized function that returns the value.
 * @notes Function arguments are ignored when cache has not expired.
 */
export function lazyMemo<T, Args extends any[]>(
  refreshMs: number,
  invalidMs: number,
  getter: (...args: Args) => Promise<T>
): () => Promise<T> {
  let ts = -invalidMs * 2;
  let value: T;
  async function _refresh(...args: Args) {
    value = await getter(...args);
    ts = Date.now();
    return value;
  }
  let refreshPromise: ReturnType<typeof _refresh> | null = null;
  async function refresh(...args: Args) {
    if (!refreshPromise) {
      refreshPromise = _refresh(...args);
    }
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }
  return async (...args: Args) => {
    if (Date.now() > ts + invalidMs) {
      return await refresh(...args);
    }
    if (Date.now() > ts + refreshMs) {
      refresh(...args).catch(() => {
        ts = -invalidMs * 2; // Retry on next access, throw at that time if still error
      });
    }
    return value;
  };
}
