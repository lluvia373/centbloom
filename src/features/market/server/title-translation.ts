import { createRequestCache } from "@/shared/async/request-cache";
import { headlineNumbers } from "./translation-numbers";
import type { MarketStory } from "../news-model";

export const TITLE_MODEL = "@cf/openai/gpt-oss-120b";
type Translate = (title: string, signal: AbortSignal) => Promise<unknown>;

/** Reject changed quantities/currencies and invented claims, while allowing exact unit localization. */
export function translatedTitle(original: string, response: unknown): string {
  const choices = response && typeof response === "object"
    ? (response as { choices?: { finish_reason?: string; message?: { content?: unknown } }[] }).choices : undefined;
  const value = choices?.[0]?.message?.content;
  if (typeof value !== "string" || choices?.[0]?.finish_reason !== "stop") throw new Error("Incomplete translation");
  const title = value.trim().replace(/\s+/g, " ");
  if (!/[가-힣]/.test(title) || title.length > 600 || /[<>]/.test(title) || /[A-Za-z]+(?:\s+[A-Za-z]+){5}/.test(title)
    || headlineNumbers(title) !== headlineNumbers(original)) throw new Error("Invalid translation");
  if (/(급등|폭등|상승)/.test(title) && !/\b(ris\w*|rose|rais\w*|jump\w*|surg\w*|soar\w*|rall\w*|gain\w*|climb\w*|up|higher|highs?|grow\w*|grew|growth|skyrocket\w*|doubl\w*|bull\w*|boost\w*|bump\w*)\b/i.test(original)) throw new Error("Added upward price claim");
  if (/(급락|폭락|하락)/.test(title) && !/\b(fall\w*|fell|drop\w*|plung\w*|crash\w*|slid\w*|slip\w*|down\w*|lower|low|declin\w*|sink\w*|sank|los\w*|loss\w*|bear\w*|selloff|tumb\w*)\b/i.test(original)) throw new Error("Added downward price claim");
  return title;
}

export function createTitleTranslator(translate: Translate, { now = Date.now, timeoutMs = 8_000, concurrency = 4 } = {}) {
  const requests = createRequestCache({ concurrency, maxEntries: 1000, now });
  const failedUntil = new Map<string, number>();
  return async function translateStories(stories: MarketStory[], signal?: AbortSignal, budgetMs = timeoutMs) {
    signal?.throwIfAborted();
    // Translation is optional: it must not delay the whole news feed indefinitely.
    const deadline = AbortSignal.timeout(budgetMs);
    const consumerSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const results = await Promise.all(stories.map(async (story) => {
      const title = story.title.trim();
      if (story.titleKo || /[가-힣]/.test(title) || !/[A-Za-z]/.test(title) || title.length > 500) return story;
      const key = TITLE_MODEL + ":en:ko:v6:" + title;
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
        }, { signal: consumerSignal, ttlMs: 7 * 86400_000, timeoutMs: budgetMs });
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
