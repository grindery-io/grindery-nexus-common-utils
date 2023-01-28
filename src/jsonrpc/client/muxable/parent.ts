import { EventEmitter } from "node:events";
import { JSONRPCRequest, JSONRPCResponse } from "json-rpc-2.0";
import WebSocket from "ws";
import { IJsonRpcConnection, WithConnectionId } from "../../connection";
import { wsSendMessage } from "../../utils";
import { createConnectionManager } from "../../connection/manager";
import { JsonRpcWebSocketClientConnection } from "./child";

export class MuxableJsonRpcWebSocket extends EventEmitter implements IJsonRpcConnection {
  private ws: WebSocket;
  private manager = createConnectionManager(
    (id) => new JsonRpcWebSocketClientConnection(this, id, this.requestTimeout),
    false
  );
  private supportsMuxing: boolean | null = null;
  private lastRxTimestamp = 0;
  private pingPromise = null as Promise<unknown> | null;

  constructor(private url: string, private requestTimeout = 60000) {
    super();
    this.ws = new WebSocket(url);
    this.ws.on("message", (data) => {
      let msg: (JSONRPCRequest | JSONRPCResponse) & WithConnectionId;
      try {
        msg = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf-8") : data.toString());
      } catch (e) {
        console.warn("Received invalid JSON message from WebSocket", e, { data });
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
        }
        return;
      }
      const connResult = this.manager.getConnectionForMessage(msg);
      if (!connResult) {
        return;
      }
      if ("jsonrpc" in connResult) {
        this.ws.send(connResult);
        return;
      }
      this.supportsMuxing = "connectionId" in msg;
      this.lastRxTimestamp = Date.now();
      connResult[0].processMessage(msg);
    });
    const handleClose = (code: number, reason?: Buffer) => {
      this.ws.off("close", handleClose);
      this.emit("close", code, reason);
      this.removeAllListeners("close");
    };
    this.ws.on("close", handleClose);
    this.ws.on("error", (e) => {
      console.error("WebSocket error:", e);
      this.ws.close(3003, "WebSocket error");
      this.emit("close", 3003, String(e));
      this.removeAllListeners("close");
    });
    this.manager.getDefaultConnection().on("close", (code, reason) => this.close(code, reason));
  }
  getDefaultConnection() {
    return this.manager.getDefaultConnection();
  }
  maybeClose() {
    if (this.manager.getNumChildren() === 0) {
      this.close(1000, "All children connections are closed");
    }
  }
  async coalescedPing() {
    if (Date.now() - this.lastRxTimestamp < 10000) {
      return true;
    }
    if (this.pingPromise) {
      return await this.pingPromise;
    }
    this.pingPromise = this.getDefaultConnection().request("ping");
    this.pingPromise.finally(() => (this.pingPromise = null));
    return await this.pingPromise;
  }
  async createConnection() {
    if (!this.isOpen) {
      throw new Error("Can't create child connection on closed parent connection");
    }
    if (this.supportsMuxing === null) {
      await this.manager.getDefaultConnection().request("ping");
    }
    if (this.supportsMuxing) {
      const ret = this.manager.createConnection();
      ret.once("close", () => setTimeout(this.maybeClose.bind(this), 0));
      console.log(`[${this.url}] Creating muxed connection: ${ret.connectionId}`);
      return ret;
    }
    return null;
  }
  send(obj: JSONRPCRequest | JSONRPCResponse): void {
    wsSendMessage(this.ws, obj);
  }
  close(code = 1000, reason = "Called close function on MuxableJsonRpcWebSocket") {
    if (!this.isOpen) {
      return;
    }
    this.ws.close(code, reason);
  }
  get isOpen() {
    return ([WebSocket.CONNECTING, WebSocket.OPEN] as number[]).includes(this.ws.readyState);
  }
}
