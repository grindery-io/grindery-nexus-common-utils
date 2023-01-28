import {
  JSONRPCServer,
  JSONRPCClient,
  JSONRPCServerAndClient,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse,
} from "json-rpc-2.0";
import { MuxedChildConnection } from "../../connection";
import { MuxableJsonRpcWebSocket } from "./parent";

export class JsonRpcWebSocketClientConnection extends MuxedChildConnection<MuxableJsonRpcWebSocket> {
  private serverAndClient = new JSONRPCServerAndClient(
    new JSONRPCServer(),
    new JSONRPCClient(async (request) => {
      this.send(request);
    })
  );
  constructor(parent: MuxableJsonRpcWebSocket, connectionId: string, private requestTimeout: number) {
    super(parent, connectionId);
    this.on("close", (code, reason) => this.serverAndClient.rejectAllPendingRequests(`${code} - ${reason}`));
  }
  processMessage(msg: JSONRPCRequest | JSONRPCResponse) {
    this.serverAndClient.receiveAndSend(msg).catch((e) => console.error("receiveAndSend error: ", e));
  }
  onTimeout() {
    this.serverAndClient.rejectAllPendingRequests("JsonRpcWebSocketClientConnection: Unexpected timeout");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addMethod<T extends Record<string, unknown>>(name: string, method: (params: T | undefined) => PromiseLike<any>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.serverAndClient.addMethod(name, method as any);
  }
  async request<T extends JSONRPCParams, U = unknown>(method: string, params?: T): Promise<U> {
    if (!this.isOpen) {
      throw new Error("WebSocket is not open");
    }
    if (method === "ping" && this.connectionId) {
      return (await this.parent.coalescedPing()) as U;
    }
    let deadLineTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      deadLineTimer = null;
      console.warn(`JsonRpcWebSocketClientConnection: Unexpected timeout (method: ${method})`, {
        method,
        params,
      });
      this.onTimeout();
      this.close(3002, `JsonRpcWebSocketClientConnection: Unexpected timeout (method: ${method})`);
    }, this.requestTimeout * 1.5);
    try {
      return await this.serverAndClient.timeout(this.requestTimeout).request(method, params);
    } finally {
      if (deadLineTimer) {
        clearTimeout(deadLineTimer);
        deadLineTimer = null;
      }
    }
  }
}
