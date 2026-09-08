/** Read prior brand namespaces without modifying their stored bytes. */
export function brandedStorageKeys(key: string): string[] {
  const brands = key.startsWith("centbloom")
    ? ["centbloom", "centifolio", "stockfolio"]
    : key.startsWith("centifolio") ? ["centifolio", "stockfolio"] : [];
  return brands.length
    ? brands.map((brand) => key.replace(/^(?:centbloom|centifolio)(?=[:-])/, brand))
    : [key];
}

export function isBrandedStorageKey(changedKey: string | null, key: string): boolean {
  return changedKey === null || brandedStorageKeys(key).includes(changedKey);
}

export function readBrandedStorage(storage: Pick<Storage, "getItem">, key: string): string | null {
  for (const candidate of brandedStorageKeys(key)) {
    const value = storage.getItem(candidate);
    if (value !== null) return value;
  }
  return null;
}

/** A confirmed or abandoned outbox must not reappear from a legacy namespace. */
export function removeBrandedStorage(storage: Pick<Storage, "removeItem">, key: string): void {
  for (const candidate of brandedStorageKeys(key).reverse()) storage.removeItem(candidate);
}
