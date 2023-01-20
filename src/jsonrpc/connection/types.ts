import { JSONRPCRequest, JSONRPCResponse } from "json-rpc-2.0";

export interface IJsonRpcConnection {
  send(obj: JSONRPCRequest | JSONRPCResponse): void;
  close(code?: number, data?: string): void;
  isOpen(): boolean;

  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  on(event: "error", listener: (err: Error) => void): void;

  once(event: "close", listener: (code: number, reason: Buffer) => void): void;
  once(event: "error", listener: (err: Error) => void): void;

  off(event: "close", listener: (code: number, reason: Buffer) => void): void;
  off(event: "error", listener: (err: Error) => void): void;
}

export type WithConnectionId = {
  connectionId?: string;
};
