import { describe, test, jest, beforeEach, expect } from "@jest/globals";
import { JSONRPCRequest } from "json-rpc-2.0";
import { createJsonRpcServer } from "..";
import { runJsonRpcServer } from "../server";
import { MuxableJsonRpcWebSocket } from "./muxable/parent";

describe("Muxable JSON-RPC client", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {
      /* Nothing */
    });
    jest.spyOn(console, "warn").mockImplementation(() => {
      /* Nothing */
    });
  });
  test("muxing not supported", async () => {
    const jr = createJsonRpcServer();
    jr.addMethod("test", () => true);
    const { server } = runJsonRpcServer(jr, { port: 34569, disableMuxing: true });
    await new Promise((res) => setTimeout(res, 100));
    const socket = new MuxableJsonRpcWebSocket("ws://127.0.0.1:34569", 2000);
    await expect(socket.createConnection()).resolves.toBe(null);
    const defaultConnection = socket.getDefaultConnection();
    await defaultConnection.request("test");
    const closeHandler = jest.fn();
    defaultConnection.on("close", closeHandler);
    socket.close();
    await new Promise((res) => socket.once("close", res));
    expect(closeHandler).toBeCalled();
    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
  test("muxing not supported (close test)", async () => {
    const jr = createJsonRpcServer();
    jr.addMethod("test", () => true);
    const { server } = runJsonRpcServer(jr, { port: 34569, disableMuxing: true });
    await new Promise((res) => setTimeout(res, 100));
    const socket = new MuxableJsonRpcWebSocket("ws://127.0.0.1:34569", 2000);
    await expect(socket.createConnection()).resolves.toBe(null);
    const defaultConnection = socket.getDefaultConnection();
    await defaultConnection.request("test");
    const closeHandler = jest.fn();
    socket.on("close", closeHandler);
    defaultConnection.close();
    await new Promise((res) => setTimeout(res, 100));
    expect(closeHandler).toBeCalled();
    expect(socket.isOpen).toBe(false);
    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
  test("muxed", async () => {
    const jr = createJsonRpcServer();
    const method = jest.fn((params, { connection }) =>
      connection.send({ jsonrpc: "2.0", method: "notify", params } as JSONRPCRequest)
    );
    jr.addMethod("test", method);
    const { server } = runJsonRpcServer(jr, { port: 34569 });
    await new Promise((res) => setTimeout(res, 100));
    const socket = new MuxableJsonRpcWebSocket("ws://127.0.0.1:34569", 2000);
    const [[conn1, notifyFn1, closeHandler1], [conn2, notifyFn2, closeHandler2], [conn3, notifyFn3, closeHandler3]] =
      await Promise.all(
        [1, 2, 3].map(async () => {
          const conn = await socket.createConnection();
          expect(conn).toBeTruthy();
          const notifyFn = jest.fn(async () => undefined);
          conn?.addMethod("notify", notifyFn);
          const closeHandler = jest.fn();
          conn?.on("close", closeHandler);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return [conn!, notifyFn, closeHandler];
        })
      );
    await conn1.request("test", { x: 1 });
    expect(method).lastCalledWith({ x: 1 }, expect.anything());
    await conn2.request("test", { x: 2 });
    expect(method).lastCalledWith({ x: 2 }, expect.anything());
    await conn3.request("test", { x: 3 });
    expect(method).lastCalledWith({ x: 3 }, expect.anything());

    expect(notifyFn1).toBeCalledWith({ x: 1 }, undefined);
    expect(notifyFn2).toBeCalledWith({ x: 2 }, undefined);
    expect(notifyFn3).toBeCalledWith({ x: 3 }, undefined);

    conn2.close();
    await conn1.request("test", { x: 1 });
    await conn3.request("test", { x: 3 });

    expect(closeHandler2).toBeCalledTimes(1);
    expect(conn2.isOpen).toBe(false);
    await expect(conn2.request("test", { x: 2 })).rejects.toThrow();

    socket.close();
    await new Promise((res) => socket.once("close", res));

    expect(conn1.isOpen).toBe(false);
    expect(conn3.isOpen).toBe(false);

    expect(closeHandler1).toBeCalledTimes(1);
    expect(closeHandler2).toBeCalledTimes(1);
    expect(closeHandler3).toBeCalledTimes(1);

    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
  test("muxed (timeout)", async () => {
    const jr = createJsonRpcServer();
    jr.addMethod("test", async () => undefined);
    jr.addMethod("timeout", () => new Promise((res) => setTimeout(res, 200)));
    const { server } = runJsonRpcServer(jr, { port: 34569 });
    await new Promise((res) => setTimeout(res, 100));
    const socket = new MuxableJsonRpcWebSocket("ws://127.0.0.1:34569", 100);
    const [[conn1, closeHandler1], [conn2, closeHandler2], [conn3, closeHandler3]] = await Promise.all(
      [1, 2, 3].map(async () => {
        const conn = await socket.createConnection();
        expect(conn).toBeTruthy();
        const closeHandler = jest.fn();
        conn?.on("close", closeHandler);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return [conn!, closeHandler];
      })
    );
    await conn1.request("test", { x: 1 });
    await conn2.request("test", { x: 2 });
    await conn3.request("test", { x: 3 });

    await expect(conn2.request("timeout", {})).rejects.toThrow();
    await conn1.request("test", { x: 1 });
    await conn3.request("test", { x: 3 });
    await conn2.request("test", { x: 2 });

    expect(conn1.isOpen).toBe(true);
    expect(conn2.isOpen).toBe(true);
    expect(conn3.isOpen).toBe(true);

    socket.close();
    await new Promise((res) => socket.once("close", res));

    expect(conn1.isOpen).toBe(false);
    expect(conn2.isOpen).toBe(false);
    expect(conn3.isOpen).toBe(false);

    expect(closeHandler1).toBeCalledTimes(1);
    expect(closeHandler2).toBeCalledTimes(1);
    expect(closeHandler3).toBeCalledTimes(1);

    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
});
