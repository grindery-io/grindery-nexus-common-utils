import * as Sentry from "@sentry/node";
import { TriggerHostServices, TriggerInit } from ".";

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

export interface ITriggerInstance {
  get isRunning(): boolean;
  stop(reason: string): void;
  start(): void;
  main(): Promise<unknown>;
}

export abstract class TriggerBase<
  TInput = unknown,
  TNotificationPayload = Record<string, unknown>,
  TState extends Record<string, unknown> = Record<string, unknown>
> implements ITriggerInstance
{
  protected readonly sessionId: string;
  protected readonly key: string;
  private running = false;
  protected readonly fields: TInput;
  private readonly hostServices: TriggerHostServices<TNotificationPayload>;
  protected readonly state: TState;
  private stopper = createStopper();

  constructor(private readonly input: TriggerInit<TInput, TNotificationPayload, TState>) {
    this.fields = input.fields as TInput;
    this.sessionId = input.sessionId;
    this.key = input.key;
    this.state = input.initStates || ({} as TState);
    this.hostServices = input.hostServices;
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
  protected async processSignal(_payload: TNotificationPayload): Promise<boolean> {
    return true;
  }
  private async sendNotificationAsync(payload: TNotificationPayload) {
    if (!this.running) {
      return;
    }
    if ((await this.processSignal(payload)) === false) {
      console.log("Dropping notification:", { payload });
      return;
    }
    this.hostServices.sendNotification(payload);
  }
  protected sendNotification(payload: TNotificationPayload) {
    this.sendNotificationAsync(payload).catch((e) => console.error("Failed to send notification:", e));
  }
  protected async updateState(newValues: Partial<TState>) {
    Object.assign(this.state, newValues);
    await this.hostServices.setInitStates(this.state);
  }
  start() {
    this.running = true;
    this.main()
      .then((result) => {
        this.running = false;
        this.hostServices.onStop(1000, result ? String(result) : "Trigger stopped normally");
      })
      .catch((e) => {
        this.running = false;
        this.hostServices.onStop(3001, String(e));
        console.error(e);
        Sentry.captureException(e);
      });
  }
  abstract main(): Promise<unknown>;
}
