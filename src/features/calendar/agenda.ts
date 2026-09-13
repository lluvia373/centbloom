import { kstDate } from "./model";
import { shiftDay } from "./navigation";
import { hasActual, type Release } from "./release";

type EconomicTopic = "cpi" | "ppi" | "jobs" | "retail" | "fomc" | "gdp" | "pce";

/** The home selection has a fixed scope; the full calendar keeps every release. */
function economicTopic(title: string): EconomicTopic | null {
  if (/소비자물가|\bCPI\b|\binflation rate\b/i.test(title)) return "cpi";
  if (/생산자물가|\bPPI\b|\bproducer prices?\b/i.test(title)) return "ppi";
  if (/고용보고서|비농업.*고용|\bnon[- ]?farm payrolls?\b|\bemployment situation\b/i.test(title)) return "jobs";
  if (/소매판매|\bretail sales\b/i.test(title)) return "retail";
  if (/FOMC.*금리.*결정|\binterest rate decision\b/i.test(title)) return "fomc";
  if (/\bGDP\b|국내총생산/i.test(title)) return "gdp";
  if (/\bPCE\b|개인소비지출.*(?:물가|가격)|personal consumption expenditure.*(?:price|index)/i.test(title)) return "pce";
  return null;
}

function updatedTime(event: Release) {
  const value = event.updatedAt ? Date.parse(event.updatedAt) : NaN;
  return Number.isFinite(value) ? value : 0;
}

export function selectAgenda(events: Release[], now: number, watchedSymbols: readonly string[] = []): { upcoming: Release[]; recent: Release[] } {
  if (!Number.isFinite(now)) return { upcoming: [], recent: [] };
  const today = kstDate(now);
  const lastDay = shiftDay(today, 45);
  const firstRecentDay = shiftDay(today, -7);
  const watched = new Set(watchedSymbols.map(symbol => symbol.trim().toUpperCase()));
  const unique = new Map<string, Release>();
  for (const event of events) {
    if (!Number.isFinite(Date.parse(event.at))) continue;
    const previous = unique.get(event.id);
    if (!previous || updatedTime(event) > updatedTime(previous) ||
        (updatedTime(event) === updatedTime(previous) && hasActual(event) && !hasActual(previous))) {
      unique.set(event.id, event);
    }
  }
  const eligible = [...unique.values()].filter(event => event.kind === "earnings"
    ? !!event.earnings && watched.has(event.earnings.symbol.trim().toUpperCase())
    : economicTopic(event.title) !== null);
  const upcoming = eligible.filter(event => {
    const day = kstDate(event.at);
    return !hasActual(event) && day <= lastDay &&
      (event.timingEstimated ? day >= today : Date.parse(event.at) >= now);
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)).slice(0, 5);
  const recent = eligible.filter(event => {
    const day = kstDate(event.at);
    return hasActual(event) && day >= firstRecentDay &&
      (event.timingEstimated ? day <= today : Date.parse(event.at) <= now);
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id)).slice(0, 2);
  return { upcoming, recent };
}

export function agendaObservation(event: Release): string {
  if (event.kind === "earnings") return "매출과 주당순이익이 시장 예상과 얼마나 차이 나는지 봅니다.";
  const topic = economicTopic(event.title);
  switch (topic) {
    case "cpi": return "물가 상승세가 지난달보다 둔화됐는지, 식료품·에너지를 뺀 물가도 같은 방향인지 봅니다.";
    case "ppi": return "기업이 상품·서비스를 파는 가격이 지난달보다 얼마나 달라졌는지 봅니다.";
    case "jobs": return "새로 늘어난 일자리 수와 실업률을 지난달과 비교합니다.";
    case "retail": return "소매판매가 지난달보다 늘었는지, 자동차를 뺀 소비도 같은 방향인지 봅니다.";
    case "fomc": return "직전 기준금리와 이번 결정을 비교하고, 다음 금리에 대한 연준의 설명을 봅니다.";
    case "gdp": return "이번 분기 성장률과 직전 분기 성장률의 차이를 봅니다.";
    case "pce": return "소비지출과 물가가 지난달보다 얼마나 달라졌는지 함께 봅니다.";
    default: return event.detail;
  }
}
