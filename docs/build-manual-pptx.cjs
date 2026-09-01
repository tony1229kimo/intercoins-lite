/**
 * 洲遊幣 Lite · 後台操作手冊 → PPTX
 *
 * 內容與 docs/後台操作手冊.md 同步。改了手冊記得重跑這支。
 * 用色沿用 IC 高雄既有簡報（IC_Kaohsiung_Game_Staff_Bilingual_v3）的品牌色，
 * 讓兩份簡報放在一起不會打架。
 *
 * Run:  node docs/build-manual-pptx.cjs
 * Out:  docs/洲遊幣Lite_後台操作手冊.pptx
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

// ─── IC 品牌色（與既有員工手冊簡報一致）──────────────────────
const INK = "3D3935";   // 洲際黑
const GOLD = "935D08";   // 遊戲主金
const GOLD_LT = "B8923E";
const GREY = "686869";
const GREY_LT = "DAD9D6";
const WHITE = "FFFFFF";
const CREAM = "FAF8F6";
const TINT = "F4ECE7";
const CODE_BG = "F2EDE9";
const OK = "065F46"; const OK_BG = "ECFDF5";
const BAD = "991B1B"; const BAD_BG = "FEF2F2";
const WARN = "B45309"; const WARN_BG = "FEF3C7";
const KH_BG = "EFE7D6"; const KH_FG = "7A5B12";
const TPE_BG = "E2E8EE"; const TPE_FG = "37536E";

const FONT = "Microsoft JhengHei";      // Windows 內建，中文不會變豆腐
const MONO = "Consolas";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_16x9";            // 10 x 5.625 inch
pptx.author = "Tony Chen";
pptx.company = "InterContinental Kaohsiung × Taipei";
pptx.title = "洲遊幣 Lite 後台操作手冊";

const W = 10, H = 5.625;
let pageNo = 0;

/** 一般內頁：標題 + 副標 + 頁碼 + 底線 */
function slide(title, sub) {
  const s = pptx.addSlide();
  s.background = { color: CREAM };
  pageNo++;
  if (title) {
    s.addText(title, {
      x: 0.55, y: 0.34, w: 8.9, h: 0.5,
      fontFace: FONT, fontSize: 25, bold: true, color: INK,
    });
    s.addShape(pptx.ShapeType.rect, { x: 0.55, y: 0.9, w: 0.55, h: 0.045, fill: { color: GOLD } });
  }
  if (sub) {
    s.addText(sub, {
      x: 0.55, y: 0.98, w: 8.9, h: 0.34,
      fontFace: FONT, fontSize: 12.5, color: GREY,
    });
  }
  s.addText(String(pageNo), {
    x: 9.1, y: H - 0.45, w: 0.5, h: 0.3,
    fontFace: FONT, fontSize: 10, color: GREY_LT, align: "right",
  });
  s.addText("洲遊幣 Lite · 後台操作手冊", {
    x: 0.55, y: H - 0.45, w: 4, h: 0.3,
    fontFace: FONT, fontSize: 9, color: GREY_LT,
  });
  return s;
}

/** 色塊提示（重點 / 警告 / 正確做法） */
function callout(s, { x, y, w, h, text, tone = "warn", icon = "⚠️" }) {
  const map = { warn: [WARN_BG, WARN], bad: [BAD_BG, BAD], ok: [OK_BG, OK], info: [TINT, GOLD] };
  const [bg, fg] = map[tone];
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06, fill: { color: bg }, line: { color: fg, width: 0.75 },
  });
  s.addText([{ text: icon + "  ", options: { fontSize: 13 } }, { text, options: { bold: false } }], {
    x: x + 0.18, y: y + 0.06, w: w - 0.36, h: h - 0.12,
    fontFace: FONT, fontSize: 12, color: fg, valign: "middle",
  });
}

/** 統一的表格樣式 */
function table(s, rows, opts = {}) {
  s.addTable(rows, {
    x: 0.55, y: opts.y ?? 1.5, w: opts.w ?? 8.9,
    colW: opts.colW,
    fontFace: FONT, fontSize: opts.fontSize ?? 11.5, color: INK,
    border: { type: "solid", color: GREY_LT, pt: 0.5 },
    fill: { color: WHITE },
    rowH: opts.rowH ?? 0.34,
    valign: "middle",
    autoPage: false,
  });
}

