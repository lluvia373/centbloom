import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { inspectDocumentationMap, lookupDocumentationGuide } from "./documentation-map.mjs";

const args = process.argv.slice(2);
let rootArgument;
let guideQuery;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--guide" && guideQuery === undefined && args[index + 1] && !args[index + 1].startsWith("--")) {
    guideQuery = args[++index];
  } else if (!args[index].startsWith("--") && rootArgument === undefined) {
    rootArgument = args[index];
  } else {
    console.error("Usage: node tests/check-docs.mjs [root] [--guide <feature or src path>]");
    process.exit(1);
  }
}
const root = resolve(rootArgument ?? process.cwd());
if (guideQuery !== undefined) {
  const mapPath = resolve(root, "DEVELOPMENT.md");
  if (!existsSync(mapPath)) {
    console.error("DEVELOPMENT.md의 작업별 시작점 표가 있어야 기능 안내를 조회할 수 있습니다.");
    process.exit(1);
  }
  const guide = lookupDocumentationGuide(root, withoutCode(readFileSync(mapPath, "utf8")), guideQuery);
  if (guide.error) console.error(guide.error);
  else console.log(guide.text);
  process.exit(guide.error ? 1 : 0);
}
const errors = [];
const privateDoc = "BUSINESS_MODEL.md";
function gitFiles(...flags) {
  return execFileSync("git", ["ls-files", "-z", ...flags, "--", "*.md"], {
    cwd: root, encoding: "utf8",
  }).split("\0").filter(Boolean);
}
const tracked = new Set(gitFiles("--cached"));
const documents = new Set(gitFiles("--cached", "--others", "--exclude-standard"));
if (existsSync(resolve(root, privateDoc))) documents.add(privateDoc);
if (tracked.has(privateDoc)) errors.push(privateDoc + ": private document is tracked by Git");

const cache = new Map();
function read(file) {
  const absolute = resolve(root, file);
  if (!cache.has(absolute)) cache.set(absolute, readFileSync(absolute, "utf8"));
  return cache.get(absolute);
}
// The private plan is absent in public checkouts. When present, require review
// of the current decision text; this checks freshness, not semantic correctness.
if (existsSync(resolve(root, privateDoc))) {
  if (!existsSync(resolve(root, "DECISIONS.md"))) {
    errors.push(privateDoc + ": cannot verify decision review without DECISIONS.md");
  } else {
    const decisionText = read("DECISIONS.md").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const hash = createHash("sha256").update(decisionText).digest("hex");
    const markers = [...read(privateDoc).matchAll(/<!-- business-model-decisions-sha256: ([a-f0-9]{64}) -->/g)];
    if (markers.length !== 1 || markers[0][1] !== hash) {
      errors.push(privateDoc + ": missing or stale decision review; sync product, revenue assumptions, milestones and metrics before updating the marker. Expected SHA-256: " + hash);
    }
  }
}
function withoutCode(text) {
  let fence = "";
  return text.split(/\r?\n/).map((line) => {
    const marker = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = "";
      return "";
    }
    return fence ? "" : line;
  }).join("\n");
}
function registry(file, heading) {
  const section = withoutCode(read(file)).split("## " + heading + "\n")[1]?.split("\n## ")[0];
  if (!section) {
    errors.push(file + ": missing registry section " + heading);
    return new Set();
  }
  const found = new Set();
  for (const row of section.split("\n").filter((line) => line.startsWith("|"))) {
    const cell = row.split("|")[2] ?? "";
    const linked = cell.match(/\]\((?:\.\/)?([^)#]+\.md)(?:#[^)]*)?\)/);
    const plain = file === "AGENTS.md" ? cell.match(/\b(AGENTS\.md|BUSINESS_MODEL\.md)\b/) : null;
    const name = linked?.[1] ?? plain?.[1];
    if (!name) continue;
    if (found.has(name)) errors.push(file + ": duplicate registry entry " + name);
    found.add(name);
  }
  return found;
}
const managed = registry("AGENTS.md", "문서 관리 기준");
const indexed = registry("README.md", "문서 안내");
for (const file of documents) {
  if (!managed.has(file)) errors.push(file + ": missing from AGENTS registry");
  if (file !== privateDoc && file !== "README.md" && !indexed.has(file)) {
    errors.push(file + ": missing from README registry");
  }
}
for (const [owner, registryEntries] of [["AGENTS.md", managed], ["README.md", indexed]]) {
  for (const file of registryEntries) {
    if (file !== privateDoc && !documents.has(file)) errors.push(owner + ": unlisted or missing document " + file);
    if (file !== privateDoc && !existsSync(resolve(root, file))) errors.push(owner + ": missing document " + file);
  }
}

function anchors(text) {
  const ids = new Set();
  const counts = new Map();
  for (const match of withoutCode(text).matchAll(/^#{1,6}\s+(.+?)(?:\s+#+)?$/gm)) {
    const base = match[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\s-]/gu, "").replace(/\s/g, "-");
    const count = counts.get(base) ?? 0;
    ids.add(base + (count ? "-" + count : ""));
    counts.set(base, count + 1);
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
}
for (const file of documents) {
  if (!existsSync(resolve(root, file))) {
    errors.push(file + ": document was deleted but is still registered or tracked");
    continue;
  }
  const text = withoutCode(read(file));
  // Project docs use inline relative links; fenced examples and external URLs are excluded.
  for (const match of text.matchAll(/\]\((\.{1,2}\/[^)]+|#[^)]+)\)/g)) {
    const [pathname, ...fragmentParts] = match[1].split("#");
    let target;
    let fragment;
    try {
      target = pathname ? resolve(root, dirname(file), decodeURIComponent(pathname)) : resolve(root, file);
      fragment = decodeURIComponent(fragmentParts.join("#"));
    } catch {
      errors.push(file + ": malformed link " + match[1]);
      continue;
    }
    if (!existsSync(target)) errors.push(file + ": broken link " + match[1]);
    else if (fragment && extname(target) === ".md" && statSync(target).isFile() && !anchors(read(target)).has(fragment)) {
      errors.push(file + ": missing anchor " + match[1]);
    }
  }
}
let mapSize;
if (existsSync(resolve(root, "src")) && existsSync(resolve(root, "DEVELOPMENT.md"))) {
  const map = inspectDocumentationMap(root, withoutCode(read("DEVELOPMENT.md")));
  errors.push(...map.errors);
  mapSize = map.rows.length;
}
if (errors.length) {
  console.error("Documentation check failed:\n" + [...new Set(errors)].map((error) => "- " + error).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Documentation check passed: " + documents.size + " documents, registries, inline local links/anchors and local business decision review"
    + (mapSize === undefined ? "." : "; " + mapSize + " feature guides with source coverage."));
}
