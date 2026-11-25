import type { DatabaseAdapter, StorageMode } from "@/lib/db/adapter";
import { MemoryJsonAdapter } from "@/lib/db/memory-json-adapter";
import { MongoAdapter } from "@/lib/db/mongo-adapter";

declare global {
  var __aliemsDbAdapter: DatabaseAdapter | undefined;
  var __aliemsDbAdapterKey: string | undefined;
}

export function getStorageMode(): StorageMode {
  return process.env.MONGODB_URI?.trim() ? "mongodb" : "fallback";
}

export async function getDb(): Promise<DatabaseAdapter> {
  const uri = process.env.MONGODB_URI?.trim() || "";
  const dbName = process.env.MONGODB_DB_NAME?.trim() || "aliems";
  const mode: StorageMode = uri ? "mongodb" : "fallback";
  const key = mode === "mongodb" ? `mongodb:${uri}:${dbName}` : "fallback";

  if (globalThis.__aliemsDbAdapter && globalThis.__aliemsDbAdapterKey === key) {
    await globalThis.__aliemsDbAdapter.ensureSeeded();
    return globalThis.__aliemsDbAdapter;
  }

  const adapter: DatabaseAdapter =
    mode === "mongodb"
      ? new MongoAdapter(uri, dbName)
      : new MemoryJsonAdapter();

  await adapter.ensureSeeded();
  globalThis.__aliemsDbAdapter = adapter;
  globalThis.__aliemsDbAdapterKey = key;
  return adapter;
}
