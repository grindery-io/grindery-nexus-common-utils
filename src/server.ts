import "dotenv/config";
import bodyParser from "body-parser";
import express from "express";
import { Server } from "ws";
import { Response } from "./utils";
import { JSONRPCServer } from "json-rpc-2.0";

async function handleRequest(server, body, extra) {
  const result = await server.receive(body, extra);
  if (result) {
    if (result.error) {
      if ([-32600, -32601, -32602, -32700].includes(result.error.code)) {
        return new Response(400, result);
      }
      return new Response(400, result);
    }
    return result;
  } else {
    return new Response(204, "");
  }
}

export function runJsonRpcServer(
  jsonRpc: JSONRPCServer,
  { port, mutateRoutes }: { port?: number; mutateRoutes?: (app: ReturnType<typeof express>) => void } = {}
) {
  port = parseInt(process.env.PORT || "", 10) || 3000;
  const app = express();
  app.use(bodyParser.json());

  app.post("/", (req, res) => {
    const body = req.body || {};
    handleRequest(jsonRpc, body, { socket: null })
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
    ws.on("message", async function message(data) {
      let parsed = {};
      try {
        parsed = JSON.parse(data.toString("utf8"));
      } catch (e) {
        console.error("Invalid message", e);
      }
      let result = await handleRequest(jsonRpc, parsed, { socket: ws });
      if (result instanceof Response) {
        if (result.getResponseData()?.jsonrpc === "2.0") {
          result = result.getResponseData();
        } else {
          return;
        }
      }
      ws.send(JSON.stringify(result));
    });
    ws.on("close", () => console.log("Client disconnected"));
  });
  return app;
}
