import { ingestFiling, type GuruFiling, type GuruHolding } from "./model";

// Manually checked against both SEC cover-page totals and the complete information table.
// A real historical filing, NOT a demo portfolio or a claim about current positions.
const sourceRoot = "https://www.sec.gov/Archives/edgar/data/1336528/000117266125003509";
const rows: [string, string, string, number, number][] = [
  ["ALPHABET INC", "CAP STK CL C", "02079K107", 1121819859, 6324031],
  ["ALPHABET INC", "CAP STK CL A", "02079K305", 945117965, 5362980],
  ["AMAZON COM INC", "COM", "023135106", 1277577297, 5823316],
  ["BROOKFIELD CORP", "CL A LTD VT SH", "11271J107", 2545770554, 41160397],
  ["CHIPOTLE MEXICAN GRILL INC", "COM", "169656105", 1209537089, 21541177],
  ["HERTZ GLOBAL HLDGS INC", "COM NEW", "42806J700", 104096897, 15241127],
  ["HILTON WORLDWIDE HLDGS INC", "COM", "43300A203", 807164145, 3030578],
  ["HOWARD HUGHES HOLDINGS INC", "COM", "44267T102", 1272514320, 18852064],
  ["RESTAURANT BRANDS INTL INC", "COM", "76131D103", 1524730589, 23000914],
  ["SEAPORT ENTMT GROUP INC", "COMMON STOCK", "812215200", 93693497, 5023780],
  ["UBER TECHNOLOGIES INC", "COM", "90353T100", 2827098321, 30301161],
];
const holdings: GuruHolding[] = rows.map(([issuer, shareClass, cusip, valueUsd, shares], i) => ({
  rowId: String(i + 1), issuer, shareClass, cusip, valueUsd, shares, shareType: "SH", option: null, mapping: null,
}));
const filing: GuruFiling = {
  guruId: "pershing-square", accession: "0001172661-25-003509", period: "2025-06-30", filedDate: "2025-08-14",
  acceptedAt: "2025-08-14 16:31:59", publicAt: null,
  source: "https://www.sec.gov/Archives/edgar/data/1336528/0001172661-25-003509-index.htm",
  tableSource: `${sourceRoot}/xslForm13F_X02/infotable.xml`,
  kind: "original", revision: 0, parentAccession: null, expectedRows: 11, expectedValueUsd: 13729120533, complete: true, holdings,
};
const priorRows: [string,string,string,number,number][] = [
  ["ALPHABET INC","CAP STK CL C","02079K107",988003363,6324031],
  ["ALPHABET INC","CAP STK CL A","02079K305",686289227,4437980],
  ["BROOKFIELD CORP","CL A LTD VT SH","11271J107",2149054073,41004657],
  ["CANADIAN PACIFIC KANSAS CITY","COM","13646K108",1039093677,14799796],
  ["CHIPOTLE MEXICAN GRILL INC","COM","169656105",1081582497,21541177],
  ["HERTZ GLOBAL HLDGS INC","COM NEW","42806J700",59100000,15000000],
  ["HILTON WORLDWIDE HLDGS INC","COM","43300A203",682825214,3000770],
  ["HOWARD HUGHES HOLDINGS INC","COM","44267T102",1396560901,18852064],
  ["RESTAURANT BRANDS INTL INC","COM","76131D103",1532780909,23000914],
  ["SEAPORT ENTMT GROUP INC","COMMON STOCK","812215200",107860557,5023780],
  ["UBER TECHNOLOGIES INC","COM","90353T100",2207742590,30301161],
];
const prior: GuruFiling = {
  ...filing,accession:"0001172661-25-002315",period:"2025-03-31",filedDate:"2025-05-15",acceptedAt:"2025-05-15 16:03:24",
  source:"https://www.sec.gov/Archives/edgar/data/1336528/000117266125002315/0001172661-25-002315-index.htm",
  tableSource:"https://www.sec.gov/Archives/edgar/data/1336528/000117266125002315/xslForm13F_X02/infotable.xml",expectedValueUsd:11930893008,
  holdings:priorRows.map(([issuer,shareClass,cusip,valueUsd,shares],i)=>({rowId:String(i+1),issuer,shareClass,cusip,valueUsd,shares,shareType:"SH",option:null,mapping:null})),
};
const first = ingestFiling({versions:[],activeAccession:null},prior);
if(first.error)throw new Error(first.error);
const result = ingestFiling(first.archive, filing);
if (result.error) throw new Error(result.error);
export const guruCatalog = [{ slug: "pershing-square", name: "Pershing Square", manager: "Bill Ackman", cik: "0001336528", archive: result.archive }];
