// Persistent local/server process. Keys come from environment; never print credentials.
// node --env-file=.env.local scripts/sync-economic-calendar.mjs --watch
const base = process.env.CALENDAR_SYNC_BASE_URL ?? "http://localhost:3000";
const secret = process.env.CALENDAR_SYNC_SECRET;
if (!secret) throw new Error("Set CALENDAR_SYNC_SECRET in the process environment");
const monthArg = process.argv.find(arg=>/^--month=/.test(arg))?.slice(8);
if (monthArg && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthArg)) throw new Error("Invalid --month");
async function sync() {
 const today = new Date();
 // Revisit last/current/next month for late revisions and upcoming schedules.
 const months = monthArg ? [monthArg] : [-1,0,1].map(offset => {
   const d = new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+offset,1));
   return d.toISOString().slice(0,7);
 });
 for (const month of months) {
   try {
     const response = await fetch(new URL("/api/calendar/sync?month="+month,base),{
       method:"POST",headers:{Authorization:"Bearer "+secret},signal:AbortSignal.timeout(60000),
     });
     if (!response.ok) throw new Error("HTTP "+response.status);
     const result=await response.json();console.log(month+": saved "+result.saved);
   } catch { console.error(month+": sync failed; retained stored history"); if (!process.argv.includes("--watch")) process.exitCode=1; }
 }
}
do {
 await sync();
 if (!process.argv.includes("--watch")) break;
 await new Promise(resolve=>setTimeout(resolve,300000));
} while(true);
