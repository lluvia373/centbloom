import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LedgerProvider } from "@/features/portfolio/state/ledger";
import { PortfolioSwitcher } from "@/features/portfolio/ui/PortfolioSwitcher";
import { PriceAlertEditor } from "@/features/watchlist/PriceAlertEditor";
import "@/features/portfolio/ui/PortfolioSwitcher.module.css";

function Fixture() {
  const [saved, setSaved] = useState(false);
  return <main>
    <p className="qa-note">화면 검사 전용 · 계정·거래·알림 저장 없음</p>
    <div className="page-heading"><div className="page-heading-title"><h1>보유자산</h1><PortfolioSwitcher /></div></div>
    <section className="qa-card"><h2>거래 기록</h2><PortfolioSwitcher destination /></section>
    <section className="qa-card"><h2>관심종목</h2>
      <PriceAlertEditor symbol="AAPL" currency="USD" rules={[]} pending={false}
        onSave={async () => null} onClose={() => setSaved(true)} />
      {saved && <p role="status">입력 동작 확인 · 저장하지 않음</p>}
    </section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<LedgerProvider><Fixture /></LedgerProvider>);
