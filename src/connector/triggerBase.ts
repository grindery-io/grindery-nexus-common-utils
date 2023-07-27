import * as Sentry from "@sentry/node";
import { TriggerHostServices, TriggerInit, TriggerInput } from ".";

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
  TNotificationPayload extends Record<string, unknown> = Record<string, unknown>,
  TState extends unknown | Record<string, unknown> = unknown
> implements ITriggerInstance
{
  protected readonly input: TriggerInput<TInput>;
  private running = false;
  private readonly hostServices: TriggerHostServices<TNotificationPayload>;
  protected readonly state: TState;
  private stopper = createStopper();

  constructor(input: TriggerInit<TInput, TNotificationPayload, TState>) {
    this.input = input;
    this.state = (input.initStates || {}) as TState;
    this.hostServices = input.hostServices;
  }
  protected get sessionId(): string {
    return this.input.sessionId;
  }
  protected get key(): string {
    return this.input.key;
  }
  protected get fields(): TInput {
    return this.input.fields;
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
    Object.assign(this.state as object, newValues);
    if (!this.running) {
      return;
    }
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
