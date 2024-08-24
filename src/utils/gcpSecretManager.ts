import { ensureEnv, lazyMemo } from "./misc";

const getSecretClient = lazyMemo(
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
  async () => await import("@google-cloud/secret-manager").then((m) => new m.SecretManagerServiceClient())
);
const alreadyEmittedWarning = new Set<string>();
async function getSecretVersion(envName: string): Promise<string> {
  const secretName = ensureEnv(envName);
  if (!/^projects\/\d+\/secrets\/.*/.test(secretName)) {
    if (process.env.NODE_ENV !== "production") {
      if (!alreadyEmittedWarning.has(envName)) {
        console.warn(
          `Non-production mode: Environment variable ${envName} is not a secret path, using as secret directly`
        );
        alreadyEmittedWarning.add(envName);
      }
      return secretName;
    }
    throw new Error(`Invalid secret path: ${envName}`);
  }
  const secretClient = await getSecretClient();
  const [version] = await secretClient.accessSecretVersion({
    name: secretName,
  });

  // Extract the secret's content
  const secretValue = version?.payload?.data?.toString();
  if (!secretValue) {
    throw new Error(`Got invalid result for secret ${envName}`);
  }
  return secretValue;
}

/**
 * Returns a memoized function that retrieves a secret value from Google Cloud Secret Manager.
 *
 * @param {string} envName - The name of the environment variable containing the secret path.
 * @param {number} [refreshMs=60000] - The time interval in milliseconds to refresh the secret value.
 * @param {number} [invalidMs=604800000] - The time interval in milliseconds to invalidate the secret value.
 * @return {() => Promise<string>} An async function that returns the secret value.
 */
export function secretManagerGetter(
  envName: string,
  refreshMs: number = 60000,
  invalidMs: number = 86400 * 7 * 1000
): () => Promise<string> {
  ensureEnv(envName);
  return lazyMemo(refreshMs, invalidMs, async () => await getSecretVersion(envName));
}
