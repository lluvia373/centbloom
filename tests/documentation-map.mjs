import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const owner = "DEVELOPMENT.md";
const heading = "작업별 시작점";
const columns = ["기능", "기능 명세", "디자인 기준", "구현·확장 시작점", "검증"];
const slash = (path) => path.replace(/\\/g, "/");
const plain = (text) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*`]/g, "").trim();

function localLinks(cell) {
  const links = [];
  for (const match of cell.matchAll(/\]\((\.\/[^)]+)\)/g)) {
    try {
      const [path, ...fragments] = decodeURIComponent(match[1]).split("#");
      links.push({ path: slash(path).replace(/^\.\//, "").replace(/\/$/, ""), fragment: fragments.join("#") });
    } catch {
      // The general documentation checker reports malformed links.
    }
  }
  return links;
}

function sourcePath(root, path) {
  const normalized = slash(relative(root, resolve(root, path)));
  return normalized.startsWith("src/") && !["src/app", "src/features"].includes(normalized)
    ? normalized : null;
}

function appRoutes(root, directory = "src/app") {
  if (!existsSync(resolve(root, directory))) return [];
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = directory + "/" + entry.name;
    if (entry.isDirectory()) return appRoutes(root, path);
    return entry.isFile() && ["page.tsx", "route.ts"].includes(entry.name) ? [path] : [];
  });
}

// Parsing is shared by the lightweight guide and the full documentation check.
// source must have fenced examples removed, as with the general link checker.
function parseDocumentationMap(root, source) {
  const errors = [];
  const rows = [];
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const sections = lines.flatMap((line, index) => /^## 작업별 시작점\s*$/.test(line) ? [index] : []);
  if (sections.length !== 1) {
    return { rows, errors: [owner + ": expected one registry section " + heading] };
  }
  const end = lines.findIndex((line, index) => index > sections[0] && /^##\s/.test(line));
  const section = lines.slice(sections[0] + 1, end < 0 ? undefined : end);
  const table = section.filter((line) => /^\s*\|/.test(line)).map((line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim()));
  if (!table.length || table[0].join("|") !== columns.join("|")
      || table[1]?.length !== columns.length || !table[1].every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return { rows, errors: [owner + ": " + heading + " requires columns " + columns.join(" | ")] };
  }
  for (const cells of table.slice(2)) {
    const name = plain(cells[0] ?? "");
    const label = owner + ": " + heading + " [" + (name || "unnamed") + "]";
    if (cells.length !== columns.length || cells.some((cell) => !cell)) {
      errors.push(label + ": every row requires five non-empty cells");
      continue;
    }
    const links = cells.map(localLinks);
    const implementations = links[3].flatMap((link) => {
      const path = sourcePath(root, link.path);
      if (!path) return [];
      const present = existsSync(resolve(root, path));
      const stat = present ? statSync(resolve(root, path)) : undefined;
      return [{ path, directory: stat?.isDirectory() ?? false, exists: Boolean(stat?.isDirectory() || stat?.isFile()) }];
    });
    rows.push({ name, cells, links, implementations });
  }
  if (!rows.length) errors.push(owner + ": " + heading + " requires at least one feature row");
  return { rows, errors };
}

export function inspectDocumentationMap(root, source) {
  const { rows, errors } = parseDocumentationMap(root, source);
  const names = new Set();
  for (const row of rows) {
    const { name, links } = row;
    const label = owner + ": " + heading + " [" + (name || "unnamed") + "]";
    const key = name.toLocaleLowerCase();
    if (!name) errors.push(label + ": missing feature name");
    if (names.has(key)) errors.push(label + ": duplicate feature name");
    names.add(key);
    if (!links[1].some((link) => link.path === "PRODUCT_SPEC.md" && link.fragment)) {
      errors.push(label + ": 기능 명세 requires a PRODUCT_SPEC.md#anchor link");
    }
    if (!links[2].some((link) => link.path === "DESIGN_SYSTEM.md" && link.fragment)) {
      errors.push(label + ": 디자인 기준 requires a DESIGN_SYSTEM.md#anchor link");
    }
    const implementations = row.implementations.filter((item) => item.exists);
    if (!implementations.length) errors.push(label + ": 구현·확장 시작점 requires an existing specific src file or directory link");
    if (new Set(implementations.map((item) => item.path)).size !== implementations.length) {
      errors.push(label + ": duplicate implementation link in row");
    }
    if (!links[4].some((link) => {
      const path = slash(relative(root, resolve(root, link.path)));
      return path.startsWith("tests/") && existsSync(resolve(root, path)) && statSync(resolve(root, path)).isFile();
    })) errors.push(label + ": 검증 requires an existing tests file link");
    row.implementations = implementations;
  }
  const registered = new Set(rows.flatMap((row) => row.implementations.map((item) => item.path)));
  const featureRoot = resolve(root, "src/features");
  const features = existsSync(featureRoot) ? readdirSync(featureRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => "src/features/" + entry.name) : [];
  for (const path of [...features, ...appRoutes(root)]) {
    if (!registered.has(path)) errors.push(owner + ": " + heading + " missing implementation entry " + path);
  }
  return { rows, errors };
}

export function lookupDocumentationGuide(root, source, query) {
  const map = parseDocumentationMap(root, source);
  const guide = documentationGuide(root, map.rows, query);
  // An unfinished unrelated row must not block a usable feature guide.
  if (guide.error && map.errors.length) guide.error += "\n" + map.errors.join("\n");
  return guide;
}

export function documentationGuide(root, rows, query) {
  const normalized = slash(query.trim());
  const looksLikePath = normalized.startsWith("./") || normalized.startsWith("src/") || isAbsolute(normalized);
  let matches;
  if (looksLikePath) {
    const path = slash(relative(root, resolve(root, normalized)));
    const scored = rows.map((row) => ({
      row,
      score: Math.max(-1, ...row.implementations.filter((item) => path === item.path
        || (item.directory && path.startsWith(item.path + "/"))).map((item) => item.path.length)),
    }));
    const best = Math.max(-1, ...scored.map((item) => item.score));
    matches = best < 0 ? [] : scored.filter((item) => item.score === best).map((item) => item.row);
  } else {
    const name = plain(normalized).toLocaleLowerCase();
    const exact = rows.filter((row) => row.name.toLocaleLowerCase() === name);
    matches = exact.length ? exact : rows.filter((row) => row.name.toLocaleLowerCase().includes(name));
  }
  if (!normalized || !matches.length) {
    return { error: "일치하는 기능이 없습니다: " + query + ". DEVELOPMENT.md의 '작업별 시작점' 표에 기능 명세·디자인·구현·검증 링크를 추가하세요." };
  }
  return { text: matches.map((row) => ["기능: " + row.name,
    ...columns.slice(1).map((column, index) => column + ": " + row.cells[index + 1]),
  ].join("\n")).join("\n\n") };
}
