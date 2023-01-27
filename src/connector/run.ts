import { createJsonRpcServer, forceObject } from "../jsonrpc";
import { IJsonRpcConnection } from "../jsonrpc/connection";
import { runJsonRpcServer, RunJsonRpcServerOptions } from "../server";
import { TriggerBase } from "./triggerBase";
import {
  ConnectorInput,
  ActionOutput,
  WebhookParams,
  InputProviderInput,
  InputProviderOutput,
  ConnectorOutput,
} from "./types";

type Action = (params: ConnectorInput<unknown>) => Promise<ActionOutput>;

export type WebhookOutput = ActionOutput &
  ({ returnUnwrapped?: undefined | false } | { returnUnwrapped: true; statusCode?: number; contentType?: string });

type WebhookHandler = (params: ConnectorInput<WebhookParams>) => Promise<WebhookOutput>;

type InputProvider = (params: InputProviderInput) => Promise<InputProviderOutput>;

type TriggerFactory =
  | (new (input: ConnectorInput) => TriggerBase)
  | {
      factory: (input: ConnectorInput) => Promise<TriggerBase> | TriggerBase;
    };

export type ConnectorDefinition = {
  actions: { [name: string]: Action };
  triggers: {
    [name: string]: TriggerFactory;
  };
  webhooks?: { [key: string]: WebhookHandler };
  inputProviders?: { [key: string]: InputProvider };
  options?: RunJsonRpcServerOptions;
};
export function runConnector({ actions, triggers, webhooks, inputProviders, options }: ConnectorDefinition) {
  const jsonRpcServer = createJsonRpcServer();

  async function runAction(params: ConnectorInput): Promise<ConnectorOutput> {
    if (params.key in actions) {
      let result = await actions[params.key](params);
      if (!("payload" in result)) {
        console.warn(`Action ${params.key} returned result in incorrect format, wrapping it`);
        result = { payload: result };
      }
      return { ...result, key: params.key, sessionId: params.sessionId };
    } else {
      throw new Error(`Invalid action: ${params.key}`);
    }
  }
  async function callWebhook(params: ConnectorInput<WebhookParams>): Promise<ConnectorOutput> {
    const handler = webhooks?.[params.key];
    if (!handler) {
      throw new Error("Webhook is not supported");
    }
    const result = await handler(params);
    return { ...result, key: params.key, sessionId: params.sessionId };
  }
  async function inputProvider(params: InputProviderInput): Promise<InputProviderOutput> {
    const handler = inputProviders?.[params.key];
    if (!handler) {
      throw new Error("Input provider is not supported");
    }
    const result = await handler(params);
    return result;
  }
  async function setupSignal(params: ConnectorInput, { connection }: { connection?: IJsonRpcConnection }) {
    if (!connection) {
      throw new Error("This method is only callable via WebSocket");
    }
    if (!connection.isOpen) {
      throw new Error("Socket is not open");
    }
    const trigger = triggers[params.key];
    if (trigger) {
      const instance = typeof trigger === "object" ? await trigger.factory(params) : new trigger(params);
      instance.on("stop", (code = 1000, reason = "Trigger stopped") => {
        if (reason.length > 100) {
          reason = reason.slice(0, 100) + "...";
        }
        if (connection.isOpen) {
          connection.close(code, reason);
        }
      });
      instance.on("signal", (message) => {
        connection.send(message);
      });
      connection.on("close", () => {
        instance.stop("WebSocket closed");
      });
      connection.on("error", (e) => {
        instance.stop(String(e));
      });
      instance.start();
    } else {
      throw new Error(`Invalid trigger: ${params.key}`);
    }
    return {};
  }

  jsonRpcServer.addMethod("setupSignal", forceObject(setupSignal));
  jsonRpcServer.addMethod("runAction", forceObject(runAction));
  jsonRpcServer.addMethod("callWebhook", forceObject(callWebhook));
  jsonRpcServer.addMethod("grinderyNexusConnectorUpdateFields", forceObject(inputProvider));
  const { app, server } = runJsonRpcServer(jsonRpcServer, options);
  return { jsonRpcServer, app, server };
}
