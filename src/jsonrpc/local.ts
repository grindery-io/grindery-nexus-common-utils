import { JSONRPCRequest, JSONRPCServer } from "json-rpc-2.0";

export async function cliMain(server: JSONRPCServer<unknown>) {
  const [, , method, payloadRaw] = process.argv;
  let payload: JSONRPCRequest | null = null;
  try {
    if (payloadRaw) {
      payload = JSON.parse(payloadRaw);
    }
  } catch (e) {
    console.error("Invalid payload:", e);
  }
  if (!process.env.RAW_PAYLOAD) {
    payload = {
      jsonrpc: "2.0",
      id: "1",
      method,
      params: payload,
    } as JSONRPCRequest;
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const result = await server.receive(payload!);
  return result;
}
