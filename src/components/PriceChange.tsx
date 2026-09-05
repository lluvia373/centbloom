import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";

interface PriceChangeProps {
  value: number;
  percent?: number;
  currency?: string;
  size?: "sm" | "md" | "lg";
  showPercent?: boolean;
  className?: string;
}

export function PriceChange({
  value,
  percent,
  currency,
  size = "md",
  showPercent = true,
  className,
}: PriceChangeProps) {
  const isPositive = value >= 0;
  const sizeClass = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg font-semibold",
  }[size];
  const amount = currency
    ? formatCurrency(Math.abs(value), currency)
    : Math.abs(value).toFixed(2);

  return (
    <span
      className={cn(
        sizeClass,
        value === 0
          ? "text-[#727680]"
          : isPositive
            ? "text-[#16856b]"
            : "text-[#d65353]",
        className,
      )}
    >
      {value === 0 ? "" : isPositive ? "+" : "-"}
      {amount}
      {showPercent && percent !== undefined && (
        <span className="ml-1 opacity-100">({formatPercent(percent)})</span>
      )}
    </span>
  );
}
