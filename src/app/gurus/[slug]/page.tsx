import Link from "next/link";
import { notFound } from "next/navigation";
import { guruCatalog } from "@/features/gurus/catalog";
import { reportedChanges } from "@/features/gurus/model";
import { FollowGuru } from "@/features/notifications/FollowGuru";
import styles from "@/features/gurus/Guru.module.css";

export default async function GuruPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{filing?:string}> }) {
  const { slug } = await params;
  const guru = guruCatalog.find(g => g.slug === slug);
  if (!guru) notFound();
  const query = await searchParams;
  const filing = guru.archive.versions.find(f => f.accession === (query.filing ?? guru.archive.activeAccession));
  if (!filing) notFound();
  const previous = [...guru.archive.versions].filter(f=>f.period<filing.period).sort((a,b)=>b.period.localeCompare(a.period)||b.revision-a.revision)[0];
  const changes = previous ? reportedChanges(previous,filing) : null;
  const number = (n: number) => n.toLocaleString("ko-KR");
  return <div className={styles.page}>
    <Link href="/gurus" className={styles.control}>구루 목록</Link>
    <header className={styles.heading}><div><h1>{guru.name}</h1><p className={styles.muted}>{guru.manager}</p></div><FollowGuru guruId={slug} /></header>
    <section className={styles.panel} aria-labelledby="guru-holdings">
      <div className={styles.heading}><h2 id="guru-holdings">분기 말 보유 내역</h2><a className={styles.control} href={filing.tableSource}>SEC 원문</a></div>
      <p className={styles.muted}>{filing.period} 기준 · {filing.filedDate} 제출 · USD</p>
      <p className={styles.muted}>과거 공시이며 실제 매매 내역이 아닙니다. 비중은 이 공시의 보고 금액 기준입니다.</p>
      <ul className={styles.list}>{[...filing.holdings].sort((a,b) => b.valueUsd-a.valueUsd).map(row => <li className={styles.row} key={row.rowId}>
        <div><p>{row.issuer}</p><p className={styles.muted}>{row.shareClass} · CUSIP {row.cusip}</p><p className={styles.muted}>{number(row.shares)}주 · 티커 연결 미확인</p></div>
        <div className={styles.numbers}><p>${number(row.valueUsd)}</p><p>{(row.valueUsd / filing.expectedValueUsd * 100).toFixed(2)}%</p></div>
      </li>)}</ul>
    </section>
    <section className={styles.section} aria-labelledby="guru-changes"><h2 id="guru-changes">보유 변화</h2>
      {changes ? <><p className={styles.muted}>{previous.period} → {filing.period} 보고 수량 비교 · 실제 매매 수량이 아니며 주식분할은 조정하지 않았습니다.</p>
        {changes.length ? <ul className={`${styles.panel} ${styles.list}`}>{changes.map(change=><li className={styles.row} key={change.id}>
          <div><p>{change.row.issuer}</p><p className={styles.muted}>{change.row.shareClass}</p></div>
          <p className={styles.numbers}>{change.previous===null?"이전 보고 없음":`${number(change.previous)}주`} → {change.current===null?"이번 보고 없음":`${number(change.current)}주`}</p>
        </li>)}</ul>:<p className={styles.muted}>보고 수량의 변화가 없습니다.</p>}</>
        :<p className={styles.muted}>비교할 이전 분기 공시가 없습니다.</p>}
    </section>
    <section className={styles.section} aria-labelledby="guru-filings"><h2 id="guru-filings">공시 이력</h2>
      <ul className={styles.list}>{guru.archive.versions.map(version => <li className={styles.row} key={version.accession}>
        <div><Link className={styles.control} href={`/gurus/${slug}?filing=${version.accession}`} aria-current={filing.accession===version.accession?"page":undefined}>{version.period} 기준 · {version.kind === "original" ? "최초 보고" : "정정 보고"}</Link><p className={styles.muted}>제출 {version.filedDate} · 정확한 공개 시각 미확인</p></div><a className={styles.control} href={version.source}>SEC 원문</a>
      </li>)}</ul>
    </section>
  </div>;
}
