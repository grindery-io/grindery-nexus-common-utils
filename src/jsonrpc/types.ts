import { Request } from "express";
import { IJsonRpcConnection } from "./connection";

export type ServerParams<TContext extends Record<string, unknown> = Record<string, unknown>> = {
  req?: Request;
  connection?: IJsonRpcConnection;
  context: Partial<TContext>;
};
