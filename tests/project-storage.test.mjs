import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTypescript } from './load-typescript.mjs';

const require = createRequire(import.meta.url);
const projectA = 'tocdnobpkbpczjzbenbd';
const projectB = 'abcdefghijklmnopqrst';
const production = 'cvuqzetasndsjtpaqbmr';
function browserModule(file, overrides = {}, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports, require: name => name in overrides ? overrides[name] : require(name),
    URL, Date, crypto: globalThis.crypto, ...globals,
  }, { filename: file });
  return exports;
}
function project(ref, additions = {}) {
  const env = ref ? {
    NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF: ref,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    ...additions,
  } : { ...additions };
  const helper = browserModule('src/lib/project-storage.ts', {}, { process: { env } });
  return {
    key: helper.projectStorageKey,
    load: (file, overrides = {}) => loadTypescript(file, {
      './project-storage': helper, '@/lib/project-storage': helper, ...overrides,
    }),
    helper,
  };
}
function memoryStorage(entries = []) {
  const values = new Map(entries);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const record = {
  id: '00000000-0000-4000-8000-000000000001', symbol: 'AAPL', name: 'Apple', type: 'buy',
  date: '2026-09-01', quantity: 1, price: 100, fee: 0, currency: 'USD',
  createdAt: '2026-09-01T00:00:00Z', fxRateToKRW: 1300, usdKrwRateAtTransaction: 1300,
};

test('only a matching configured development project changes browser keys; production and guest stay compatible', () => {
  const key = 'stock-transactions:user';
  for (const scope of [project(), project(null, { NEXT_PUBLIC_SUPABASE_URL: `https://${production}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }),
    project(projectA, { NEXT_PUBLIC_SUPABASE_URL: '' }), project(projectA, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }),
    project('invalid'), project(projectA, { NEXT_PUBLIC_SUPABASE_URL: `https://${projectB}.supabase.co` })]) {
    assert.equal(scope.key(key), key);
  }
  assert.notEqual(project(projectA).key(key), key);
  assert.notEqual(project(projectA).key(key), project(projectB).key(key));
  assert.equal(project(projectA, { NEXT_PUBLIC_SUPABASE_URL: `https://${projectA}.supabase.co/` }).key(key), project(projectA).key(key));
  assert.equal(project(projectA, { NEXT_PUBLIC_SUPABASE_URL: `https://${projectA.toUpperCase()}.SUPABASE.CO` }).key(key), project(projectA).key(key));
});

test('development transactions and pending retries cannot read or replace old same-user or guest records', () => {
  const a = project(projectA), b = project(projectB);
  const legacy = JSON.stringify([record]);
  const pending = JSON.stringify({ id: record.id, revision: '0', transactions: [record] });
  const originals = [['stock-transactions', legacy], ['stock-transactions:user', legacy],
    ['stock-portfolio', '{unread legacy}'], ['centifolio-pending-transaction:user', pending],
    [b.key('centbloom-pending-transaction:user'), pending]];
  const storage = memoryStorage(originals);
  const portfolio = a.load('src/lib/portfolio-storage.ts');
  const { transactionCache } = a.load('src/features/portfolio/data/local.ts');
  assert.equal(portfolio.loadStoredTransactions(storage, 'user').transactions.length, 0);
  assert.equal(portfolio.loadStoredTransactions(storage).transactions.length, 0);
  const cache = transactionCache(storage, 'user');
  assert.equal(cache.pending(), null);
  cache.stage(JSON.parse(pending));
  assert.equal(cache.pending().id, record.id);
  assert.equal(b.load('src/features/portfolio/data/local.ts').transactionCache(storage, 'other-user').pending(), null);
  cache.confirm([]);
  assert.equal(cache.pending(), null);
  for (const [key, value] of originals) assert.equal(storage.getItem(key), value);
  assert.equal(storage.getItem(a.key('stock-transactions:user')), '[]');
  // Existing guest compatibility remains usable within the selected project only.
  portfolio.saveStoredTransactions(storage, [record]);
  assert.equal(portfolio.loadStoredTransactions(storage, 'new-user').transactions[0].id, record.id);
  assert.equal(project().load('src/lib/portfolio-storage.ts').loadStoredTransactions(storage, 'user').transactions[0].id, record.id);
});

test('development watchlist import skips old brand, guest and other-project records with the same user ID', async () => {
  const a = project(projectA), b = project(projectB);
  const item = { symbol: 'AAPL', name: 'Apple', targetPrice: null, targetCurrency: null, addedAt: '2026-09-01T00:00:00Z' };
  const raw = JSON.stringify({ version: 1, items: [item] });
  const storage = memoryStorage([['centbloom:watchlist:v1:user', raw], ['centifolio:watchlist:v1:user', raw],
    [a.key('centbloom:watchlist:v1:guest'), raw], [b.key('centbloom:watchlist:v1:user'), raw]]);
  const calls = [];
  const client = { rpc(name, args) { calls.push({ name, args }); return { abortSignal() { return Promise.resolve({ data: [], error: null }); } }; } };
  const { accountWatchlistRepository, watchlistStorageKey } = a.load('src/features/watchlist/repository.ts', {
    '@/lib/supabase': { getSupabaseBrowserClient: () => client },
    '@/features/auth/session-request': { runSupabaseRequest: (_client, _userId, request) => request(new AbortController().signal) },
  });
  const repo = accountWatchlistRepository('user', storage);
  const before = [...storage.values];
  await repo.read(new AbortController().signal);
  assert.deepEqual(calls.map(call => call.name), ['read_watchlist']);
  assert.deepEqual([...storage.values], before);
  storage.setItem(watchlistStorageKey('user'), raw);
  await repo.read(new AbortController().signal);
  assert.deepEqual(calls.map(call => call.name), ['read_watchlist', 'commit_watchlist', 'read_watchlist']);
  assert.equal(calls[1].args.operation, 'import');
  for (const [key, value] of before) assert.equal(storage.getItem(key), value);
});

test('login return is claimed only by its own development project and leaves production navigation intact', () => {
  const storage = memoryStorage();
  const plain = project().load('src/features/auth/login-return.ts');
  const a = project(projectA).load('src/features/auth/login-return.ts');
  const b = project(projectB).load('src/features/auth/login-return.ts');
  plain.startLoginReturn(storage, '/portfolio', 1000);
  a.startLoginReturn(storage, '/watchlist', 1000);
  assert.equal(b.takeLoginReturn(storage, 2000), null);
  b.cancelLoginReturn(storage);
  assert.equal(a.takeLoginReturn(storage, 2000), '/watchlist');
  assert.equal(a.takeLoginReturn(storage, 2000), null);
  assert.equal(plain.takeLoginReturn(storage, 2000), '/portfolio');
});

test('recent searches cannot read or overwrite the same user in production or another development project', () => {
  const a = project(projectA), b = project(projectB), plain = project();
  const storage = memoryStorage();
  const repository = scope => scope.load('src/features/market/recent-searches.ts').createRecentSearches(() => storage);
  repository(plain).record('user', { symbol: 'AAPL', name: 'Apple' });
  const original = repository(plain).read('user');
  assert.equal(repository(a).read('user'), null);
  repository(a).record('user', { symbol: 'MSFT', name: 'Microsoft' });
  assert.equal(repository(b).read('user'), null);
  assert.equal(repository(plain).read('user'), original);
  assert.equal(JSON.parse(repository(a).read('user'))[0].symbol, 'MSFT');
});

test('performance history isolates same-user and guest caches across development projects without changing production keys', async () => {
  const a = project(projectA), b = project(projectB), plain = project();
  const history = { revision: 'same-revision', startedAt: '2026-09-01T00:00:00Z', points: [{
    date: '2026-09-01', assetValueKRW: 100, twrIndex: 100, netFlowKRW: 100,
    cumulativeNetFlowKRW: 100, cumulativeProfitKRW: 0,
  }] };
  for (const userId of ['same-user', null]) {
    const baseKey = `centbloom-performance-v2:${userId ?? 'guest'}`;
    const legacyKey = baseKey.replace('centbloom', 'centifolio');
    const original = JSON.stringify(history);
    const storage = memoryStorage([[legacyKey, original]]);
    const repository = scope => browserModule('src/features/performance/repository.ts', {
      '@/lib/project-storage': scope.helper,
      '@/lib/branded-storage': loadTypescript('src/lib/branded-storage.ts'),
      '@/lib/supabase': { getSupabaseBrowserClient: () => null },
      '@/features/auth/session-request': { runSupabaseRequest: () => { throw new Error('Unexpected server access'); } },
    }, { localStorage: storage, AbortSignal });
    const read = scope => repository(scope).readHistory(userId, history.revision, new AbortController().signal);
    assert.equal((await read(plain)).saved.points[0].assetValueKRW, 100);
    assert.equal((await read(a)).saved, null);
    assert.equal(await repository(a).saveHistory(userId, history, [], new AbortController().signal), null);
    assert.equal((await read(a)).saved.points[0].assetValueKRW, 100);
    assert.equal((await read(b)).saved, null);
    assert.equal(storage.getItem(baseKey), null);
    assert.equal(storage.getItem(legacyKey), original);
    assert.ok(storage.getItem(a.key(baseKey)));
    assert.equal(await repository(plain).saveHistory(userId, history, [], new AbortController().signal), null);
    assert.ok(storage.getItem(baseKey));
    assert.equal(storage.getItem(legacyKey), original);
  }
});

test('journal reads and writes stay in the selected project for both account and guest notes', () => {
  const a = project(projectA), b = project(projectB);
  const storage = memoryStorage([['centbloom-journal:v1:user', '{old original}'], ['centbloom-journal:v1:local', '{guest original}']]);
  for (const user of [{ id: 'user' }, null]) {
    const journal = scope => browserModule('src/hooks/useJournal.ts', {
      '@/lib/project-storage': scope.helper,
      '@/lib/branded-storage': loadTypescript('src/lib/branded-storage.ts'),
      '@/hooks/useAuth': { useAuth: () => ({ user, loading: false }) },
      react: { useCallback: callback => callback, useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    }, { localStorage: storage, window: { dispatchEvent() {} }, Event: class {} }).useJournal();
    assert.equal(journal(a).entries.length, 0);
    assert.equal(journal(a).saveEntry({ title: 'Dev note', body: 'Dev only', symbol: 'MSFT', sentiment: '관찰' }), null);
    assert.equal(journal(a).entries.length, 1);
    assert.equal(journal(b).entries.length, 0);
  }
  assert.equal(storage.getItem('centbloom-journal:v1:user'), '{old original}');
  assert.equal(storage.getItem('centbloom-journal:v1:local'), '{guest original}');
});

test('display currency guest fallback and account writes remain within the development project', async () => {
  const a = project(projectA);
  const storage = memoryStorage([['stock-display-currency', 'USD'], ['stock-display-currency:user', 'USD']]);
  const currencies = [];
  let index = 0;
  const { PreferencesProvider } = browserModule('src/features/portfolio/state/preferences.tsx', {
    '@/hooks/useAuth': { useAuth: () => ({ user: { id: 'user' } }) },
    '@/lib/portfolio-storage': a.load('src/lib/portfolio-storage.ts'),
    '../data/preferences': { readDisplayCurrency: async () => null, saveDisplayCurrency: async () => {} },
    react: { createContext: () => ({ Provider: 'preferences' }), useContext() {}, useCallback: callback => callback,
      useEffect: callback => { callback(); }, useRef: value => ({ current: value }),
      useState: value => [value, ++index === 1 ? currency => currencies.push(currency) : () => {}] },
  }, { localStorage: storage });
  const tree = PreferencesProvider({ children: null });
  assert.deepEqual(currencies, ['KRW']);
  tree.props.value.setDisplayCurrency('KRW');
  assert.equal(storage.getItem(a.key('stock-display-currency:user')), 'KRW');
  assert.equal(storage.getItem('stock-display-currency:user'), 'USD');
  assert.equal(storage.getItem('stock-display-currency'), 'USD');
});

test('ledger cross-tab locks and storage events use the same development transaction area', () => {
  const a = project(projectA);
  const listeners = new Map(), locks = [];
  let options, reloads = 0;
  const { LedgerProvider } = browserModule('src/features/portfolio/state/ledger.tsx', {
    '@/hooks/useAuth': { useAuth: () => ({ user: null }) },
    '@/lib/supabase': { getSupabaseBrowserClient: () => null },
    '@/lib/portfolio-storage': a.load('src/lib/portfolio-storage.ts'),
    '../data/ledger-store': { createLedgerStore: input => { options = input; return { start() {}, reload() { reloads++; } }; } },
    '../data/local': { localRepository() {}, transactionCache() {} }, '../data/server': { serverRepository() {} },
    '../model/enrichment': { prepareTransactions() {} },
    react: { createContext: () => ({ Provider: 'ledger' }), useMemo: callback => callback(), useEffect: callback => { callback(); } },
  }, { window: { addEventListener: (name, callback) => listeners.set(name, callback) }, navigator: { locks: { request: key => { locks.push(key); } } } });
  LedgerProvider({ children: null });
  void options.lock(() => {});
  assert.deepEqual(locks, [a.key('centifolio-ledger:guest')]);
  listeners.get('storage')({ key: 'stock-transactions' });
  listeners.get('storage')({ key: project(projectB).key('stock-transactions') });
  assert.equal(reloads, 0);
  listeners.get('storage')({ key: a.key('stock-transactions') });
  assert.equal(reloads, 1);
});
