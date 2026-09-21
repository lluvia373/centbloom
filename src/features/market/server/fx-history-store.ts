import { createRequestCache } from "@/shared/async/request-cache";
import { buildDailyFxSeries, fxToday, parseDailyFxReferences, shiftFxDate, validFxDate, type FxReferenceDay } from "../fx-history";

export const FX_FULL_HISTORY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
export const FX_RECENT_HISTORY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
export const FX_HISTORY_PREFIX = "fx:ecb-krw:v1:";
const REFRESH_MS = 60 * 60_000;
const RETRY_MS = 60_000;
const MAX_XML_BYTES = 16 * 1024 * 1024;
const indexKey = FX_HISTORY_PREFIX + "index";
export const fxYearKey = (year: number) => FX_HISTORY_PREFIX + year;

export interface FxHistoryStorage {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
}
interface StoredYear { version: 1; fetchedAt: number; days: FxReferenceDay[] }
interface HistoryIndex { version: 1; checkedAt: number; firstDate: string; lastDate: string }

function storedYear(value: unknown, year: number): StoredYear | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StoredYear;
  if (row.version !== 1 || !Number.isFinite(row.fetchedAt) || !Array.isArray(row.days) || !row.days.length ||
    row.days.some((day, i) => !day || !validFxDate(day.date) || Number(day.date.slice(0, 4)) !== year ||
      (i > 0 && row.days[i - 1].date >= day.date) || !day.rates || typeof day.rates !== "object" ||
      Object.entries(day.rates).some(([currency, rate]) => !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(rate) || rate <= 0))) return null;
  return row;
}
function historyIndex(value: unknown): HistoryIndex | null {
  if (!value || typeof value !== "object") return null;
  const row = value as HistoryIndex;
  return row.version === 1 && Number.isFinite(row.checkedAt) && validFxDate(row.firstDate) &&
    validFxDate(row.lastDate) && row.firstDate <= row.lastDate ? row : null;
}

