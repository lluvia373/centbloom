/** Read older installations without changing or deleting their stored bytes. */
export function legacyStorageKey(key: string): string {
  return key.replace(/^centifolio(?=[:-])/, "stockfolio");
}

export function readBrandedStorage(storage: Pick<Storage, "getItem">, key: string): string | null {
  return storage.getItem(key) ?? storage.getItem(legacyStorageKey(key));
}
