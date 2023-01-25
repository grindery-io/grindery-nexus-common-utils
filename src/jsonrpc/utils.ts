import { JSONRPCRequest, JSONRPCResponse } from "json-rpc-2.0";
import WebSocket from "ws";

export function wsSendMessage(ws: WebSocket, request: JSONRPCRequest | JSONRPCResponse) {
  const data = JSON.stringify(request);
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
    return;
  }
  if (ws.readyState !== WebSocket.CONNECTING) {
    throw new Error("WebSocket is not open");
  }
  // Do not wait for result here, otherwise the builtin timeout mechanism doesn't work
  const onError = (e) => {
    ws.close(3005, e?.toString() || "Failed to send request to WebSocket due to WebSocket error");
  };
  ws.on("error", onError);
  ws.on("close", onError);
  ws.once("open", () => {
    ws.off("error", onError);
    ws.off("close", onError);
    try {
      ws.send(data);
    } catch (error) {
      ws.close(3006, error?.toString() || "Failed to send request to WebSocket");
      return;
    }
  });
}