const th = (t) => ({ text: t, options: { bold: true, fill: { color: TINT }, color: INK } });

// ══════════════════════════════════════════════════════════════
// 1 · 封面
// ══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  s.background = { color: INK };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.14, h: H, fill: { color: GOLD_LT } });
  s.addText("I N T E R C O N T I N E N T A L", {
    x: 0.9, y: 1.45, w: 8, h: 0.3, fontFace: FONT, fontSize: 12, color: GOLD_LT, charSpacing: 2,
  });
  s.addText("洲遊幣 Lite", {
    x: 0.9, y: 1.85, w: 8, h: 0.85, fontFace: FONT, fontSize: 44, bold: true, color: WHITE,
  });
  s.addText("後台操作手冊", {
    x: 0.9, y: 2.7, w: 8, h: 0.6, fontFace: FONT, fontSize: 27, color: GOLD_LT,
  });
  s.addText("給行銷、櫃檯與兩館負責獎品的同事", {
    x: 0.9, y: 3.45, w: 8, h: 0.3, fontFace: FONT, fontSize: 13, color: "BFB8AE",
  });
  s.addText("https://intercoins.ictaiwan.net/admin", {
    x: 0.9, y: 3.85, w: 8, h: 0.3, fontFace: MONO, fontSize: 13, color: GOLD_LT,
  });
  s.addText("高雄洲際酒店 × 臺北洲際酒店　·　2026 年 9 月", {
    x: 0.9, y: H - 0.85, w: 8, h: 0.3, fontFace: FONT, fontSize: 11, color: GREY,
  });
}

// ══════════════════════════════════════════════════════════════
// 2 · 核心概念：兩館的獎不一樣
// ══════════════════════════════════════════════════════════════
{
  const s = slide("先搞懂這件事：兩館的獎，處理方式不一樣",
    "客人是在【同一個轉盤】抽獎，會抽到高雄的獎，也會抽到臺北的獎。");

  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.55, y: 1.5, w: 4.28, h: 2.5, rectRadius: 0.08,
    fill: { color: KH_BG }, line: { color: KH_FG, width: 1 },
  });
  s.addText("高雄洲際的獎", { x: 0.8, y: 1.68, w: 3.8, h: 0.35, fontFace: FONT, fontSize: 17, bold: true, color: KH_FG });
  s.addText([
    { text: "客人中獎當下，優惠券就自動推到他的 LINE 聊天室。\n\n", options: { breakLine: false } },
    { text: "▸ 客人自己點連結領取（只能領一次）\n", options: {} },
    { text: "▸ 到店時出示兌換碼，櫃檯核銷\n", options: {} },
    { text: "▸ 我們不用主動聯繫他", options: {} },
  ], { x: 0.8, y: 2.1, w: 3.8, h: 1.75, fontFace: FONT, fontSize: 12, color: INK, lineSpacing: 19 });

  s.addShape(pptx.ShapeType.roundRect, {
    x: 5.17, y: 1.5, w: 4.28, h: 2.5, rectRadius: 0.08,
    fill: { color: TPE_BG }, line: { color: TPE_FG, width: 1 },
  });
  s.addText("臺北洲際的獎", { x: 5.42, y: 1.68, w: 3.8, h: 0.35, fontFace: FONT, fontSize: 17, bold: true, color: TPE_FG });
  s.addText([
    { text: "兌換細則還沒定案，所以【不發券】。\n\n", options: {} },
    { text: "▸ 中獎當下跳表單，請客人留聯絡方式\n", options: {} },
    { text: "▸ 由臺北洲際的人主動聯繫\n", options: {} },
    { text: "▸ 客人沒有券可以領，這是正常的", options: {} },
  ], { x: 5.42, y: 2.1, w: 3.8, h: 1.75, fontFace: FONT, fontSize: 12, color: INK, lineSpacing: 19 });

  callout(s, {
    x: 0.55, y: 4.2, w: 8.9, h: 0.62, tone: "bad", icon: "🚫",
    text: "臺北的兌換碼，高雄櫃檯不能核銷 —— 名單上的「館別」欄就是用來分辨的。",
  });
}

