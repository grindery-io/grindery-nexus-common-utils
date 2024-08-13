import { describe, expect, test } from "@jest/globals";
import { JWTPayload } from "jose";
import { createHash } from "node:crypto";
import { getJwtTools, JwtTools } from "./jwtTools";

describe("jwtTools", () => {
  const ISSUER = "urn:grindery:test";
  function initJwtTools(issuer = ISSUER) {
    return new JwtTools(issuer, async () => createHash("sha512").update("test").digest());
  }
  test("getJwtTools", () => {
    const jwtTools = getJwtTools(ISSUER, async () => createHash("sha512").update("test").digest());
    expect(jwtTools["defaultIssuer"]).toBe(ISSUER);
    expect(jwtTools).toBe(getJwtTools(ISSUER, async () => createHash("sha512").update("test").digest()));
  });
  test("typedCipher", async () => {
    const jwtTools = initJwtTools();
    const t = jwtTools.typedCipher<{ data: string }>("audience");
    const token = await t.encrypt({ sub: "x", data: "123" }, "60s");
    const decrypted = await t.decrypt(token, { subject: "x" });
    expect(decrypted.data).toBe("123");
    await expect(t.decrypt(token, { subject: "y" })).rejects.toThrow();
    await expect(jwtTools.typedCipher("otherAudience").decrypt(token, { subject: "x" })).rejects.toThrow();
  });
  test("typedToken", async () => {
    const jwtTools = initJwtTools();
    const t = jwtTools.typedToken<{ data: string }>("audience");
    const token = await t.sign({ sub: "x", data: "123" }, "60s");
    const decrypted = await t.verify(token, { subject: "x" });
    expect(decrypted.data).toBe("123");
    await expect(t.verify(token, { subject: "y" })).rejects.toThrow();
    await expect(jwtTools.typedToken("otherAudience").verify(token, { subject: "x" })).rejects.toThrow();
  });
  test("authToken", async () => {
    const jwtTools = initJwtTools();
    const jwtTools2 = initJwtTools(ISSUER + "alt");
    const t = jwtTools.authToken<JWTPayload>();
    const t2 = jwtTools2.authToken<JWTPayload>({ [ISSUER]: { keys: [await jwtTools.getPublicJwk()] } });
    const token = await t.sign(jwtTools2["defaultIssuer"]);
    const decrypted = await t2.verify(token);
    expect(decrypted.iss).toBe(ISSUER);
    await expect(t2.verify(await t.sign("INVALID"))).rejects.toThrow();
    await expect(t2.verify(await t.sign(ISSUER))).rejects.toThrow();
  });
  test("hmac", async () => {
    const jwtTools = initJwtTools();
    await jwtTools.hmac("TEST");
  });
});
