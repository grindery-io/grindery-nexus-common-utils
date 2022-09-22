import { createHash, createPrivateKey, createPublicKey, KeyObject, webcrypto } from "node:crypto";
import KeyEncoder from "@tradle/key-encoder";
import * as jose from "jose";

const initKeys = async () => {
  const masterKey = Buffer.from(process.env.MASTER_KEY || "ERASED");
  process.env["MASTER_KEY"] = "ERASED";
  if (masterKey.length < 64) {
    throw new Error("Invalid master key in environment variable");
  }
  const rawKeySource = createHash("sha512").update(masterKey).digest();
  masterKey.fill(0);

  const rawKey = await webcrypto.subtle.importKey("raw", rawKeySource, "PBKDF2", false, ["deriveBits", "deriveKey"]);
  rawKeySource.fill(0);

  const AES = KeyObject.from(
    await webcrypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        iterations: 10,
        salt: createHash("sha512").update("Grindery AES Key").digest().subarray(0, 16),
        hash: "SHA-512",
      },
      rawKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      false,
      ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    )
  );
  const keyEncoder = new KeyEncoder("p256");
  const pemKey = keyEncoder.encodePrivate(
    Buffer.from(
      await webcrypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          iterations: 10,
          salt: createHash("sha512").update("Grindery ECDSA Key").digest().subarray(0, 16),
          hash: "SHA-512",
        },
        rawKey,
        256
      )
    ),
    "raw",
    "pem",
    "pkcs8"
  );
  const ECDSA_PRIVATE = createPrivateKey({ key: pemKey, format: "pem" });
  const ECDSA_PUBLIC = createPublicKey(ECDSA_PRIVATE);
  return { AES, ECDSA_PRIVATE, ECDSA_PUBLIC };
};

type RemoveIndex<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};
type JWTPayloadPure = RemoveIndex<jose.JWTPayload>;

class JwtTools {
  private keys = initKeys();
  constructor(private defaultIssuer: string) {}
  encryptJWT = async (payload: jose.JWTPayload, expirationTime: number | string) =>
    await new jose.EncryptJWT(payload)
      .setProtectedHeader({
        alg: "dir",
        enc: "A256GCM",
      })
      .setIssuedAt()
      .setIssuer(this.defaultIssuer)
      .setExpirationTime(expirationTime)
      .encrypt((await this.keys).AES);
  signJWT = async (payload: jose.JWTPayload, expirationTime: number | string) =>
    await new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: "ES256",
      })
      .setIssuedAt()
      .setIssuer(this.defaultIssuer)
      .setExpirationTime(expirationTime)
      .sign((await this.keys).ECDSA_PRIVATE);
  decryptJWT = async (token: string, options: jose.JWTDecryptOptions) =>
    await jose.jwtDecrypt(token, (await this.keys).AES, {
      issuer: this.defaultIssuer,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
      ...options,
    });
  verifyJWT = async (token: string, options: jose.JWTVerifyOptions) =>
    await jose.jwtVerify(token, (await this.keys).ECDSA_PUBLIC, {
      issuer: this.defaultIssuer,
      algorithms: ["ES256"],
      ...options,
    });
  getPublicJwk = async () => jose.exportJWK((await this.keys).ECDSA_PUBLIC);
  typedCipher = <T = unknown>(audience: string) =>
    Object.freeze({
      encrypt: (payload: T & JWTPayloadPure, expirationTime: number | string) =>
        this.encryptJWT({ aud: audience, ...payload }, expirationTime),
      decrypt: async (token: string, options: jose.JWTDecryptOptions = {}) =>
        (await this.decryptJWT(token, { audience, ...options })).payload as T & JWTPayloadPure,
    });
  typedToken = <T = unknown>(audience: string) =>
    Object.freeze({
      sign: (payload: T & JWTPayloadPure, expirationTime: number | string) =>
        this.signJWT({ aud: audience, ...payload }, expirationTime),
      verify: async (token: string, options: jose.JWTVerifyOptions = {}) =>
        (await this.verifyJWT(token, { audience, ...options })).payload as T & JWTPayloadPure,
    });
}

let instance: JwtTools;

export function getJwtTools(defaultIssuer: string) {
  if (!instance) {
    instance = new JwtTools(defaultIssuer);
  }
  return instance;
}
