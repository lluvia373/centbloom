import { AddTransactionLink, PageHeading } from "@/components/Header";
import { TransactionHistory } from "@/features/portfolio/ui/TransactionHistory";
import { PortfolioSwitcher } from "@/features/portfolio/ui/PortfolioSwitcher";
import { StorageNotice } from "@/components/StorageNotice";

export default function TransactionsPage() {
  return <>
    <PageHeading title="거래내역" titleAction={<PortfolioSwitcher />}><AddTransactionLink /></PageHeading>
    <StorageNotice placement="inline" />
    <TransactionHistory />
  </>;
}
