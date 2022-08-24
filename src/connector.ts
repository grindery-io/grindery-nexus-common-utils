import { EventEmitter } from "node:events";
import WebSocket from "ws";
import * as Sentry from "@sentry/node";
import { createJsonRpcServer, forceObject } from "./jsonrpc";
import { runJsonRpcServer } from "./server";
import { ConnectorInput, ConnectorOutput } from "./ws";

export { ConnectorInput, ConnectorOutput };

function createStopper() {
  let resolve, reject;
  const promise: Promise<unknown> & { stop?: () => void; error?: (e) => void } = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.stop = () => resolve();
  promise.error = (e) => reject(e);
  return promise;
}

export abstract class TriggerBase<T = unknown> extends EventEmitter {
  protected sessionId = "";
  private running = false;
  protected fields: T;
  private stopper = createStopper();
  constructor(private input: ConnectorInput) {
    super();
    this.fields = input.fields as T;
    this.sessionId = input.sessionId;
  }
  get isRunning() {
    return this.running;
  }
  stop() {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.stopper.stop?.();
  }
  interrupt(e) {
    this.stopper.error?.(e);
  }
  async waitForStop() {
    await this.stopper;
  }
  sendNotification(payload: unknown) {
    if (!this.running) {
      return;
    }
    this.emit("signal", {
      jsonrpc: "2.0",
      method: "notifySignal",
      params: { key: this.input.key, sessionId: this.input.sessionId, payload },
    });
  }
  start() {
    this.running = true;
    this.main()
      .catch((e) => {
        console.error(e);
        Sentry.captureException(e);
      })
      .finally(() => {
        this.running = false;
        this.emit("stop");
      });
  }
  abstract main(): Promise<unknown>;
}

export type ActionOutput = Pick<ConnectorOutput, "payload">;

export function runConnector({
  actions,
  triggers,
  options,
}: {
  actions: { [name: string]: (params: ConnectorInput<unknown>) => Promise<ActionOutput> };
  triggers: { [name: string]: new (input: ConnectorInput) => TriggerBase };
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
  async function setupSignal(params: ConnectorInput, { socket }: { socket: WebSocket }) {
    if (!socket) {
      throw new Error("This method is only callable via WebSocket");
    }
    if (socket.readyState !== socket.OPEN) {
      throw new Error("Socket is not open");
    }
    if (params.key in triggers) {
      const instance = new triggers[params.key](params);
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
  const app = runJsonRpcServer(jsonRpcServer, options);
  return { jsonRpcServer, app };
}
export type ConnectorDefinition = Parameters<typeof runConnector>[0];
