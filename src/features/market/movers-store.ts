import { createPollingStore, type PollingView } from "@/shared/async/polling-store";
import { MOVERS_REFRESH_MS, type MoverKind, type MoversResult } from "./movers-model";
import { compareMoverRanks, type RankedMoversResult } from "./mover-ranks";
export type MoversView = PollingView<RankedMoversResult>;
export function createMoversStore(
  load: (kind: MoverKind, signal: AbortSignal) => Promise<MoversResult>,
  interval = MOVERS_REFRESH_MS,
) {
  const store = createPollingStore<MoverKind, RankedMoversResult>(
    async (kind, signal): Promise<RankedMoversResult> => {
      const result = await load(kind, signal);
      if (result.kind !== kind) throw new Error("Mismatched movers list");
      return compareMoverRanks(result, store.snapshot(kind).data);
    },
    interval,
  );
  return store;
}
