/**
 * 員工手冊 · 一般版（雙語）→ PPTX
 *
 * 出：docs/洲遊幣Lite_員工手冊_一般版_雙語.pptx
 *
 * 設計原則
 *   - 中先英後。中文為主視覺，英文以較小的灰字並列，不做成兩堵字牆
 *   - 館別一律用固定顏色：高雄=金棕、臺北=藍。客人問到時同事一眼認得出
 *   - 【刻意不放活動連結】—— 客人是掃月餅禮盒裡的 QR Code 進來的，
 *     手冊放連結會被截圖轉發，繞過禮盒這個通路
 *   - 不含機率、庫存、後台入口等內部資訊（那些在管理版）
 *
 * Run: node docs/build-staff-guide-bilingual.cjs
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

// ─── IC 品牌色 ──────────────────────────────────────────────────
const INK = "3D3935", GOLD = "935D08", GOLD_LT = "B8923E";
const GREY = "6E6A63", GREY_LT = "DAD9D6", WHITE = "FFFFFF";
const CREAM = "FAF8F6", TINT = "F4ECE7", SOFT = "FFFDFA";
const OK = "1F6B47", OK_BG = "E8F3EC";
const BAD = "9A3B3B", BAD_BG = "FBEDED";
const WARN = "9C6212", WARN_BG = "FBF1DC";
const KH_BG = "F3EADA", KH_FG = "7A5B12", KH_LINE = "C9A961";
const TPE_BG = "E7EDF3", TPE_FG = "35536F", TPE_LINE = "8FA9C0";

const FONT = "Microsoft JhengHei";
const H = 5.625, W = 10;

const p = new pptxgen();
p.layout = "LAYOUT_16x9";
p.author = "Tony Chen";
p.company = "InterContinental Kaohsiung × Taipei";
p.title = "洲遊幣 Lite 員工手冊（雙語）";
p.subject = "InterCoins Lite Staff Guide (Bilingual)";

let n = 0;

/** 內頁框架：中文大標 + 英文小標 + 金色短線 + 頁碼 */
function slide(zh, en) {
  const s = p.addSlide();
  s.background = { color: CREAM };
  n++;
  if (zh) {
    s.addText(zh, { x: 0.55, y: 0.3, w: 8.9, h: 0.42, fontFace: FONT, fontSize: 22, bold: true, color: INK });
    if (en) s.addText(en, { x: 0.55, y: 0.72, w: 8.9, h: 0.28, fontFace: FONT, fontSize: 11.5, color: GREY });
    s.addShape(p.ShapeType.rect, { x: 0.55, y: en ? 1.03 : 0.8, w: 0.5, h: 0.04, fill: { color: GOLD } });
  }
  s.addText(String(n), { x: 9.15, y: H - 0.4, w: 0.4, h: 0.26, fontFace: FONT, fontSize: 9.5, color: GREY_LT, align: "right" });
  s.addText("洲遊幣 Lite 員工手冊 · InterCoins Lite Staff Guide",
    { x: 0.55, y: H - 0.4, w: 6, h: 0.26, fontFace: FONT, fontSize: 8.5, color: GREY_LT });
  return s;
}

/** 中英並列的文字段（中文一行、英文一行） */
function bi(zh, en, o = {}) {
  return [
    { text: zh + (en ? "\n" : ""), options: { fontSize: o.zhSize ?? 12.5, bold: o.bold, color: o.color ?? INK } },
    ...(en ? [{ text: en + (o.tail ?? ""), options: { fontSize: o.enSize ?? 10, color: o.enColor ?? GREY } }] : []),
  ];
}

/** 色塊提示 */
function callout(s, { x, y, w, h, zh, en, tone = "warn", icon = "⚠️" }) {
  const map = { warn: [WARN_BG, WARN], bad: [BAD_BG, BAD], ok: [OK_BG, OK], info: [TINT, GOLD] };
  const [bg, fg] = map[tone];
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: bg }, line: { color: fg, width: 0.75 } });
  s.addText([
    { text: icon + "  ", options: { fontSize: 12 } },
    { text: zh + "\n", options: { fontSize: 11.5, bold: true } },
    { text: "　　 " + en, options: { fontSize: 9.5, color: fg } },
  ], { x: x + 0.16, y: y + 0.05, w: w - 0.32, h: h - 0.1, fontFace: FONT, color: fg, valign: "middle", lineSpacing: 15 });
}

