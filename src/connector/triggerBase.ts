import { EventEmitter } from "node:events";
import * as Sentry from "@sentry/node";
import { ConnectorInput } from "../ws";

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
