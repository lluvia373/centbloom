import type { Transaction } from "@/lib/types";
import type { Portfolio, Snapshot, TransactionCommand } from "./types";

export const DEFAULT_PORTFOLIO_ID = "00000000-0000-4000-8000-000000000001";
export const ALL_PORTFOLIOS_ID = "all";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const defaultPortfolio = (): Portfolio => ({
  id: DEFAULT_PORTFOLIO_ID, name: "기본 포트폴리오",
  createdAt: "1970-01-01T00:00:00.000Z", isDefault: true,
});
export function portfolioName(value: string) {
  const name = value.trim();
  if (!name || name.length > 40) throw new Error("포트폴리오 이름은 1~40자로 입력해 주세요.");
  return name;
}
export function normalizeWorkspace<T extends Snapshot>(snapshot: T): T & { portfolios: Portfolio[] } {
  const portfolios = snapshot.portfolios ?? [defaultPortfolio()];
  if (!portfolios.length || portfolios.length > 100) throw new Error("포트폴리오 목록을 확인하지 못했습니다.");
  const ids = new Set<string>();
  for (const item of portfolios) {
    if (!uuid.test(item.id) || ids.has(item.id) || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.isDefault !== "boolean")
      throw new Error("포트폴리오 기록이 올바르지 않습니다.");
    portfolioName(item.name); ids.add(item.id);
  }
  if (portfolios.filter((item) => item.isDefault).length !== 1) throw new Error("기본 포트폴리오 연결을 확인해 주세요.");
  const fallback = portfolios.find((item) => item.isDefault)?.id ?? portfolios[0].id;
  const transactions = snapshot.transactions.map((tx) => {
    const portfolioId = tx.portfolioId ?? fallback;
    if (!ids.has(portfolioId)) throw new Error("거래에 연결된 포트폴리오를 찾지 못했습니다.");
    return tx.portfolioId ? tx : { ...tx, portfolioId };
  });
  return { ...snapshot, portfolios, transactions };
}

export function changePortfolios(portfolios: Portfolio[], transactions: Transaction[], command: TransactionCommand) {
  let next = portfolios;
  let records = transactions;
  if (command.type === "createPortfolio") {
    if (portfolios.length >= 100) throw new Error("포트폴리오는 최대 100개까지 만들 수 있습니다.");
    if (portfolios.some((p) => p.id === command.portfolio.id)) throw new Error("이미 존재하는 포트폴리오입니다.");
    next = [...portfolios, { ...command.portfolio, name: portfolioName(command.portfolio.name), isDefault: false }];
  } else if (command.type === "renamePortfolio") {
    if (!portfolios.some((p) => p.id === command.id)) throw new Error("포트폴리오를 찾지 못했습니다.");
    next = portfolios.map((p) => p.id === command.id ? { ...p, name: portfolioName(command.name) } : p);
  } else if (command.type === "deletePortfolio") {
    if (!portfolios.some((p) => p.id === command.id)) throw new Error("포트폴리오를 찾지 못했습니다.");
    if (portfolios.length === 1) throw new Error("포트폴리오는 하나 이상 유지해 주세요.");
    const hasTrades = transactions.some((tx) => tx.portfolioId === command.id);
    if (hasTrades && (!command.targetPortfolioId || command.targetPortfolioId === command.id || !portfolios.some((p) => p.id === command.targetPortfolioId)))
      throw new Error("거래를 옮길 다른 포트폴리오를 선택해 주세요.");
    // Freeze both histories: a destination's old sell must not consume the incoming pool.
    records = transactions.map((tx) => hasTrades && (tx.portfolioId === command.id || tx.portfolioId === command.targetPortfolioId)
      ? { ...tx, portfolioId: command.targetPortfolioId!, costBasisPath: [tx.portfolioId!, ...(tx.costBasisPath ?? [])] } : tx);
    next = portfolios.filter((p) => p.id !== command.id);
    if (!next.some((p) => p.isDefault)) next = next.map((p, index) => ({ ...p, isDefault: index === 0 }));
  } else if (command.type === "import" && command.portfolios) {
    next = command.mode === "replace" ? command.portfolios : [...portfolios, ...command.portfolios.filter((item) => !portfolios.some((p) => p.id === item.id))];
    const defaultId = next.find((item) => item.isDefault)?.id ?? next[0]?.id;
    next = next.map((item) => ({ ...item, isDefault: item.id === defaultId }));
  }
  return { portfolios: next, transactions: records };
}
