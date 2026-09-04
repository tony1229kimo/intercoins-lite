/**
 * public/ 底下的檔案會【原封不動】送到瀏覽器，按 F12 就看得到。
 *
 * 2026-09-04 實測線上原始碼撈出來的東西，這個測試就是為了擋住它們再犯：
 *   🔴 客人【看得到的畫面文字】寫著「【AI 草稿】需法務審核；稅務門檻為待查證值」
 *      —— 不是註解，是 opacity:.75 的 <p>，領獎須知一點開就看到
 *   🔴 寫死的預覽密碼、後台 API 路徑、示範連結註解裡的中獎機率
 *   🔴 「假驗證」「無法真的驗證追蹤，回來即發」＝告訴客人不用真追蹤也能拿幣
 *   🟡 其他專案名、資料表名、託管商、環境變數名、內部來源檔名
 *
 * 靠人工複查會再犯（2026-09-04 當天就犯了兩次），所以寫成測試。
 *
 * 規則：public/*.html 只留「怎麼運作」，不留
 *       為什麼這樣防 / 還沒審核 / 其實是假的 / 商業意圖 / 內部識別。
 *       詳細脈絡寫在 server/ 底下 —— 那些永遠不會送到瀏覽器。
 *
 * ⚠️ admin.html 也是公開送出的（登入表單就在裡面），但它本來就是後台，
 *    「機率」「名額」「Omnichat 發券」是它的功能標籤，不列入禁詞；
 *    真正該做的是讓 /admin 的 HTML 需要驗證才拿得到 —— 見 README 的待辦。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.join(import.meta.dirname, "..", "..", "public");
const FILES = readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".html"));

/** 兩個檔案都不可以有的東西。 */
const BANNED_ALL = [
  ["寫死的密碼", /(?:PASSWORD|password)\s*[:=]\s*['"][^'"]{3,}['"]/,
   "密碼不可寫死在公開檔案，改由伺服器環境變數餵"],
  ["託管商", /Zeabur/, "不要在前端提到託管平台"],
  ["環境變數名", /ADMIN_TOKEN|ADMIN_USERS|DATABASE_URL|LINE_MESSAGING_ACCESS_TOKEN|MAX_PHYSICAL_WINS|PRIZES_RESEED|PREVIEW_PASSWORD/,
   "不要在前端提到伺服器環境變數名"],
  ["資料表名", /player_profiles|prize_contacts|task_claims|coin_ledger|[Pp]ostgres/,
   "不要洩漏資料庫與資料表名"],
  ["券商連結", /api\.omnichat|omnichat\.ai/i,
   "兌換券連結是 stateless，拿到就能領，絕不可出現在前端"],
  ["內部來源檔名", /\.xlsx/, "不要洩漏內部來源檔名"],
  ["其他專案名", /味蕾地圖|culinary-?journey|ictaipei|ickaohsiung|wellness-ai/i,
   "不要提到其他專案"],
  ["後端檔案路徑", /server\/(lib|routes|middleware)\//,
   "不要洩漏後端原始碼結構"],
];

/** 只有客人會看的 index.html 要守的額外規則。 */
const BANNED_CUSTOMER = [
  ["未審核自白", /AI 草稿|需法務|待查證|恐受限|尚未審核|未定案|草稿/,
   "🔴 不可自承文案未經審核 —— 等於告訴客人活動條款可能無效"],
  ["假驗證自白", /假驗證|無法真的驗證|回來即發|輕量存取門檻|保護應改由|原型/,
   "🔴 不可寫出驗證是假的或防護不足"],
  ["後台 API 路徑", /\/api\/admin/, "前端不該提到後台端點"],
  ["揭露機率／庫存機制", /機率.{0,8}庫存|庫存.{0,8}機率|不能讓客人|改個變數|自己改幣數/,
   "不要解釋我們藏了什麼、以及為什麼要藏"],
  ["商業意圖", /刻意不列|留在畫面上當目標|免得客人白轉|當誘因|維持蒐集動機/,
   "不要寫出對客人的引導意圖"],
  // 中獎機率：只抓「機率／中獎率」語境裡的數字，
  // 才不會誤判 CSS 的 width:100% 或條款裡合法的稅率 10%／20%
  ["中獎機率數字", /(?:機率|中獎率|weight)[^\n]{0,20}\d{1,3}(?:\.\d+)?\s*%|\d{1,3}(?:\.\d+)?\s*%[^\n]{0,12}(?:機率|中獎率)/,
   "🔴 中獎機率絕不可對客人公開"],
];

for (const file of FILES) {
  const src = readFileSync(path.join(PUBLIC_DIR, file), "utf8");
  const rules = file === "index.html"
    ? [...BANNED_ALL, ...BANNED_CUSTOMER]
    : BANNED_ALL;

  for (const [label, re, why] of rules) {
    test(`${file} 不可出現：${label}`, () => {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      const hits = (src.match(g) || []).map((h) => h.replace(/\s+/g, " ").slice(0, 60));
      assert.deepEqual(hits, [], `${why}\n找到 ${hits.length} 處：${JSON.stringify(hits.slice(0, 5))}`);
    });
  }
}

test("確實有掃到檔案（避免測試空轉而假通過）", () => {
  assert.ok(FILES.includes("index.html"), `沒掃到 index.html，只有：${FILES}`);
  assert.ok(FILES.length >= 2, `只掃到 ${FILES.length} 個檔案`);
});
