import { v4 as uuidv4 } from "uuid";
import { ConnectorDefinition } from "./run";
import { ConnectorInput, TriggerInit, TriggerInput } from "./types";

async function runAction(def: ConnectorDefinition, key: string, payload: unknown) {
  const action = def.actions[key];
  if (!action) {
    throw new Error(`Action not found: ${key}`);
  }
  return await action(payload as ConnectorInput);
}

async function runTrigger(def: ConnectorDefinition, key: string, payload: TriggerInput) {
  const trigger = def.triggers[key] || def.triggers["*"];
  if (!trigger) {
    throw new Error(`Trigger not found: ${key}`);
  }
  const init: TriggerInit = {
    ...payload,
    hostServices: {
      async setInitStates(value: unknown): Promise<void> {
        console.log("setInitStates:", value);
      },
      sendNotification(payload: unknown): void {
        console.log("New signal:", payload);
      },
      onStop(code = 1000, reason = "Trigger stopped"): void {
        console.log("Trigger stopped:", code, reason);
        process.exit(0);
      },
    },
  };
  const instance = typeof trigger === "object" ? await trigger.factory(init) : new trigger(init);
  instance.start();
  console.log(`Trigger ${key} started`);
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
    return await runTrigger(def, key, payload as TriggerInput);
  }
  throw new Error(`Invalid mode: ${mode}`);
}
