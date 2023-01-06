import axios from "axios";
import { ConnectorSchema } from "../types";

const DEFAULT_SCHEMAS: { [key: string]: ConnectorSchema | Promise<ConnectorSchema> } = {};

function verifyConnectorId(connectorId: string) {
  if (typeof connectorId !== "string" || !/^[a-zA-Z0-9-_]+$/.test(connectorId)) {
    throw new Error("Invalid connector ID");
  }
}

class SchemaCache {
  private schemas: { [key: string]: ConnectorSchema | Promise<ConnectorSchema> } = { ...DEFAULT_SCHEMAS };
  private currentCommit = "";
  private lastCommitCheck = 0;
  private urlPrefix: string;

  constructor(private environment = "production") {
    this.urlPrefix =
      process.env["CONNECTOR_SCHEMA_URL" + (environment === "production" ? "" : "_" + environment.toUpperCase())] || "";
    if (!this.urlPrefix) {
      throw new Error("No schema URL for environment: " + environment);
    }
    this.validateSchemaCache();
  }
  async validateSchemaCache() {
    if (Date.now() - this.lastCommitCheck < 60000) {
      return;
    }
    this.lastCommitCheck = Date.now();
    const commit = await axios
      .get(`${this.urlPrefix}/COMMIT`, { responseType: "text" })
      .then((response) => (response.data as string).trim())
      .catch((e) => console.error(e));
    if (!commit) {
      console.warn(`[${this.environment}] Connector schema commit not available`);
      return;
    }
    if (!this.currentCommit) {
      this.currentCommit = commit;
      console.log(`[${this.environment}] Connector schema commit: ${commit}`);
      return;
    }
    if (this.currentCommit !== commit) {
      this.currentCommit = commit;
      this.schemas = { ...DEFAULT_SCHEMAS };
      console.log(`[${this.environment}] Connector schema commit updated: ${commit}`);
    }
  }
  async getConnectorSchema(connectorId: string): Promise<ConnectorSchema> {
    verifyConnectorId(connectorId);
    this.validateSchemaCache();
    if (connectorId in this.schemas) {
      return this.schemas[connectorId];
    }
    const ret = axios.get(`${this.urlPrefix}/${connectorId}.json`).then((response) => response.data);
    this.schemas[connectorId] = ret;
    ret
      .then((schema) => (this.schemas[connectorId] = schema))
      .catch((e) => {
        console.error(`[${this.environment}] Error getting connector schema`, connectorId, e);
        setTimeout(() => {
          if (this.schemas[connectorId] === ret) {
            delete this.schemas[connectorId];
          }
        }, 1000 * 60);
      });
    return ret;
  }
}

const getSchemaCache = (function () {
  const cache = new Map<string, SchemaCache>();
  return (env: string) => {
    if (!cache.has(env)) {
      cache.set(env, new SchemaCache(env));
    }
    return cache.get(env) as SchemaCache;
  };
})();

export async function getConnectorSchema(
  connectorId: string,
  envirnment: "production" | "staging" | string
): Promise<ConnectorSchema> {
  return await getSchemaCache(envirnment).getConnectorSchema(connectorId);
}
