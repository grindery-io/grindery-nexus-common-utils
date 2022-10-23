import { describe, expect, test } from "@jest/globals";
import { createHash } from "node:crypto";
import { getJwtTools } from "./jwtTools";

describe("jwtTools", () => {
  async function initJwtTools() {
    process.env.MASTER_KEY = createHash("sha512").update("test").digest("hex");
    return await getJwtTools("urn:grindery:test");
  }
  test("typedCipher", async () => {
    const jwtTools = await initJwtTools();
    const t = jwtTools.typedCipher<{ data: string }>("audience");
    const token = await t.encrypt({ sub: "x", data: "123" }, "60s");
    const decrypted = await t.decrypt(token, { subject: "x" });
    expect(decrypted.data).toBe("123");
    await expect(t.decrypt(token, { subject: "y" })).rejects.toThrow();
    await expect(jwtTools.typedCipher("otherAudience").decrypt(token, { subject: "x" })).rejects.toThrow();
  });
  test("typedToken", async () => {
    const jwtTools = await initJwtTools();
    const t = jwtTools.typedToken<{ data: string }>("audience");
    const token = await t.sign({ sub: "x", data: "123" }, "60s");
    const decrypted = await t.verify(token, { subject: "x" });
    expect(decrypted.data).toBe("123");
    await expect(t.verify(token, { subject: "y" })).rejects.toThrow();
    await expect(jwtTools.typedToken("otherAudience").verify(token, { subject: "x" })).rejects.toThrow();
  });
  test("hmac", async () => {
    const jwtTools = await initJwtTools();
    await jwtTools.hmac("TEST");
  });
});