/** 編號步驟列 */
function step(s, { x = 0.6, y, num, zh, en, w = 8.4 }) {
  s.addShape(p.ShapeType.ellipse, { x, y, w: 0.42, h: 0.42, fill: { color: GOLD } });
  s.addText(String(num), { x, y, w: 0.42, h: 0.42, fontFace: FONT, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle" });
  s.addText(zh, { x: x + 0.6, y: y - 0.03, w, h: 0.28, fontFace: FONT, fontSize: 13, bold: true, color: INK });
  s.addText(en, { x: x + 0.6, y: y + 0.25, w, h: 0.24, fontFace: FONT, fontSize: 9.5, color: GREY });
}

/** 問答卡 */
function qa(s, { y, zh, en, azh, aen, h = 1.06 }) {
  s.addShape(p.ShapeType.roundRect, { x: 0.55, y, w: 8.9, h, rectRadius: 0.06, fill: { color: SOFT }, line: { color: GREY_LT, width: 0.75 } });
  s.addText([
    { text: "Q  ", options: { fontSize: 11, bold: true, color: GOLD_LT } },
    { text: zh + "\n", options: { fontSize: 12, bold: true, color: GOLD } },
    { text: "　  " + en, options: { fontSize: 9, color: GREY } },
    // 問句：中文 + 英文兩行，需要 0.5" 才不會被下面的答案壓到
  ], { x: 0.75, y: y + 0.08, w: 8.5, h: 0.5, fontFace: FONT, lineSpacing: 13 });
  s.addText([
    { text: azh + "\n", options: { fontSize: 10.5, color: INK } },
    { text: aen, options: { fontSize: 9, color: GREY } },
  ], { x: 0.75, y: y + 0.62, w: 8.5, h: h - 0.7, fontFace: FONT, lineSpacing: 13 });
}

// ══════════════════════════════════════════════════════════════
// 1 · 封面
// ══════════════════════════════════════════════════════════════
{
  const s = p.addSlide();
  s.background = { color: "2B2620" };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.13, h: H, fill: { color: GOLD_LT } });
  s.addText("I N T E R C O N T I N E N T A L", { x: 0.9, y: 1.2, w: 8, h: 0.28, fontFace: FONT, fontSize: 11.5, color: GOLD_LT, charSpacing: 2 });
  s.addText("洲遊幣 Lite", { x: 0.9, y: 1.58, w: 8, h: 0.8, fontFace: FONT, fontSize: 42, bold: true, color: WHITE });
  s.addText("InterCoins Lite", { x: 0.9, y: 2.36, w: 8, h: 0.38, fontFace: FONT, fontSize: 17, color: GOLD_LT });
  s.addShape(p.ShapeType.rect, { x: 0.92, y: 2.86, w: 0.5, h: 0.035, fill: { color: GOLD_LT } });
  s.addText("員工手冊", { x: 0.9, y: 3.0, w: 8, h: 0.44, fontFace: FONT, fontSize: 22, color: WHITE });
  s.addText("Staff Guide", { x: 0.9, y: 3.42, w: 8, h: 0.3, fontFace: FONT, fontSize: 13, color: "B5ADA2" });
  s.addText([
    { text: "櫃檯 · 餐廳外場 · 客服 · 行銷執行\n", options: { fontSize: 11.5, color: "B5ADA2" } },
    { text: "Front Desk · F&B Service · Guest Relations · Marketing", options: { fontSize: 9.5, color: "8A837A" } },
  ], { x: 0.9, y: 3.88, w: 8, h: 0.5, fontFace: FONT, lineSpacing: 14 });
  s.addText([
    { text: "活動期間 Campaign Period　2026.09.01 – 11.30", options: { fontSize: 11, color: GOLD_LT } },
  ], { x: 0.9, y: H - 0.82, w: 8.5, h: 0.3, fontFace: FONT });
}

// ══════════════════════════════════════════════════════════════
// 2 · 目錄
// ══════════════════════════════════════════════════════════════
{
  const s = slide("目錄", "Contents");
  const items = [
    ["1", "活動概要", "About the Campaign"],
    ["2", "客人怎麼參加", "How Guests Join"],
    ["3", "客人怎麼玩", "How the Game Works"],
    ["4", "⭐ 兩種領獎方式", "Two Ways Prizes Are Claimed"],
    ["5", "⭐ 只有兌換碼、沒有券", "Code but No Coupon"],
    ["6", "櫃檯核銷步驟", "Counter Redemption Procedure"],
    ["7", "常見問題與標準回答（含櫃檯）", "FAQ & Suggested Replies"],
    ["8", "不可以對客人說的事 / 何時回報", "What Not to Disclose / When to Escalate"],
  ];
  items.forEach(([num, zh, en], i) => {
    const x = i < 4 ? 0.65 : 5.15;
    const y = 1.45 + (i % 4) * 0.82;
    s.addText(num, { x, y: y + 0.02, w: 0.35, h: 0.3, fontFace: FONT, fontSize: 15, bold: true, color: GOLD_LT });
    s.addText(zh, { x: x + 0.42, y, w: 3.7, h: 0.3, fontFace: FONT, fontSize: 13.5, bold: true, color: INK });
    s.addText(en, { x: x + 0.42, y: y + 0.29, w: 3.7, h: 0.26, fontFace: FONT, fontSize: 9.5, color: GREY });
  });
  callout(s, { x: 0.55, y: 4.75, w: 8.9, h: 0.55, tone: "info", icon: "📖",
    zh: "第 4、5 章是最容易搞錯的部分（領獎方式看獎品不看飯店；只有兌換碼有兩種人），請務必看完。",
    en: "Sections 4 and 5 are the most commonly misunderstood — please read them carefully." });
}

