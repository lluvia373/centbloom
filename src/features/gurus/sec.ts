import { SaxesParser } from "saxes";
import { validateFiling, type GuruFiling, type GuruHolding } from "./model";

export interface SecFilingMetadata {
  cik: string;
  accession: string;
  form: "13F-HR" | "13F-HR/A";
  reportDate: string;
  filingDate: string;
  acceptanceDateTime: string;
  primaryDocument: string;
  source: string;
  primaryDocumentUrl: string;
  directoryIndexUrl: string;
}

const COVER_NAMESPACE = "http://www.sec.gov/edgar/thirteenffiler";
const COMMON_NAMESPACE = "http://www.sec.gov/edgar/common";
const TABLE_NAMESPACE = "http://www.sec.gov/edgar/document/thirteenf/informationtable";
// Large institutional reports (e.g. Citadel) exceed 10,000 public positions.
// Bounded offline parsing, never performed during a visitor request.
const MAX_XML_BYTES = 32 * 1024 * 1024;
const MAX_ROWS = 50_000;
const fail = (message: string): never => { throw new Error(message); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("SEC 응답 구조를 확인해 주세요.");
  return value as Record<string, unknown>;
};
const string = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) return fail("SEC 필수 문자열이 없습니다.");
  return value.trim();
};

export function normalizeSecCik(value: string | number): string {
  const raw = String(value);
  if (!/^\d{1,10}$/.test(raw) || Number(raw) === 0) return fail("SEC 운용사 CIK를 확인해 주세요.");
  return raw.padStart(10, "0");
}

function accessionNumber(value: unknown): string {
  const accession = string(value);
  if (!/^\d{10}-\d{2}-\d{6}$/.test(accession)) return fail("SEC 공시 접수번호를 확인해 주세요.");
  return accession;
}

function calendarDate(value: unknown): string {
  const raw = string(value);
  const date = /^\d{2}-\d{2}-\d{4}$/.test(raw) ? `${raw.slice(6)}-${raw.slice(0, 2)}-${raw.slice(3, 5)}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return fail("SEC 공시 날짜가 유효하지 않습니다.");
  return date;
}

/** Build only exact SEC archive URLs; never resolve arbitrary filenames or redirects. */
export function secArchiveUrl(cik: string, accession: string, filename: string): string {
  const canonicalCik = normalizeSecCik(cik);
  accessionNumber(accession);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(filename) || filename.includes(".."))
    return fail("SEC 원문 파일 이름을 확인해 주세요.");
  return `https://www.sec.gov/Archives/edgar/data/${Number(canonicalCik)}/${accession.replaceAll("-", "")}/${filename}`;
}

function metadataFor(row: Record<string, unknown>, cik: string): SecFilingMetadata {
  const accession = accessionNumber(row.accessionNumber);
  const form = row.form;
  if (form !== "13F-HR" && form !== "13F-HR/A") return fail("지원하는 13F 보유 공시가 아닙니다.");
  const reportDate = calendarDate(row.reportDate), filingDate = calendarDate(row.filingDate);
  if (!/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(reportDate) || filingDate < reportDate ||
    accession.slice(11, 13) !== filingDate.slice(2, 4)) return fail("SEC 접수번호·보고 분기·제출일이 일치하지 않습니다.");
  const acceptanceDateTime = string(row.acceptanceDateTime);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(acceptanceDateTime) ||
    !Number.isFinite(Date.parse(acceptanceDateTime)) ||
    Math.abs(Date.parse(acceptanceDateTime) - Date.parse(`${filingDate}T00:00:00Z`)) > 2 * 86400_000)
    return fail("SEC 접수 시각을 확인해 주세요.");
  // Submissions may name the SEC stylesheet view; always fetch its raw XML sibling.
  const primaryDocument = string(row.primaryDocument).replace(/^xslForm13F_X0[12]\//, "");
  if (!/\.xml$/i.test(primaryDocument)) return fail("원본 13F XML 표지가 필요합니다.");
  return {
    cik, accession, form, reportDate, filingDate, acceptanceDateTime, primaryDocument,
    source: secArchiveUrl(cik, accession, `${accession}-index.html`),
    primaryDocumentUrl: secArchiveUrl(cik, accession, primaryDocument),
    directoryIndexUrl: secArchiveUrl(cik, accession, "index.json"),
  };
}

