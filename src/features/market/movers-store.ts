import { createPollingStore, type PollingView } from "@/shared/async/polling-store";
import type { MoverKind, MoversResult } from "./movers-model";
export type MoversView = PollingView<MoversResult>;
export function createMoversStore(
  load: (kind: MoverKind, signal: AbortSignal) => Promise<MoversResult>,
  interval = 60_000,
) {
  return createPollingStore(load, interval);
}