// ══════════════════════════════════════════════════════════════
// 3 · 登入
// ══════════════════════════════════════════════════════════════
{
  const s = slide("一、登入", "https://intercoins.ictaiwan.net/admin");
  table(s, [
    [th("項目"), th("說明")],
    ["帳號", "你的【個人帳號】，不是共用密碼。帳號不分大小寫，密碼區分大小寫"],
    ["忘記密碼", "找 Tony 重設。系統沒有「忘記密碼」功能"],
    ["登入有效期", "密碼不存在瀏覽器裡，關掉分頁就要重新登入"],
  ], { y: 1.55, colW: [1.9, 7.0], rowH: 0.46 });

  callout(s, {
    x: 0.55, y: 3.25, w: 8.9, h: 1.0, tone: "warn", icon: "🔒",
    text: "這裡有中獎者的姓名、手機、Email —— 屬於個人資料。\n" +
          "每一次調閱都會留下紀錄（誰、什麼時候、看了哪一份、從哪個 IP）。請勿轉傳帳號密碼。",
  });
}

// ══════════════════════════════════════════════════════════════
// 4 · 首頁六個數字
// ══════════════════════════════════════════════════════════════
{
  const s = slide("二、登入後先看上方六個數字", "只有兩個會變紅色 —— 紅了就代表有事情要處理。");
  table(s, [
    [th("卡片"), th("意思"), th("要不要處理")],
    ["參加人數", "進過遊戲的 LINE 帳號數", "—"],
    ["抽獎次數", "總共轉了幾次盤", "—"],
    ["已發出洲遊幣", "客人靠做任務賺到的總幣數", "—"],
    ["未使用洲遊幣", "還在客人手上、還沒拿去抽的", "—"],
    [{ text: "臺北待聯繫", options: { bold: true, color: BAD } },
     "中了臺北獎、但還沒留聯絡資訊的人數",
     { text: "紅字＝有待辦", options: { bold: true, color: BAD } }],
    [{ text: "推播失敗", options: { bold: true, color: BAD } },
     "券沒送進客人 LINE 的筆數",
     { text: "紅字＝要補送", options: { bold: true, color: BAD } }],
  ], { y: 1.5, colW: [2.2, 4.5, 2.2], rowH: 0.42 });
}

// ══════════════════════════════════════════════════════════════
// 5 · 臺北待聯繫
// ══════════════════════════════════════════════════════════════
{
  const s = slide("三、「臺北待聯繫」分頁", "臺北洲際的人主要看這一頁。");
  s.addText([
    { text: "① 先篩選「只看未填聯絡資訊」\n", options: { bold: true, fontSize: 14 } },
    { text: "     這些人系統還在等他們填 —— ", options: {} },
    { text: "不需要打電話催。\n", options: { bold: true, color: OK } },
    { text: "     客人下次打開遊戲，系統會自動再問一次，直到填完為止。\n\n", options: { color: GREY } },
    { text: "② 已填的，就照名單主動聯繫\n", options: { bold: true, fontSize: 14 } },
    { text: "     有姓名、手機、Email、方便聯繫時段。\n\n", options: { color: GREY } },
    { text: "③ 聯繫時請客人出示【兌換碼】核對身分\n", options: { bold: true, fontSize: 14 } },
  ], { x: 0.7, y: 1.55, w: 8.6, h: 2.4, fontFace: FONT, fontSize: 12.5, color: INK, lineSpacing: 22 });

  callout(s, {
    x: 0.55, y: 4.1, w: 8.9, h: 0.72, tone: "info", icon: "💡",
    text: "臺北的獎沒有券可以領，客人問「為什麼沒收到券」是正常的 —— 請告訴他會有專人聯繫。",
  });
}

