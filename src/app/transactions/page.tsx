import { AddTransactionLink, PageHeading, PortfolioMode } from "@/components/Header";
import { TransactionHistory } from "@/features/portfolio/ui/TransactionHistory";

export default function TransactionsPage() {
  return <>
    <PageHeading title="거래내역"><AddTransactionLink /></PageHeading>
    <PortfolioMode />
    <TransactionHistory />
  </>;
}
