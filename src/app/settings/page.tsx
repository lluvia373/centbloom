import { TransactionBackupPanel } from "@/components/TransactionBackupPanel";
import { AccountSettings } from "@/features/settings/ui/AccountSettings";
import { CurrencySettings } from "@/features/settings/ui/CurrencySettings";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6 text-cf-ink">
      <h1 className="text-cf-title font-semibold">설정</h1>
      <div className="space-y-4">
        <AccountSettings />
        <CurrencySettings />
        <TransactionBackupPanel />
      </div>
    </div>
  );
}