// ══════════════════════════════════════════════════════════════
// 6 · 中獎名單 · 篩選器
// ══════════════════════════════════════════════════════════════
{
  const s = slide("四、「中獎名單」分頁 —— 兩館互相核對",
    "兩館共用同一份名單，因為客人是在同一個轉盤抽的。");
  table(s, [
    [th("篩選"), th("什麼時候用")],
    ["只看高雄 / 只看臺北", "只想看自己家的獎"],
    ["只看實體獎", "排除「洲遊幣 +N」那種直接入帳的"],
    [{ text: "實體獎・尚未領取", options: { bold: true, color: GOLD } },
     { text: "這就是你的待辦清單 —— 高雄看券還沒被領走的、臺北看聯絡資訊還沒填的", options: { bold: true } }],
    ["搜尋框", "客人打電話來問時，用姓名 / 手機 / 兌換碼 / LINE 名稱直接查"],
  ], { y: 1.6, colW: [2.5, 6.4], rowH: 0.5 });

  callout(s, {
    x: 0.55, y: 4.05, w: 8.9, h: 0.72, tone: "ok", icon: "⬇",
    text: "「下載 CSV」會拿到更完整的欄位（推播錯誤原因、券領取時間、LINE UserId…），Excel 直接開得起來。",
  });
}

// ══════════════════════════════════════════════════════════════
// 7 · 狀態欄對照表
// ══════════════════════════════════════════════════════════════
{
  const s = slide("五、「狀態」欄怎麼看", "六種顯示，只有一種需要你動手。");
  table(s, [
    [th("顯示"), th("意思"), th("要做什麼")],
    [{ text: "券已領取", options: { color: OK } }, "高雄的獎，客人已經點過領取連結", "不用處理"],
    ["券未領取", "券已推到 LINE，客人還沒點", "不用處理，等他自己領"],
    [{ text: "推播失敗", options: { bold: true, color: BAD } },
     "券沒送出去（客人封鎖了官方帳號等）",
     { text: "★ 要處理：找 Tony 補送", options: { bold: true, color: BAD } }],
    [{ text: "已留聯絡資訊", options: { color: OK } }, "臺北的獎，客人填好了", "臺北的人主動聯繫"],
    ["待客人填寫", "臺北的獎，客人還沒填", "不用催，系統會自動再問"],
    ["直接入帳", "抽到「洲遊幣 +N」", "不用處理"],
  ], { y: 1.5, colW: [2.0, 4.2, 2.7], rowH: 0.42 });
}

// ══════════════════════════════════════════════════════════════
// 8 · 櫃檯核銷
// ══════════════════════════════════════════════════════════════
{
  const s = slide("六、櫃檯核銷流程（高雄）", "客人拿兌換碼來的時候。");
  const steps = [
    ["1", "在搜尋框輸入兌換碼", "客人手機上的 IC-XXXX-XXXX"],
    ["2", "核對「館別」欄", "必須是【高雄】才能核銷"],
    ["3", "核對「獎品」欄", "跟客人說的獎品一致"],
    ["4", "核銷、交付獎品", "完成"],
  ];
  steps.forEach(([n, t, d], i) => {
    const y = 1.55 + i * 0.78;
    s.addShape(pptx.ShapeType.ellipse, { x: 0.6, y, w: 0.48, h: 0.48, fill: { color: GOLD } });
    s.addText(n, { x: 0.6, y, w: 0.48, h: 0.48, fontFace: FONT, fontSize: 15, bold: true, color: WHITE, align: "center", valign: "middle" });
    s.addText(t, { x: 1.25, y: y - 0.02, w: 3.6, h: 0.3, fontFace: FONT, fontSize: 14, bold: true, color: INK });
    s.addText(d, { x: 1.25, y: y + 0.26, w: 7.8, h: 0.28, fontFace: FONT, fontSize: 11.5, color: GREY });
  });
  callout(s, {
    x: 0.55, y: 4.75, w: 8.9, h: 0.55, tone: "bad", icon: "🚫",
    text: "館別是【臺北】的兌換碼，高雄不能核銷 —— 請客人等臺北洲際的專人聯繫。",
  });
}

