import { v4 as uuidv4 } from "uuid";
import { ConnectorDefinition, ConnectorInput } from "./index";

async function runAction(def: ConnectorDefinition, key: string, payload: unknown) {
  const action = def.actions[key];
  if (!action) {
    throw new Error(`Action not found: ${key}`);
  }
  return await action(payload as ConnectorInput);
}

async function runTrigger(def: ConnectorDefinition, key: string, payload: unknown) {
  const trigger = def.triggers[key];
  if (!trigger) {
    throw new Error(`Trigger not found: ${key}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance =
    typeof trigger === "object"
      ? await trigger.factory(payload as ConnectorInput)
      : new trigger(payload as ConnectorInput);
  instance.on("signal", (msg) => console.log("New signal:", msg.params.payload));
  instance.start();
  console.log(`Trigger ${key} started`);
  await new Promise((res) => instance.on("stop", () => res(undefined)));
  console.log("Trigger stopped");
}

export async function cliMain(def: ConnectorDefinition) {
  const [, , mode, key, payloadRaw] = process.argv;
  let payload: Record<string, unknown> = {};
  try {
    if (payloadRaw) {
      payload = JSON.parse(payloadRaw);
    }
  } catch (e) {
    console.error("Invalid payload:", e);
  }
  if (!process.env.RAW_PAYLOAD) {
    payload = {
      key,
      sessionId: uuidv4(),
      credentials: {},
      fields: payload,
    };
  }
  if (mode === "action") {
    return await runAction(def, key, payload);
  } else if (mode === "trigger") {
    return await runTrigger(def, key, payload);
  }
  throw new Error(`Invalid mode: ${mode}`);
}
