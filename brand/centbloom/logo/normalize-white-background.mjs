import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const logoDir = path.dirname(fileURLToPath(import.meta.url));
const activeName = "centbloom-logo-gold-on-white.png";
const archiveName = "centbloom-logo-gold-on-white.pre-pixel-edit.png";
const sourceHash = "105631ec014d89463e43b42d2a9aba7afaaa7c5e024d00021ad0dd276c5b2dcd";
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");

try {
  await copyFile(path.join(logoDir, activeName), path.join(logoDir, archiveName), constants.COPYFILE_EXCL);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const source = await readFile(path.join(logoDir, archiveName));
if (hash(source) !== sourceHash) throw new Error("Pre-edit source hash mismatch; refusing to alter the approved derivative.");
const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
if (info.channels !== 3) throw new Error("Expected the archived RGB source.");
const output = Buffer.from(data);
const backgroundMask = (r, g, b) => Math.min(r, g, b) >= 245 && Math.max(r, g, b) - Math.min(r, g, b) <= 6;
let backgroundPixels = 0;
let changedPixels = 0;
let preservedGoldPixels = 0;
for (let i = 0; i < data.length; i += 3) {
  if (data[i] - data[i + 2] > 20) preservedGoldPixels++;
  if (!backgroundMask(data[i], data[i + 1], data[i + 2])) continue;
  backgroundPixels++;
  if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) changedPixels++;
  output[i] = output[i + 1] = output[i + 2] = 255;
}
const encoded = await sharp(output, { raw: { width: info.width, height: info.height, channels: 3 } })
  .png({ compressionLevel: 9, palette: false }).toBuffer();
const decoded = await sharp(encoded).raw().toBuffer();
let changedOutsideMask = 0;
let nonWhiteInsideMask = 0;
for (let i = 0; i < data.length; i += 3) {
  const selected = backgroundMask(data[i], data[i + 1], data[i + 2]);
  const equal = data[i] === decoded[i] && data[i + 1] === decoded[i + 1] && data[i + 2] === decoded[i + 2];
  if (!selected && !equal) changedOutsideMask++;
  if (selected && (decoded[i] !== 255 || decoded[i + 1] !== 255 || decoded[i + 2] !== 255)) nonWhiteInsideMask++;
}
if (changedOutsideMask || nonWhiteInsideMask) throw new Error("Background-only pixel verification failed.");
await writeFile(path.join(logoDir, activeName), encoded);
const validation = {
  authorization: "User explicitly requested: 배경 픽셀만 직접 수정해",
  input: archiveName,
  inputSha256: sourceHash,
  output: activeName,
  outputSha256: hash(encoded),
  dimensions: { width: info.width, height: info.height },
  method: "Replace only near-white neutral background RGB pixels with (255,255,255); no crop, rotation, resampling, foreground recoloring or generation.",
  mask: { minimumChannel: 245, maximumChannelSpread: 6 },
  backgroundPixels,
  changedPixels,
  unchangedOutsideMask: info.width * info.height - backgroundPixels,
  preservedGoldPixels,
  goldCheck: "Every warm-gold pixel with R minus B greater than 20 is outside the background mask and unchanged.",
  changedOutsideMask,
  nonWhiteInsideMask,
  tool: { name: "sharp", version: sharp.versions.sharp },
};
await writeFile(path.join(logoDir, "background-pixel-validation.json"), `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify(validation, null, 2));
