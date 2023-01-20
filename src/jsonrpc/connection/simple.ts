import { JSONRPCRequest, JSONRPCResponse } from "json-rpc-2.0";
import WebSocket from "ws";
import EventEmitter from "node:events";
import { IJsonRpcConnection } from "./types";

export class SimpleJsonRpcConnection extends EventEmitter implements IJsonRpcConnection {
  constructor(private ws: WebSocket) {
    super();
    ws.once("close", this.handleClose);
    ws.once("error", this.handleError);
  }
  isOpen(): boolean {
    return this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN;
  }
  send(obj: JSONRPCRequest | JSONRPCResponse): void {
    const data = JSON.stringify(obj);
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      return;
    }
    if (this.ws.readyState !== WebSocket.CONNECTING) {
      throw new Error("WebSocket is not open");
    }
    // Do not wait for result here, otherwise the builtin timeout mechanism doesn't work
    const onError = (e) => {
      this.close(3005, e?.toString() || "Failed to send request to WebSocket due to WebSocket error");
    };
    this.ws.on("error", onError);
    this.ws.on("close", onError);
    this.ws.once("open", () => {
      this.ws.off("error", onError);
      this.ws.off("close", onError);
      try {
        this.ws.send(data);
      } catch (error) {
        this.close(3006, error?.toString() || "Failed to send request to WebSocket");
        return;
      }
    });
  }
  close(code = 1000, reason = "Called close function on SimpleJsonRpcConnection"): void {
    this.ws.close(code, reason);
  }
  private handleClose(code: number, reason: Buffer) {
    this.emit("close", code, reason);
  }
  private handleError(err: Error) {
    this.emit("error", err);
  }
}
