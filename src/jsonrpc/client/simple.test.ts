import { describe, test, jest, beforeEach } from "@jest/globals";
import { createJsonRpcServer } from "..";
import { runJsonRpcServer } from "../server";
import { JsonRpcWebSocket } from ".";
import { getPort } from "../../testUtils";

describe("JsonRpcWebSocket", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {
      /* Nothing */
    });
  });
  test("ping", async () => {
    const jr = createJsonRpcServer();
    jr.addMethod("test", () => true);
    const port = await getPort();
    const { server } = runJsonRpcServer(jr, { port });
    await new Promise((res) => setTimeout(res, 100));
    const socket = new JsonRpcWebSocket(`ws://127.0.0.1:${port}`, 2000);
    for (let i = 0; i < 10; i++) {
      await socket.request("test");
      await new Promise((res) => setTimeout(res, 10));
    }
    socket.close();
    server.close();
    server.unref();
    await new Promise((res) => setTimeout(res, 100));
  });
});
