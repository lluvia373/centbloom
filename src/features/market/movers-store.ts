import type { MoverKind, MoversResult } from "./movers-model";
export interface MoversView {
  data?: MoversResult;
  loading: boolean;
  failed: boolean;
}
const empty: MoversView = { loading: true, failed: false };
/** Shared per-list requests, one polling timer; only subscribed lists refresh. */
export function createMoversStore(
  load: (kind: MoverKind, signal: AbortSignal) => Promise<MoversResult>,
  interval = 60_000,
) {
  const entries = new Map<
    MoverKind,
    {
      view: MoversView;
      listeners: Set<() => void>;
      controller?: AbortController;
    }
  >();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = true;
  function schedule() {
    clearTimeout(timer);
    if (visible && entries.size)
      timer = setTimeout(() => {
        for (const kind of entries.keys()) void refresh(kind);
        schedule();
      }, interval);
  }
  async function refresh(kind: MoverKind) {
    const entry = entries.get(kind);
    if (!entry || entry.controller || !visible) return;
    const controller = new AbortController();
    entry.controller = controller;
    entry.view = { ...entry.view, loading: true };
    entry.listeners.forEach((fn) => fn());
    try {
      const data = await load(kind, controller.signal);
      if (!controller.signal.aborted && entries.get(kind) === entry)
        entry.view = { data, loading: false, failed: false };
    } catch {
      if (!controller.signal.aborted && entries.get(kind) === entry)
        entry.view = { ...entry.view, loading: false, failed: true };
    } finally {
      if (entry.controller === controller) entry.controller = undefined;
      if (!controller.signal.aborted && entries.get(kind) === entry)
        entry.listeners.forEach((fn) => fn());
    }
  }
  return {
    empty,
    refresh,
    snapshot: (kind: MoverKind) => entries.get(kind)?.view ?? empty,
    subscribe(kind: MoverKind, listener: () => void) {
      let entry = entries.get(kind);
      if (!entry) {
        entry = { view: empty, listeners: new Set() };
        entries.set(kind, entry);
      }
      entry.listeners.add(listener);
      void refresh(kind);
      schedule();
      return () => {
        entry.listeners.delete(listener);
        if (!entry.listeners.size) {
          entries.delete(kind);
          entry.controller?.abort();
        }
        schedule();
      };
    },
    setVisible(value: boolean) {
      visible = value;
      if (!value)
        for (const entry of entries.values()) {
          entry.controller?.abort();
          entry.controller = undefined;
        }
      else for (const kind of entries.keys()) void refresh(kind);
      schedule();
    },
  };
}
