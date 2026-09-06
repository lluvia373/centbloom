import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ReleasePage } from "@/features/calendar/ReleasePage";
export const metadata:Metadata={title:"발표 상세 | Centifolio"};
export default async function EventPage({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<{from?:string|string[]}>}) {
  await connection();
  const [{id},{from}]=await Promise.all([params,searchParams]);
  if (!/^[\w:-]{1,150}$/.test(id)) notFound();
  // eslint-disable-next-line react-hooks/purity
  const now=Date.now();
  return <ReleasePage id={id} now={now} from={typeof from==="string" ? from : undefined}/>;
}
