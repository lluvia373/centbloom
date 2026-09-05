/** Shared execution per immutable input key; the final subscriber owns cancellation. */
export function createSharedResource<I, R>(
  load: (input: I, signal: AbortSignal) => Promise<R>,
  empty: R,
  interval = 60_000,
) {
  type State = { value: R; loading: boolean; error: string | null };
  type Entry = {
    input: I;
    state: State;
    listeners: Set<() => void>;
    controller?: AbortController;
    timer?: ReturnType<typeof setTimeout>;
  };
  const entries = new Map<string, Entry>();
  const initial: State = { value: empty, loading: true, error: null };
  const emit = (entry: Entry) =>
    entry.listeners.forEach((listener) => listener());
  const run = async (entry: Entry) => {
    if (entry.controller || !entry.listeners.size) return;
    const controller = new AbortController();
    entry.controller = controller;
    entry.state = { ...entry.state, loading: true, error: null };
    emit(entry);
    try {
      const value = await load(entry.input, controller.signal);
      if (!controller.signal.aborted)
        entry.state = { value, loading: false, error: null };
    } catch (error) {
      if (!controller.signal.aborted)
        entry.state = {
          ...entry.state,
          loading: false,
          error: error instanceof Error ? error.message : "불러오기 실패",
        };
    } finally {
      if (entry.controller === controller) {
        entry.controller = undefined;
        emit(entry);
        if (entry.listeners.size)
          entry.timer = setTimeout(() => void run(entry), interval);
      }
    }
  };
  return {
    snapshot(key: string) {
      return entries.get(key)?.state ?? initial;
    },
    initial,
    subscribe(key: string, input: I, listener: () => void) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { input, state: initial, listeners: new Set() };
        entries.set(key, entry);
      }
      entry.listeners.add(listener);
      if (entry.listeners.size === 1 && !entry.timer) void run(entry);
      const owned = entry;
      return () => {
        owned.listeners.delete(listener);
        if (!owned.listeners.size) {
          clearTimeout(owned.timer);
          owned.controller?.abort();
          entries.delete(key);
        }
      };
    },
  };
}
