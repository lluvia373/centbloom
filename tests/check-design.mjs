import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Resolve the CSS parser from Next's declared dependency, without another install.
const requireNext = createRequire(import.meta.resolve("next/package.json"));
const postcss = requireNext("postcss");
export const tokenFile = "src/styles/design-tokens.css";
const neutral = /^(?:0|auto|none|inherit|initial|unset|revert|transparent|currentColor)$/i;
const rawColor = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/i;
const cssKind = (prop) => {
  if (prop === "font-family") return "font";
  if (prop === "font-size") return "text";
  if (prop === "font-weight") return "weight";
  if (prop === "line-height") return "leading";
  if (prop === "letter-spacing") return "tracking";
  if (/^border.*radius$/.test(prop)) return "radius";
  if (/^(?:margin|padding)(?:-|$)|^(?:gap|row-gap|column-gap)$/.test(prop)) return "space";
  if (/^(?:box|text)-shadow$/.test(prop)) return "shadow";
  if (/color$|^(?:fill|stroke|background)$/.test(prop)) return "color";
  return null;
};
const kebab = (value) => value.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
export function readTokens(css) {
  const tokens = new Map();
  postcss.parse(css).walkDecls((decl) => {
    if (decl.prop.startsWith("--cf-")) {
      if (tokens.has(decl.prop)) throw new Error("Duplicate design token: " + decl.prop);
      tokens.set(decl.prop, decl.value);
    }
  });
  return tokens;
}
function references(value) {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]);
}
function validValue(kind, value, tokens) {
  value = String(value).trim();
  if (neutral.test(value) || (kind === "color" && /^url\(["']?#[\w-]+["']?\)$/.test(value))) return true;
  if (kind === "weight" && [...tokens].some(([name, v]) => name.startsWith("--cf-weight-") && v === value)) return true;
  const refs = references(value);
  return refs.length > 0 && refs.every((name) => name.startsWith("--cf-" + kind + "-") && tokens.has(name))
    && !rawColor.test(value) && !/[-\d.]+(?:px|rem|em|%|vw)\b/.test(value)
    && !value.includes(","); // No unreviewed fallback values.
}
function tokensInClasses(value) {
  return value.split(/\s+/).map((word) => word.replace(/^[!]+|[!]+$/g, "").split(/:(?![^[\]]*\])/).at(-1));
}
function classViolation(word, tokens) {
  if (/^(?:text|bg|border|ring|outline|fill|stroke|decoration|accent|caret|divide|from|via|to)-/.test(word)) {
    if (/^(?:text|bg|border|ring|outline|fill|stroke|decoration|accent|caret|divide|from|via|to)-(?:cf-[\w-]+)(?:\/[\d.]+)?$/.test(word)) {
      const suffix = word.replace(/^[^-]+-/, "").split("/")[0].slice(3);
      const isText = word.startsWith("text-") && tokens.has("--cf-text-" + suffix);
      return tokens.has("--cf-color-" + suffix) || isText ? null : "unknown-token";
    }
    if (rawColor.test(word)) return "color";
    if (/^[a-z]+-[\[(]/.test(word)) return "arbitrary-style";
    if (/\[(?:color|background|font-size|font-family|border-radius):/.test(word)) return "arbitrary-style";
    if (/^(?:bg|border|ring|outline|fill|stroke|decoration|accent|caret|divide|from|via|to)-(?:[a-z]+-\d+|white|black)(?:\/.*)?$/.test(word)) return "color";
    if (word.startsWith("text-") && !/^text-(?:left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|inherit|current|transparent)$/.test(word)) return "typography";
  }
  if (/^\[(?:color|background|font|line-height|letter-spacing|border-radius|margin|padding|gap|box-shadow)/.test(word)) return "arbitrary-style";
  if (word.startsWith("font-") && !/^font-(?:sans|mono|normal|medium|semibold)$/.test(word)) return "font";
  if (word.startsWith("rounded") && !/^rounded-(?:none|cf-control|cf-card|cf-pill)$/.test(word)) return "radius";
  if (/^(?:leading|tracking)-/.test(word)) {
    const kind = word.startsWith("leading") ? "leading" : "tracking";
    const ref = word.match(/^\w+-\[var\((--cf-[\w-]+)\)\]$/)?.[1];
    if (!ref || !tokens.has(ref) || !ref.startsWith("--cf-" + kind + "-")) return kind;
  }
  if (/^-?(?:p[trblxyse]?|m[trblxyse]?|gap(?:-[xy])?|space-[xy])-/.test(word)
    && !/^-?(?:p[trblxyse]?|m[trblxyse]?|gap(?:-[xy])?|space-[xy])-(?:0|1|2|3|4|6|8|12|auto)$/.test(word)) return "spacing";
  if (/^(?:shadow|drop-shadow)(?:-|$)/.test(word) && !/^shadow-(?:none|cf-dialog)$/.test(word)) return "shadow";
  if (/^(?:filter|grayscale|sepia|hue-rotate|invert|mix-blend)(?:-|$)/.test(word)) return "image-treatment";
  return null;
}
export function inspectSource(file, source, tokens) {
  const findings = [];
  const add = (rule, value, position, context = value) => {
    const line = source.slice(0, position).split("\n").length;
    const signature = createHash("sha256").update(rule + "\0" + context).digest("hex").slice(0, 20);
    findings.push({ file, line, rule, value, key: file + "|" + rule + "|" + signature });
  };
  const inspectValue = (prop, value, position, context) => {
    const kind = cssKind(prop);
    if (prop === "font") add("font-shorthand", value, position, context);
    else if (/^(?:filter|mix-blend-mode)$/.test(prop) && value !== "none" && value !== "normal") add("image-treatment", value, position, context);
    else if (rawColor.test(value)) add("color", value, position, context);
    else if (kind && !validValue(kind, value, tokens)) add(kind, value, position, context);
    for (const ref of references(value)) {
      if (ref.startsWith("--cf-") && !tokens.has(ref)) add("unknown-token", ref, position, context + ref);
    }
  };
  if (file.endsWith(".css")) {
    const tree = postcss.parse(source, { from: file });
    tree.walkDecls((decl) => {
      let selector = "";
      for (let parent = decl.parent; parent; parent = parent.parent) {
        selector = (parent.selector ?? parent.params ?? "") + " " + selector;
      }
      const context = selector.trim() + "|" + decl.prop + ":" + decl.value;
      inspectValue(decl.prop, decl.value, decl.source.start.offset, context);
      if (decl.prop.startsWith("--cf-")) add("token-redefinition", decl.prop, decl.source.start.offset, context);
    });
    tree.walkAtRules("apply", (rule) => {
      for (const word of tokensInClasses(rule.params)) {
        const violation = classViolation(word, tokens);
        if (violation) add(violation, word, rule.source.start.offset, rule.parent.selector + "|" + rule.params + "|" + word);
      }
    });
    return findings;
  }
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const value = node.text;
      const position = node.getStart(tree);
      if (rawColor.test(value) && /^(?:#|rgba?\(|hsla?\(|oklch\(|linear-gradient\()/i.test(value)) {
        add("color", value, position, value);
      }
      for (const word of tokensInClasses(value)) {
        const rule = classViolation(word, tokens);
        if (rule) add(rule, word, position, value + "|" + word);
      }
      if (/^(?:.*\s)?(?:\w+:)*(?:text|bg|font|rounded)-$/.test(value) && !ts.isStringLiteral(node)) {
        add("dynamic-utility", value, position);
      }
    }
    if (ts.isJsxAttribute(node)) {
      const prop = node.name.getText(tree);
      const init = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (cssKind(kebab(prop)) && init && (ts.isStringLiteralLike(init) || ts.isNumericLiteral(init)) && !rawColor.test(init.text)) {
        inspectValue(kebab(prop), init.text, node.getStart(tree), node.getText(tree));
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const prop = node.name.getText(tree).replace(/^["']|["']$/g, "");
      if (cssKind(kebab(prop)) || prop === "font" || prop === "filter") {
        const init = node.initializer;
        if (ts.isStringLiteralLike(init) || ts.isNumericLiteral(init)) {
          // Color strings are already inspected above.
          if (!rawColor.test(init.text)) inspectValue(kebab(prop), init.text, node.getStart(tree), node.getText(tree));
        }
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      if (tag === "img") add("image-component", "<img>", node.getStart(tree), node.getText(tree));
      if (tag === "Image") {
        const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(tree), a]));
        if (!attrs.has("alt") || (!attrs.has("fill") && (!attrs.has("width") || !attrs.has("height")))) {
          add("image-contract", "Image needs alt and dimensions (or fill)", node.getStart(tree), node.getText(tree));
        }
        const src = attrs.get("src")?.initializer;
        if (src && ts.isStringLiteral(src) && src.text.startsWith("/brand/")
          && (file !== "src/components/BrandMark.tsx" || src.text !== "/brand/centifolio-logo-gold-on-white.webp")) {
          add("brand-component", src.text, node.getStart(tree), node.getText(tree));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return findings;
}
export function counts(findings) {
  const result = {};
  for (const f of findings) result[f.key] = (result[f.key] ?? 0) + 1;
  return result;
}
export function newViolations(findings, baseline) {
  const seen = {};
  return findings.filter((f) => (seen[f.key] = (seen[f.key] ?? 0) + 1) > (baseline[f.key] ?? 0));
}
export function validateDocument(css, doc) {
  const errors = [];
  const tokens = readTokens(css);
  for (const [token, value] of tokens) {
    const row = doc.split(/\r?\n/).find((line) => line.startsWith("|") && line.includes("`" + token + "`"));
    if (!row?.includes("`" + value + "`")) errors.push("DESIGN_SYSTEM.md: missing/stale value for " + token);
  }
  // A removed token must not leave an apparently valid reference in the guide.
  for (const match of doc.matchAll(/`(--cf-[\w-]+)`/g)) {
    if (!tokens.has(match[1])) errors.push("DESIGN_SYSTEM.md: unknown token " + match[1]);
  }
  return errors;
}
export function audit(root) {
  const css = readFileSync(join(root, tokenFile), "utf8");
  const tokens = readTokens(css);
  const errors = validateDocument(css, readFileSync(join(root, "DESIGN_SYSTEM.md"), "utf8"));
  const findings = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:css|tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        const file = relative(root, path).replaceAll("\\", "/");
        if (file !== tokenFile) findings.push(...inspectSource(file, readFileSync(path, "utf8"), tokens));
      }
    }
  };
  walk(join(root, "src"));
  // The token file is executable CSS: validate references and its scope too.
  const tree = postcss.parse(css);
  tree.walkDecls((decl) => {
    if (decl.parent.type !== "rule" && decl.parent.name !== "theme") errors.push("Design token outside :root/@theme: " + decl.prop);
    if (decl.parent.type === "rule" && (decl.parent.selector !== ":root" || !decl.prop.startsWith("--cf-"))) errors.push("Design tokens must be custom properties in :root: " + decl.prop);
    if (decl.parent.name === "theme" && (!/^--(?:(?:color|text|radius|shadow)-cf-|font-(?:sans|mono)$)/.test(decl.prop)
      || !/^var\(--cf-[\w-]+\)$/.test(decl.value))) errors.push("Theme must only map design tokens: " + decl.prop);
    for (const ref of references(decl.value)) {
      if (ref.startsWith("--cf-") && !tokens.has(ref)) errors.push("Design token references missing " + ref);
    }
  });
  const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
  if (!globals.includes('@import "../styles/design-tokens.css";')) errors.push("globals.css must import design-tokens.css");
  const baselinePath = join(root, "tests/fixtures/design-baseline.json");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (baseline.version !== 1 || !baseline.entries) errors.push("Invalid design baseline format");
  const exceptions = JSON.parse(readFileSync(join(root, "tests/fixtures/design-exceptions.json"), "utf8"));
  const remaining = [...findings];
  const exceptionKeys = new Set();
  for (const exception of exceptions) {
    const key = exception.file + "|" + exception.rule + "|" + exception.value;
    if (exceptionKeys.has(key)) { errors.push("Duplicate design exception: " + key); continue; }
    exceptionKeys.add(key);
    if (!exception.reason?.trim() || exception.count !== 1) {
      errors.push("Design exception must have a reason and a one-occurrence scope");
      continue;
    }
    const index = remaining.findIndex((f) => f.file === exception.file && f.rule === exception.rule && f.value === exception.value);
    if (index < 0) errors.push("Stale design exception: " + exception.file + " " + exception.value);
    else remaining.splice(index, 1);
  }
  const current = counts(remaining);
  for (const [key, count] of Object.entries(baseline.entries ?? {})) {
    if (!Number.isInteger(count) || count < 1) errors.push("Invalid baseline count: " + key);
    else if (count > (current[key] ?? 0)) errors.push("Remove/reduce resolved baseline entry: " + key);
  }
  return { errors, findings: remaining, baseline: baseline.entries, current };
}
function main() {
  const flags = new Set(process.argv.slice(2));
  for (const flag of flags) if (!["--strict", "--json"].includes(flag)) throw new Error("Unknown option: " + flag);
  const result = audit(process.cwd());
  const violations = flags.has("--strict") ? result.findings : newViolations(result.findings, result.baseline);
  const report = { mode: flags.has("--strict") ? "full-compliance" : "no-new-violations", errors: result.errors,
    newViolationCount: newViolations(result.findings, result.baseline).length,
    existingViolationCount: result.findings.length, fullyCompliant: result.errors.length === 0 && result.findings.length === 0,
    violations };
  if (flags.has("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("Design: " + report.mode + "; " + report.newViolationCount + " new / " + report.existingViolationCount
      + " unresolved. Full compliance: " + (report.fullyCompliant ? "YES" : "NO") + ".");
    for (const error of result.errors) console.error(error);
    for (const f of violations.slice(0, 30)) console.error(f.file + ":" + f.line + " [" + f.rule + "] " + f.value);
    if (violations.length > 30) console.error("... " + (violations.length - 30) + " more; use --strict --json for the full list.");
  }
  if (result.errors.length || violations.length) process.exitCode = 1;
}
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
