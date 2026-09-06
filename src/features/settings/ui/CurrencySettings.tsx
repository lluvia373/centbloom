"use client";

import { usePreferences } from "@/hooks/usePortfolio";

export function CurrencySettings() {
  const { displayCurrency, setDisplayCurrency, preferenceError } = usePreferences();

  return (
    <section
      aria-labelledby="currency-settings-title"
      className="rounded-cf-card border border-cf-line bg-cf-surface p-4 sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="currency-settings-title" className="text-cf-label font-medium">
          표시 통화
        </h2>
        <div
          className="inline-flex flex-wrap gap-1 rounded-cf-control bg-cf-soft p-1"
          role="group"
          aria-labelledby="currency-settings-title"
        >
          {([
            ["KRW", "원화"],
            ["USD", "달러"],
          ] as const).map(([currency, label]) => (
            <button
              type="button"
              key={currency}
              aria-pressed={displayCurrency === currency}
              onClick={() => setDisplayCurrency(currency)}
              className={`min-h-11 rounded-cf-control px-3 py-2 text-cf-label font-medium transition-colors ${displayCurrency === currency ? "bg-cf-action text-cf-surface" : "text-cf-muted hover:bg-cf-surface hover:text-cf-ink"}`}
            >
              {label} {currency}
            </button>
          ))}
        </div>
      </div>
      {preferenceError && (
        <p role="alert" className="mt-3 text-cf-caption text-cf-negative">
          {preferenceError}
        </p>
      )}
    </section>
  );
}
