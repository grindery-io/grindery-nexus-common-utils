export const ensureEnv = <T = string>(key: string, parse?: (value: string) => T): T => {
  const ret = process.env[key];
  if (!ret) {
    console.error("Error: Environment variable not set:", key);
    setTimeout(() => process.exit(1), 0); // Check more variables before exiting
    return "" as T;
  }
  return parse ? parse(ret) : (ret as T);
};

export const failFast = (f: () => Promise<unknown>) =>
  f().catch((e) => {
    console.error(e?.toString());
    setTimeout(() => process.exit(1), 1000).unref();
    return Promise.reject(e);
  });

export function lazyMemo<T>(refreshMs: number, invalidMs: number, getter: () => Promise<T>): () => Promise<T> {
  let ts = Date.now() - invalidMs * 2;
  let value: T;
  async function refresh() {
    value = await getter();
    ts = Date.now();
    return value;
  }
  return async () => {
    if (Date.now() > ts + invalidMs) {
      return await refresh();
    }
    if (Date.now() > ts + refreshMs) {
      refresh().catch(() => {
        ts = 0; // Retry on next access, throw at that time if still error
      });
    }
    return value;
  };
}
