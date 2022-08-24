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

export abstract class TriggerBase<T = unknown> {
  protected sessionId = "";
  private running = false;
  protected fields: T;
  private stopper = createStopper();
  constructor(private ws: WebSocket, private input: ConnectorInput) {
    this.fields = input.fields as T;
    this.sessionId = input.sessionId;
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.on("close", () => {
      this.stop();
    });
    ws.on("error", () => {
      this.stop();
    });
  }
  isRunning() {
    return this.running;
  }
  stop() {
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
    this.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifySignal",
        params: { key: this.input.key, sessionId: this.input.sessionId, payload },
      })
    );
  }
  start() {
    this.running = true;
    this.main()
      .catch((e) => {
        console.error(e);
        Sentry.captureException(e);
      })
      .finally(() => {
        try {
          this.ws.close();
        } catch (e) {
          /* Ignore */
        }
      });
  }
  abstract main(): Promise<unknown>;
}

export function runConnector({
  actions,
  signals,
  options,
}: {
  actions: { [name: string]: (params: ConnectorInput<unknown>) => Promise<Pick<ConnectorOutput, "payload">> };
  signals: { [name: string]: new (ws: WebSocket, input: ConnectorInput) => TriggerBase };
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
    if (params.key in signals) {
      new signals[params.key](socket, params).start();
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
