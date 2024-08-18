import axios, { AxiosError, AxiosRequestHeaders } from "axios";
import {
  JSONRPCErrorException,
  type JSONRPCRequest,
  type JSONRPCErrorResponse,
  type JSONRPCResponse,
  JSONRPCParams,
} from "json-rpc-2.0";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTypedJsonRpcClient<T extends { [name: string]: (params: any, ...args: any[]) => Promise<any> }>(
  url: string,
  issuer: string,
  getHeaders = async <Method extends keyof T>(_name: keyof T, ..._params: Parameters<T[Method]>) =>
    ({}) as AxiosRequestHeaders
): Readonly<{ [K in keyof T]: T[K] }> {
  const methodCache = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy({} as any, {
    get(target, name) {
      if (typeof name !== "string" || target[name]) {
        return target[name];
      }
      if (!methodCache.has(name)) {
        methodCache.set(name, async (...args) => {
          try {
            const resp = await axios.post<JSONRPCResponse>(
              url,
              {
                jsonrpc: "2.0",
                id: "1",
                method: name,
                params: args[0] as JSONRPCParams,
              } satisfies JSONRPCRequest,
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                headers: await getHeaders(name, ...(args as any)),
              }
            );
            return resp.data?.result;
          } catch (_e) {
            const e = _e as AxiosError;
            if (!e.isAxiosError) {
              throw e;
            }
            const data = e.response?.data as JSONRPCErrorResponse;
            if (data?.error) {
              const error = new JSONRPCErrorException(data.error.message, data.error.code, data.error.data);
              Object.assign(error, { statusCode: e.response?.status });
              throw error;
            }
            throw e;
          }
        });
      }
      return methodCache.get(name);
    },
  });
}
