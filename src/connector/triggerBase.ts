import { EventEmitter } from "node:events";
import * as Sentry from "@sentry/node";
import { ConnectorInput } from ".";
import { JSONRPCRequest } from "json-rpc-2.0";

function createStopper() {
  let resolve, reject;
  const promise: Promise<unknown> & { stop?: (reason?: string) => void; error?: (e) => void } = new Promise(
    (res, rej) => {
      resolve = res;
      reject = rej;
    }
  );
  promise.stop = (reason?: string) => resolve(reason);
  promise.error = (e) => reject(e);
  return promise;
}

export abstract class TriggerBase<T = unknown> extends EventEmitter {
  protected sessionId = "";
  protected key = "";
  private running = false;
  protected fields: T;
  private stopper = createStopper();
  constructor(private input: ConnectorInput) {
    super();
    this.fields = input.fields as T;
    this.sessionId = input.sessionId;
    this.key = input.key;
  }
  get isRunning() {
    return this.running;
  }
  stop(reason = "") {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.stopper.stop?.(reason);
  }
  interrupt(e) {
    this.stopper.error?.(e);
  }
  protected async waitForStop() {
    await this.stopper;
  }
  private async sendNotificationAsync(payload: Record<string, unknown>) {
    if (!this.running) {
      return;
    }
    for (const process of this.listeners("processSignal")) {
      if ((await process(payload)) === false) {
        console.log("Dropping notification:", { payload });
      }
    }
    this.emit("signal", {
      jsonrpc: "2.0",
      method: "notifySignal",
      params: { key: this.input.key, sessionId: this.input.sessionId, payload },
    });
  }
  protected sendNotification(payload: Record<string, unknown>) {
    this.sendNotificationAsync(payload).catch((e) => console.error("Failed to send notification:", e));
  }
  start() {
    this.running = true;
    this.main()
      .then((result) => {
        this.running = false;
        this.emit("stop", 1000, result ? String(result) : "Trigger stopped normally");
      })
      .catch((e) => {
        this.running = false;
        this.emit("stop", 3001, String(e));
        console.error(e);
        Sentry.captureException(e);
      });
  }
  abstract main(): Promise<unknown>;

  emit(e: "signal", payload: JSONRPCRequest): boolean;
  emit(e: "stop", code: number, reason: string): boolean;
  emit(e: string, ...args: unknown[]): boolean {
    return super.emit(e, ...args);
  }

  on(e: "processSignal", listener: (payload: Record<string, unknown>) => Promise<void | false>): this;
  on(e: "signal", listener: (payload: JSONRPCRequest) => void): this;
  on(e: "stop", listener: (code: number, reason: string) => void): this;
  on(e: string, listener: (...args) => unknown): this {
    return super.on(e, listener);
  }
}
