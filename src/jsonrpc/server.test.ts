import { describe, test, jest, beforeEach, expect } from "@jest/globals";
import { JSONRPCResponse } from "json-rpc-2.0";
import WebSocket from "ws";
import { createJsonRpcServer, IJsonRpcConnection, WithConnectionId } from ".";
import { runJsonRpcServer } from "./server";

describe("JsonRpcServer", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {
      /* Nothing */
    });
    jest.spyOn(console, "warn").mockImplementation(() => {
      /* Nothing */
    });
  });
  test("standard", async () => {
    const calls = [] as [unknown, unknown][];
    const jr = createJsonRpcServer();
    jr.addMethod("test", (params, { connection } = { context: {} }) => {
      calls.push([params, connection]);
      return params;
    });
    const { server } = runJsonRpcServer(jr, { port: 34568 });
    await new Promise((res) => setTimeout(res, 10));
    const socket = new WebSocket("ws://127.0.0.1:34568");

    const responses = [] as JSONRPCResponse[];
    socket.on("message", (data) => responses.push(JSON.parse(data.toString())));
    await new Promise((res) => setTimeout(res, 10));
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "test",
        params: true,
        id: Date.now(),
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(responses.length).toBe(1);
    expect(calls.length).toBe(1);
    expect(responses[responses.length - 1].result).toBe(calls[calls.length - 1][0]);
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "test",
        params: true,
        id: Date.now(),
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(responses.length).toBe(2);
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(responses[responses.length - 1].result).toBe(calls[calls.length - 1][0]);
    socket.close();
    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
  test("muxed", async () => {
    const calls = [] as [unknown, IJsonRpcConnection][];
    const jr = createJsonRpcServer();
    jr.addMethod("test", (params, { connection } = { context: {} }) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      calls.push([params, connection!]);
      return params;
    });
    const { server } = runJsonRpcServer(jr, { port: 34568 });
    await new Promise((res) => setTimeout(res, 10));
    const socket = new WebSocket("ws://127.0.0.1:34568");

    const responses = [] as (JSONRPCResponse & WithConnectionId)[];
    socket.on("message", (data) => responses.push(JSON.parse(data.toString())));
    await new Promise((res) => setTimeout(res, 10));
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "test",
        params: true,
        id: Date.now(),
        connectionId: "conn-1",
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(responses.length).toBe(1);
    expect(calls.length).toBe(1);
    expect(responses[responses.length - 1].result).toBe(calls[calls.length - 1][0]);
    expect(responses[responses.length - 1].connectionId).toBe("conn-1");
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "test",
        params: true,
        id: Date.now(),
        connectionId: "conn-2",
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(responses.length).toBe(2);
    expect(calls.length).toBe(2);
    expect(responses[responses.length - 1].result).toBe(calls[calls.length - 1][0]);
    expect(responses[responses.length - 1].connectionId).toBe("conn-2");
    expect(calls[0][1]).not.toBe(calls[1][1]);

    calls[0][1].close();
    await new Promise((res) => socket.once("message", res));
    expect(responses.length).toBe(3);
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "test",
        params: true,
        id: Date.now(),
        connectionId: "conn-1",
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(calls.length).toBe(2);
    expect(responses.length).toBe(4);
    expect(responses[responses.length - 1].error).toBeTruthy();
    expect(responses[responses.length - 1].connectionId).toBe("conn-1");

    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "test",
        params: true,
        id: Date.now(),
        connectionId: "conn-2",
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(calls.length).toBe(3);
    expect(responses.length).toBe(5);
    expect(responses[responses.length - 1].result).toBeTruthy();
    expect(responses[responses.length - 1].connectionId).toBe("conn-2");

    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "test",
        params: true,
        id: Date.now(),
        connectionId: "conn-3",
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(calls.length).toBe(4);
    expect(responses.length).toBe(6);
    expect(responses[responses.length - 1].result).toBeTruthy();
    expect(responses[responses.length - 1].connectionId).toBe("conn-3");

    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "_grinderyNexusCloseConnection",
        connectionId: "conn-2",
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(calls.length).toBe(4);
    expect(responses.length).toBe(7);

    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "test",
        params: true,
        id: Date.now(),
        connectionId: "conn-2",
      })
    );
    await new Promise((res) => socket.once("message", res));
    expect(calls.length).toBe(4);
    expect(responses.length).toBe(8);
    expect(responses[responses.length - 1].error).toBeTruthy();
    expect(responses[responses.length - 1].connectionId).toBe("conn-2");

    socket.close();
    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
});
