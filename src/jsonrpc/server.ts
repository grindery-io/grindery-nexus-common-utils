import "dotenv/config";
import bodyParser from "body-parser";
import express from "express";
import { Server } from "ws";
import { Response } from "../utils";
import { JSONRPCRequest, JSONRPCResponse, JSONRPCServer } from "json-rpc-2.0";
import { ServerParams } from "./types";
import { IJsonRpcConnection, MuxedChildConnection, SimpleJsonRpcConnection, WithConnectionId } from "./connection";

async function handleRequest(server: JSONRPCServer<ServerParams>, body, extra: ServerParams) {
  const result = await server.receive(body, extra);
  if (result) {
    if (result.error) {
      if ([-32600, -32601, -32602, -32700].includes(result.error.code)) {
        return new Response(400, result);
      }
      return new Response(500, result);
    }
    return result;
  } else {
    return new Response(204, "");
  }
}

export type RunJsonRpcServerOptions = {
  port?: number;
  mutateRoutes?: (app: ReturnType<typeof express>) => void;
  middlewares?: express.RequestHandler[];
};

export function runJsonRpcServer(
  jsonRpc: JSONRPCServer<ServerParams>,
  { port, mutateRoutes, middlewares = [bodyParser.json()] }: RunJsonRpcServerOptions = {}
) {
  port = port || parseInt(process.env.PORT || "", 10) || 3000;
  const app = express();
  for (const middleware of middlewares) {
    app.use(middleware);
  }

  app.post("/", (req, res) => {
    const body = req.body || {};
    handleRequest(jsonRpc, body, { connection: undefined, context: {}, req })
      .then((result) => {
        if (result instanceof Response) {
          result.sendResponse(res);
          return;
        }
        res.json(result).end();
      })
      .catch((e) => {
        console.error(e);
        res.status(500).send("Unexpected error");
      });
  });
  app.get("/", (_req, res) => res.type("text/plain").send("It works!"));
  if (mutateRoutes) {
    mutateRoutes(app);
  }

  console.log(`Listening on http://0.0.0.0:${port}`);
  const server = app.listen(port);

  const wss = new Server({ server });
  wss.on("connection", (ws) => {
    console.log("Client connected");
    const context = {};
    const parent = new SimpleJsonRpcConnection(ws);
    const children = new Map<string, IJsonRpcConnection>();
    const closedConnectionIds = new Set<string>();
    children.set("", new MuxedChildConnection(parent, ""));
    ws.on("message", async function message(data) {
      let parsed = {} as (JSONRPCRequest | JSONRPCResponse) & WithConnectionId;
      try {
        parsed = JSON.parse(data.toString("utf8"));
      } catch (e) {
        console.error("Invalid message", e);
        return ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
      }
      if (parsed?.jsonrpc !== "2.0") {
        return ws.send(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: null })
        );
      }
      const connectionId = parsed?.connectionId || "";

      let conn = children.get(connectionId);
      if ("method" in parsed && parsed.method === "_grinderyNexusCloseConnection") {
        if (!connectionId) {
          return ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32000, message: "Can't close default connection" },
              id: parsed?.id,
              connectionId,
            } as JSONRPCResponse & WithConnectionId)
          );
        }
        if (conn) {
          const params = parsed.params as { code?: number; reason?: string };
          conn.close(
            parseInt(params?.code?.toString() || "", 10) || 3000,
            params?.reason?.toString() || "Remote closed connection"
          );
          children.delete(connectionId);
          closedConnectionIds.add(connectionId);
        }
        if (!parsed?.id) {
          return;
        }
        return ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            result: true,
            id: parsed?.id,
            connectionId,
          } as JSONRPCResponse & WithConnectionId)
        );
      }
      if (!conn) {
        if ("method" in parsed) {
          if (closedConnectionIds.has(connectionId)) {
            console.warn(`[${connectionId}] Calling ${parsed?.method} on closed connection`, { parsed });
            if (!parsed.id) {
              return;
            }
            return ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Called method on a closed connection" },
                id: parsed?.id,
                connectionId,
              } as JSONRPCResponse & WithConnectionId)
            );
          } else {
            conn = new MuxedChildConnection(parent, connectionId);
            conn.once("close", () => {
              children.delete(connectionId);
              closedConnectionIds.add(connectionId);
            });
            children.set(connectionId, conn);
            console.log(`[${connectionId}] New child connection created from method ${parsed?.method}`);
          }
        } else {
          // Response
          if (!closedConnectionIds.has(connectionId)) {
            console.warn(`[${connectionId}] Received response from unknown connection`, { parsed });
          }
        }
      }
      delete parsed?.connectionId;
      let result: unknown = await handleRequest(jsonRpc, parsed, { connection: conn, context });
      if (result instanceof Response) {
        const responseData = result.getResponseData();
        if (typeof responseData === "object" && responseData?.jsonrpc === "2.0") {
          result = responseData;
        } else {
          return;
        }
      }
      (result as WithConnectionId).connectionId = connectionId;
      ws.send(JSON.stringify(result));
    });
    ws.on("close", (code, reason) =>
      console.log(`Client disconnected: ${code} - ${Buffer.isBuffer(reason) ? reason.toString("utf-8") : reason}`)
    );
  });
  return { app, server };
}
