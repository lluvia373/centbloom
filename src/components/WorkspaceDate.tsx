"use client";
import { useSyncExternalStore } from "react";
import { CalendarDays } from "lucide-react";
const formatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long",
  timeZone: "Asia/Seoul",
});
function subscribe(listener: () => void) {
  const timer = window.setInterval(listener, 60_000);
  return () => window.clearInterval(timer);
}
function today() {
  return formatter.format(new Date());
}
export function WorkspaceDate() {
  const date = useSyncExternalStore(subscribe, today, () => "");
  return (
    <span className="page-date">
      <CalendarDays size={13} />
      {date}
    </span>
  );
}
