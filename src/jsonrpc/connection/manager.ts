import { v4 as uuidv4 } from "uuid";
import { JSONRPCRequest, JSONRPCResponse } from "json-rpc-2.0";
import { WithConnectionId } from ".";

interface Closable {
  close(code: number, reason: string): unknown;
  once(event: "close", handler: () => void): unknown;
}
export function createConnectionManager<T extends Closable>(
  createChildConnection: (connectionId: string) => T,
  autoCreateConnection = true
) {
  const children = new Map<string, T>();
  const closedConnectionIds = new Set<string>();
  children.set("", createChildConnection(""));

  return {
    getDefaultConnection(): T {
      return children.get("") as T;
    },
    getConnectionForMessage(
      msg: (JSONRPCRequest | JSONRPCResponse) & WithConnectionId
    ): null | [T, string] | (JSONRPCResponse & WithConnectionId) {
      if (msg?.jsonrpc !== "2.0") {
        return { jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: null };
      }
      const connectionId = msg?.connectionId || "";

      let conn = children.get(connectionId);
      if ("method" in msg && msg.method === "_grinderyNexusCloseConnection") {
        if (!connectionId) {
          return msg?.id
            ? {
                jsonrpc: "2.0",
                error: { code: -32000, message: "Can't close default connection" },
                id: msg?.id,
                connectionId,
              }
            : null;
        }
        if (conn) {
          const params = msg.params as { code?: number; reason?: string };
          conn.close(
            parseInt(params?.code?.toString() || "", 10) || 3000,
            params?.reason?.toString() || "Remote closed connection"
          );
          children.delete(connectionId);
          closedConnectionIds.add(connectionId);
        }
        if (!msg?.id) {
          return null;
        }
        return {
          jsonrpc: "2.0",
          result: true,
          id: msg?.id,
          connectionId,
        };
      }
      if (!conn) {
        if ("method" in msg) {
          if (closedConnectionIds.has(connectionId)) {
            console.warn(`[${connectionId}] Calling ${msg?.method} on closed connection`, { msg });
            if (!msg.id) {
              return null;
            }
            return {
              jsonrpc: "2.0",
              error: { code: -32000, message: "Called method on a closed connection" },
              id: msg?.id,
              connectionId,
            };
          } else if (autoCreateConnection) {
            conn = this.createConnection(connectionId);
            console.log(`[${connectionId}] New child connection created from method ${msg?.method}`);
          } else {
            console.warn(`[${connectionId}] Called method ${msg?.method} on an invalid connection`);
            if (!msg.id) {
              return null;
            }
            return {
              jsonrpc: "2.0",
              error: { code: -32000, message: "Called method on an invalid connection" },
              id: msg?.id,
              connectionId,
            };
          }
        } else {
          // Response
          if (!closedConnectionIds.has(connectionId)) {
            console.warn(`[${connectionId}] Received response from unknown connection`, { msg });
          }
          return null;
        }
      }
      return [conn, connectionId];
    },
    createConnection(connectionId = ""): T {
      if (!connectionId) {
        connectionId = `conn-${uuidv4()}`;
      }
      const conn = createChildConnection(connectionId);
      conn.once("close", () => {
        children.delete(connectionId);
        closedConnectionIds.add(connectionId);
      });
      children.set(connectionId, conn);
      return conn;
    },
  };
}
