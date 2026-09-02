/**
 * Flex Message 屬性防呆。
 *
 * 2026-09-02 的教訓：`letterSpacing` 不是 LINE Flex 的屬性（只有 lineSpacing），
 * 帶了整則訊息會被退 HTTP 400 —— 而且是**每一則都退**。
 * 結果從上線到發現為止，76 筆中獎推播成功 0 筆，沒有任何一位客人收到券。
 *
 * 這種錯不會在本機噴出來（我們沒有 LINE token 可以打），所以改用原始碼掃描：
 * 只要 line.js 裡出現「看起來像 CSS、但 LINE 沒有」的屬性名就讓測試失敗。
 *
 * ⚠️ 這是 lint 等級的防呆，不是完整的 schema 驗證。
 *    真正的驗證要打 LINE 的 POST /v2/bot/message/validate/push（不發送、只驗格式）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
  path.join(import.meta.dirname, "..", "lib", "line.js"),
  "utf8",
);

/** 這些是 CSS 有、但 LINE Flex 沒有的屬性 —— 寫下去就是整則 400。 */
const NOT_LINE_FLEX = {
  letterSpacing: "LINE 只有 lineSpacing（行距），沒有字距",
  fontSize: "用 size（xs/sm/md/lg/xl/xxl/3xl…）",
  fontFamily: "Flex 不能指定字體",
  fontWeight: "用 weight: 'regular' | 'bold'",
  lineHeight: "用 lineSpacing",
  textAlign: "用 align",
  borderRadius: "用 cornerRadius",
  boxShadow: "Flex 沒有陰影",
  opacity: "Flex 沒有透明度",
  zIndex: "Flex 沒有疊層",
};

for (const [prop, hint] of Object.entries(NOT_LINE_FLEX)) {
  test(`Flex 不可以用 ${prop}`, () => {
    // 只抓當成物件 key 用的（prop: ...），註解裡提到不算
    const asKey = new RegExp(`(^|[{,\\s])${prop}\\s*:`, "m");
    const lines = SRC.split("\n")
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter(([, l]) => asKey.test(l));
    assert.deepEqual(
      lines.map(([n, l]) => `line.js:${n} ${l.trim().slice(0, 80)}`),
      [],
      `server/lib/line.js 用了 LINE Flex 不支援的 ${prop} —— ${hint}。` +
        "帶了它整則推播會被 LINE 退 400，而且每一則都退。",
    );
  });
}

test("兩個 bubble 的 header 標題還在（改動時別把文字弄丟）", () => {
  const hits = SRC.match(/text:\s*"洲\s*遊\s*幣\s*·\s*恭\s*喜\s*中\s*獎"/g) || [];
  assert.equal(hits.length, 2, "pushRewardCoupon 與 pushContactReminder 各應有一個 header 標題");
});