// ══════════════════════════════════════════════════════════════
// 3 · 活動概要
// ══════════════════════════════════════════════════════════════
{
  const s = slide("一、活動概要", "About the Campaign");
  s.addText(bi(
    "「洲遊幣 Lite」是臺北洲際酒店與高雄洲際酒店合辦的中秋線上抽獎遊戲。",
    "InterCoins Lite is a Mid-Autumn online prize game jointly run by InterContinental Taipei and InterContinental Kaohsiung.",
    { zhSize: 13.5 }),
    { x: 0.7, y: 1.35, w: 8.6, h: 0.75, fontFace: FONT, lineSpacing: 19 });

  const cards = [
    ["📅", "活動期間", "Campaign Period", "2026 年 9 月 1 日 – 11 月 30 日", "1 Sep – 30 Nov 2026"],
    ["📱", "在哪裡玩", "Where", "在 LINE 中進行", "Played entirely within LINE"],
    ["🎁", "獎品來源", "Prizes From", "兩家飯店的獎品同時在一個轉盤裡", "Both hotels share one prize wheel"],
  ];
  cards.forEach(([icon, zh, en, vzh, ven], i) => {
    const x = 0.55 + i * 3.03;
    s.addShape(p.ShapeType.roundRect, { x, y: 2.3, w: 2.84, h: 1.75, rectRadius: 0.08, fill: { color: SOFT }, line: { color: GREY_LT, width: 0.75 } });
    s.addText(icon, { x: x + 0.2, y: 2.45, w: 0.5, h: 0.35, fontFace: FONT, fontSize: 19 });
    s.addText(zh, { x: x + 0.2, y: 2.85, w: 2.4, h: 0.26, fontFace: FONT, fontSize: 12.5, bold: true, color: GOLD });
    s.addText(en, { x: x + 0.2, y: 3.09, w: 2.4, h: 0.22, fontFace: FONT, fontSize: 8.5, color: GREY });
    s.addText(vzh, { x: x + 0.2, y: 3.38, w: 2.45, h: 0.28, fontFace: FONT, fontSize: 11, color: INK });
    s.addText(ven, { x: x + 0.2, y: 3.64, w: 2.45, h: 0.34, fontFace: FONT, fontSize: 8.5, color: GREY });
  });

  callout(s, { x: 0.55, y: 4.3, w: 8.9, h: 0.62, tone: "info", icon: "🥮",
    zh: "客人是掃描月餅禮盒內附的 QR Code 進入活動。",
    en: "Guests enter by scanning the QR code included in the mooncake gift box." });
}

// ══════════════════════════════════════════════════════════════
// 4 · 客人怎麼參加
// ══════════════════════════════════════════════════════════════
{
  const s = slide("二、客人怎麼參加", "How Guests Join");
  step(s, { y: 1.45, num: 1, zh: "掃描月餅禮盒內附的 QR Code", en: "Scan the QR code inside the mooncake gift box" });
  step(s, { y: 2.15, num: 2, zh: "以 LINE 帳號登入", en: "Log in with their LINE account" });
  step(s, { y: 2.85, num: 3, zh: "加入「高雄洲際酒店」LINE 官方帳號好友（必要）",
    en: "Add InterContinental Kaohsiung's LINE Official Account as a friend (required)" });
  step(s, { y: 3.55, num: 4, zh: "進入遊戲", en: "Enter the game" });

  callout(s, { x: 0.55, y: 4.25, w: 4.3, h: 0.95, tone: "info", icon: "❓",
    zh: "為什麼一定要加好友？",
    en: "Because prize coupons are delivered to the guest's LINE chat — without the friendship, they cannot be sent." });
  callout(s, { x: 5.15, y: 4.25, w: 4.3, h: 0.95, tone: "warn", icon: "🙅",
    zh: "請勿私下轉發活動連結給客人。",
    en: "Please do not forward the campaign link — always direct guests to the QR code in the gift box." });
}

// ══════════════════════════════════════════════════════════════
// 5 · 客人怎麼玩
// ══════════════════════════════════════════════════════════════
{
  const s = slide("三、客人怎麼玩", "How the Game Works");
  s.addText(bi("完成任務 → 獲得洲遊幣 → 投幣抽獎",
    "Complete tasks → Earn InterCoins → Spend them to spin the wheel",
    { zhSize: 14, bold: true, color: GOLD }),
    { x: 0.7, y: 1.35, w: 8.6, h: 0.6, fontFace: FONT, lineSpacing: 19 });

  // 任務
  s.addShape(p.ShapeType.roundRect, { x: 0.55, y: 2.0, w: 4.3, h: 2.35, rectRadius: 0.08, fill: { color: SOFT }, line: { color: GREY_LT, width: 0.75 } });
  s.addText([{ text: "可以做的任務\n", options: { fontSize: 12.5, bold: true, color: INK } },
             { text: "Available Tasks　（每項 +1 洲遊幣 / +1 coin each）", options: { fontSize: 8.5, color: GREY } }],
    { x: 0.78, y: 2.14, w: 3.9, h: 0.45, fontFace: FONT, lineSpacing: 13 });
  s.addText([
    { text: "▸ 追蹤 高雄洲際 Instagram / Facebook\n", options: {} },
    { text: "▸ 追蹤 臺北洲際 Instagram / Facebook\n", options: {} },
    { text: "▸ 追蹤 高雄洲際「食遇」Instagram / Facebook\n", options: {} },
    { text: "▸ 分享活動給好友\n", options: {} },
    { text: "▸ 填寫個人資料", options: {} },
  ], { x: 0.78, y: 2.66, w: 3.95, h: 1.6, fontFace: FONT, fontSize: 10.5, color: INK, lineSpacing: 17 });

  // 抽獎
  s.addShape(p.ShapeType.roundRect, { x: 5.15, y: 2.0, w: 4.3, h: 2.35, rectRadius: 0.08, fill: { color: SOFT }, line: { color: GREY_LT, width: 0.75 } });
  s.addText([{ text: "投幣抽獎\n", options: { fontSize: 12.5, bold: true, color: INK } },
             { text: "Spending Coins on the Wheel", options: { fontSize: 8.5, color: GREY } }],
    { x: 5.38, y: 2.14, w: 3.9, h: 0.45, fontFace: FONT, lineSpacing: 13 });
  [["三等獎", "Third Prize", "投 1 枚 / 1 coin"],
   ["二等獎", "Second Prize", "投 3 枚 / 3 coins"],
   ["一等獎", "First Prize", "投 5 枚 / 5 coins"]].forEach(([zh, en, cost], i) => {
    const y = 2.7 + i * 0.5;
    s.addText([{ text: zh + "　", options: { fontSize: 12, bold: true, color: INK } },
               { text: en, options: { fontSize: 8.5, color: GREY } }],
      { x: 5.38, y, w: 2.3, h: 0.3, fontFace: FONT });
    s.addShape(p.ShapeType.roundRect, { x: 7.75, y: y + 0.02, w: 1.5, h: 0.3, rectRadius: 0.05, fill: { color: TINT } });
    s.addText(cost, { x: 7.75, y: y + 0.02, w: 1.5, h: 0.3, fontFace: FONT, fontSize: 8.5, color: GOLD, align: "center", valign: "middle" });
  });

  callout(s, { x: 0.55, y: 4.5, w: 8.9, h: 0.62, tone: "bad", icon: "🪙",
    zh: "每次抽獎都會扣洲遊幣，但一定會中獎 —— 最少也會拿到餐飲 85 折優惠。",
    en: "Every spin costs coins, and every spin wins something — at minimum a 15% dining discount." });
}

