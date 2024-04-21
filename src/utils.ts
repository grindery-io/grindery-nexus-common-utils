import express from "express";
import _ from "lodash";

export class Response<T> {
  _code: number;
  _resp: T;
  constructor(code: number, resp: T) {
    this._code = code;
    this._resp = resp;
  }
  getResponseData() {
    return this._resp;
  }
  sendResponse(res: express.Response) {
    if (this._code === 204) {
      return res.status(204).send();
    }
    return res.status(this._code).json(this._resp);
  }
}

const TOKEN_TRANSFORMERS = {
  urlencode: (s) => encodeURIComponent(String(s)),
  urldecode: (s) => decodeURIComponent(String(s)),
  json: (s) => JSON.stringify(s),
  "": (s) => String(s),
};

// > replaceTokens("abc{{ '{{' }} def }}abc")
// "abc{{ def }}abc"
export function replaceTokens<T>(obj: T, context: { [key: string]: unknown }): T {
  if (typeof obj === "string") {
    return obj.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_original, key) => {
      const parts = key.split("|");
      const m = /^(["'])(.*?)\1$/.exec(parts[0]);
      if (m) {
        return m[2];
      }
      const transform = TOKEN_TRANSFORMERS[parts[1] ? parts[1].trim() : ""] || TOKEN_TRANSFORMERS[""];
      const ret = transform((_.get(context, parts[0].trim(), "") as string) ?? "");
      return ret;
    }) as unknown as T;
  }
  if (typeof obj === "object") {
    if (Array.isArray(obj)) {
      return obj.map((item) => replaceTokens(item, context)) as unknown as T;
    }
    return Object.entries(obj).reduce((acc, [key, value]) => {
      acc[key] = replaceTokens(value, context);
      return acc;
    }, {} as T);
  }
  return obj;
}
// vim: sw=2:ts=2:expandtab:fdm=syntax
