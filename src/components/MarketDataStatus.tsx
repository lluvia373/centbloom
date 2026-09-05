"use client";

import { AlertTriangle } from "lucide-react";

interface MarketDataStatusProps {
  lastUpdatedAt: number | null;
  error: string | null;
  loading: boolean;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function MarketDataStatus({
  lastUpdatedAt,
  error,
  loading,
}: MarketDataStatusProps) {
  if (loading && !lastUpdatedAt && !error) {
    return <p className="text-xs text-[#727680]">시세 불러오는 중...</p>;
  }

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[#727680]">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>
          시세 업데이트 실패
          {lastUpdatedAt ? ` · ${formatTime(lastUpdatedAt)} 데이터 표시 중` : ""}
        </span>
      </div>
    );
  }

  if (!lastUpdatedAt) {
    return <p className="text-xs text-[#727680]">시세 대기 중</p>;
  }

  return (
    <p className="text-xs text-[#727680]" title="화면을 보고 있을 때 30초마다 자동 갱신됩니다.">
      {formatTime(lastUpdatedAt)} 기준
    </p>
  );
}