// ══════════════════════════════════════════════════════════════
// 6 · ⭐ 兩種領獎方式（核心）
// ══════════════════════════════════════════════════════════════
{
  const s = slide("四、⭐ 兩種領獎方式", "Two Ways Prizes Are Claimed　—　最重要的一頁 / The most important page");
  s.addText(bi("看【客人手上有沒有優惠券】，不是看哪一家飯店。",
    "What matters is whether the guest has a coupon — not which hotel the prize is from.",
    { zhSize: 12.5, bold: true, color: GOLD }),
    { x: 0.7, y: 1.28, w: 8.6, h: 0.5, fontFace: FONT, lineSpacing: 17 });

  s.addShape(p.ShapeType.roundRect, { x: 0.55, y: 1.85, w: 4.3, h: 2.5, rectRadius: 0.1, fill: { color: KH_BG }, line: { color: KH_LINE, width: 1.25 } });
  s.addText([{ text: "📩  有優惠券（多數獎項）\n", options: { fontSize: 14, bold: true, color: KH_FG } },
             { text: "Coupon Issued — most prizes", options: { fontSize: 9, color: KH_FG } }],
    { x: 0.78, y: 1.98, w: 3.9, h: 0.48, fontFace: FONT, lineSpacing: 14 });
  s.addText([
    { text: "券在中獎當下自動進客人的 LINE\n", options: { fontSize: 11, bold: true, color: INK } },
    { text: "Delivered to their LINE chat automatically\n\n", options: { fontSize: 8.5, color: KH_FG } },
    { text: "▸ 客人自行點選領取（限一次）\n", options: { fontSize: 10.5, color: INK } },
    { text: "   Claimed by the guest, once only\n", options: { fontSize: 8, color: KH_FG } },
    { text: "▸ 到店出示兌換碼 → 櫃檯核銷\n", options: { fontSize: 10.5, color: INK } },
    { text: "   Present the code → redeem at counter", options: { fontSize: 8, color: KH_FG } },
  ], { x: 0.78, y: 2.5, w: 3.9, h: 1.75, fontFace: FONT, lineSpacing: 13 });

  s.addShape(p.ShapeType.roundRect, { x: 5.15, y: 1.85, w: 4.3, h: 2.5, rectRadius: 0.1, fill: { color: TPE_BG }, line: { color: TPE_LINE, width: 1.25 } });
  s.addText([{ text: "📞  沒有券・專人聯繫\n", options: { fontSize: 14, bold: true, color: TPE_FG } },
             { text: "No Coupon — direct follow-up", options: { fontSize: 9, color: TPE_FG } }],
    { x: 5.38, y: 1.98, w: 3.9, h: 0.48, fontFace: FONT, lineSpacing: 14 });
  s.addText([
    { text: "臺北全部獎項 ＋ 高雄的兩項住宿大獎\n", options: { fontSize: 11, bold: true, color: INK } },
    { text: "All Taipei prizes + two Kaohsiung room prizes\n\n", options: { fontSize: 8.5, color: TPE_FG } },
    { text: "▸ 畫面請客人留姓名／手機／Email\n", options: { fontSize: 10.5, color: INK } },
    { text: "   Guest submits their contact details\n", options: { fontSize: 8, color: TPE_FG } },
    { text: "▸ 該館同仁主動聯繫安排\n", options: { fontSize: 10.5, color: INK } },
    { text: "   That hotel's team contacts them directly", options: { fontSize: 8, color: TPE_FG } },
  ], { x: 5.38, y: 2.5, w: 3.9, h: 1.75, fontFace: FONT, lineSpacing: 13 });

  callout(s, { x: 0.55, y: 4.5, w: 8.9, h: 0.62, tone: "bad", icon: "🚫",
    zh: "客人只有兌換碼、LINE 裡沒有優惠券 → 是專人聯繫的獎項，請勿核銷。",
    en: "If the guest has only a code and no coupon in LINE, it is a follow-up prize — do not redeem." });
}

