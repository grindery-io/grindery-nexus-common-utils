import { JSONRPCRequest, JSONRPCResponse } from "json-rpc-2.0";
import EventEmitter from "node:events";
import { IJsonRpcConnection, WithConnectionId } from "./types";

export class MuxedChildConnection extends EventEmitter implements IJsonRpcConnection {
  private closed = false;
  constructor(private parent: IJsonRpcConnection, public readonly connectionId: string) {
    super();
    parent.once("close", this.handleClose.bind(this));
    parent.once("error", this.handleError.bind(this));
  }
  get isOpen(): boolean {
    return !this.closed && this.parent.isOpen;
  }
  send(obj: JSONRPCRequest | JSONRPCResponse): void {
    if (!this.isOpen) {
      throw new Error("Can't send message on a closed connection");
    }
    this.parent.send({ ...obj, connectionId: this.connectionId } as (JSONRPCRequest | JSONRPCResponse) &
      WithConnectionId);
  }
  close(code = 1000, reason = "Called close function on MuxedChildConnection"): void {
    if (this.closed) {
      return;
    }
    this.handleClose(code, reason);
  }
  private handleClose(code: number, reason: Buffer | string) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.parent.isOpen) {
      this.parent.send({
        jsonrpc: "2.0",
        method: "_grinderyNexusCloseConnection",
        params: {
          code,
          reason: Buffer.isBuffer(reason) ? reason.toString("utf-8") : reason,
        },
        connectionId: this.connectionId,
      } as (JSONRPCRequest | JSONRPCResponse) & WithConnectionId);
    }
    this.emit("close", code, reason);
    console.log(
      `[${this.connectionId}] Connection closed: ${code} - ${
        Buffer.isBuffer(reason) ? reason.toString("utf-8") : reason
      }`
    );
  }
  private handleError(err: Error) {
    if (this.closed) {
      return;
    }
    this.emit("error", err);
  }
}