/** Recent submissions or a historical submissions JSON page. No requests or clock reads. */
export function discoverSecFilings(
  data: unknown, cik: string, { limit = 32, after }: { limit?: number; after?: string } = {},
): SecFilingMetadata[] {
  const canonicalCik = normalizeSecCik(cik), body = record(data);
  if (body.cik !== undefined && normalizeSecCik(string(String(body.cik))) !== canonicalCik)
    return fail("SEC 조회 결과의 운용사가 다릅니다.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail("SEC 조회 범위는 1~200개여야 합니다.");
  const afterDate = after === undefined ? undefined : calendarDate(after);
  const recent = body.filings === undefined ? body : record(record(body.filings).recent);
  const keys = ["accessionNumber", "form", "reportDate", "filingDate", "acceptanceDateTime", "primaryDocument"] as const;
  const forms = recent.form;
  if (!Array.isArray(forms) || forms.length > 100_000 ||
    keys.some(key => !Array.isArray(recent[key]) || (recent[key] as unknown[]).length !== forms.length))
    return fail("SEC 공시 목록의 열 길이가 일치하지 않습니다.");
  const candidates: Record<string, unknown>[] = [];
  for (let index = 0; index < forms.length; index++) {
    if (forms[index] !== "13F-HR" && forms[index] !== "13F-HR/A") continue;
    const row = Object.fromEntries(keys.map(key => [key, (recent[key] as unknown[])[index]]));
    const period = calendarDate(row.reportDate);
    if (afterDate === undefined || period >= afterDate) candidates.push(row);
  }
  // Old, unselected filings may predate XML. They must not block a bounded recent import.
  candidates.sort((a, b) => string(b.reportDate).localeCompare(string(a.reportDate)) ||
    string(b.acceptanceDateTime).localeCompare(string(a.acceptanceDateTime)) || string(b.accessionNumber).localeCompare(string(a.accessionNumber)));
  const found = new Map<string, SecFilingMetadata>();
  for (const row of candidates.slice(0, limit)) {
    const filing = metadataFor(row, canonicalCik);
    const existing = found.get(filing.accession);
    if (existing && JSON.stringify(existing) !== JSON.stringify(filing)) return fail("SEC 목록에 충돌하는 공시가 있습니다.");
    found.set(filing.accession, filing);
  }
  return [...found.values()].sort((a, b) => b.reportDate.localeCompare(a.reportDate) ||
    b.acceptanceDateTime.localeCompare(a.acceptanceDateTime) || b.accession.localeCompare(a.accession)).slice(0, limit);
}

function checkedMetadata(metadata: SecFilingMetadata, cik: string): SecFilingMetadata {
  const canonicalCik = normalizeSecCik(cik);
  const checked = metadataFor({
    accessionNumber: metadata.accession, form: metadata.form, reportDate: metadata.reportDate,
    filingDate: metadata.filingDate, acceptanceDateTime: metadata.acceptanceDateTime, primaryDocument: metadata.primaryDocument,
  }, canonicalCik);
  if (metadata.cik !== checked.cik || metadata.source !== checked.source ||
    metadata.primaryDocumentUrl !== checked.primaryDocumentUrl || metadata.directoryIndexUrl !== checked.directoryIndexUrl)
    return fail("SEC 원문 경로와 공시 식별자가 일치하지 않습니다.");
  return checked;
}

/** The directory returns candidates, not proof that an XML file is an information table. */
export function discoverInformationTables(data: unknown, metadata: SecFilingMetadata): string[] {
  const checked = checkedMetadata(metadata, metadata.cik);
  const directory = record(record(data).directory), items = directory.item;
  const path = new URL(checked.directoryIndexUrl).pathname.replace(/\/index\.json$/, "");
  if (directory.name !== undefined && directory.name !== path) return fail("SEC 원문 목록 경로가 다릅니다.");
  if (!Array.isArray(items) || items.length > 1000) return fail("SEC 원문 목록을 확인해 주세요.");
  return [...new Set(items.flatMap(item => {
    const name = string(record(item).name);
    return /\.xml$/i.test(name) && name !== checked.primaryDocument ? [secArchiveUrl(checked.cik, checked.accession, name)] : [];
  }))].sort();
}

interface XmlNode { name: string; namespace: string; text: string; children: XmlNode[] }

function xmlDocument(xml: string, rootName: string, namespace: string): XmlNode {
  if (typeof xml !== "string" || xml.length > MAX_XML_BYTES || new TextEncoder().encode(xml).length > MAX_XML_BYTES)
    return fail("SEC XML은 32MB를 넘을 수 없습니다.");
  const parser = new SaxesParser({ xmlns: true });
  let root: XmlNode | undefined, count = 0;
  const stack: XmlNode[] = [];
  parser.on("doctype", () => fail("SEC XML의 DTD는 허용하지 않습니다."));
  parser.on("error", () => fail("SEC XML이 올바른 형식이 아닙니다."));
  parser.on("opentag", tag => {
    if (++count > 1_500_000 || stack.length >= 32 || Object.keys(tag.attributes).length > 64)
      return fail("SEC XML의 구조 제한을 초과했습니다.");
    if (tag.uri !== namespace && !(namespace === COVER_NAMESPACE && tag.uri === COMMON_NAMESPACE))
      return fail("SEC XML 이름공간이 다릅니다.");
    const node: XmlNode = { name: tag.local, namespace: tag.uri, text: "", children: [] };
    if (stack.length) stack.at(-1)!.children.push(node);
    else { if (root) return fail("SEC XML 루트가 중복됐습니다."); root = node; }
    stack.push(node);
  });
  const append = (value: string) => {
    const node = stack.at(-1);
    if (node) node.text += value;
  };
  parser.on("text", append);
  parser.on("cdata", append);
  parser.on("closetag", () => { stack.pop(); });
  parser.write(xml).close();
  if (!root || root.name !== rootName || root.namespace !== namespace || stack.length) return fail("SEC XML 문서 종류가 다릅니다.");
  return root;
}

function child(node: XmlNode, name: string, optional = false): XmlNode | undefined {
  const matches = node.children.filter(item => item.name === name && item.namespace === node.namespace);
  if (matches.length > 1 || (!optional && matches.length !== 1)) return fail("SEC XML 필수 항목이 없거나 중복됐습니다.");
  return matches[0];
}
function at(node: XmlNode, path: string): XmlNode {
  for (const part of path.split("/")) node = child(node, part)!;
  return node;
}
function textOf(node: XmlNode): string {
  if (node.children.length || !node.text.trim()) return fail("SEC XML의 값이 올바르지 않습니다.");
  return node.text.trim();
}
const textAt = (node: XmlNode, path: string) => textOf(at(node, path));
function optionalText(node: XmlNode, name: string): string | null {
  const value = child(node, name, true);
  return value ? textOf(value) : null;
}
function integer(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return fail("SEC 공시 정수가 유효하지 않습니다.");
  return Number(value);
}
function boolean(value: string): boolean {
  if (!["true", "false", "1", "0"].includes(value)) return fail("SEC 공시 확인값이 유효하지 않습니다.");
  return value === "true" || value === "1";
}

export interface SecFilingInput {
  guruId: string;
  cik: string;
  metadata: SecFilingMetadata;
  coverXml: string;
  informationXml: string;
  informationTableUrl: string;
  parent?: GuruFiling;
}

/** Parse public source files only. Acceptance/first observation never invent publicAt. */
export function parseSecFiling(input: SecFilingInput): GuruFiling {
  const { guruId, coverXml, informationXml, informationTableUrl, parent } = input;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guruId)) return fail("구루 식별자가 유효하지 않습니다.");
  const metadata = checkedMetadata(input.metadata, input.cik);
  const tableName = informationTableUrl.slice(informationTableUrl.lastIndexOf("/") + 1);
  if (!/\.xml$/i.test(tableName) || tableName === metadata.primaryDocument ||
    secArchiveUrl(metadata.cik, metadata.accession, tableName) !== informationTableUrl)
    return fail("SEC 정보표가 같은 공시의 원문 경로가 아닙니다.");
  const cover = xmlDocument(coverXml, "edgarSubmission", COVER_NAMESPACE);
  if (textAt(cover, "headerData/submissionType") !== metadata.form ||
    normalizeSecCik(textAt(cover, "headerData/filerInfo/filer/credentials/cik")) !== metadata.cik ||
    calendarDate(textAt(cover, "headerData/filerInfo/periodOfReport")) !== metadata.reportDate)
    return fail("SEC XML의 운용사·서식·보고 기간이 조회 목록과 다릅니다.");
  const page = at(cover, "formData/coverPage"), summary = at(cover, "formData/summaryPage");
  const reportType = textAt(page, "reportType");
  if (calendarDate(textAt(page, "reportCalendarOrQuarter")) !== metadata.reportDate ||
    !["13F HOLDINGS REPORT", "13F COMBINATION REPORT"].includes(reportType)) return fail("13F 보유 보고서가 필요합니다.");
  const confidential = optionalText(summary, "isConfidentialOmitted");
  const disclosureScope: NonNullable<GuruFiling["disclosureScope"]> = {
    reportType: reportType === "13F HOLDINGS REPORT" ? "holdings" : "combination",
    confidentialOmitted: confidential === null ? false : boolean(confidential),
  };
  // Original SEC covers may omit this optional field (e.g. Berkshire 2025 Q1).
  // An amendment still needs an explicit flag in addition to its validated lineage.
  const amendmentFlag = optionalText(page, "isAmendment");
  if (amendmentFlag === null && metadata.form === "13F-HR/A") return fail("SEC 정정 표시가 없습니다.");
  const amended = amendmentFlag === null ? false : boolean(amendmentFlag);
  if (amended !== (metadata.form === "13F-HR/A")) return fail("SEC 정정 표시가 서식과 다릅니다.");
  let revision = 0;
  if (amended) {
    const info = at(page, "amendmentInfo");
    if (textAt(info, "amendmentType") !== "RESTATEMENT") return fail("추가형 정정은 원본과의 대조 후 반영해야 합니다.");
    revision = integer(textAt(page, "amendmentNo"));
    if (!parent || validateFiling(parent) || parent.guruId !== guruId || parent.period !== metadata.reportDate ||
      parent.accession === metadata.accession || parent.revision + 1 !== revision || parent.filedDate > metadata.filingDate)
      return fail("정정 원본과 순서를 확인해야 합니다.");
  } else if (child(page, "amendmentInfo", true) || child(page, "amendmentNo", true)) {
    return fail("원본 공시에 정정 정보가 포함됐습니다.");
  }
  const expectedRows = integer(textAt(summary, "tableEntryTotal"));
  if (expectedRows > MAX_ROWS) return fail("SEC 정보표는 50,000행을 넘을 수 없습니다.");
  // SEC FAQ 62: filings (including old-period amendments) from 2023-01-03 use dollars.
  const multiplier = metadata.filingDate < "2023-01-03" ? 1000 : 1;
  const expectedValueUsd = integer(textAt(summary, "tableValueTotal")) * multiplier;
  const table = xmlDocument(informationXml, "informationTable", TABLE_NAMESPACE);
  const placeholder = table.children.length === 1 ? table.children[0] : null;
  // Some empty SEC reports explicitly encode a single NONE sentinel. Only the
  // exact all-zero marker is accepted against a cover declaring zero positions.
  const emptyPlaceholder = expectedRows === 0 && expectedValueUsd === 0 && placeholder?.name === "infoTable"
    && textAt(placeholder, "nameOfIssuer") === "NONE" && textAt(placeholder, "titleOfClass") === "NONE"
    && textAt(placeholder, "cusip") === "000000000" && textAt(placeholder, "value") === "0"
    && textAt(placeholder, "shrsOrPrnAmt/sshPrnamt") === "0" && textAt(placeholder, "shrsOrPrnAmt/sshPrnamtType") === "SH"
    && optionalText(placeholder, "putCall") === null
    && ["Sole", "Shared", "None"].every(key => textAt(placeholder, `votingAuthority/${key}`) === "0");
  const reportedRows = emptyPlaceholder ? [] : table.children;
  if (table.text.trim() || table.children.some(row => row.name !== "infoTable") || reportedRows.length !== expectedRows)
    return fail("SEC 정보표 전체 행 수가 표지와 다릅니다.");
  const holdings: GuruHolding[] = reportedRows.map((row, index) => {
    const amount = at(row, "shrsOrPrnAmt"), rawShares = textAt(amount, "sshPrnamt");
    if (!/^\d+(?:\.\d{1,6})?$/.test(rawShares) || !Number.isFinite(Number(rawShares)) || Number(rawShares) > Number.MAX_SAFE_INTEGER)
      return fail("SEC 보유 수량이 유효하지 않습니다.");
    const shareType = textAt(amount, "sshPrnamtType"), option = optionalText(row, "putCall")?.toUpperCase() ?? null;
    if ((shareType !== "SH" && shareType !== "PRN") || (option !== null && option !== "PUT" && option !== "CALL"))
      return fail("SEC 보유 종류가 유효하지 않습니다.");
    const rawCusip = textAt(row, "cusip");
    if (!/^[A-Za-z0-9]{9}$/.test(rawCusip)) return fail("SEC 종목 식별자가 유효하지 않습니다.");
    return {
      rowId: String(index + 1), issuer: textAt(row, "nameOfIssuer"), shareClass: textAt(row, "titleOfClass"),
      cusip: rawCusip.toUpperCase(), valueUsd: integer(textAt(row, "value")) * multiplier,
      shares: Number(rawShares), shareType, option, mapping: null,
    };
  });
  const filing: GuruFiling = {
    guruId, accession: metadata.accession, period: metadata.reportDate, filedDate: metadata.filingDate,
    acceptedAt: metadata.acceptanceDateTime, publicAt: null, source: metadata.source, tableSource: informationTableUrl,
    kind: amended ? "restatement" : "original", revision, parentAccession: amended ? parent!.accession : null,
    expectedRows, expectedValueUsd, disclosureScope, complete: true, holdings,
    ...(emptyPlaceholder ? { sourceNormalization: "empty-placeholder" as const } : {}),
  };
  const error = validateFiling(filing);
  if (error) return fail(error);
  return filing;
}
