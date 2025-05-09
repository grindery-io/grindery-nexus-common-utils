/* eslint-disable no-use-before-define */
import { createHash, createPrivateKey, createPublicKey, KeyObject, webcrypto, createHmac } from "node:crypto";
import KeyEncoder from "@tradle/key-encoder";
import * as jose from "jose";

const defaultGetMasterKey = async function () {
  const masterKey = Buffer.from(process.env.MASTER_KEY || "ERASED");
  process.env["MASTER_KEY"] = "ERASED";
  return masterKey;
};

const initKeys = async (getMasterKey = defaultGetMasterKey) => {
  const masterKey = await getMasterKey();
  if (masterKey.length < 64) {
    throw new Error("Master key must be at least 64 characters");
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
  const HMAC = KeyObject.from(
    await webcrypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        iterations: 10,
        salt: createHash("sha512").update("Grindery HMAC Key").digest().subarray(0, 16),
        hash: "SHA-512",
      },
      rawKey,
      {
        name: "HMAC",
        hash: "SHA-512",
        length: 512,
      },
      false,
      ["sign"]
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
  return { AES, HMAC, ECDSA_PRIVATE, ECDSA_PUBLIC };
};

type RemoveIndex<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};
type JWTPayloadPure = RemoveIndex<jose.JWTPayload>;

export type TypedJWTPayload<T> = JWTPayloadPure & T;

export class TypedCipher<T> {
  constructor(
    private readonly jwtTools: JwtTools,
    private readonly audience: string
  ) {}

  encrypt = async (payload: TypedJWTPayload<T>, expirationTime: number | string): Promise<string> =>
    await this.jwtTools.encryptJWT({ aud: this.audience, ...payload }, expirationTime);
  decrypt = async (token: string, options: jose.JWTDecryptOptions = {}): Promise<TypedJWTPayload<T>> =>
    (await this.jwtTools.decryptJWT(token, { audience: this.audience, ...options })).payload as TypedJWTPayload<T>;
}

export class TypedToken<T> {
  constructor(
    private readonly jwtTools: JwtTools,
    private readonly audience: string
  ) {}
  sign = async (payload: TypedJWTPayload<T>, expirationTime: number | string): Promise<string> =>
    await this.jwtTools.signJWT({ aud: this.audience, ...payload }, expirationTime);
  verify = async (token: string, options: jose.JWTVerifyOptions = {}): Promise<TypedJWTPayload<T>> =>
    (await this.jwtTools.verifyJWT(token, { audience: this.audience, ...options })).payload as TypedJWTPayload<T>;
}

export class TypedExternalToken<T> {
  private keySet: ReturnType<typeof jose.createLocalJWKSet> | null = null;
  constructor(
    private readonly audience: string,
    private readonly issuer: string,
    private readonly keySetGetter: () => ReturnType<typeof jose.createLocalJWKSet>
  ) {}
  verify = async (token: string, options: jose.JWTVerifyOptions = {}): Promise<TypedJWTPayload<T>> => {
    const claims = jose.decodeJwt(token);
    if (claims.iss !== this.issuer) {
      throw new Error("Invalid issuer");
    }
    if (!this.keySet) {
      this.keySet = this.keySetGetter();
    }
    return (
      await jose.jwtVerify(token, this.keySet, {
        audience: this.audience,
        issuer: this.issuer,
        algorithms: ["ES256"],
        ...options,
      })
    ).payload as TypedJWTPayload<T>;
  };
}

