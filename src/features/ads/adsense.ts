export type AdSenseConfig = { client: string; slot: string };

export function readAdSenseConfig(
  enabled: string | undefined,
  client: string | undefined,
  slot: string | undefined,
): AdSenseConfig | null {
  if (enabled !== "true" || !client || !slot) return null;
  if (!/^ca-pub-\d{16}$/.test(client) || !/^\d{1,20}$/.test(slot)) return null;
  return { client, slot };
}

const requested = new WeakSet<HTMLElement>();

export function requestAdOnce(
  element: HTMLElement,
  queue: { push: (request: Record<string, never>) => unknown },
): "waiting" | "requested" | "failed" {
  if (requested.has(element) || element.getAttribute("data-adsbygoogle-status")) {
    return "requested";
  }
  if (!element.isConnected || element.getBoundingClientRect().width <= 0) {
    return "waiting";
  }
  // Mark before calling the vendor, including failures, to avoid repeated requests.
  requested.add(element);
  try {
    queue.push({});
    return "requested";
  } catch {
    return "failed";
  }
}
