// Local preparation command, not a request-time scraper. Requires Node 24+.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { prepareGurus, parseCollectorArgs } from "./guru-collector.mjs";
import { publishGuruAssets } from "./publish-guru-assets.mjs";
export { prepareGurus, parseCollectorArgs, requestedPeriods, discoverAllFilings } from "./guru-collector.mjs";
export { createSecClient } from "./guru-source-cache.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => prepareGurus(parseCollectorArgs(process.argv.slice(2)))).then(async result => {
    console.log(JSON.stringify({ coverage: result.coverage, stopped: result.stopped }));
    console.log(JSON.stringify({ publication: await publishGuruAssets() }));
    if (result.failures || result.coverage.pending) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