// ══════════════════════════════════════════════════════════════
// 7 · 哪些獎要專人聯繫
// ══════════════════════════════════════════════════════════════
{
  const s = slide("四之二、哪些獎項要專人聯繫", "Which Prizes Require Follow-Up");

  s.addShape(p.ShapeType.roundRect, { x: 0.55, y: 1.3, w: 4.3, h: 1.5, rectRadius: 0.08, fill: { color: TPE_BG }, line: { color: TPE_LINE, width: 1 } });
  s.addText([{ text: "🔵  臺北洲際酒店\n", options: { fontSize: 13, bold: true, color: TPE_FG } },
             { text: "InterContinental Taipei\n\n", options: { fontSize: 8.5, color: TPE_FG } },
             { text: "全部獎項\n", options: { fontSize: 12, bold: true, color: INK } },
             { text: "All prizes — redemption terms not yet finalised", options: { fontSize: 8.5, color: TPE_FG } }],
    { x: 0.78, y: 1.44, w: 3.9, h: 1.25, fontFace: FONT, lineSpacing: 14 });

  s.addShape(p.ShapeType.roundRect, { x: 5.15, y: 1.3, w: 4.3, h: 1.5, rectRadius: 0.08, fill: { color: KH_BG }, line: { color: KH_LINE, width: 1 } });
  s.addText([{ text: "🟡  高雄洲際酒店\n", options: { fontSize: 13, bold: true, color: KH_FG } },
             { text: "InterContinental Kaohsiung\n\n", options: { fontSize: 8.5, color: KH_FG } },
             { text: "只有這兩項住宿大獎\n", options: { fontSize: 12, bold: true, color: INK } },
             { text: "Only these two room prizes — the rest issue coupons", options: { fontSize: 8.5, color: KH_FG } }],
    { x: 5.38, y: 1.44, w: 3.9, h: 1.25, fontFace: FONT, lineSpacing: 14 });

  [["港灣海景開放式套房 住宿一晚（含雙人早餐）", "Harbour View Studio Suite — one night with breakfast for two"],
   ["豪華經典房 住宿一晚（含雙人早餐）", "Deluxe Classic Room — one night with breakfast for two"]]
    .forEach(([zh, en], i) => {
    const y = 2.95 + i * 0.72;
    s.addShape(p.ShapeType.roundRect, { x: 0.55, y, w: 8.9, h: 0.62, rectRadius: 0.05, fill: { color: SOFT }, line: { color: KH_LINE, width: 0.75 } });
    s.addText("🏨", { x: 0.75, y: y + 0.06, w: 0.4, h: 0.5, fontFace: FONT, fontSize: 13, valign: "middle" });
    s.addText([{ text: "高雄洲際酒店 " + zh + "\n", options: { fontSize: 11.5, bold: true, color: INK } },
               { text: en, options: { fontSize: 8.5, color: GREY } }],
      { x: 1.2, y: y + 0.05, w: 8.05, h: 0.52, fontFace: FONT, lineSpacing: 13 });
  });

  callout(s, { x: 0.55, y: 4.45, w: 8.9, h: 0.72, tone: "info", icon: "🛏",
    zh: "住宿券要安排入住日期與房型，不是拿張券到櫃檯就能換，所以由飯店的人主動聯繫。",
    en: "Room stays require arranging dates and room types, so the hotel contacts the guest directly." });
}

// ══════════════════════════════════════════════════════════════
// 8 · 櫃檯核銷步驟
// ══════════════════════════════════════════════════════════════
{
  const s = slide("五、⭐ 只有兌換碼、沒有優惠券", "Code but No Coupon　—　有兩種人，要分開處理 / Two different cases");
  s.addText(bi("同樣是「只有兌換碼」，有的人是真的中獎，有的人要等專人聯繫。看獎品名稱就能分。",
    "Both look the same. Tell them apart by the prize name.",
    { zhSize: 12, bold: true, color: GOLD }),
    { x: 0.7, y: 1.26, w: 8.6, h: 0.5, fontFace: FONT, lineSpacing: 17 });

  // 左：受理
  s.addShape(p.ShapeType.roundRect, { x: 0.55, y: 1.86, w: 4.3, h: 2.4, rectRadius: 0.08,
    fill: { color: OK_BG }, line: { color: OK, width: 1.2 } });
  s.addText([{ text: "✅  是真的中獎 → 受理\n", options: { fontSize: 13.5, bold: true, color: OK } },
             { text: "A genuine win — accept it", options: { fontSize: 9, color: GREY } }],
    { x: 0.78, y: 2.0, w: 3.9, h: 0.5, fontFace: FONT, lineSpacing: 15 });
  s.addText([
    { text: "獎品是「高雄洲際酒店」的實體小物或餐飲券\n", options: { bold: true } },
    { text: "Kaohsiung merchandise or dining vouchers\n\n", options: { fontSize: 8.5, color: GREY } },
    { text: "系統曾經發生異常，券沒送進客人的 LINE。\n", options: {} },
    { text: "獎品確實是他的 —— 請受理並回報主管確認。", options: { bold: true } },
  ], { x: 0.78, y: 2.56, w: 3.9, h: 1.6, fontFace: FONT, fontSize: 10.5, color: INK, lineSpacing: 16 });

  // 右：不核銷
  s.addShape(p.ShapeType.roundRect, { x: 5.15, y: 1.86, w: 4.3, h: 2.4, rectRadius: 0.08,
    fill: { color: BAD_BG }, line: { color: BAD, width: 1.2 } });
  s.addText([{ text: "🚫  專人聯繫類 → 不核銷\n", options: { fontSize: 13.5, bold: true, color: BAD } },
             { text: "Follow-up prize — do not redeem", options: { fontSize: 9, color: GREY } }],
    { x: 5.38, y: 2.0, w: 3.9, h: 0.5, fontFace: FONT, lineSpacing: 15 });
  s.addText([
    { text: "① 獎品名稱有「臺北洲際酒店」\n② 任何「住宿一晚」的獎項\n", options: { bold: true } },
    { text: "Any Taipei prize, or any room stay\n\n", options: { fontSize: 8.5, color: GREY } },
    { text: "這類獎項本來就不發券，由該館同仁主動聯繫。\n", options: {} },
    { text: "請告知客人會有專人聯繫，並回報主管。", options: { bold: true } },
  ], { x: 5.38, y: 2.56, w: 3.9, h: 1.6, fontFace: FONT, fontSize: 10.5, color: INK, lineSpacing: 16 });

  callout(s, { x: 0.55, y: 4.42, w: 8.9, h: 0.7, tone: "info", icon: "🔑",
    zh: "一句話：看到「臺北」或「住宿」→ 不核銷；其餘高雄的實體小物與餐飲券 → 受理，回報主管。",
    en: "In short: Taipei or room stay → do not redeem. Other Kaohsiung items → accept and report to your supervisor." });
}

