import { readFile, writeFile, rename, open, unlink, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export async function atomicJson(path, value) {
  const temporary = `${path}.pending`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, path);
}
export async function collectionLock(path) {
  let handle;
  try { handle = await open(path, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const before = await stat(path);
    let owner;
    try { owner = JSON.parse(await readFile(path, 'utf8')); } catch { throw Error('Collection lock has no valid owner; inspect it before resuming.'); }
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw Error('Collection lock owner is invalid.');
    try { process.kill(owner.pid, 0); throw Error('A guru collection is already running.'); }
    catch (ownerError) { if (ownerError.code !== 'ESRCH') throw ownerError; }
    const current = await stat(path);
    if (before.ino !== current.ino || before.mtimeMs !== current.mtimeMs) throw Error('Collection lock changed; retry later.');
    await unlink(path); handle = await open(path, 'wx');
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return async () => { await handle.close(); await unlink(path); };
}

export function createSecClient(userAgent, { request = fetch, wait = pause, now = Date.now, requestsPerSecond = 1 } = {}) {
  if (!/^Centbloom\b.{0,100}\b[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userAgent ?? '')) throw Error('Set SEC_USER_AGENT to Centbloom and an operator email.');
  if (![1, 2, 3].includes(requestsPerSecond)) throw Error('SEC request rate must be 1, 2 or 3 per second');
  let lastRequest = -Infinity, stopped = null, queue = Promise.resolve();
  return url => {
    const task = queue.then(async () => {
      if (stopped) throw stopped;
      const target = new URL(url);
      if (target.protocol !== 'https:' || target.username || target.password || target.port || target.search || target.hash
        || !(target.hostname === 'data.sec.gov' && /^\/submissions\/CIK\d{10}(?:-submissions-\d+)?\.json$/.test(target.pathname)
          || target.hostname === 'www.sec.gov' && (/^\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9_.-]+$/.test(target.pathname)
            || target.pathname === '/files/company_tickers_exchange.json'))) throw Error('SEC URL rejected');
      await wait(Math.max(0, Math.ceil(1000 / requestsPerSecond) - (now() - lastRequest))); lastRequest = now();
      const response = await request(target.href, { headers: { 'User-Agent': userAgent, Accept: 'application/json, application/xml, text/xml' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        const error = new Error(`SEC HTTP ${response.status}`);
        error.status = response.status; error.stopCollection = [403, 429].includes(response.status);
        if (error.stopCollection) {
          const retry = response.headers.get('retry-after');
          const delay = /^\d+$/.test(retry ?? '') ? Number(retry) * 1000 : Date.parse(retry ?? '') - now();
          error.retryAt = now() + (Number.isFinite(delay) && delay > 0 ? delay : 60 * 60_000); stopped = error;
        }
        throw error;
      }
      // Large institutional information tables can exceed the submissions/index limit.
      const maximum = (target.hostname === 'www.sec.gov' && /\.xml$/i.test(target.pathname) ? 32 : 12) * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > maximum) {
        await response.body?.cancel(); throw Error('SEC response too large');
      }
      if (!response.body) throw Error('SEC response has no body');
      const reader = response.body.getReader(), chunks = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.length; if (length > maximum) throw Error('SEC response too large'); chunks.push(value);
        }
      } finally { await reader.cancel(); }
      return Buffer.concat(chunks).toString('utf8');
    });
    queue = task.catch(() => {}); return task;
  };
}

/** Immutable raw files plus URL indexes. Error responses never become cached data. */
export function createSourceCache(storage, request, { now = Date.now } = {}) {
  const blockedPath = resolve(storage, 'sec-cooldown.json');
  const readJson = async path => {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
  };
  const raw = async (hash, extension = 'xml') => {
    if (!/^[a-f0-9]{64}$/.test(hash ?? '')) return null;
    try { const text = await readFile(resolve(storage, `${hash}.${extension}`), 'utf8'); return sha256(text) === hash ? text : null; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const store = async (text, extension = 'xml') => {
    const hash = sha256(text), path = resolve(storage, `${hash}.${extension}`);
    try { await writeFile(path, text, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await raw(hash, extension) === null) throw Error('Stored source hash mismatch; preserve and inspect the source file.');
    }
    return hash;
  };
  const get = async (url, { ttl = Infinity } = {}) => {
    const indexPath = resolve(storage, `${sha256(url)}.request.json`), extension = new URL(url).pathname.endsWith('.xml') ? 'xml' : 'json';
    const entry = await readJson(indexPath);
    if (entry?.url === url && Number.isFinite(entry.fetchedAt) && entry.fetchedAt <= now() && now() - entry.fetchedAt < ttl) {
      const text = await raw(entry.hash, extension);
      if (text !== null) return { ...entry, text, cached: true };
    }
    const block = await readJson(blockedPath);
    if (Number.isFinite(block?.retryAt) && block.retryAt > now()) {
      const error = new Error(`SEC collection paused until ${new Date(block.retryAt).toISOString()}`);
      error.stopCollection = true; error.retryAt = block.retryAt; throw error;
    }
    let text;
    try { text = await request(url); }
    catch (error) {
      if (error.stopCollection) await atomicJson(blockedPath, { status: error.status, blockedAt: now(), retryAt: error.retryAt ?? now() + 60 * 60_000 });
      throw error;
    }
    const next = { url, hash: await store(text, extension), fetchedAt: now() };
    await atomicJson(indexPath, next); return { ...next, text, cached: false };
  };
  return { raw, store, get };
}
