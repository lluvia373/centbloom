"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { trendPoints, type Release } from "./release";
import { kstDate } from "./model";
import styles from "./calendar.module.css";
export function ReleaseTrend({records,event,metricKey,unit}: {records:Release[];event:Release;metricKey:string;unit:string}) {
  const points = trendPoints(records,event,metricKey).map(point=>({...point,date:kstDate(point.at)}));
  if (points.filter(point=>point.actual!==null).length<2) return <p className={styles.empty}>같은 단위의 발표 결과가 2건 이상 쌓이면 추이를 표시해요.</p>;
  return <figure className={styles.trend} aria-label="실제치와 예상치 추이">
    <figcaption>실제치 · 예상치{unit ? " ("+unit+")" : ""}</figcaption>
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{top:12,right:16,bottom:0,left:0}} accessibilityLayer>
        <CartesianGrid stroke="var(--cf-color-line)" vertical={false}/>
        <XAxis dataKey="date" tickFormatter={value=>value.slice(2)} minTickGap={32}/>
        <YAxis width={64} domain={["auto","auto"]}/>
        <Tooltip labelFormatter={value=>String(value)+" · KST"}/>
        <Line type="linear" dataKey="actual" name="실제치" stroke="var(--cf-color-ink)" strokeWidth={2} dot={{r:3}} isAnimationActive={false} connectNulls={false}/>
        <Line type="linear" dataKey="forecast" name="예상치" stroke="var(--cf-color-muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer>
  </figure>;
}