export class AuthToken<T> {
  private readonly issuerKeys: Record<string, ReturnType<typeof jose.createLocalJWKSet>>;
  constructor(
    private readonly jwtTools: JwtTools,
    whitelistedIssuers: Record<string, string | jose.JSONWebKeySet>
  ) {
    this.issuerKeys = Object.fromEntries(
      Object.entries(whitelistedIssuers).map(([k, v]) => [k, createKeySetAdaptive(v)])
    );
  }
  sign = async (targetApp: string, payload?: TypedJWTPayload<T> | undefined): Promise<string> =>
    await this.jwtTools.signJWT({ aud: `${targetApp}:meta:auth-token:v1`, ...(payload || {}) }, "10s");
  verify = async (token: string, options: jose.JWTVerifyOptions = {}): Promise<TypedJWTPayload<T>> => {
    const claims = jose.decodeJwt(token);
    if (!claims.iss || !(claims.iss in this.issuerKeys)) {
      throw new Error("Unknown issuer");
    }
    return (
      await jose.jwtVerify(token, this.issuerKeys[claims.iss], {
        audience: `${this.jwtTools.defaultIssuer}:meta:auth-token:v1`,
        issuer: claims.iss,
        clockTolerance: "15s",
        maxTokenAge: "30s",
        algorithms: ["ES256"],
        ...options,
      })
    ).payload as TypedJWTPayload<T>;
  };
}

export class JwtTools {
  private readonly keys: ReturnType<typeof initKeys>;
  constructor(
    public defaultIssuer: string,
    getMasterKey = defaultGetMasterKey
  ) {
    this.keys = initKeys(getMasterKey);
  }
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
  hmac = async (data: string | Buffer) =>
    createHmac("SHA512", (await this.keys).HMAC)
      .update(data)
      .digest();
  getPublicJwk = async () => jose.exportJWK((await this.keys).ECDSA_PUBLIC);

  typedCipher = <T = unknown>(audience: string) => new TypedCipher<T>(this, audience);

  typedToken = <T = unknown>(audience: string) => new TypedToken<T>(this, audience);

  authToken = <T extends Record<string, unknown> = Record<string, never>>(
    whitelistedIssuers: Record<string, string | jose.JSONWebKeySet> = getWhitelistedIssuersFromEnv()
  ) => new AuthToken<T>(this, whitelistedIssuers);

  externalTypedToken = <T = unknown>(audience: string, issuer: string, keySet: string | jose.JSONWebKeySet = "") =>
    new TypedExternalToken<T>(audience, issuer, () => createKeySetAdaptive(keySet || getIssuerKeyFromEnv(issuer)));
}

let instance: JwtTools;

function createKeySetAdaptive(
  v: string | jose.JSONWebKeySet
): (protectedHeader?: jose.JWSHeaderParameters, token?: jose.FlattenedJWSInput) => Promise<jose.KeyLike> {
  return typeof v === "string"
    ? jose.createRemoteJWKSet(new URL(v), {
        timeoutDuration: 5000,
        cooldownDuration: 1000,
        cacheMaxAge: 1000 * 60 * 60 * 24,
      })
    : jose.createLocalJWKSet(v);
}

export function getJwtTools(defaultIssuer: string, getMasterKey = defaultGetMasterKey) {
  if (!instance) {
    instance = new JwtTools(defaultIssuer, getMasterKey);
  }
  return instance;
}

const DEFAULT_AUTH_ISSUERS_ENV = "AUTH_ISSUERS";
export function getWhitelistedIssuersFromEnv(
  envName = DEFAULT_AUTH_ISSUERS_ENV
): Record<string, string | jose.JSONWebKeySet> {
  return Object.fromEntries(
    (process.env[envName] ?? "")
      .split(";")
      .filter(Boolean)
      .map((s) => s.trim().split(","))
      .map(([k, v]) => [k, v.toLowerCase().startsWith("http") ? v : JSON.parse(Buffer.from(v, "base64").toString())])
  );
}

export function getIssuerKeyFromEnv(issuer: string, envName = DEFAULT_AUTH_ISSUERS_ENV): string | jose.JSONWebKeySet {
  const ret = getWhitelistedIssuersFromEnv(envName)[issuer];
  if (!ret) {
    throw new Error(`Issuer ${issuer} not found in ${envName}`);
  }
  return ret;
}
