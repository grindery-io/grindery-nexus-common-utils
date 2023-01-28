import { describe, test, jest, beforeEach, expect } from "@jest/globals";
import { createJsonRpcServer } from "..";
import { runJsonRpcServer } from "../server";
import { getAdaptiveConnection } from "./adaptive";

describe("Adaptive JSON-RPC client", () => {
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
    const { server } = runJsonRpcServer(jr, { port: 34571, disableMuxing: true });
    await new Promise((res) => setTimeout(res, 100));
    const socket = await getAdaptiveConnection("ws://127.0.0.1:34571", 2000);
    await socket.request("test");
    const socket2 = await getAdaptiveConnection("ws://127.0.0.1:34571", 2000);
    await socket2.request("test");
    const socket3 = await getAdaptiveConnection("ws://127.0.0.1:34571", 2000);
    await socket3.request("test");
    const closeHandler = jest.fn();
    socket.on("close", closeHandler);
    socket.close();
    await new Promise((res) => socket.once("close", res));
    expect(closeHandler).toBeCalled();
    socket2.close();
    socket3.close();

    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
  test("muxing supported", async () => {
    const jr = createJsonRpcServer();
    jr.addMethod("test", () => true);
    const { server } = runJsonRpcServer(jr, { port: 34572 });
    await new Promise((res) => setTimeout(res, 100));
    const [socket, socket2, socket3] = await Promise.all(
      [1, 2, 3].map(() => getAdaptiveConnection("ws://127.0.0.1:34572", 2000))
    );
    await socket.request("test");
    await socket2.request("test");
    await socket3.request("test");
    const closeHandler = jest.fn();
    socket.on("close", closeHandler);
    socket.close();
    await new Promise((res) => setTimeout(res, 100));
    expect(closeHandler).toBeCalled();
    await socket2.request("test");
    await socket3.request("test");
    socket2.close();
    socket3.close();

    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
  test("muxing supported with reconnection", async () => {
    const jr = createJsonRpcServer();
    jr.addMethod("test", () => true);
    const { server } = runJsonRpcServer(jr, { port: 34573 });
    await new Promise((res) => setTimeout(res, 100));
    let [socket, socket2] = await Promise.all([1, 2].map(() => getAdaptiveConnection("ws://127.0.0.1:34573", 2000)));
    await socket.request("test");
    await socket2.request("test");
    socket.close();
    socket2.close();

    await new Promise((res) => setTimeout(res, 100));

    [socket, socket2] = await Promise.all([1, 2].map(() => getAdaptiveConnection("ws://127.0.0.1:34573", 2000)));
    await socket.request("test");
    await socket2.request("test");
    socket.close();
    socket2.close();

    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
});
