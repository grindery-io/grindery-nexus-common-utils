import { EventEmitter } from "node:events";
import { JSONRPCServer, JSONRPCClient, JSONRPCServerAndClient, JSONRPCParams } from "json-rpc-2.0";
import WebSocket from "ws";
import { wsSendMessage } from "../utils";

export class JsonRpcWebSocket extends EventEmitter {
  private serverAndClient: JSONRPCServerAndClient;
  private ws: WebSocket;

  constructor(url: string, private requestTimeout = 60000) {
    super();
    this.ws = new WebSocket(url);
    this.serverAndClient = new JSONRPCServerAndClient(
      new JSONRPCServer(),
      new JSONRPCClient(async (request) => {
        await wsSendMessage(this.ws, request);
      })
    );
    this.ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf-8") : data.toString());
      } catch (e) {
        console.warn("Received invalid JSON message from WebSocket", e, { data });
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
        }
        return;
      }
      this.serverAndClient.receiveAndSend(msg).catch((e) => console.error("receiveAndSend error: ", e));
    });
    const handleClose = (code: number, reason?: Buffer) => {
      this.ws.off("close", handleClose);
      this.serverAndClient.rejectAllPendingRequests(`Connection is closed (${code} - ${reason?.toString("binary")}).`);
      this.emit("close", code, reason);
      this.removeAllListeners("close");
    };
    this.ws.on("close", handleClose);
    this.ws.on("error", (e) => {
      console.error("WebSocket error:", e);
      this.ws.close(3003, "WebSocket error");
      this.serverAndClient.rejectAllPendingRequests(`Connection error: ${e.toString()}`);
      this.emit("close", 3003, String(e));
      this.removeAllListeners("close");
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addMethod<T extends Record<string, unknown>>(name: string, method: (params: T | undefined) => PromiseLike<any>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.serverAndClient.addMethod(name, method as any);
  }
  onTimeout() {
    this.serverAndClient.rejectAllPendingRequests("JsonRpcWebSocket: Unexpected timeout");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request<T extends JSONRPCParams, U = unknown>(method: string, params?: T, clientParams?: any): Promise<U> {
    if (!this.isOpen) {
      throw new Error("WebSocket is not open");
    }
    let running = true;
    let keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
    const keepAlive = () => {
      if (!running) {
        return;
      }
      if (method === "ping") {
        return;
      }
      keepAliveTimer = setTimeout(() => {
        keepAliveTimer = null;
        if (!running) {
          return;
        }
        this.serverAndClient
          .timeout(5000)
          .request("ping")
          .then(keepAlive, () => {
            if (!this.isOpen) {
              return;
            }
            this.ws.close(3001, "Failed to ping server");
          });
      }, 5000);
    };
    keepAlive();
    let deadLineTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      deadLineTimer = null;
      console.warn(`JsonRpcWebSocket: Unexpected timeout (method: ${method})`, {
        method,
        params,
      });
      this.onTimeout();
      this.close(3002, `JsonRpcWebSocket: Unexpected timeout (method: ${method})`);
    }, this.requestTimeout * 1.5);
    try {
      return await this.serverAndClient.timeout(this.requestTimeout).request(method, params, clientParams);
    } finally {
      running = false;
      if (deadLineTimer) {
        clearTimeout(deadLineTimer);
        deadLineTimer = null;
      }
      if (keepAliveTimer) {
        clearTimeout(keepAliveTimer);
        keepAliveTimer = null;
      }
    }
  }
  close(code = 1000, reason = "Called close function on JsonRpcWebSocket") {
    this.ws.close(code, reason);
    this.serverAndClient.rejectAllPendingRequests(`JsonRpcWebSocket: close: ${code} - ${reason}`);
  }
  get isOpen() {
    return ([WebSocket.CONNECTING, WebSocket.OPEN] as number[]).includes(this.ws.readyState);
  }
}