// ══════════════════════════════════════════════════════════════
{
  const s = slide("六、櫃檯核銷步驟（高雄）", "Counter Redemption Procedure (Kaohsiung)");
  step(s, { y: 1.4, num: 1, zh: "請客人出示 LINE 中的優惠券畫面與兌換碼",
    en: "Ask the guest to show the coupon in LINE, along with the redemption code" });
  step(s, { y: 2.05, num: 2, zh: "沒有優惠券、只有兌換碼 → 先看獎品名稱再決定（見下一頁）",
    en: "A code with no coupon — check the prize name first (see next page)" });
  step(s, { y: 2.7, num: 3, zh: "依券面規則辦理（部分獎品有消費門檻或指定地點／時段）",
    en: "Follow the terms shown on the coupon — some prizes have a minimum spend, venue or time window" });
  step(s, { y: 3.35, num: 4, zh: "核銷後交付獎品",
    en: "Complete redemption and hand over the prize" });

  callout(s, { x: 0.55, y: 4.1, w: 4.3, h: 0.95, tone: "warn", icon: "🤔",
    zh: "無法確認時，不要自行判斷。",
    en: "If anything is unclear, do not decide on your own — contact your supervisor to check the record." });
  callout(s, { x: 5.15, y: 4.1, w: 4.3, h: 0.95, tone: "bad", icon: "🚫",
    zh: "臺北的獎、或任何住宿獎 → 一律不核銷。",
    en: "Taipei prizes and any room-stay prize are never redeemed at the counter." });
}

// ══════════════════════════════════════════════════════════════
// 9-11 · 常見問題（拆三頁，避免卡片壓到頁尾）
// ══════════════════════════════════════════════════════════════
{
  const s = slide("七、常見問題與標準回答（1/4）", "FAQ & Suggested Replies (1 of 4)");
  qa(s, { y: 1.22, h: 1.36,
    zh: "我沒有收到優惠券？", en: "I didn't receive my coupon.",
    azh: "請打開高雄洲際酒店的 LINE 對話往上找，優惠券是以訊息形式發送的。若真的找不到，我幫您回報，會有同仁協助處理。",
    aen: "Please scroll up in your LINE chat with InterContinental Kaohsiung — the coupon is sent as a message. If you still can't find it, I'll report it for assistance." });
  qa(s, { y: 2.68, h: 1.12,
    zh: "券的連結點了，顯示「已使用過」？", en: "The coupon link says it has already been used.",
    azh: "每張券只能領取一次。如果您確定沒有領過，我幫您回報查詢。",
    aen: "Each coupon can only be claimed once. If you're sure you haven't claimed it, I'll report it for verification." });
  qa(s, { y: 3.90, h: 1.18,
    zh: "我中獎了，怎麼都沒有券？", en: "I won a prize, but there's no coupon.",
    azh: "住宿類與臺北的獎項由飯店同仁直接與您聯繫安排，所以不會發送優惠券。若是其他獎品卻沒收到券，我幫您回報，同仁會協助處理。",
    aen: "Room stays and Taipei prizes are arranged directly by our colleagues, so no coupon is issued. For any other prize, I'll report it and a colleague will assist." });
}
{
  const s = slide("七、常見問題與標準回答（2/4）", "FAQ & Suggested Replies (2 of 4)");
  qa(s, { y: 1.22, h: 1.12,
    zh: "我還沒留聯絡資料，要怎麼補？", en: "I haven't submitted my contact details yet.",
    azh: "請再打開一次活動頁面，系統會自動提醒您填寫。",
    aen: "Please reopen the campaign page — the system will prompt you again automatically." });
  qa(s, { y: 2.44, h: 1.24,
    zh: "為什麼我一直抽到餐飲 85 折？", en: "Why do I keep getting the 15% dining discount?",
    azh: "本活動每次抽獎都一定會中獎，餐飲 85 折是保底獎項，其他獎品則有名額限制，發完為止。",
    aen: "Every spin wins something. The 15% dining discount is the guaranteed baseline; other prizes are limited and awarded while stocks last." });
  qa(s, { y: 3.78, h: 1.32,
    zh: "獎項一覽上的獎品抽不到？我抽到的又沒列在上面？",
    en: "I can't win what's listed — and what I won isn't on the list?",
    azh: "獎項一覽列的是本活動的獎品種類，部分獎品已經送完；餐飲 85 折是保底獎項，不在清單上但一定拿得到。實際以抽獎結果為準。",
    aen: "The list shows the prize types in this campaign; some are already fully claimed. The 15% dining discount is the guaranteed baseline and is not listed. The draw result is what counts." });
}
{
  const s = slide("七、常見問題與標準回答（3/4）", "FAQ & Suggested Replies (3 of 4)");
  qa(s, { y: 1.3, h: 1.3,
    zh: "可以指定要抽哪個獎嗎？中獎率多少？", en: "Can I choose my prize? What are the odds?",
    azh: "抽獎結果由系統隨機產生，無法指定。詳細規則請參考活動頁面的「活動規則」。",
    aen: "Results are generated randomly and cannot be selected. Full terms are available under \"Campaign Rules\" on the activity page." });
  qa(s, { y: 2.75, h: 1.3,
    zh: "獎品可以折換現金或轉讓嗎？", en: "Can the prize be exchanged for cash or transferred?",
    azh: "依活動規則，獎項不得折換現金、找零或轉讓。",
    aen: "Under the campaign terms, prizes cannot be exchanged for cash, given as change, or transferred." });
  callout(s, { x: 0.55, y: 4.35, w: 8.9, h: 0.7, tone: "bad", icon: "🚫",
    zh: "客人追問中獎率時，請勿透露任何數字 —— 一律回「由系統隨機產生」。",
    en: "If pressed on the odds, never share numbers — always answer that results are randomly generated." });
}

