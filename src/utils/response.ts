import type express from "express";

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
