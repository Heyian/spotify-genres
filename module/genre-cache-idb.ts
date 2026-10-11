import type { GenreCacheEntry, GenreCacheStore } from "./genre-cache.ts";

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** IndexedDB-backed genre cache, one object store keyed by track URI. */
export function openIndexedDbStore(dbName = "spotify-genres", storeName = "tracks"): GenreCacheStore {
  let db: Promise<IDBDatabase> | undefined;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName, { keyPath: "uri" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        db = undefined;
        reject(req.error);
      };
    }));
  const objectStore = async (mode: IDBTransactionMode) => (await open()).transaction(storeName, mode).objectStore(storeName);

  return {
    get: async (uri) => (await request((await objectStore("readonly")).get(uri))) as GenreCacheEntry | undefined,
    getMany: async (uris) => {
      const found = new Map<string, GenreCacheEntry>();
      if (uris.length === 0) return found;
      const store = await objectStore("readonly"); // one transaction for every key
      const entries = await Promise.all(uris.map((uri) => request(store.get(uri))));
      entries.forEach((entry, i) => {
        if (entry) found.set(uris[i], entry as GenreCacheEntry);
      });
      return found;
    },
    put: async (entry) => void (await request((await objectStore("readwrite")).put(entry))),
    clear: async () => void (await request((await objectStore("readwrite")).clear())),
  };
}
