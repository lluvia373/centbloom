// ECB MID releaseDateTime is the public release time, not the observation time:
// https://www.ecb.europa.eu/press/shared/pdf/MID-Catalogue-and-Integration-Guide.en.pdf
import { MarketError, providerRequests, validDate } from "./provider";

export const ECB_RELEASE_FEED = "https://mid.ecb.europa.eu/rss/mid.xml";
export interface EcbRelease { date: string; rates: Record<string, number>; publishedAt: string }
interface ReleaseLink { url: string; publishedAt: string; localPublishedAt: string }
const DAY = 86_400_000;
const fail = () => new MarketError("공식 환율 발표의 형식을 확인하지 못했습니다.");
function safeXml(xml: string) {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw fail();
}
function textTag(xml: string, name: string) {
  const entries = [...xml.matchAll(new RegExp(`<${name}>([^<>]*)</${name}>`, "g"))];
  if (entries.length !== 1) throw fail();
  return entries[0][1].trim();
}
function attributes(text: string) {
  const values: Record<string, string> = {};
  const remainder = text.replace(/([\w:]+)\s*=\s*(["'])([^"'<>]*)\2/g, (_, key, _quote, value) => {
    if (Object.hasOwn(values, key)) throw fail();
    values[key] = value; return "";
  });
  if (remainder.trim()) throw fail();
  return values;
}

export function parseEcbReleaseFeed(xml: string): ReleaseLink[] {
  safeXml(xml);
  if (!/<rss\s+version=["']2\.0["']\s*>/.test(xml)) throw fail();
  const links: ReleaseLink[] = [];
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    if (textTag(item[1], "title") !== "Euro foreign exchange reference rates") continue;
    const url = textTag(item[1], "link"), date = textTag(item[1], "pubDate");
    // Never follow provider-supplied URLs to another host, credentials, ports or queries.
    if (!/^https:\/\/mid\.ecb\.europa\.eu\/rel\/[a-f0-9]{32}\.xml$/.test(url)) continue;
    const offset = / ([+-])(\d{2})(\d{2})$/.exec(date);
    if (!offset || Number(offset[2]) > 14 || Number(offset[3]) > 59) continue;
    const at = Date.parse(date);
    if (!Number.isFinite(at)) continue;
    const offsetMinutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1);
    links.push({ url, publishedAt: new Date(at).toISOString(), localPublishedAt: new Date(at + offsetMinutes * 60_000).toISOString().slice(0, 19) });
  }
  return links.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function parseEcbRelease(xml: string, link: ReleaseLink): EcbRelease {
  safeXml(xml);
  if (!xml.includes('xmlns:escb="http://escb.ecb.int/MarketInformationDissemination"') ||
    textTag(xml, "escb:releaseType") !== "EuroForeignExchangeReferenceRates" ||
    textTag(xml, "escb:releaseDateTime") !== link.localPublishedAt) throw fail();
  const roots = [...xml.matchAll(/<fx:eurofxref\s+([^>]+)>/g)];
  if (roots.length !== 1) throw fail();
  const root = attributes(roots[0][1]);
  if (root["xmlns:fx"] !== "http://escb.ecb.int/eurofxref" || root.refcur !== "EUR" || root.refamt !== "1") throw fail();
  const days = [...xml.matchAll(/<fx:dailyrates\s+([^>]+)>([\s\S]*?)<\/fx:dailyrates>/g)];
  if (days.length !== 1) throw fail();
  const id = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(attributes(days[0][1]).id ?? "");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (!id || !months.includes(id[2])) throw fail();
  const date = `${id[3]}-${String(months.indexOf(id[2]) + 1).padStart(2, "0")}-${id[1].padStart(2, "0")}`;
  if (!validDate(date) || date > link.localPublishedAt.slice(0, 10)) throw fail();
  const rates: Record<string, number> = { EUR: 1 };
  let count = 0;
  const remainder = days[0][2].replace(/<fx:currency\s+([^>]+)\/>/g, (_, attrs) => {
    const { code, rate } = attributes(attrs);
    if (!/^[A-Z]{3}$/.test(code ?? "") || Object.hasOwn(rates, code) || !/^[0-9]+(?:\.[0-9]+)?$/.test(rate ?? "")) throw fail();
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) throw fail();
    rates[code] = value; count++; return "";
  });
  if (remainder.trim() || !count) throw fail();
  return { date, rates, publishedAt: link.publishedAt };
}

async function xmlAt(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store", redirect: "error" });
  if (!response.ok) throw new MarketError("공식 환율 발표 조회에 실패했습니다.");
  return response.text();
}

export async function fetchEcbReleases(asOf: number, signal?: AbortSignal): Promise<EcbRelease[]> {
  const links = await providerRequests.request("ecb-mid-feed", async s => parseEcbReleaseFeed(await xmlAt(ECB_RELEASE_FEED, s)),
    { signal, ttlMs: 60_000, timeoutMs: 8_000 });
  // The feed is deliberately bounded; history XML remains the fallback when a release has aged out.
  const candidates = links.filter(link => Date.parse(link.publishedAt) <= asOf && Date.parse(link.publishedAt) >= asOf - 7 * DAY).slice(0, 5);
  const releases = await Promise.all(candidates.map(async link => {
    try {
      return await providerRequests.request(`ecb-mid:${link.url}:${link.publishedAt}`, async s => parseEcbRelease(await xmlAt(link.url, s), link),
        { signal, ttlMs: 60 * 60_000, timeoutMs: 8_000 });
    } catch { signal?.throwIfAborted(); return null; }
  }));
  return releases.filter((release): release is EcbRelease => !!release)
    .sort((a, b) => b.date.localeCompare(a.date) || b.publishedAt.localeCompare(a.publishedAt));
}
