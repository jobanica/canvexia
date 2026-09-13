/**
 * Tiny IndexedDB wrapper for offline mode (Phase 0). No dependencies. Two
 * stores: `kv` (cached JSON snapshots, e.g. the last kitchen orders) and
 * `outbox` (queued mutations replayed on reconnect). All calls are safe to run
 * in the browser only; on the server / unsupported envs they no-op.
 */
const DB_NAME = "servd-offline";
const DB_VERSION = 1;

export interface OutboxOp {
  opId: string;
  type: "advance"; // Phase 0: kitchen status advance only
  orderId: string;
  toStatus: "preparing" | "done";
  createdAt: number;
}

function hasIDB(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "opId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!hasIDB()) return null;
  try {
    return (await run<T | undefined>("kv", "readonly", (s) => s.get(key))) ?? null;
  } catch {
    return null;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (!hasIDB()) return;
  try {
    await run("kv", "readwrite", (s) => s.put(value as unknown as IDBValidKey, key));
  } catch {
    /* ignore */
  }
}

export async function outboxAdd(op: OutboxOp): Promise<void> {
  if (!hasIDB()) return;
  try {
    await run("outbox", "readwrite", (s) => s.put(op));
  } catch {
    /* ignore */
  }
}

export async function outboxAll(): Promise<OutboxOp[]> {
  if (!hasIDB()) return [];
  try {
    const all = await run<OutboxOp[]>("outbox", "readonly", (s) => s.getAll());
    return (all ?? []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function outboxRemove(opId: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    await run("outbox", "readwrite", (s) => s.delete(opId));
  } catch {
    /* ignore */
  }
}