// ══════════════════════════════════════════════════════════════
// 9 · 獎項與庫存
// ══════════════════════════════════════════════════════════════
{
  const s = slide("七、「獎項與庫存」分頁", "看每個獎還剩幾份、實際中獎率多少。");
  s.addText([
    { text: "▸ 每個獎品都有：實際中獎機率、名額、已發出、剩餘（附進度條）\n", options: {} },
    { text: "▸ 標題會顯示該等級是「開放中」還是「已全數發完」\n", options: {} },
    { text: "▸ 機率是同一等級內【跨館一起】分配到 100%\n", options: {} },
  ], { x: 0.7, y: 1.55, w: 8.6, h: 1.2, fontFace: FONT, fontSize: 13, color: INK, lineSpacing: 26 });

  callout(s, {
    x: 0.55, y: 2.9, w: 8.9, h: 0.85, tone: "info", icon: "🎡",
    text: "某等級的獎全部發完後，客人抽到的會是「銘謝惠顧」，\n" +
          "而且【不會扣他的洲遊幣】—— 他可以改抽其他等級。",
  });
  callout(s, {
    x: 0.55, y: 3.95, w: 8.9, h: 0.85, tone: "ok", icon: "🔧",
    text: "要調整機率或名額，找 Tony —— 可以直接改，\n不用重新部署，改完立即生效。",
  });
}

// ══════════════════════════════════════════════════════════════
// 10 · 常見問題
// ══════════════════════════════════════════════════════════════
{
  const s = slide("八、客人常問的問題（1/2）");
  const qa = [
    ["客人說沒收到券？",
      "先在中獎名單搜他的姓名或兌換碼。狀態是「推播失敗」→ 找 Tony 補送；\n是「券未領取」→ 請他打開高雄洲際的 LINE 對話往上找那則訊息。"],
    ["券的連結點了說「已使用過」？",
      "那張券只能領一次（防止無限領取）。如果他確定沒領過，找 Tony 查紀錄。"],
    ["抽到臺北的獎，什麼時候會被聯繫？",
      "他填完聯絡資訊後就會出現在「臺北待聯繫」，由臺北洲際的人主動聯繫。\n臺北的獎沒有券可以領，這是正常的。"],
  ];
  qa.forEach(([q, a], i) => {
    const y = 1.5 + i * 1.22;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y, w: 8.9, h: 1.05, rectRadius: 0.06, fill: { color: WHITE }, line: { color: GREY_LT, width: 0.75 } });
    s.addText("Q　" + q, { x: 0.78, y: y + 0.1, w: 8.5, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: GOLD });
    s.addText(a, { x: 0.78, y: y + 0.42, w: 8.5, h: 0.56, fontFace: FONT, fontSize: 11.5, color: INK, lineSpacing: 16 });
  });
}
{
  const s = slide("八、客人常問的問題（2/2）");
  const qa = [
    ["為什麼有人抽到「銘謝惠顧」？",
      "該等級的獎已經全部發完了。他的洲遊幣沒有被扣，可以改抽其他等級。"],
    ["客人的洲遊幣從哪裡來？",
      "做任務，每項 +1 枚，共 8 項：追蹤高雄 IG/FB、臺北 IG/FB、食遇 IG/FB、\n分享活動、填個人資料。每人上限 8 枚。"],
    ["各等級要投幾枚？",
      "一等獎 5 枚、二等獎 3 枚、三等獎 1 枚。抽到「洲遊幣 +N」等於退幣，可以再抽一次。"],
  ];
  qa.forEach(([q, a], i) => {
    const y = 1.5 + i * 1.22;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y, w: 8.9, h: 1.05, rectRadius: 0.06, fill: { color: WHITE }, line: { color: GREY_LT, width: 0.75 } });
    s.addText("Q　" + q, { x: 0.78, y: y + 0.1, w: 8.5, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: GOLD });
    s.addText(a, { x: 0.78, y: y + 0.42, w: 8.5, h: 0.56, fontFace: FONT, fontSize: 11.5, color: INK, lineSpacing: 16 });
  });
}

