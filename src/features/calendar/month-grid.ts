import { validMonth } from "./model";
export function monthCells(month: string): (string | null)[] {
  if (!validMonth(month)) return [];
  const first = new Date(month + "-01T00:00:00Z");
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let day = 1; day <= last.getUTCDate(); day++) cells.push(month + "-" + String(day).padStart(2, "0"));
  while (cells.length % 7) cells.push(null);
  return cells;
}
