import { describe, test } from "@jest/globals";
import { ConnectorDefinition, runConnector } from "./run";
import { getPort } from "../testUtils";
import { ActionOutput, ConnectorInput } from "./types";

describe("runConnector", () => {
  test("run", async () => {
    async function testAction(input: ConnectorInput<{ test: string }>): Promise<ActionOutput> {
      return { payload: input.fields };
    }
    async function testAction2(input: ConnectorInput<{ test2: number }>): Promise<ActionOutput> {
      return { payload: input.fields };
    }
    const def: ConnectorDefinition = {
      actions: { testAction, testAction2 },
      triggers: {},
      options: { port: await getPort() },
    };
    const ret = runConnector(def);
    ret.server.close();
  });
});
