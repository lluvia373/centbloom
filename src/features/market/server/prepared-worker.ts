import { fxPair } from "../fx";
import { createPreparedQuotes, type PreparedQuoteDemand } from "./prepared-quotes";
import { loadPreparationQuotes } from "./quote-source";
import { validSymbol } from "./provider";

const DEMAND_KEY = "market-demand:v1";
const COOLDOWN_KEY = "market-blocked-until:v1";
const DEMAND_MS = 5 * 60_000;
const REFRESH_MS = 30_000;
const MAX_BODY_BYTES = 4 * 1024;

function statusOf(error: unknown): number {
  if (!error || typeof error !== "object") return 502;
  const value = error as { status?: unknown; code?: unknown; cause?: unknown; message?: unknown };
  if ([value.status, value.code, value.cause].includes(429) ||
    (typeof value.message === "string" && /\bstatus[: ]+429\b/i.test(value.message))) return 429;
  const status = [value.status, value.code, value.cause].find(value =>
    typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599);
  return typeof status === "number" ? status : 502;
}

function json(value: unknown, status = 200, retryAfter?: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}

const invalid = (message: string, status = 400) => Object.assign(new Error(message), { status });

async function readSymbols(request: Request): Promise<string[]> {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES)
    throw invalid("요청 본문은 4KB를 넘을 수 없습니다.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw invalid("공개 시세 종목 목록이 필요합니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw invalid("요청 본문은 4KB를 넘을 수 없습니다.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw invalid("올바른 JSON 요청이 필요합니다."); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !Object.hasOwn(body, "symbols"))
    throw invalid("요청에는 공개 종목 목록만 포함할 수 있습니다.");
  const raw = (body as { symbols: unknown }).symbols;
  if (!Array.isArray(raw) || !raw.length || raw.length > 50)
    throw invalid("공개 시세 종목은 1~50개까지 요청할 수 있습니다.");
  const symbols = raw.map(value => typeof value === "string" ? value.trim().toUpperCase() : "");
  if (symbols.some(symbol => {
    if (!validSymbol(symbol)) return true;
    if (!symbol.endsWith("=X")) return false;
    const pair = fxPair(symbol);
    return !pair || pair.base === pair.quote;
  })) throw invalid("유효한 공개 시세 종목이 필요합니다.");
  return [...new Set(symbols)].sort();
}

/** One shared public-quote owner. Prices deliberately never enter durable storage. */
export class MarketQuotes implements DurableObject {
  private readonly engine: ReturnType<typeof createPreparedQuotes>;
  private readonly ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private blockedUntil = 0;
  private retryNotBefore = 0;
  private storedDemand: string | undefined;
  private storedCooldown: unknown;

  constructor(private readonly state: DurableObjectState, env: unknown) {
    void env;
    this.engine = createPreparedQuotes({
      freshnessMs: REFRESH_MS, demandMs: DEMAND_MS, maxEntries: 256, maxPrepared: 50,
      load: async (symbols, signal) => {
        if (this.blockedUntil > Date.now()) throw Object.assign(new Error("시장 데이터 조회 제한"), {
          status: 429, retryAfterSeconds: this.retryAfter(),
        });
        try {
          const result = await loadPreparationQuotes(symbols, signal);
          const previousDeadline = this.blockedUntil;
          for (const error of Object.values(result.errors)) this.rememberLimit(error);
          if (this.blockedUntil !== previousDeadline) await this.persistAndSchedule();
          return result;
        } catch (error) {
          this.rememberLimit(error);
          // A provider may report its limit after the last caller has cancelled.
          // Persist it here as well, not only when a fetch response is sent.
          if (statusOf(error) === 429) await this.persistAndSchedule();
          throw error;
        }
      },
    });
    this.ready = state.blockConcurrencyWhile(async () => {
      const [demand, cooldown] = await Promise.all([
        state.storage.get<unknown>(DEMAND_KEY), state.storage.get<unknown>(COOLDOWN_KEY),
      ]);
      this.storedDemand = JSON.stringify(demand ?? []);
      this.storedCooldown = cooldown ?? 0;
      if (Array.isArray(demand)) this.engine.restoreDemand(demand as PreparedQuoteDemand[]);
      if (typeof cooldown === "number" && Number.isSafeInteger(cooldown) && cooldown > Date.now())
        this.blockedUntil = cooldown;
      await this.persistAndSchedule();
    });
  }

  private retryAfter(): number {
    return Math.max(1, Math.ceil((this.blockedUntil - Date.now()) / 1000));
  }

  private rememberLimit(error: unknown): void {
    if (statusOf(error) !== 429) return;
    const raw = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    const seconds = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 60;
    const now = Date.now();
    this.blockedUntil = Math.max(this.blockedUntil,
      now + Math.min(seconds * 1000, Number.MAX_SAFE_INTEGER - now));
  }

  private persistAndSchedule(): Promise<void> {
    // Serialize storage only, never a provider request. Read the newest snapshot when
    // this job runs so an older fetch completion cannot overwrite newer demand.
    const write = this.writes.then(async () => {
      const now = Date.now();
      const demand = this.engine.demandSnapshot();
      if (this.blockedUntil <= now) this.blockedUntil = 0;
      const serialized = JSON.stringify(demand);
      const updates: Record<string, unknown> = {};
      if (serialized !== this.storedDemand) updates[DEMAND_KEY] = demand;
      if (this.blockedUntil !== this.storedCooldown) updates[COOLDOWN_KEY] = this.blockedUntil;
      if (Object.keys(updates).length) {
        await this.state.storage.put(updates);
        this.storedDemand = serialized;
        this.storedCooldown = updates[COOLDOWN_KEY] ?? this.storedCooldown;
      }
      const existing = await this.state.storage.getAlarm();
      if (!demand.length) {
        if (existing !== null) await this.state.storage.deleteAlarm();
        return;
      }
      const expires = Math.max(...demand.map(item => item.lastSeen + DEMAND_MS));
      const due = Math.max(this.engine.nextPreparationAt() ?? now + REFRESH_MS,
        this.blockedUntil, this.retryNotBefore);
      // An expiry-only alarm removes idle demand even when a longer cooldown is active.
      const next = Math.max(now + 1000, Math.min(due, expires));
      if (existing === null || next < existing) await this.state.storage.setAlarm(next);
    });
    this.writes = write.catch(() => {});
    return write;
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/quotes") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "POST 요청이 필요합니다." }, 405);
    let symbols: string[];
    try { symbols = await readSymbols(request); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "잘못된 요청입니다." }, statusOf(error)); }
    await this.ready;
    let response: Response;
    try {
      const reading = this.engine.read(symbols, request.signal);
      const [result] = await Promise.all([reading, this.persistAndSchedule()]);
      response = json(result, 200, Object.values(result.errors).some(error => error.status === 429) ? this.retryAfter() : undefined);
    } catch (error) {
      const status = statusOf(error);
      response = json({ error: status === 429
        ? "시장 데이터 공급처의 조회 제한으로 잠시 기다려 주세요."
        : "시장 시세를 확인하지 못했습니다." }, status, status === 429 ? this.retryAfter() : undefined);
    }
    // Keep durability/output gates intact: a sent 429 must survive a restart.
    await this.persistAndSchedule();
    return response;
  }

  async alarm(): Promise<void> {
    await this.ready;
    try {
      if (Date.now() >= Math.max(this.blockedUntil, this.retryNotBefore)) await this.engine.prepare();
    } catch (error) {
      if (statusOf(error) !== 429) this.retryNotBefore = Date.now() + REFRESH_MS;
      // Handled upstream failures use the normal policy alarm, not automatic short retries.
    }
    await this.persistAndSchedule();
  }
}
