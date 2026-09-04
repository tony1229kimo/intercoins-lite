/**
 * 櫃檯應對指引（一頁）→ PPTX
 *
 * 為什麼要單獨做這一頁：《員工手冊_一般版》是 2026-09-01 寫的，
 * 9/2 之後有幾件事變了，照舊手冊做會把【合法中獎者】擋在櫃檯外面：
 *
 *   舊手冊：「只有兌換碼、LINE 裡沒有券 → 專人聯繫類，請勿核銷」
 *   現實  ：9/2 早上的推播 bug 讓 44 位【發券類】中獎者也沒收到券，
 *           他們手上同樣只有兌換碼，但他們是真的中獎。
 *
 * 所以這一頁的重點就是「同樣是只有兌換碼，怎麼分辨這兩種人」。
 *
 * ⚠️ 不含機率、庫存數字、後台網址 —— 可以直接發給櫃檯與客服。
 *
 * Run: node docs/build-counter-card.cjs
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

const INK = "3D3935", GOLD = "935D08", GOLD_LT = "B8923E";
const GREY = "686869", GREY_LT = "DAD9D6", WHITE = "FFFFFF";
const CREAM = "FAF8F6", TINT = "F4ECE7";
const OK = "065F46", OK_BG = "ECFDF5";
const BAD = "991B1B", BAD_BG = "FEF2F2";
const WARN = "B45309", WARN_BG = "FEF3C7";
const FONT = "Microsoft JhengHei";
const H = 5.625;

const p = new pptxgen();
p.layout = "LAYOUT_16x9";
p.author = "Tony Chen";
p.company = "InterContinental Kaohsiung × Taipei";
p.title = "洲遊幣 Lite · 櫃檯應對指引";

/* ── 第 1 頁：核心判斷 ─────────────────────────────────────── */
{
  const s = p.addSlide();
  s.background = { color: CREAM };

  s.addText("洲遊幣 Lite · 櫃檯應對指引", {
    x: 0.5, y: 0.3, w: 7.4, h: 0.45, fontFace: FONT, fontSize: 23, bold: true, color: INK,
  });
  s.addShape(p.ShapeType.roundRect, {
    x: 8.05, y: 0.32, w: 1.45, h: 0.36, rectRadius: 0.05,
    fill: { color: WARN_BG }, line: { color: WARN, width: 0.75 },
  });
  s.addText("2026-09-04 更新", {
    x: 8.05, y: 0.32, w: 1.45, h: 0.36,
    fontFace: FONT, fontSize: 9.5, bold: true, color: WARN, align: "center", valign: "middle",
  });
  s.addShape(p.ShapeType.rect, { x: 0.5, y: 0.84, w: 0.55, h: 0.045, fill: { color: GOLD } });
  s.addText("這一頁取代員工手冊裡「只有兌換碼就不核銷」那條規則", {
    x: 0.5, y: 0.92, w: 9, h: 0.3, fontFace: FONT, fontSize: 12, color: GREY,
  });

  // 核心：兩種「只有兌換碼」
  s.addText("客人有兌換碼，但 LINE 裡找不到優惠券 —— 有兩種人，要分開處理", {
    x: 0.5, y: 1.35, w: 9, h: 0.32, fontFace: FONT, fontSize: 14.5, bold: true, color: INK,
  });

  // 左：真中獎
  s.addShape(p.ShapeType.roundRect, {
    x: 0.5, y: 1.76, w: 4.4, h: 2.5, rectRadius: 0.08,
    fill: { color: OK_BG }, line: { color: OK, width: 1.2 },
  });
  s.addText("✅  是真的中獎 —— 要受理", {
    x: 0.72, y: 1.9, w: 4, h: 0.32, fontFace: FONT, fontSize: 15, bold: true, color: OK,
  });
  s.addText([
    { text: "怎麼認：獎品是「高雄洲際酒店」的\n", options: { bold: true } },
    { text: "明信片組 · 洲賀熊 · 旅行外幣收納錢包 ·\n隨行瓶 · 餐飲抵用券 · 餐飲折扣\n\n", options: { color: GREY } },
    { text: "9/2 上午系統異常，券沒送進客人的 LINE。\n", options: {} },
    { text: "獎品確實是他的，請受理並回報主管確認。", options: { bold: true } },
  ], {
    x: 0.72, y: 2.3, w: 4, h: 1.85, fontFace: FONT, fontSize: 11.5, color: INK, lineSpacing: 17,
  });

  // 右：專人聯繫
  s.addShape(p.ShapeType.roundRect, {
    x: 5.1, y: 1.76, w: 4.4, h: 2.5, rectRadius: 0.08,
    fill: { color: BAD_BG }, line: { color: BAD, width: 1.2 },
  });
  s.addText("🚫  專人聯繫類 —— 不核銷", {
    x: 5.32, y: 1.9, w: 4, h: 0.32, fontFace: FONT, fontSize: 15, bold: true, color: BAD,
  });
  s.addText([
    { text: "怎麼認：只要看到這兩種就是\n", options: { bold: true } },
    { text: "① 獎品名稱有「臺北洲際酒店」\n② 任何「住宿一晚」的獎項\n\n", options: { color: GREY } },
    { text: "這類獎項本來就不發券，由該館同仁\n主動聯繫安排。", options: {} },
    { text: "請告知客人會有專人聯繫，並回報主管。", options: { bold: true } },
  ], {
    x: 5.32, y: 2.3, w: 4, h: 1.85, fontFace: FONT, fontSize: 11.5, color: INK, lineSpacing: 17,
  });

  // 2026-09-04 新規則：沒中獎也扣幣 —— 櫃檯最容易被質問的一點
  s.addShape(p.ShapeType.roundRect, {
    x: 0.5, y: 4.34, w: 9, h: 0.42, rectRadius: 0.06,
    fill: { color: WARN_BG }, line: { color: WARN, width: 1 },
  });
  s.addText([
    { text: "9/4 起：", options: { bold: true } },
    { text: "抽獎每次都會扣洲遊幣，沒中獎也一樣。三等獎目前保證中獎，客人抱怨時請引導改抽三等獎。" },
  ], {
    x: 0.72, y: 4.34, w: 8.6, h: 0.42, fontFace: FONT, fontSize: 11.5, color: WARN, valign: "middle",
  });

  // 一句話口訣
  s.addShape(p.ShapeType.roundRect, {
    x: 0.5, y: 4.86, w: 9, h: 0.46, rectRadius: 0.07,
    fill: { color: TINT }, line: { color: GOLD, width: 1 },
  });
  s.addText([
    { text: "一句話記住：", options: { bold: true, color: GOLD } },
    { text: "看到「臺北」或「住宿」→ 不核銷，等專人聯繫。其餘高雄的實體小物與餐飲券 → 受理，回報主管。" },
  ], {
    x: 0.72, y: 4.86, w: 8.6, h: 0.46, fontFace: FONT, fontSize: 11.5, color: INK, valign: "middle",
  });

  s.addText("洲遊幣 Lite · 櫃檯應對指引 · 內部使用", {
    x: 0.5, y: H - 0.4, w: 6, h: 0.26, fontFace: FONT, fontSize: 9, color: GREY_LT,
  });
  s.addText("1 / 2", {
    x: 8.9, y: H - 0.4, w: 0.6, h: 0.26, fontFace: FONT, fontSize: 9, color: GREY_LT, align: "right",
  });
}

