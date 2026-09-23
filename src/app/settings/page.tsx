import { TransactionBackupPanel } from "@/components/TransactionBackupPanel";
import { AccountSettings } from "@/features/settings/ui/AccountSettings";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6 text-cf-ink">
      <h1 className="text-cf-title font-semibold">계정 설정</h1>
      <AccountSettings />
      <Link href="/notifications" className="button-secondary">알림 보기</Link>
      <details>
        <summary className="cursor-pointer text-cf-label font-medium">데이터 관리</summary>
        <div className="mt-3"><TransactionBackupPanel /></div>
      </details>
    </div>
  );
}
