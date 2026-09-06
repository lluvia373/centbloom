"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight, Building2 } from "lucide-react";
import { companyLogoSources } from "@/lib/company-logos";

export function AssetAvatar({
  symbol,
  small = false,
  logoUrl,
}: {
  symbol: string;
  small?: boolean;
  logoUrl?: string;
}) {
  const sources = companyLogoSources(symbol, logoUrl);
  // Reset failures when a reused row changes security or receives a new provider URL.
  return <CompanyMark key={JSON.stringify([symbol, sources])} sources={sources} small={small} />;
}

function CompanyMark({ sources, small }: { sources: string[]; small: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const source = sources.find(candidate => !failed.includes(candidate));
  return (
    <span className={`asset-avatar ${small ? "asset-avatar-small" : ""}`} aria-hidden="true">
      {source ? (
        <Image key={source} src={source} alt="" width={32} height={32} unoptimized
          loading="lazy" referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          onError={() => setFailed(previous => previous.includes(source) ? previous : [...previous, source])} />
      ) : <Building2 size={small ? 16 : 19} strokeWidth={1.6} />}
    </span>
  );
}

export function EmptyPortfolio({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`empty-portfolio ${compact ? "compact" : ""}`}>
      <span className="empty-icon">
        <ArrowUpRight size={27} />
      </span>
      <h3>보유종목 없음</h3>


    </div>
  );
}