/** Persistent public reference data only; never store account IDs or transactions. */
export function createFxHistoryStore(storage: FxHistoryStorage, fetcher: typeof fetch = fetch, now = Date.now) {
  const jobs = createRequestCache({ concurrency: 1, maxEntries: 4 });
  let retryAfter = 0;

  async function readYear(year: number) {
    return storedYear(await storage.get(fxYearKey(year), "json"), year);
  }

  async function refresh(full = false, signal?: AbortSignal) {
    return jobs.request(full ? "full" : "recent", async (jobSignal) => {
      const index = historyIndex(await storage.get(indexKey, "json"));
      const startedAt = now();
      if (!full && index && startedAt - index.checkedAt < REFRESH_MS) return;
      if (startedAt < retryAfter) throw new Error("공식 일별 환율 수집을 잠시 후 다시 시도해주세요.");
      try {
        // A recent-only download cannot bridge a shutdown longer than its 90-day window.
        const needsFull = full || !index || startedAt - Date.parse(index.lastDate) >= 85 * 86400000;
        const response = await fetcher(needsFull ? FX_FULL_HISTORY_URL : FX_RECENT_HISTORY_URL, {
          signal: jobSignal, cache: "no-store",
        });
        if (!response.ok) throw new Error("공식 일별 환율 조회에 실패했습니다.");
        if (Number(response.headers.get("content-length")) > MAX_XML_BYTES) throw new Error("일별 환율 자료의 크기를 확인하지 못했습니다.");
        const xml = await response.text();
        if (xml.length > MAX_XML_BYTES) throw new Error("일별 환율 자료의 크기를 확인하지 못했습니다.");
        const days = parseDailyFxReferences(xml).filter(day => day.date <= fxToday(startedAt));
        if (!days.length) throw new Error("적용할 과거 환율이 없습니다.");
        if (days.some(day => !day.rates.USD || day.rates.KRW !== 1)) throw new Error("일별 환율 자료의 필수 통화가 누락되었습니다.");
        // Do not accept an incomplete bootstrap as a complete historical archive.
        if (needsFull && days[0].date !== "1999-01-04") throw new Error("전체 과거 환율 자료의 시작일을 확인하지 못했습니다.");
        const grouped = new Map<number, FxReferenceDay[]>();
        for (const day of days) {
          const year = Number(day.date.slice(0, 4));
          const group = grouped.get(year) ?? [];
          group.push(day); grouped.set(year, group);
        }
        const updates: [number, StoredYear][] = [];
        for (const [year, incoming] of grouped) {
          jobSignal.throwIfAborted();
          const existing = await readYear(year);
          if (existing && existing.fetchedAt > startedAt) continue;
          const merged = new Map(existing?.days.map(day => [day.date, day]) ?? []);
          for (const day of incoming) {
            const prior = merged.get(day.date);
            if (prior && Object.keys(prior.rates).some(currency => !day.rates[currency])) {
              throw new Error("일별 환율의 일부 통화가 누락되어 기존 자료를 유지합니다.");
            }
            merged.set(day.date, day);
          }
          const mergedDays = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
          // No expiry: an outage must not erase already collected history.
          if (!existing || JSON.stringify(existing.days) !== JSON.stringify(mergedDays)) {
            updates.push([year, { version: 1, fetchedAt: startedAt, days: mergedDays }]);
          }
        }
        for (const [year, update] of updates) {
          jobSignal.throwIfAborted();
          const latest = await readYear(year);
          if (!latest || latest.fetchedAt <= startedAt) await storage.put(fxYearKey(year), JSON.stringify(update));
        }
        jobSignal.throwIfAborted();
        const current = historyIndex(await storage.get(indexKey, "json"));
        if (!current || current.checkedAt <= startedAt) {
          await storage.put(indexKey, JSON.stringify({ version: 1, checkedAt: startedAt,
            firstDate: current?.firstDate && current.firstDate < days[0].date ? current.firstDate : days[0].date,
            lastDate: current?.lastDate && current.lastDate > days.at(-1)!.date ? current.lastDate : days.at(-1)!.date,
          } satisfies HistoryIndex));
        }
        retryAfter = 0;
      } catch (error) {
        if (!jobSignal.aborted) retryAfter = now() + RETRY_MS;
        throw error;
      }
    }, { signal, ttlMs: 0, timeoutMs: 45_000 });
  }

  async function loadDays(start: string, end: string) {
    const years: number[] = [];
    for (let year = Math.max(1999, Number(shiftFxDate(start, -7).slice(0, 4))); year <= Number(end.slice(0, 4)); year++) years.push(year);
    const values = await Promise.all(years.map(readYear));
    return { missingYears: years.filter((_, index) => !values[index]), days: values.flatMap(year => year?.days ?? []) };
  }

  async function get(currency: string, start: string, end: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    let stored = await loadDays(start, end);
    let index = historyIndex(await storage.get(indexKey, "json"));
    // Bootstrap missing years before serving; never silently claim a transient fetch was saved.
    const archiveMissing = () => !index || stored.missingYears.some(year => year <= Number(index!.lastDate.slice(0, 4)));
    if (archiveMissing()) {
      await refresh(true, signal);
      stored = await loadDays(start, end);
      index = historyIndex(await storage.get(indexKey, "json"));
      if (archiveMissing()) throw new Error("일별 환율의 공통 저장을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } else if (index && now() - index.checkedAt >= REFRESH_MS) {
      try { await refresh(false, signal); stored = await loadDays(start, end); }
      catch { signal?.throwIfAborted(); /* Known-good past data remains usable; gaps still fail below. */ }
    }
    signal?.throwIfAborted();
    return buildDailyFxSeries(currency, start, end, stored.days, now());
  }
  return { get, refresh };
}

const stores = new WeakMap<object, ReturnType<typeof createFxHistoryStore>>();
export function dailyFxStore(storage: FxHistoryStorage) {
  let store = stores.get(storage);
  if (!store) { store = createFxHistoryStore(storage); stores.set(storage, store); }
  return store;
}
export async function refreshScheduledFxHistory(env: Pick<WorkerBindings, "NEWS_CACHE">) {
  await dailyFxStore(env.NEWS_CACHE).refresh();
}
