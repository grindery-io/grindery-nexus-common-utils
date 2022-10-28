import "dotenv/config";
import bodyParser from "body-parser";
import express from "express";
import { Server } from "ws";
import { Response } from "./utils";
import { JSONRPCServer } from "json-rpc-2.0";
import { ServerParams } from "./jsonrpc";

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
    handleRequest(jsonRpc, body, { socket: undefined, context: {}, req })
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
    ws.on("message", async function message(data) {
      let parsed = {};
      try {
        parsed = JSON.parse(data.toString("utf8"));
      } catch (e) {
        console.error("Invalid message", e);
      }
      let result: unknown = await handleRequest(jsonRpc, parsed, { socket: ws, context });
      if (result instanceof Response) {
        const responseData = result.getResponseData();
        if (typeof responseData === "object" && responseData?.jsonrpc === "2.0") {
          result = responseData;
        } else {
          return;
        }
      }
      ws.send(JSON.stringify(result));
    });
    ws.on("close", (code, reason) =>
      console.log(`Client disconnected: ${code} - ${Buffer.isBuffer(reason) ? reason.toString("utf-8") : reason}`)
    );
  });
  return { app, server };
}
