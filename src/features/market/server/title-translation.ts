import { createRequestCache } from "@/shared/async/request-cache";
import type { MarketStory } from "../news-model";

export const TITLE_MODEL = "@cf/openai/gpt-oss-120b";
type Translate = (title: string, signal: AbortSignal) => Promise<unknown>;

/** Preserve numeric tokens: a changed percentage/price/year must fall back to the original. */
export function translatedTitle(original: string, response: unknown): string {
  const choices = response && typeof response === "object"
    ? (response as { choices?: { finish_reason?: string; message?: { content?: unknown } }[] }).choices : undefined;
  const value = choices?.[0]?.message?.content;
  if (typeof value !== "string" || choices?.[0]?.finish_reason !== "stop") throw new Error("Incomplete translation");
  const title = value.trim().replace(/\s+/g, " ");
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  // Sept. 30 → 9월 30일 is valid; a changed month/day still fails.
  const numericDates = (text: string) => text.replace(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?!\d)/gi,
    (_, month: string, day: string) => (months.indexOf(month.slice(0, 3).toLowerCase()) + 1) + "/" + day,
  );
  const numbers = (text: string) => (numericDates(text).match(/\d[\d,.]*/g) ?? [])
    .map((n) => n.replace(/,/g, "").replace(/[.]$/, "")).sort().join("|");
  if (!/[가-힣]/.test(title) || title.length > 600 || /[<>]/.test(title) || /[A-Za-z]+(?:\s+[A-Za-z]+){5}/.test(title)
    || numbers(title) !== numbers(original)) throw new Error("Invalid translation");
  if (/(급등|폭등|상승)/.test(title) && !/\b(ris\w*|rose|rais\w*|jump\w*|surg\w*|soar\w*|rall\w*|gain\w*|climb\w*|up|higher|highs?|grow\w*|grew|growth|skyrocket\w*|doubl\w*|bull\w*|boost\w*|bump\w*)\b/i.test(original)) throw new Error("Added upward price claim");
  if (/(급락|폭락|하락)/.test(title) && !/\b(fall\w*|fell|drop\w*|plung\w*|crash\w*|slid\w*|slip\w*|down\w*|lower|low|declin\w*|sink\w*|sank|los\w*|loss\w*|bear\w*|selloff|tumb\w*)\b/i.test(original)) throw new Error("Added downward price claim");
  return title;
}

export function createTitleTranslator(translate: Translate, { now = Date.now, timeoutMs = 8_000 } = {}) {
  const requests = createRequestCache({ concurrency: 4, maxEntries: 1000, now });
  const failedUntil = new Map<string, number>();
  return async function translateStories(stories: MarketStory[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    // Translation is optional: it must not delay the whole news feed indefinitely.
    const deadline = AbortSignal.timeout(timeoutMs);
    const consumerSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const results = await Promise.all(stories.map(async (story) => {
      const title = story.title.trim();
      if (story.titleKo || /[가-힣]/.test(title) || !/[A-Za-z]/.test(title) || title.length > 500) return story;
      const key = TITLE_MODEL + ":en:ko:v5:" + title;
      if ((failedUntil.get(key) ?? 0) > now()) return story;
      try {
        const titleKo = await requests.request(key, async (sharedSignal) => {
          try {
            const result = translatedTitle(title, await translate(title, sharedSignal));
            sharedSignal.throwIfAborted();
            failedUntil.delete(key);
            return result;
          } catch (error) {
            if (!sharedSignal.aborted) {
              if (failedUntil.size >= 1000) failedUntil.delete(failedUntil.keys().next().value!);
              failedUntil.set(key, now() + 300_000);
            }
            throw error;
          }
        }, { signal: consumerSignal, ttlMs: 7 * 86400_000, timeoutMs });
        return { ...story, titleKo };
      } catch {
        // Failed/expired translations are never cached as successful originals.
        return story;
      }
    }));
    signal?.throwIfAborted();
    return results;
  };
}
