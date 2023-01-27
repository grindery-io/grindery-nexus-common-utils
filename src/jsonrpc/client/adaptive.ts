import { JSONRPCParams } from "json-rpc-2.0";
import { JsonRpcWebSocketClientConnection } from "./muxable/child";
import { MuxableJsonRpcWebSocket } from "./muxable/parent";
import { JsonRpcWebSocket } from "./simple";

export interface IJsonRpcClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addMethod<T extends Record<string, unknown>>(name: string, method: (params: T | undefined) => PromiseLike<any>): void;
  request<T extends JSONRPCParams, U = unknown>(method: string, params?: T): Promise<U>;
  close(code?: number, data?: string): void;
  get isOpen(): boolean;

  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  on(event: "error", listener: (err: Error) => void): void;

  once(event: "close", listener: (code: number, reason: Buffer) => void): void;
  once(event: "error", listener: (err: Error) => void): void;

  off(event: "close", listener: (code: number, reason: Buffer) => void): void;
  off(event: "error", listener: (err: Error) => void): void;
}
const muxableConnections = new Map<string, MuxableJsonRpcWebSocket | null | Promise<MuxableJsonRpcWebSocket | null>>();

export async function getAdaptiveConnection(url: string, requestTimeout = 60000): Promise<IJsonRpcClient> {
  let parent = await Promise.resolve(muxableConnections.get(url));
  if (parent === null) {
    return new JsonRpcWebSocket(url, requestTimeout);
  }
  if (parent && !parent.isOpen) {
    muxableConnections.delete(url);
    parent = undefined;
  }
  if (parent) {
    const ret = await parent.createConnection();
    if (ret) {
      return ret;
    }
  }
  const promise = (async () => {
    const parent = new MuxableJsonRpcWebSocket(url, requestTimeout);
    const conn = await parent.createConnection();
    if (!conn) {
      parent.close(3000, "Muxing not supported");
      return null;
    }
    parent.on("close", () => muxableConnections.delete(url));
    return [parent, conn] as [MuxableJsonRpcWebSocket, JsonRpcWebSocketClientConnection];
  })();
  muxableConnections.set(
    url,
    promise.then((result) => {
      const ret = result?.[0] || null;
      muxableConnections.set(url, ret);
      return ret;
    })
  );
  promise.catch((e) => {
    muxableConnections.delete(url);
    console.error("Got error when creating muxable connection:", e);
  });
  const result = await promise;
  if (!result) {
    return new JsonRpcWebSocket(url, requestTimeout);
  }
  return result[1];
}
