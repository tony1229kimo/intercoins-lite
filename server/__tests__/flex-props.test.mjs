/**
 * Guard against properties LINE Flex does not have.
 *
 * The lesson from 2026-09-02: letterSpacing is not a Flex property -- only
 * lineSpacing is -- and including it has the whole message rejected with a 400.
 * Every message, every time. Between going live and the cause being found, all 76
 * winner pushes failed and not one guest received a voucher.
 *
 * This kind of mistake cannot surface locally, because there is no token here to
 * call LINE with. So it is caught by scanning the source instead: a property name
 * that looks like CSS but does not exist in Flex fails the test.
 *
 * This is a lint, not schema validation. Real validation means calling LINE's
 * POST /v2/bot/message/validate/push, which checks the shape without sending.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
  path.join(import.meta.dirname, "..", "lib", "line.js"),
  "utf8",
);

/** Properties CSS has and LINE Flex does not. Writing one is a 400 for the whole message. */
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
    // only where it is used as an object key (prop: ...); a mention in a comment does not count
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
