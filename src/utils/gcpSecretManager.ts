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

export const secretManagerGetter = (envName: string, refreshMs = 60000, invalidMs = 86400 * 7 * 1000) => {
  ensureEnv(envName);
  return lazyMemo<string>(refreshMs, invalidMs, async () => await getSecretVersion(envName));
};
