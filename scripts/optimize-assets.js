/**
 * 把 public/assets 底下的 PNG 轉成 WebP。
 *
 * 為什麼要做：轉盤三層美術原檔 1920×1920 PNG，三個等級共 15 張約 43MB。
 * 這是給手機在 LINE 裡開的 LIFF —— 味蕾旅遊地圖的程式碼裡就留著
 * 「弱網時要等十幾秒到幾分鐘（現場 4G 擁塞常見）」的註解。
 * WebP 大約能壓到 1/10，而且 iOS 14+ / Android Chrome 全支援。
 *
 * 用法：npm run optimize:assets
 * 轉完會自動刪掉原 PNG（原檔在 git 歷史裡；要回頭找就 git show）。
 */
import { readdir, stat, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "public", "assets");

// 轉盤大圖用 quality 80 就看不出差別；小圖（硬幣、投幣口）留高一點避免邊緣糊掉。
function qualityFor(width) {
  return width >= 1000 ? 80 : 90;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let before = 0, after = 0, count = 0;

for await (const file of walk(ASSETS)) {
  if (extname(file).toLowerCase() !== ".png") continue;
  const out = file.replace(/\.png$/i, ".webp");
  const src = await stat(file);
  const meta = await sharp(file).metadata();

  await sharp(file)
    .webp({ quality: qualityFor(meta.width), effort: 6, alphaQuality: 100 })
    .toFile(out);

  const dst = await stat(out);
  before += src.size;
  after += dst.size;
  count++;
  const rel = file.slice(ASSETS.length + 1).replace(/\\/g, "/");
  console.log(
    `  ${rel.padEnd(22)} ${(src.size / 1048576).toFixed(2)}MB → ${(dst.size / 1048576).toFixed(2)}MB` +
    `  (-${(100 - dst.size / src.size * 100).toFixed(0)}%)`,
  );
  await unlink(file);
}

console.log(`\n${count} 張圖：${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB` +
  `（省下 ${(100 - after / before * 100).toFixed(0)}%）`);
console.log("記得把 index.html 裡的 .png 參照改成 .webp");
