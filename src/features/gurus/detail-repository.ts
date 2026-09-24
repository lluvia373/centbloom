import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getPreparedDirectory, type GuruManifestManager, type GuruManifestVersion } from "./directory-repository";
import { validateFiling, type GuruFiling } from "./model";

const MAX_ASSET_BYTES = 25 * 1024 * 1024;
type AssetReader = (path: string) => Promise<string>;

async function readPreparedAsset(path: string): Promise<string> {
  if (process.env.NODE_ENV === "development") {
    const { readFile, stat } = await import("node:fs/promises");
    const file = `${process.cwd()}/public${path}`;
    if ((await stat(file)).size > MAX_ASSET_BYTES) throw Error("공시 자료 크기를 확인해 주세요.");
    return readFile(file, "utf8");
  }
  const { env } = await getCloudflareContext({ async: true });
  const assets = (env as unknown as { ASSETS?: { fetch(request: Request): Promise<Response> } }).ASSETS;
  if (!assets) throw Error("공시 자료 저장소를 확인해 주세요.");
  const response = await assets.fetch(new Request(`https://assets.local${path}`));
  if (!response.ok || Number(response.headers.get("content-length")) > MAX_ASSET_BYTES) throw Error("공시 자료를 불러오지 못했습니다.");
  return response.text();
}

export async function readVerifiedFiling(guru: GuruManifestManager, version: GuruManifestVersion, readAsset: AssetReader = readPreparedAsset): Promise<GuruFiling> {
  const expected = `/data/gurus/${guru.slug}/${version.accession}-${version.hash}.json`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guru.slug) || !/^\d{10}$/.test(guru.cik)
    || !/^\d{10}-\d{2}-\d{6}$/.test(version.accession) || !/^[a-f0-9]{64}$/.test(version.hash) || version.path !== expected) throw Error("공시 자료 경로를 확인해 주세요.");
  const raw = await readAsset(version.path);
  if (raw.length > MAX_ASSET_BYTES) throw Error("공시 자료 크기를 확인해 주세요.");
  const bytes = new TextEncoder().encode(raw);
  if (bytes.length > MAX_ASSET_BYTES) throw Error("공시 자료 크기를 확인해 주세요.");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== version.hash) throw Error("공시 자료의 원본 확인에 실패했습니다.");
  const filing = JSON.parse(raw) as GuruFiling;
  const prefix = `https://www.sec.gov/Archives/edgar/data/${Number(guru.cik)}/`;
  if (filing.guruId !== guru.slug || filing.accession !== version.accession || filing.period !== version.period
    || filing.revision !== version.revision || filing.kind !== version.kind || filing.filedDate !== version.filedDate
    || !filing.source?.startsWith(prefix) || !filing.tableSource?.startsWith(prefix) || validateFiling(filing)) throw Error("공시 자료의 신고자·내용을 확인해 주세요.");
  return filing;
}

/** Only the selected and preceding quarter are read; other funds stay unloaded. */
export async function getGuruDetail(slug: string, accession?: string, readAsset?: AssetReader) {
  const guru = getPreparedDirectory().managers[slug];
  if (!guru) return null;
  const selected = guru.versions.find(version => version.accession === (accession ?? guru.activeAccession));
  if (!selected) return null;
  const versions = [...guru.versions].sort((a, b) => b.period.localeCompare(a.period) || b.revision - a.revision);
  const prior = versions.find(version => version.period < selected.period);
  const [filing, previous] = await Promise.all([
    readVerifiedFiling(guru, selected, readAsset),
    prior ? readVerifiedFiling(guru, prior, readAsset) : undefined,
  ]);
  return { guru, filing, previous, versions };
}
