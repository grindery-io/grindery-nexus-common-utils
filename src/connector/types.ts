import { FieldSchema } from "../types";

type WebSocketPayloadCommon = {
  key: string;
  sessionId: string;
};
export type ConnectorInput<T = unknown> = WebSocketPayloadCommon & {
  cdsName: string;
  authentication?: string;
  fields: T;
};
export type ConnectorOutput = WebSocketPayloadCommon & {
  payload: unknown;
};

export type InputProviderInput<T = unknown> = {
  cdsName: string;
  key: string;
  authentication?: string;
  fieldData: T;
};
export type InputProviderOutput = {
  inputFields: FieldSchema[];
  outputFields?: FieldSchema[];
  sample?: Record<string, unknown>;
};

export type ActionOutput = Pick<ConnectorOutput, "payload">;

export type WebhookParams = {
  method: string;
  path: string;
  payload: unknown;
};
