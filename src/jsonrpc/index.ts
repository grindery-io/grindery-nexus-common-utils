import {
  createJSONRPCErrorResponse,
  JSONRPCErrorCode,
  JSONRPCErrorException,
  JSONRPCParams,
  JSONRPCServer,
  SimpleJSONRPCMethod,
} from "json-rpc-2.0";
import * as Sentry from "@sentry/node";
import { ServerParams } from "./types";

export * from "./connection";
export * from "./client";
export * from "./typedClient";
export * from "./types";

export class InvalidParamsError extends Error {
  constructor(message?: string) {
    super(message || "Invalid parameters");
  }
}
const exceptionMiddleware = async (next, request, serverParams) => {
  try {
    return await next(request, serverParams);
  } catch (error) {
    if (error instanceof InvalidParamsError) {
      return createJSONRPCErrorResponse(request.id, JSONRPCErrorCode.InvalidParams, error.message);
    } else if (error instanceof JSONRPCErrorException) {
      return createJSONRPCErrorResponse(request.id, error.code, error.message, error.data);
    } else if (error.isAxiosError) {
      return createJSONRPCErrorResponse(request.id, error.response?.status, error.message, {
        headers: error.response?.headers,
        data: error.response?.data,
      });
    } else {
      Sentry.captureException(error);
      await Sentry.flush(2000);
      throw error;
    }
  }
};
export function forceObject<T extends { [key: string]: unknown }, TContext extends Record<string, unknown>>(
  func: (params: T, extra: ServerParams<TContext>) => Promise<unknown>
): SimpleJSONRPCMethod<ServerParams<TContext>> {
  return async function (params: Partial<JSONRPCParams> | undefined, extra) {
    if (typeof params !== "object" || Array.isArray(params)) {
      throw new InvalidParamsError("Only parameter object are supported");
    }
    return await func(params as T, extra || { context: {} });
  };
}
export function createJsonRpcServer<TContext extends Record<string, unknown>>() {
  const server = new JSONRPCServer<ServerParams<TContext>>();
  server.applyMiddleware(exceptionMiddleware);
  server.addMethod("ping", () => "pong");
  return server;
}
