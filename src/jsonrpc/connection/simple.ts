import { JSONRPCRequest, JSONRPCResponse } from "json-rpc-2.0";
import WebSocket from "ws";
import EventEmitter from "node:events";
import { IJsonRpcConnection } from "./types";
import { wsSendMessage } from "../utils";

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
    wsSendMessage(this.ws, obj);
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
