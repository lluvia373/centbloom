import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getGuruDetail } from "@/features/gurus/detail-repository";
import { GuruHoldings, filingQuarter } from "@/features/gurus/GuruHoldings";
import { GuruQuarterSelect } from "@/features/gurus/GuruQuarterSelect";
import { FollowGuru } from "@/features/notifications/FollowGuru";
import styles from "@/features/gurus/Guru.module.css";

export default async function GuruPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{filing?:string; holdingQuery?: string; holdingLimit?: string}> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const detail = await getGuruDetail(slug, query.filing);
  if (!detail) notFound();
  const { guru, filing, previous, versions } = detail;
  return <div className={styles.page}>
    <Link href="/gurus" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" />구루 목록</Link>
    <header className={styles.detailHeading}><div><h1>{guru.name}</h1>{guru.manager !== guru.name && <p className={styles.subtitle}>{guru.manager}</p>}</div><FollowGuru guruId={slug} /></header>
    <GuruQuarterSelect slug={slug} selected={filing.accession} options={versions.map(version => ({
      accession: version.accession,
      label: `${filingQuarter(version.period)} · ${version.kind === "original" ? "최초 보고" : `정정 ${version.revision}`} · ${version.filedDate} 제출`,
    }))} />
    <section className={styles.filingSummary} aria-label="선택한 공시 정보">
      <dl className={styles.filingFacts}>
        <div className={styles.totalValue}><dt>공시 금액 · USD</dt><dd>${filing.expectedValueUsd.toLocaleString("ko-KR")}</dd></div>
        <div><dt>보유 기준일</dt><dd>{filing.period}</dd></div>
        <div><dt>제출일</dt><dd>{filing.filedDate}</dd></div>
      </dl>
      <div className={styles.sourceLinks}><a href={filing.source}>SEC 공시<ArrowUpRight size={14} aria-hidden="true" /></a><a href={filing.tableSource}>보유 내역 원문<ArrowUpRight size={14} aria-hidden="true" /></a></div>
      <p className={styles.tableNote}>과거 공시이며 현재 보유 내역과 다를 수 있습니다. 비중은 이 공시의 보고 금액 기준입니다.{filing.publicAt ? "" : " 정확한 공개 시각 미확인."}</p>
      {(filing.disclosureScope?.confidentialOmitted || filing.disclosureScope?.reportType === "combination") && <p className={styles.tableNote}>
        {filing.disclosureScope.confidentialOmitted ? "비공개 종목은 제외된 공개 보유 내역입니다." : ""}
        {filing.disclosureScope.reportType === "combination" ? " 다른 운용사가 별도 보고한 내역은 제외됩니다." : ""}
      </p>}
      {guru.sourceState.issue && <p className={styles.sourceIssue}>{guru.sourceState.issue}</p>}
      {guru.sourceState.checkedAt && <p className={styles.tableNote}>자료 확인 {guru.sourceState.checkedAt.slice(0, 10)}</p>}
    </section>
    <GuruHoldings filing={filing} previous={previous} holdingsQuery={query.holdingQuery} holdingsLimit={query.holdingLimit} pendingCorrection={guru.sourceState.pendingPeriods?.some(period => period === filing.period || period === previous?.period)} />
  </div>;
}
