import { DuckdbClient } from "./DuckdbClient.js";
import { SqliteClient } from "./SqliteClient.js";
import { MemoryResultStore } from "./MemoryResultStore.js";
import { NodeResultRegistry } from "./NodeResultRegistry.js";

export async function initResultInfra() {
  const { duckdbPort, sqlitePort } = await window.api.dataClean.getDbPorts();

  const duckdbClient = new DuckdbClient(duckdbPort);
  const sqliteClient = new SqliteClient(sqlitePort);
  const memoryStore = new MemoryResultStore();

  const nodeResultRegistry = new NodeResultRegistry({
    memoryStore,
    sqliteClient,
    duckdbClient,
  });

  return { duckdbClient, sqliteClient, memoryStore, nodeResultRegistry };
}
