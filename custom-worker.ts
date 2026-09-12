// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Generated import must also work before a build.
// @ts-ignore OpenNext generates this module during the deployment build.
import handler from "./.open-next/worker.js";
import { refreshScheduledNews } from "./src/features/market/server/news-refresh";

export default {
  fetch: handler.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshScheduledNews(env));
  },
} satisfies ExportedHandler<WorkerBindings>;
