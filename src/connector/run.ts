import { JSONRPCRequest } from "json-rpc-2.0";
import { createJsonRpcServer, forceObject } from "../jsonrpc";
import { IJsonRpcConnection } from "../jsonrpc/connection";
import { runJsonRpcServer, RunJsonRpcServerOptions } from "../server";
import { ITriggerInstance } from "./triggerBase";
import {
  ConnectorInput,
  ActionOutput,
  WebhookParams,
  InputProviderInput,
  InputProviderOutput,
  ConnectorOutput,
  TriggerHostServices,
  TriggerInit,
  TriggerInput,
} from "./types";

type Action<TInput = unknown, TOutput = unknown> = (params: ConnectorInput<TInput>) => Promise<ActionOutput<TOutput>>;

export type WebhookOutput<T = unknown> = ActionOutput<T> &
  ({ returnUnwrapped?: undefined | false } | { returnUnwrapped: true; statusCode?: number; contentType?: string });

type WebhookHandler<TInput = unknown, TOutput = unknown> = (
  params: ConnectorInput<WebhookParams<TInput>>
) => Promise<WebhookOutput<TOutput>>;

type InputProvider<TInput = unknown> = (params: InputProviderInput<TInput>) => Promise<InputProviderOutput>;

type TriggerFactory<
  TInput = unknown,
  TNotificationPayload extends Record<string, unknown> = Record<string, unknown>,
  TInitStates extends void | Record<string, unknown> = void
> =
  | (new (input: TriggerInit<TInput, TNotificationPayload, TInitStates>) => ITriggerInstance)
  | {
      factory: (
        input: TriggerInit<TInput, TNotificationPayload, TInitStates>
      ) => Promise<ITriggerInstance> | ITriggerInstance;
    };

export type ConnectorDefinition = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: { [name: string]: Action<any, unknown> };
  triggers: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [name: string]: TriggerFactory<any, Record<string, unknown>, any>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webhooks?: { [key: string]: WebhookHandler<any, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputProviders?: { [key: string]: InputProvider<any> };
  options?: RunJsonRpcServerOptions;
};
export function runConnector({ actions, triggers, webhooks, inputProviders, options }: ConnectorDefinition) {
  const jsonRpcServer = createJsonRpcServer();

  async function runAction(params: ConnectorInput): Promise<ConnectorOutput> {
    const action = actions[params.key] || actions["*"];
    if (action) {
      let result = await action(params);
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
  async function setupSignal(params: TriggerInput, { connection }: { connection?: IJsonRpcConnection }) {
    if (!connection) {
      throw new Error("This method is only callable via WebSocket");
    }
    if (!connection.isOpen) {
      throw new Error("Socket is not open");
    }
    const trigger = triggers[params.key];
    if (trigger) {
      const hostServices: TriggerHostServices<unknown> = {
        async setInitStates(value: unknown): Promise<void> {
          const message: JSONRPCRequest = {
            jsonrpc: "2.0",
            method: "setState",
            params: { sessionId: params.sessionId, payload: { key: "initStates", value } },
          };
          connection.send(message);
        },
        sendNotification(payload: unknown): void {
          const message: JSONRPCRequest = {
            jsonrpc: "2.0",
            method: "notifySignal",
            params: { key: params.key, sessionId: params.sessionId, payload },
          };
          connection.send(message);
        },
        onStop(code = 1000, reason = "Trigger stopped"): void {
          if (reason.length > 100) {
            reason = reason.slice(0, 100) + "...";
          }
          if (connection.isOpen) {
            connection.close(code, reason);
          }
        },
      };
      const triggerInput: TriggerInit = { ...params, hostServices };
      const instance = typeof trigger === "object" ? await trigger.factory(triggerInput) : new trigger(triggerInput);
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