{
  // 原本獨立的《櫃檯應對指引》併進來的三題（2026-09-04）——
  // 那份的核心「只有兌換碼怎麼分兩種人」已經是第五章，只差這三個問答。
  const s = slide("七、常見問題與標準回答（4/4）", "FAQ & Suggested Replies (4 of 4)");
  qa(s, { y: 1.22, h: 1.24,
    zh: "為什麼一等獎、二等獎抽到的都是餐飲 85 折？",
    en: "Why do the First and Second Prize tiers only give the dining discount?",
    azh: "這兩個等級的獎品已經全部送完，目前抽到的是保底的餐飲 85 折。三等獎還有其他獎品，建議您改抽三等獎。",
    aen: "All prizes in those two tiers have been claimed, so the guaranteed 15% dining discount is awarded instead. The Third Prize tier still has other prizes available." });
  qa(s, { y: 2.56, h: 1.16,
    zh: "為什麼現在抽不到「洲遊幣」了？", en: "Why can't I win InterCoins from the wheel any more?",
    azh: "洲遊幣目前只能透過完成任務取得，轉盤上不再發放。",
    aen: "InterCoins are now earned only by completing tasks; they are no longer awarded on the wheel." });
  qa(s, { y: 3.82, h: 1.28,
    zh: "我中了住宿獎，什麼時候會有人聯絡我？", en: "I won a room stay — when will someone contact me?",
    azh: "已收到您的資料，飯店同仁會主動與您聯繫安排。若超過一週仍未接到聯繫，我幫您回報。",
    aen: "We have your details and a colleague from the hotel will contact you to make arrangements. If you haven't heard from us within a week, I'll report it for you." });
}

// ══════════════════════════════════════════════════════════════
// 11 · 不可以說的事
// ══════════════════════════════════════════════════════════════
{
  const s = slide("八、不可以對客人說的事", "What Not to Disclose to Guests");
  const rows = [
    ["各獎項的中獎機率", "Prize win probabilities", "屬內部設定，公開會引發爭議與質疑"],
    ["每個獎品還剩幾份／已發出幾份", "Remaining or issued prize quantities", "同上，也可能被人為衝量"],
    ["內部管理系統的存在或操作方式", "The existence or use of internal admin systems", "非對外資訊"],
    ["其他中獎者的姓名／電話／中獎內容", "Other winners' names, numbers or prizes", "個人資料，涉及法律責任"],
    ["對兌換方式或日期做個人承諾", "Personal promises about redemption terms or dates", "一切以活動頁公告與券面規則為準"],
  ];
  rows.forEach(([zh, en, why], i) => {
    const y = 1.3 + i * 0.68;
    s.addShape(p.ShapeType.roundRect, { x: 0.55, y, w: 8.9, h: 0.6, rectRadius: 0.05, fill: { color: BAD_BG } });
    s.addText([{ text: "✕  " + zh + "\n", options: { fontSize: 11.5, bold: true, color: BAD } },
               { text: "　  " + en, options: { fontSize: 8.5, color: BAD } }],
      { x: 0.75, y: y + 0.04, w: 5.1, h: 0.52, fontFace: FONT, lineSpacing: 13 });
    s.addText(why, { x: 5.95, y: y + 0.04, w: 3.35, h: 0.52, fontFace: FONT, fontSize: 9.5, color: INK, valign: "middle" });
  });
  callout(s, { x: 0.55, y: 4.78, w: 8.9, h: 0.58, tone: "warn", icon: "🙋",
    zh: "遇到無法回答或客人情緒不佳時，請轉給主管處理，不要自行承諾。",
    en: "If you cannot answer, or the guest is upset, escalate to your supervisor — do not make commitments yourself." });
}

