"use client";

import { usePreferences } from "@/hooks/usePortfolio";

export function CurrencySettings() {
  const { displayCurrency, setDisplayCurrency, preferenceError } = usePreferences();
  return (
    <div className="border-t border-cf-line py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="display-currency" className="text-cf-label text-cf-muted">표시 통화</label>
        <select
          id="display-currency"
          value={displayCurrency}
          onChange={(event) => setDisplayCurrency(event.target.value === "USD" ? "USD" : "KRW")}
          aria-describedby={preferenceError ? "currency-settings-error" : undefined}
          className="min-h-8 rounded-cf-control border border-cf-line bg-cf-surface px-2 text-cf-input text-cf-ink pointer-coarse:min-h-11"
        >
          <option value="KRW">원화 KRW</option>
          <option value="USD">달러 USD</option>
        </select>
      </div>
      {preferenceError && <div className="mt-2 flex flex-wrap items-center gap-2">
        <p id="currency-settings-error" role="alert" className="text-cf-caption text-cf-negative">{preferenceError}</p>
        <button type="button" onClick={() => setDisplayCurrency(displayCurrency)} className="min-h-8 rounded-cf-control px-2 py-1 text-cf-label underline pointer-coarse:min-h-11">다시 저장</button>
      </div>}
    </div>
  );
}
