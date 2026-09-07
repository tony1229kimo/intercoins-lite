/**
 * Why did this guest not get their voucher? Prints the claim timeline.
 *
 * Reads credentials from the environment so nothing sensitive is typed into a
 * chat or committed, and masks names and contact details on the way out: the
 * question is about timing, not about who the person is.
 *
 * Usage (PowerShell):
 *   $env:ADMIN_USER="<帳號>"; $env:ADMIN_PASS="<密碼>"
 *   npm run audit -- 姓名一 姓名二
 *
 * Or with the master key instead:
 *   $env:ADMIN_TOKEN="<主金鑰>"
 *   npm run audit -- 姓名一
 *
 * With no search terms it summarises every claimed voucher, which is how you
 * see the size of a problem rather than one case of it.
 */
const BASE = process.env.BASE_URL || "https://intercoins.ictaiwan.net";

/**
 * When the two-step claim went live.
 *
 * Before this, GET /api/claim/:token spent the token, so a link preview, a
 * security scanner or a browser prefetch could burn it before the guest ever
 * tapped -- and no voucher was issued. After it, only a POST spends the token,
 * which nothing sends on its own. A claim burned before this moment and a claim
 * burned after it have completely different explanations.
 */
const TWO_STEP_LIVE = new Date("2026-09-05T01:05:14Z");

/** A claim this fast was not a person reading a message and tapping. */
const GHOST_SECS = 30;

const mask = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return "—";
  return t.length <= 1 ? t : t[0] + "○".repeat(Math.min(t.length - 1, 3));
};

const tpe = (d) => new Date(d).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });

async function getToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const username = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASS;
  if (!username || !password) {
    console.error("請先設定 ADMIN_USER + ADMIN_PASS，或 ADMIN_TOKEN。");
    console.error("PowerShell 範例：");
    console.error('  $env:ADMIN_USER="你的帳號"; $env:ADMIN_PASS="你的密碼"');
    console.error("  npm run audit -- 姓名");
    process.exit(1);
  }
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) {
    console.error("登入失敗：", d.error || `HTTP ${r.status}`);
    process.exit(1);
  }
  return d.token;
}

const terms = process.argv.slice(2).map((t) => t.toLowerCase());
const token = await getToken();

const res = await fetch(`${BASE}/api/admin/winners`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error("查詢失敗：HTTP", res.status);
  process.exit(1);
}
const { winners } = await res.json();

const hit = terms.length
  ? winners.filter((w) => terms.some((t) =>
      [w.name, w.lineName, w.phone, w.code, w.prize]
        .some((v) => String(v ?? "").toLowerCase().includes(t))))
  : winners.filter((w) => !w.coin && w.claimMode !== "contact");

if (!hit.length) {
  console.log("找不到符合的紀錄。姓名要跟系統裡登記的一致（電話有空格會對不上）。");
  process.exit(0);
}

console.log(`\n兩段式領獎上線時間：${tpe(TWO_STEP_LIVE)}（台北）\n`);

let burnedBefore = 0;
let burnedAfter = 0;

for (const w of hit) {
  const at = new Date(w.at);
  const beforeFix = at < TWO_STEP_LIVE;
  const ghost = w.claimedAt && typeof w.claimSecs === "number" && w.claimSecs < GHOST_SECS;

  let verdict;
  if (w.coin) verdict = "洲遊幣，直接入帳，沒有券";
  else if (w.claimMode === "contact") verdict = "專人聯繫類，本來就不發券";
  else if (!w.pushed) verdict = `🔴 推播就失敗了${w.pushError ? `（${w.pushError}）` : ""}`;
  else if (!w.claimedAt) verdict = "券還沒被領取 —— 連結應該還有效";
  else if (ghost && beforeFix) { verdict = "🔴 舊版 GET 被系統預先開啟燒掉，客人沒拿到"; burnedBefore++; }
  else if (ghost && !beforeFix) { verdict = "🔴🔴 兩段式上線後仍被快速消耗 —— 另有原因，要查"; burnedAfter++; }
  else verdict = "客人自己領走了（耗時合理）";

  console.log(`${mask(w.name || w.lineName)}  ${w.prize}`);
  console.log(`  中獎     ${tpe(w.at)}  ${beforeFix ? "（修正前）" : "（修正後）"}`);
  console.log(`  推播     ${w.pushed ? "成功" : "失敗"}`);
  console.log(`  領取     ${w.claimedAt ? `${tpe(w.claimedAt)}，中獎後 ${w.claimSecs} 秒` : "尚未領取"}`);
  console.log(`  兌換碼   ${w.code}`);
  console.log(`  判讀     ${verdict}`);
  console.log(`  重發用   draw id = ${w.id}`);
  console.log();
}

if (!terms.length) {
  console.log("──────────────────────────────");
  console.log(`實體獎共 ${hit.length} 筆`);
  console.log(`  修正前被燒掉（需補發）  ${burnedBefore}`);
  console.log(`  修正後仍被燒掉（要查）  ${burnedAfter}`);
}