// ══════════════════════════════════════════════════════════════
// 11 · 帳號管理（限 Tony）
// ══════════════════════════════════════════════════════════════
{
  const s = slide("九、管理後台帳號（限 Tony）",
    "Zeabur → intercoins-lite 專案 → intercoins-lite 服務 → 環境變數 → ADMIN_USERS");
  s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 1.6, w: 8.9, h: 0.6, rectRadius: 0.05, fill: { color: CODE_BG } });
  s.addText("ADMIN_USERS=tony:密碼A,alisha:密碼B,katniss:密碼C", {
    x: 0.75, y: 1.6, w: 8.5, h: 0.6, fontFace: MONO, fontSize: 13, color: INK, valign: "middle",
  });
  s.addText([
    { text: "▸ 多組用【逗號】分隔，帳號密碼用【冒號】分隔\n", options: {} },
    { text: "▸ 密碼裡不能有逗號或冒號\n", options: { bold: true, color: BAD } },
    { text: "▸ 改完一定要按「重新部署」—— 容器只在啟動時讀環境變數\n", options: { bold: true, color: BAD } },
    { text: "▸ 移除某個人：把他那組刪掉重新部署，其他人不受影響\n", options: {} },
  ], { x: 0.7, y: 2.4, w: 8.6, h: 1.3, fontFace: FONT, fontSize: 12.5, color: INK, lineSpacing: 22 });

  s.addText("驗證有沒有生效：", { x: 0.7, y: 3.75, w: 8.6, h: 0.28, fontFace: FONT, fontSize: 12, bold: true, color: INK });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 4.05, w: 8.9, h: 0.85, rectRadius: 0.05, fill: { color: CODE_BG } });
  s.addText("curl -s https://intercoins.ictaiwan.net/api/health\n看 admin_users_configured 是不是等於你設的帳號數", {
    x: 0.75, y: 4.05, w: 8.5, h: 0.85, fontFace: MONO, fontSize: 11, color: INK, valign: "middle", lineSpacing: 16,
  });
}

// ══════════════════════════════════════════════════════════════
// 12 · 速查卡
// ══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  s.background = { color: INK };
  pageNo++;
  s.addText("一頁速查卡", { x: 0.6, y: 0.35, w: 8.8, h: 0.5, fontFace: FONT, fontSize: 24, bold: true, color: GOLD_LT });
  s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.92, w: 0.55, h: 0.045, fill: { color: GOLD_LT } });

  const cards = [
    ["高雄的獎", "券自動推到客人 LINE\n客人自己領 → 櫃檯核銷兌換碼", KH_BG, KH_FG],
    ["臺北的獎", "不發券\n客人留聯絡資訊 → 專人主動聯繫", TPE_BG, TPE_FG],
    ["紅字 = 待辦", "「臺北待聯繫」有人 → 去聯繫\n「推播失敗」有數字 → 找 Tony 補送", WARN_BG, WARN],
    ["客人打來問", "中獎名單搜「姓名 / 手機 / 兌換碼」\n看「狀態」欄就知道怎麼回", OK_BG, OK],
  ];
  cards.forEach(([t, d, bg, fg], i) => {
    const x = 0.6 + (i % 2) * 4.45;
    const y = 1.35 + Math.floor(i / 2) * 1.75;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 4.2, h: 1.5, rectRadius: 0.08, fill: { color: bg } });
    s.addText(t, { x: x + 0.25, y: y + 0.16, w: 3.7, h: 0.33, fontFace: FONT, fontSize: 15, bold: true, color: fg });
    s.addText(d, { x: x + 0.25, y: y + 0.55, w: 3.7, h: 0.8, fontFace: FONT, fontSize: 11.5, color: fg, lineSpacing: 17 });
  });

  s.addText("https://intercoins.ictaiwan.net/admin", {
    x: 0.6, y: H - 0.72, w: 8.8, h: 0.3, fontFace: MONO, fontSize: 12, color: GOLD_LT, align: "center",
  });
}

const OUT = path.join(__dirname, "洲遊幣Lite_後台操作手冊.pptx");
pptx.writeFile({ fileName: OUT }).then(() => {
  console.log(`✅ ${pageNo + 1} 張投影片 → ${path.basename(OUT)}`);
});
