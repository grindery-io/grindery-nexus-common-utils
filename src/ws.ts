import { EventEmitter } from "node:events";
import { JSONRPCServer, JSONRPCClient, JSONRPCServerAndClient, JSONRPCParams } from "json-rpc-2.0";
import WebSocket from "ws";

export class JsonRpcWebSocket extends EventEmitter {
  private serverAndClient: JSONRPCServerAndClient;
  private ws: WebSocket;

  constructor(url: string, private requestTimeout = 60000) {
    super();
    this.ws = new WebSocket(url);
    this.serverAndClient = new JSONRPCServerAndClient(
      new JSONRPCServer(),
      new JSONRPCClient(async (request) => {
        await new Promise((resolve, reject) => {
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(request));
            return;
          }
          if (this.ws.readyState !== WebSocket.CONNECTING) {
            throw new Error("WebSocket is not open");
          }
          const onError = function (e) {
            reject(e || new Error("Failed to send request to WebSocket"));
          };
          this.ws.on("error", onError);
          this.ws.on("close", onError);
          this.ws.once("open", () => {
            this.ws.off("error", onError);
            this.ws.off("close", onError);
            try {
              this.ws.send(JSON.stringify(request));
            } catch (error) {
              reject(error);
              return;
            }
            resolve(undefined);
          });
        });
      })
    );
    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data.toString());
      } catch (e) {
        console.warn("Received invalid JSON message from WebSocket", e, { data: event.data });
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
        }
        return;
      }
      this.serverAndClient.receiveAndSend(msg);
    };
    this.ws.on("close", (code, reason) => {
      this.serverAndClient.rejectAllPendingRequests(`Connection is closed (${code} - ${reason?.toString("binary")}).`);
      this.emit("close", code, reason);
      this.removeAllListeners("close");
    });
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
    this.serverAndClient.rejectAllPendingRequests("JsonRpcWebSocket: Unexpected timeout with no return from library");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request<T extends JSONRPCParams, U = unknown>(method: string, params?: T, clientParams?: any): Promise<U> {
    if (!this.isOpen) {
      throw new Error("WebSocket is not open");
    }
    let running = true;
    const keepAlive = () => {
      if (!running) {
        return;
      }
      setTimeout(() => {
        if (!running) {
          return;
        }
        this.serverAndClient.request("ping").then(keepAlive, () => {
          this.ws.close(3001, "Failed to ping server");
        });
      }, 5000);
    };
    keepAlive();
    let deadLineTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      deadLineTimeout = null;
      console.warn(`JsonRpcWebSocket: Unexpected timeout with no return from library (method: ${method})`, {
        method,
        params,
      });
      this.onTimeout();
      this.close(3002, "JsonRpcWebSocket: Unexpected timeout with no return from library");
    }, this.requestTimeout * 1.5);
    try {
      const promise = this.serverAndClient.request(method, params, clientParams);
      promise.then(
        () => {
          /* Empty */
        },
        () => {
          /* Empty */
        }
      );
      const sentinel = {};
      const result = await Promise.race([
        promise,
        new Promise((res) => setTimeout(() => res(sentinel), this.requestTimeout)),
      ]);
      if (result === sentinel) {
        this.onTimeout();
        throw new Error("Request timed out");
      }
      return result;
    } finally {
      running = false;
      if (deadLineTimeout) {
        clearTimeout(deadLineTimeout);
        deadLineTimeout = null;
      }
    }
  }
  close(code = 1000, reason = "Called close function on JsonRpcWebSocket") {
    this.ws.close(code, reason);
  }
  get isOpen() {
    return ([WebSocket.CONNECTING, WebSocket.OPEN] as number[]).includes(this.ws.readyState);
  }
}
