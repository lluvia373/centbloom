import type { ReactNode } from "react";
import { Info } from "lucide-react";

/** Native disclosure works with touch and keyboard without a separate listener. */
export function CalculationHelp({ label, children }: { label: string; children: ReactNode }) {
  return <details className="calculation-help">
    <summary aria-label={label + " 계산 기준"}><Info size={16} aria-hidden="true" /></summary>
    <p>{children}</p>
  </details>;
}
