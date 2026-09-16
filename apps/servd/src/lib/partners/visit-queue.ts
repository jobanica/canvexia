/**
 * The offline queue for check-ins and visits.
 *
 * WHY THIS EXISTS AT ALL: the people using this are standing in a market street
 * with one bar of signal. A form that fails on submit means the visit is not
 * recorded, and a visit that is not recorded did not happen as far as a target,
 * a scorecard or a commission is concerned. So the phone accepts it, keeps it,
 * and sends it when it can.
 *
 * Its own IndexedDB store rather than `lib/offline/idb.ts`'s `outbox`: that one
 * is typed to the kitchen's status advances and is drained by the kitchen board.
 * Two producers on one store is how a queue starts dropping other people's
 * items.
 *
 * IDEMPOTENCY IS THE SERVER'S JOB, not this file's. Every queued item carries a
 * `clientRef` minted here, `attendance_sessions.clientRef` and
 * `staff_visits.clientRef` are unique, and a replay is a no-op. This is what
 * lets the drain be dumb: send, and on any answer that is not a network failure,
 * drop it.
 */
const DB_NAME = "canvexia-field";
const DB_VERSION = 1;
const STORE = "queue";

export type QueuedKind = "check_in" | "check_out" | "visit";

export interface QueuedItem {
  /** Also the server's idempotency key. Minted before the item is ever sent. */
  clientRef: string;
  kind: QueuedKind;
  /** The form fields, already flattened. Includes the shrunk photo — see below. */
  fields: Record<string, string>;
  createdAt: number;
  attempts: number;
}

function hasIDB(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientRef" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export function newClientRef(): string {
  // crypto.randomUUID is unavailable on http:// origins in some Android
  // browsers, and this file runs on a phone. The fallback is not
  // cryptographically interesting — it only has to be unique.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueue(item: Omit<QueuedItem, "createdAt" | "attempts">): Promise<void> {
  if (!hasIDB()) return;

  // The backstop described above: a photo that is somehow still huge costs the
  // picture, never the visit.
  const fields = { ...item.fields };
  if ((fields.photo?.length ?? 0) > QUEUE_PHOTO_LIMIT) {
    delete fields.photo;
  }

  try {
    await run("readwrite", (s) =>
      s.put({ ...item, fields, createdAt: Date.now(), attempts: 0 }),
    );
  } catch {
    /* a phone with storage disabled falls back to "it failed", which is honest */
  }
}

export async function queued(): Promise<QueuedItem[]> {
  if (!hasIDB()) return [];
  try {
    const all = await run<QueuedItem[]>("readonly", (s) => s.getAll());
    return (all ?? []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function drop(clientRef: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    await run("readwrite", (s) => s.delete(clientRef));
  } catch {
    /* ignore */
  }
}

async function bumpAttempts(item: QueuedItem): Promise<void> {
  if (!hasIDB()) return;
  try {
    await run("readwrite", (s) => s.put({ ...item, attempts: item.attempts + 1 }));
  } catch {
    /* ignore */
  }
}

/**
 * Send everything in the queue, oldest first.
 *
 * Posts to a plain route rather than invoking the server action directly: a
 * server action's id is a build artefact, and a queue item written by
 * yesterday's build must still be sendable after a deploy. A URL is stable.
 *
 * ONE FAILURE STOPS THE DRAIN. Items go in the order they happened — a check-in
 * before the visits of that day — and pushing past a failure would reorder
 * them. The next attempt starts from the same place.
 *
 * PHOTOS *ARE* QUEUED NOW, which reverses what this file used to say.
 *
 * The old rule was "a few megabytes of base64 per item fills a phone's quota in
 * an afternoon", and that was true of what a camera hands you — 3–8 MB. It
 * stopped being true when the photo became REQUIRED and `shrinkPhoto` started
 * resizing it to 1024px at quality 0.7 inside the phone: the same photo is
 * about 100 KB, so ten queued visits cost roughly a megabyte.
 *
 * The alternative was worse in both directions. Dropping the photo offline
 * leaves a hole anybody can use by claiming they had no signal; refusing the
 * visit offline loses the record of work somebody actually did. Neither is
 * acceptable when the photo is the only proof a first visit happened.
 *
 * `QUEUE_PHOTO_LIMIT` is the backstop: an item whose photo is somehow still
 * huge is queued WITHOUT it rather than not queued at all, because the visit
 * matters more than the picture.
 */

/** ~400 KB. Four times what shrinkPhoto produces, so it only catches a fault. */
export const QUEUE_PHOTO_LIMIT = 400_000;
export async function drain(): Promise<{ sent: number; left: number }> {
  const items = await queued();
  let sent = 0;
  for (const item of items) {
    try {
      const body = new URLSearchParams({ ...item.fields, clientRef: item.clientRef, kind: item.kind });
      const res = await fetch("/api/partner/field/sync", { method: "POST", body });
      if (!res.ok) {
        // A 4xx means the server refused it and will refuse it again — a
        // deactivated seat, a deleted prospect. Keep it so it is visible rather
        // than retrying forever, but stop the drain either way.
        await bumpAttempts(item);
        break;
      }
      await drop(item.clientRef);
      sent += 1;
    } catch {
      // Network. Stop; try again on the next online event.
      break;
    }
  }
  return { sent, left: (await queued()).length };
}