/* ── 第 2 頁：其他常見問題 ─────────────────────────────────── */
{
  const s = p.addSlide();
  s.background = { color: CREAM };

  s.addText("客人可能會問的其他問題", {
    x: 0.5, y: 0.3, w: 7.6, h: 0.45, fontFace: FONT, fontSize: 22, bold: true, color: INK,
  });
  s.addShape(p.ShapeType.rect, { x: 0.5, y: 0.84, w: 0.55, h: 0.045, fill: { color: GOLD } });

  const qa = [
    ["我抽到「銘謝惠顧」，洲遊幣還被扣掉了？",
     "抽獎每一次都會扣除洲遊幣，沒有中獎也一樣。目前三等獎一定會中獎，建議您改抽三等獎。"],
    ["為什麼一等獎、二等獎都抽不到東西？",
     "這兩個等級的獎品已經全部送完，投進去會是銘謝惠顧、洲遊幣一樣會扣。三等獎目前保證中獎，請改抽三等獎。"],
    ["為什麼現在抽不到「洲遊幣」了？",
     "活動調整過獎項配置，目前轉盤上的獎品以實體好禮為主。"],
    ["我中了住宿獎，什麼時候會有人聯絡我？",
     "已收到您的資料，飯店同仁會主動與您聯繫安排。若超過一週未接到聯繫，我幫您回報。"],
  ];

  let y = 1.15;
  for (const [q, a] of qa) {
    s.addShape(p.ShapeType.roundRect, {
      x: 0.5, y, w: 9, h: 0.92, rectRadius: 0.06,
      fill: { color: WHITE }, line: { color: GREY_LT, width: 0.75 },
    });
    s.addText([{ text: "Q  ", options: { color: GOLD, bold: true } }, { text: q, options: { bold: true } }], {
      x: 0.72, y: y + 0.08, w: 8.6, h: 0.3, fontFace: FONT, fontSize: 12.5, color: INK,
    });
    s.addText([{ text: "A  ", options: { color: OK, bold: true } }, { text: a }], {
      x: 0.72, y: y + 0.4, w: 8.6, h: 0.46, fontFace: FONT, fontSize: 11.5, color: GREY, wrap: true,
    });
    y += 1.02;
  }

  s.addShape(p.ShapeType.roundRect, {
    x: 0.5, y: 5.0 - 0.02, w: 9, h: 0.5, rectRadius: 0.06,
    fill: { color: BAD_BG }, line: { color: BAD, width: 1 },
  });
  s.addText([
    { text: "⚠️  ", options: { fontSize: 12 } },
    { text: "不要對客人透露中獎機率、剩餘數量，也不要自行承諾兌換方式或日期。無法判斷時一律回報主管。" },
  ], {
    x: 0.72, y: 4.98, w: 8.6, h: 0.5, fontFace: FONT, fontSize: 11.5, color: BAD, valign: "middle",
  });

  s.addText("洲遊幣 Lite · 櫃檯應對指引 · 內部使用", {
    x: 0.5, y: H - 0.4, w: 6, h: 0.26, fontFace: FONT, fontSize: 9, color: GREY_LT,
  });
  s.addText("2 / 2", {
    x: 8.9, y: H - 0.4, w: 0.6, h: 0.26, fontFace: FONT, fontSize: 9, color: GREY_LT, align: "right",
  });
}

const out = path.join(__dirname, "櫃檯應對指引_2026-09-04.pptx");
p.writeFile({ fileName: out }).then(() => console.log("✅ 2 張投影片 →", path.basename(out)));
