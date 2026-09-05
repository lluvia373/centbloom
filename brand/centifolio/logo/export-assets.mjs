import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const logoDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(logoDir, "../../..");
const originalName = "centifolio-logo-gold-on-black.original.png";
const expectedHash = "8c2c5ff68b6cce02452e42344db69adfe525f536c97b64e831b8314ed4d331c3";
const original = await readFile(path.join(logoDir, originalName));
const whiteName = "centifolio-logo-gold-on-white.png";
const whiteHash = "7d9d1542a8bfb95e70441861bb6ec0ec41c263f5f75a6d54220cf24bfceee070";
const whiteSource = await readFile(path.join(logoDir, whiteName));
const preEditName = "centifolio-logo-gold-on-white.pre-pixel-edit.png";
const preEditHash = "105631ec014d89463e43b42d2a9aba7afaaa7c5e024d00021ad0dd276c5b2dcd";
const preEditSource = await readFile(path.join(logoDir, preEditName));
const pixelValidation = JSON.parse(await readFile(path.join(logoDir, "background-pixel-validation.json"), "utf8"));
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
if (hash(original) !== expectedHash) {
  throw new Error("Approved logo source has changed. Do not export a replacement without user approval.");
}
if (hash(whiteSource) !== whiteHash) {
  throw new Error("White-background derivative has changed. Review the source and its provenance before exporting.");
}
if (hash(preEditSource) !== preEditHash || pixelValidation.outputSha256 !== whiteHash) {
  throw new Error("Background normalization provenance does not match its archived input and active output.");
}

const records = [];
async function record(file, buffer, method) {
  const metadata = await sharp(buffer).metadata();
  records.push({
    file,
    width: metadata.width,
    height: metadata.height,
    bytes: buffer.length,
    sha256: hash(buffer),
    method,
  });
}
await record(`brand/centifolio/logo/${originalName}`, original, "Byte-for-byte copy of the user-approved attachment; no processing.");
await record(`brand/centifolio/logo/${preEditName}`, preEditSource, "Byte-for-byte archive of the earlier image_gen white-background derivative, before user-authorized background pixel normalization.");
await record(`brand/centifolio/logo/${whiteName}`, whiteSource, "User-authorized deterministic normalization of near-white neutral background pixels to RGB(255,255,255). Every pixel outside the recorded background mask is unchanged from the archived pre-edit derivative.");

const outputs = [
  ["brand/centifolio/logo/centifolio-logo-gold-on-black.4096.png", 4096, "png", false, original, "approved original"],
  ["public/brand/centifolio-logo-gold-on-black.webp", 640, "webp", false, original, "approved original"],
  ["brand/centifolio/logo/centifolio-logo-gold-on-white.4096.png", 4096, "png", false, whiteSource, "white-background derivative"],
  ["public/brand/centifolio-logo-gold-on-white.webp", 640, "webp", false, whiteSource, "white-background derivative"],
  ["src/app/icon.png", 96, "png", true, whiteSource, "white-background derivative"],
  ["src/app/apple-icon.png", 180, "png", true, whiteSource, "white-background derivative"],
];
for (const [file, size, format, alpha, input, sourceLabel] of outputs) {
  let pipeline = sharp(input).resize(size, size, { kernel: sharp.kernel.lanczos3 });
  if (alpha) pipeline = pipeline.ensureAlpha();
  const buffer = await (format === "webp"
    ? pipeline.webp({ lossless: true, effort: 6 })
    : pipeline.png({ compressionLevel: 9, palette: false })).toBuffer();
  await writeFile(path.join(projectDir, file), buffer);
  await record(file, buffer, `Lanczos3 resampling from ${sourceLabel} to ${size} × ${size}; lossless ${format.toUpperCase()} encoding${alpha ? "; opaque RGBA" : ""}. No additional crop, rotation, recoloring, sharpening, or AI generation during resizing.`);
}

// ICO wraps an opaque RGBA PNG; Next.js's decoder expects a supported PNG color type.
const iconPng = await sharp(whiteSource)
  .resize(64, 64, { kernel: sharp.kernel.lanczos3 })
  .ensureAlpha()
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();
const iconHeader = Buffer.alloc(22);
iconHeader.writeUInt16LE(1, 2);
iconHeader.writeUInt16LE(1, 4);
iconHeader[6] = 64;
iconHeader[7] = 64;
iconHeader.writeUInt16LE(1, 10);
iconHeader.writeUInt16LE(32, 12);
iconHeader.writeUInt32LE(iconPng.length, 14);
iconHeader.writeUInt32LE(22, 18);
const ico = Buffer.concat([iconHeader, iconPng]);
await writeFile(path.join(projectDir, "src/app/favicon.ico"), ico);
records.push({
  file: "src/app/favicon.ico",
  width: 64,
  height: 64,
  bytes: ico.length,
  sha256: hash(ico),
  method: "Lanczos3 resampling from white-background derivative to 64 × 64; opaque RGBA lossless PNG wrapped in a 32-bit ICO container.",
});

const manifest = {
  brand: "Centifolio",
  status: "User-approved gold rose identity; original and earlier derivative archived; exact-white background derivative active locally",
  approvedDate: "2026-09-05",
  sourceAttachment: "codex-clipboard-ff734878-8a85-48c3-9a64-acf747ac0e24.png",
  originalSha256: expectedHash,
  originalDimensions: { width: 1254, height: 1254 },
  identity: "The gold rose itself is the logo. Preserve its shape, angle and gold character. Black is an optional presentation background, not part of the logo identity.",
  activeDerivative: {
    file: whiteName,
    sha256: whiteHash,
    background: "opaque pure white RGB(255,255,255) in the recorded background mask",
    method: "Earlier built-in image_gen derivative followed by explicitly authorized background-only RGB pixel normalization and deterministic resizing",
    provenance: "background-edit.json",
    pixelValidation: "background-pixel-validation.json",
    limitation: "Gold foreground is pixel-identical to the archived white derivative outside the background mask. That earlier generated derivative is not pixel-identical to the approved black original. No transparent extraction is shipped.",
  },
  exportTool: { name: "sharp", version: sharp.versions.sharp, libvips: sharp.versions.vips },
  resolutionNote: "The 4096px image is an interpolated enlargement, not a higher-detail original or a vector master. Lossless encoding preserves the resampled output, not new source detail.",
  files: records,
};
await writeFile(path.join(logoDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