// ══════════════════════════════════════════════════════════════
// 12 · 回報
// ══════════════════════════════════════════════════════════════
{
  const s = slide("九、什麼狀況要往上回報", "When to Escalate");
  const items = [
    ["客人說沒收到券，且在 LINE 對話中確實找不到", "Guest reports a missing coupon and it is genuinely not in their LINE chat"],
    ["客人的兌換碼查不到，或狀態異常", "A redemption code cannot be found, or its status looks wrong"],
    ["客人拿臺北洲際的兌換碼到高雄要求核銷", "A guest presents a Taipei redemption code at a Kaohsiung counter"],
    ["客人對中獎結果或活動規則提出申訴", "A guest disputes the result or the campaign rules"],
    ["同一位客人短時間內出現大量中獎紀錄", "One guest shows an unusually high number of wins in a short period"],
  ];
  items.forEach(([zh, en], i) => {
    const y = 1.35 + i * 0.72;
    s.addShape(p.ShapeType.roundRect, { x: 0.55, y, w: 8.9, h: 0.62, rectRadius: 0.05, fill: { color: SOFT }, line: { color: GREY_LT, width: 0.75 } });
    s.addText("→", { x: 0.75, y: y + 0.05, w: 0.35, h: 0.5, fontFace: FONT, fontSize: 14, color: GOLD_LT, valign: "middle" });
    s.addText([{ text: zh + "\n", options: { fontSize: 11.5, color: INK } },
               { text: en, options: { fontSize: 8.5, color: GREY } }],
      { x: 1.15, y: y + 0.05, w: 8.1, h: 0.52, fontFace: FONT, lineSpacing: 13 });
  });
}

// ══════════════════════════════════════════════════════════════
// 13 · 速查卡
// ══════════════════════════════════════════════════════════════
{
  const s = p.addSlide();
  s.background = { color: "2B2620" };
  n++;
  s.addText([{ text: "一頁速查卡\n", options: { fontSize: 22, bold: true, color: GOLD_LT } },
             { text: "Quick Reference", options: { fontSize: 11.5, color: "8A837A" } }],
    { x: 0.6, y: 0.32, w: 8.8, h: 0.66, fontFace: FONT, lineSpacing: 22 });
  s.addShape(p.ShapeType.rect, { x: 0.6, y: 1.06, w: 0.5, h: 0.04, fill: { color: GOLD_LT } });

  const cards = [
    ["📩", "有優惠券", "Coupon Issued", "券自動進客人 LINE\n出示兌換碼 → 櫃檯核銷", "Coupon in LINE → redeem at counter", KH_BG, KH_FG],
    ["📞", "只有兌換碼", "Code Only", "臺北或住宿 → 不核銷，等聯繫\n其餘高雄的獎 → 受理，回報主管", "Taipei / room stay → no. Others → accept & report", TPE_BG, TPE_FG],
    ["🎁", "每抽必中", "Every Spin Wins", "每次扣幣但一定中獎，最少 85 折\n85 折不在清單上；清單含已送完的獎", "Every spin wins — min. 15% discount (unlisted); list includes sold-out items", OK_BG, OK],
    ["🚫", "絕不能說", "Never Disclose", "中獎機率 · 剩餘數量 · 其他客人資料\n不確定就轉主管，不要自行承諾", "Odds · stock · other guests' data — escalate if unsure", BAD_BG, BAD],
  ];
  cards.forEach(([icon, zh, en, dzh, den, bg, fg], i) => {
    const x = 0.6 + (i % 2) * 4.45, y = 1.42 + Math.floor(i / 2) * 1.78;
    s.addShape(p.ShapeType.roundRect, { x, y, w: 4.2, h: 1.55, rectRadius: 0.08, fill: { color: bg } });
    s.addText(icon, { x: x + 0.22, y: y + 0.14, w: 0.4, h: 0.3, fontFace: FONT, fontSize: 15 });
    s.addText([{ text: zh + "　", options: { fontSize: 14, bold: true, color: fg } },
               { text: en, options: { fontSize: 9, color: fg } }],
      { x: x + 0.66, y: y + 0.14, w: 3.4, h: 0.3, fontFace: FONT });
    s.addText([{ text: dzh + "\n", options: { fontSize: 10.5, color: fg } },
               { text: den, options: { fontSize: 8.5, color: fg } }],
      { x: x + 0.24, y: y + 0.52, w: 3.75, h: 0.95, fontFace: FONT, lineSpacing: 14 });
  });
  s.addText("活動期間 Campaign Period　2026.09.01 – 11.30", {
    x: 0.6, y: H - 0.68, w: 8.8, h: 0.3, fontFace: FONT, fontSize: 11, color: GOLD_LT, align: "center" });
}

const OUT = path.join(__dirname, "洲遊幣Lite_員工手冊_一般版_雙語.pptx");
p.writeFile({ fileName: OUT }).then(() => console.log(`✅ ${n + 1} 張投影片 → ${path.basename(OUT)}`));
