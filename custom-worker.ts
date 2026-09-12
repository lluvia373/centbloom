// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Generated import must also work before a build.
// @ts-ignore OpenNext generates this module during the deployment build.
import handler from "./.open-next/worker.js";
import { refreshPreparedChanges } from "./src/features/market/server/changes-refresh";
import { refreshScheduledNews } from "./src/features/market/server/news-refresh";

import { refreshScheduledWatchedReports } from "./src/features/market/server/watched-report-refresh";

export default {
  fetch: handler.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const results = await Promise.allSettled([
        refreshScheduledNews(env),
        refreshScheduledWatchedReports(env),
        refreshPreparedChanges(env, { force: true, timeoutMs: 90_000 }),
      ]);
      const failure = results.find(result => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    })());
  },
} satisfies ExportedHandler<WorkerBindings>;
