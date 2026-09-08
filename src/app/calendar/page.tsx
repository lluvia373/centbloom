import { AdSlot } from "@/features/ads";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CalendarBrowser } from "@/features/calendar/CalendarBrowser";
import styles from "@/features/calendar/calendar.module.css";
export const metadata: Metadata = {title:"증시 캘린더 | Centbloom"};
export default async function CalendarPage({searchParams}: {searchParams:Promise<{event?:string|string[]}>}) {
  await connection();
  const {event} = await searchParams;
  // Preserve links created before event details became a separate page.
  if (typeof event === "string" && /^[\w:-]{1,150}$/.test(event)) redirect("/calendar/"+encodeURIComponent(event));
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return <div className={styles.page}>
    <div className={styles.heading}><h1>증시 캘린더</h1><span>KST</span></div>
    <CalendarBrowser now={now}/>
    <AdSlot placement="calendar-bottom" />
  </div>;
}
