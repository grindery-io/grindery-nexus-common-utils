import WebSocket from "ws";
import { createJsonRpcServer, forceObject } from "../jsonrpc";
import { runJsonRpcServer } from "../server";
import { TriggerBase } from "./triggerBase";
import {
  ConnectorInput,
  ActionOutput,
  WebhookParams,
  InputProviderInput,
  InputProviderOutput,
  ConnectorOutput,
} from "./types";

export function runConnector({
  actions,
  triggers,
  webhooks,
  inputProviders,
  options,
}: {
  actions: { [name: string]: (params: ConnectorInput<unknown>) => Promise<ActionOutput> };
  triggers: {
    [name: string]:
      | (new (input: ConnectorInput) => TriggerBase)
      | { factory: (input: ConnectorInput) => Promise<TriggerBase> | TriggerBase };
  };
  webhooks?: { [key: string]: (params: ConnectorInput<WebhookParams>) => Promise<ActionOutput> };
  inputProviders?: { [key: string]: (params: InputProviderInput) => Promise<InputProviderOutput> };
  options?: Parameters<typeof runJsonRpcServer>[1];
}) {
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
  async function setupSignal(params: ConnectorInput, { socket }: { socket?: WebSocket }) {
    if (!socket) {
      throw new Error("This method is only callable via WebSocket");
    }
    if (socket.readyState !== socket.OPEN) {
      throw new Error("Socket is not open");
    }
    const trigger = triggers[params.key];
    if (trigger) {
      const instance = typeof trigger === "object" ? await trigger.factory(params) : new trigger(params);
      instance.on("stop", () => {
        if (socket.readyState === socket.OPEN) {
          socket.close();
        }
      });
      instance.on("signal", (message) => {
        socket.send(JSON.stringify(message));
      });
      socket.on("close", () => {
        instance.stop();
      });
      socket.on("error", () => {
        instance.stop();
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
  const app = runJsonRpcServer(jsonRpcServer, options);
  return { jsonRpcServer, app };
}
export type ConnectorDefinition = Parameters<typeof runConnector>[0];
