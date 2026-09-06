"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { companyLogo } from "@/lib/company-logos";

export function AssetAvatar({
  symbol,
  small = false,
  logoUrl,
}: {
  symbol: string;
  small?: boolean;
  logoUrl?: string;
}) {
  const source = companyLogo(symbol, logoUrl);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showLogo = source !== null && source !== failedSource;
  return (
    <span
      className={`asset-avatar ${showLogo ? "asset-company-logo" : ""} ${small ? "asset-avatar-small" : ""}`}
      aria-hidden="true"
    >
      {showLogo ? <Image src={source} alt="" width={32} height={32} unoptimized
        className="h-full w-full object-contain" onError={() => setFailedSource(source)} />
        : <span className="text-xs">{symbol.slice(0, 2)}</span>}
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
