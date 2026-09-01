/**
 * 員工手冊 → PPTX（兩份）
 *
 *   洲遊幣Lite_員工手冊_一般版.pptx      可發全體同事
 *   洲遊幣Lite_員工手冊_管理版_機密.pptx  限授權人員
 *
 * 內容與 docs/員工手冊_一般版.md、docs/員工手冊_管理版（機密）.md 同步。
 * 管理版每一頁都有紅色「機密」標記，避免兩份混在一起拿錯。
 *
 * Run: node docs/build-staff-pptx.cjs
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

const INK = "3D3935", GOLD = "935D08", GOLD_LT = "B8923E";
const GREY = "686869", GREY_LT = "DAD9D6", WHITE = "FFFFFF";
const CREAM = "FAF8F6", TINT = "F4ECE7", CODE_BG = "F2EDE9";
const OK = "065F46", OK_BG = "ECFDF5";
const BAD = "991B1B", BAD_BG = "FEF2F2";
const WARN = "B45309", WARN_BG = "FEF3C7";
const KH_BG = "EFE7D6", KH_FG = "7A5B12";
const TPE_BG = "E2E8EE", TPE_FG = "37536E";
const FONT = "Microsoft JhengHei", MONO = "Consolas";
const H = 5.625;

/** 一份簡報的建構器。confidential=true 時每頁加紅色機密標記。 */
function deck({ confidential }) {
  const p = new pptxgen();
  p.layout = "LAYOUT_16x9";
  p.author = "Tony Chen";
  p.company = "InterContinental Kaohsiung × Taipei";
  p.title = confidential ? "洲遊幣 Lite 管理手冊（機密）" : "洲遊幣 Lite 員工手冊";
  let n = 0;

  const api = {
    pptx: p,
    slide(title, sub) {
      const s = p.addSlide();
      s.background = { color: CREAM };
      n++;
      if (title) {
        s.addText(title, { x: 0.55, y: 0.34, w: 7.6, h: 0.5, fontFace: FONT, fontSize: 24, bold: true, color: INK });
        s.addShape(p.ShapeType.rect, { x: 0.55, y: 0.9, w: 0.55, h: 0.045, fill: { color: GOLD } });
      }
      if (sub) {
        s.addText(sub, { x: 0.55, y: 0.98, w: 8.9, h: 0.34, fontFace: FONT, fontSize: 12.5, color: GREY });
      }
      if (confidential) {
        s.addShape(p.ShapeType.roundRect, {
          x: 8.35, y: 0.34, w: 1.1, h: 0.32, rectRadius: 0.05,
          fill: { color: BAD_BG }, line: { color: BAD, width: 0.75 },
        });
        s.addText("🔒 機密", {
          x: 8.35, y: 0.34, w: 1.1, h: 0.32,
          fontFace: FONT, fontSize: 10.5, bold: true, color: BAD, align: "center", valign: "middle",
        });
      }
      s.addText(String(n), { x: 9.1, y: H - 0.42, w: 0.5, h: 0.28, fontFace: FONT, fontSize: 10, color: GREY_LT, align: "right" });
      s.addText(confidential ? "洲遊幣 Lite · 管理手冊 · 限授權人員" : "洲遊幣 Lite · 員工手冊",
        { x: 0.55, y: H - 0.42, w: 5, h: 0.28, fontFace: FONT, fontSize: 9, color: GREY_LT });
      return s;
    },
    callout(s, { x, y, w, h, text, tone = "warn", icon = "⚠️" }) {
      const map = { warn: [WARN_BG, WARN], bad: [BAD_BG, BAD], ok: [OK_BG, OK], info: [TINT, GOLD] };
      const [bg, fg] = map[tone];
      s.addShape(p.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: bg }, line: { color: fg, width: 0.75 } });
      s.addText([{ text: icon + "  ", options: { fontSize: 13 } }, { text }], {
        x: x + 0.18, y: y + 0.06, w: w - 0.36, h: h - 0.12,
        fontFace: FONT, fontSize: 11.5, color: fg, valign: "middle",
      });
    },
    table(s, rows, o = {}) {
      s.addTable(rows, {
        x: 0.55, y: o.y ?? 1.5, w: o.w ?? 8.9, colW: o.colW,
        fontFace: FONT, fontSize: o.fontSize ?? 11, color: INK,
        border: { type: "solid", color: GREY_LT, pt: 0.5 },
        fill: { color: WHITE }, rowH: o.rowH ?? 0.32, valign: "middle", autoPage: false,
      });
    },
    th: (t) => ({ text: t, options: { bold: true, fill: { color: TINT }, color: INK } }),
    count: () => n,
  };
  return api;
}

// ════════════════════════════════════════════════════════════════
//  A · 一般版
// ════════════════════════════════════════════════════════════════
function buildGeneral() {
  const d = deck({ confidential: false });
  const { pptx, slide, callout, table, th } = d;

  // 封面
  {
    const s = pptx.addSlide();
    s.background = { color: INK };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.14, h: H, fill: { color: GOLD_LT } });
    s.addText("I N T E R C O N T I N E N T A L", { x: 0.9, y: 1.35, w: 8, h: 0.3, fontFace: FONT, fontSize: 12, color: GOLD_LT, charSpacing: 2 });
    s.addText("洲遊幣 Lite", { x: 0.9, y: 1.75, w: 8, h: 0.85, fontFace: FONT, fontSize: 44, bold: true, color: WHITE });
    s.addText("員工手冊", { x: 0.9, y: 2.6, w: 8, h: 0.6, fontFace: FONT, fontSize: 27, color: GOLD_LT });
    s.addText("櫃檯 · 餐廳外場 · 客服 · 行銷執行", { x: 0.9, y: 3.3, w: 8, h: 0.3, fontFace: FONT, fontSize: 13, color: "BFB8AE" });
    s.addText("活動期間：2026 年 9 月 1 日 ～ 11 月 30 日", { x: 0.9, y: 3.72, w: 8, h: 0.3, fontFace: FONT, fontSize: 13, color: GOLD_LT });
    s.addText("本手冊為內部教育訓練用途，請勿對外散布。", { x: 0.9, y: H - 0.85, w: 8, h: 0.3, fontFace: FONT, fontSize: 11, color: GREY });
  }

  // 這是什麼
  {
    const s = slide("一、這是什麼活動", "臺北／高雄洲際酒店合辦的中秋線上抽獎遊戲，在 LINE 裡玩。");
    s.addText([
      { text: "客人做完指定任務可以拿到「洲遊幣」，投進轉盤抽獎。\n", options: {} },
      { text: "獎品同時涵蓋兩家飯店。\n\n", options: { bold: true } },
      { text: "給客人的活動連結：", options: { color: GREY } },
    ], { x: 0.7, y: 1.6, w: 8.6, h: 1.1, fontFace: FONT, fontSize: 13.5, color: INK, lineSpacing: 24 });
    s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 2.75, w: 8.9, h: 0.6, rectRadius: 0.05, fill: { color: CODE_BG } });
    s.addText("https://liff.line.me/1656533531-r7GGrXqJ", { x: 0.75, y: 2.75, w: 8.5, h: 0.6, fontFace: MONO, fontSize: 14, color: INK, valign: "middle" });
    callout(s, { x: 0.55, y: 3.6, w: 8.9, h: 0.85, tone: "info", icon: "💡",
      text: "從 LINE 訊息或 QR Code 點這個連結最順。\n客人若說打不開，請他確認手機有安裝 LINE。" });
  }

  // 怎麼玩
  {
    const s = slide("二、客人怎麼玩");
    table(s, [
      [th("步驟"), th("內容")],
      ["1", "點活動連結，用 LINE 登入"],
      ["2", { text: "必須先加「高雄洲際酒店」LINE 官方帳號好友，才能進遊戲", options: { bold: true } }],
      ["3", "完成任務賺洲遊幣：追蹤兩館及「食遇」的 IG／FB、分享活動、填寫個人資料"],
      ["4", "投洲遊幣抽獎 —— 三等獎投 1 枚、二等獎投 3 枚、一等獎投 5 枚"],
      ["5", "中獎後依獎品所屬飯店，走不同的領獎方式"],
    ], { y: 1.5, colW: [0.9, 8.0], rowH: 0.42 });
    callout(s, { x: 0.55, y: 4.15, w: 8.9, h: 0.72, tone: "info", icon: "❓",
      text: "為什麼一定要加好友？因為中獎的優惠券是發送到客人的 LINE 聊天室，不是好友就送不出去。" });
  }

  // 兩館差別（核心）
  {
    const s = slide("三、⭐ 最重要：兩館的獎，領法不一樣",
      "客人是在【同一個轉盤】抽獎，會抽到高雄的獎，也會抽到臺北的獎。");
    s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 1.5, w: 4.28, h: 2.45, rectRadius: 0.08, fill: { color: KH_BG }, line: { color: KH_FG, width: 1 } });
    s.addText("🟡 高雄洲際的獎", { x: 0.8, y: 1.66, w: 3.8, h: 0.35, fontFace: FONT, fontSize: 16, bold: true, color: KH_FG });
    s.addText([
      { text: "優惠券自動發送到客人的 LINE 聊天室\n\n", options: { bold: true } },
      { text: "▸ 客人自己在 LINE 裡點「領取我的獎品」\n", options: {} },
      { text: "▸ 每張券只能領一次\n", options: {} },
      { text: "▸ 到店出示兌換碼，櫃檯核銷", options: {} },
    ], { x: 0.8, y: 2.08, w: 3.8, h: 1.7, fontFace: FONT, fontSize: 11.5, color: INK, lineSpacing: 18 });

    s.addShape(pptx.ShapeType.roundRect, { x: 5.17, y: 1.5, w: 4.28, h: 2.45, rectRadius: 0.08, fill: { color: TPE_BG }, line: { color: TPE_FG, width: 1 } });
    s.addText("🔵 臺北洲際的獎", { x: 5.42, y: 1.66, w: 3.8, h: 0.35, fontFace: FONT, fontSize: 16, bold: true, color: TPE_FG });
    s.addText([
      { text: "不會發券，由臺北的同仁主動聯繫\n\n", options: { bold: true } },
      { text: "▸ 畫面請客人留姓名／手機／Email\n", options: {} },
      { text: "▸ 客人手上沒有券可以領\n", options: {} },
      { text: "▸ 這是正常的，不是系統出錯", options: {} },
    ], { x: 5.42, y: 2.08, w: 3.8, h: 1.7, fontFace: FONT, fontSize: 11.5, color: INK, lineSpacing: 18 });

    callout(s, { x: 0.55, y: 4.15, w: 8.9, h: 0.72, tone: "bad", icon: "🚫",
      text: "臺北的兌換碼，高雄櫃檯不能核銷。獎品名稱前會寫「臺北洲際酒店」，遇到請回報主管。" });
  }

  // 櫃檯核銷
  {
    const s = slide("四、客人來櫃檯領獎（高雄）");
    [["1", "請客人出示 LINE 裡的優惠券畫面與兌換碼", "格式 IC-XXXX-XXXX"],
     ["2", "確認獎品名稱是「高雄洲際酒店 ○○○」", "臺北的不能在高雄核銷"],
     ["3", "依券上的兌換規則辦理", "部分獎品有消費門檻或指定地點／時段"],
     ["4", "核銷後交付獎品", ""]].forEach(([num, t, dsc], i) => {
      const y = 1.55 + i * 0.75;
      s.addShape(pptx.ShapeType.ellipse, { x: 0.6, y, w: 0.46, h: 0.46, fill: { color: GOLD } });
      s.addText(num, { x: 0.6, y, w: 0.46, h: 0.46, fontFace: FONT, fontSize: 15, bold: true, color: WHITE, align: "center", valign: "middle" });
      s.addText(t, { x: 1.22, y: y - 0.02, w: 8, h: 0.3, fontFace: FONT, fontSize: 13.5, bold: true, color: INK });
      if (dsc) s.addText(dsc, { x: 1.22, y: y + 0.26, w: 8, h: 0.26, fontFace: FONT, fontSize: 11, color: GREY });
    });
    callout(s, { x: 0.55, y: 4.62, w: 8.9, h: 0.6, tone: "warn", icon: "⚠️",
      text: "無法確認時不要自行判斷，請聯繫主管查詢系統紀錄。" });
  }

  // 常見問題 1
  {
    const s = slide("五、客人常問的問題 · 標準回答（1/2）");
    [["我沒收到優惠券？", "請您打開高雄洲際酒店的 LINE 對話往上找一下，優惠券是以訊息形式發送的。\n如果真的找不到，我幫您回報，會有同仁協助處理。"],
     ["券點了顯示「已使用過」？", "每張券只能領取一次。如果您確定沒有領過，我幫您回報查詢。"],
     ["抽到臺北的獎，怎麼沒有券？", "臺北洲際的獎項是由臺北的同仁直接與您聯繫安排，所以不會發送優惠券。\n只要您已留下聯絡資料，我們會盡快與您聯繫。"]]
      .forEach(([q, a], i) => {
      const y = 1.5 + i * 1.22;
      s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y, w: 8.9, h: 1.05, rectRadius: 0.06, fill: { color: WHITE }, line: { color: GREY_LT, width: 0.75 } });
      s.addText("Q　" + q, { x: 0.78, y: y + 0.09, w: 8.5, h: 0.3, fontFace: FONT, fontSize: 12.5, bold: true, color: GOLD });
      s.addText(a, { x: 0.78, y: y + 0.4, w: 8.5, h: 0.58, fontFace: FONT, fontSize: 11, color: INK, lineSpacing: 15 });
    });
  }

  // 常見問題 2
  {
    const s = slide("五、客人常問的問題 · 標準回答（2/2）");
    [["我還沒留聯絡資料，怎麼補？", "請再打開一次活動頁面，系統會自動提醒您填寫。"],
     ["為什麼抽到「銘謝惠顧」？", "該等級的獎品目前已全部送出。您的洲遊幣沒有被扣除，可以改抽其他等級。"],
     ["可以指定獎品嗎？中獎率多少？", "抽獎結果由系統隨機產生，無法指定。詳細規則請參考活動頁面的『活動規則』。"],
     ["獎品可以換現金嗎？", "依活動規則，獎項不得折換現金、找零或轉讓。"]]
      .forEach(([q, a], i) => {
      const y = 1.45 + i * 0.95;
      s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y, w: 8.9, h: 0.8, rectRadius: 0.06, fill: { color: WHITE }, line: { color: GREY_LT, width: 0.75 } });
      s.addText("Q　" + q, { x: 0.78, y: y + 0.07, w: 8.5, h: 0.28, fontFace: FONT, fontSize: 12, bold: true, color: GOLD });
      s.addText(a, { x: 0.78, y: y + 0.36, w: 8.5, h: 0.38, fontFace: FONT, fontSize: 10.5, color: INK });
    });
  }

  // 不可以說的
  {
    const s = slide("六、⚠️ 不可以對客人說的事", "說出去會引發爭議、甚至涉及法律責任。");
    table(s, [
      [th("不要說"), th("原因")],
      [{ text: "各獎項的中獎機率", options: { bold: true, color: BAD } }, "屬內部設定，公開會引發爭議與質疑"],
      [{ text: "每個獎品還剩幾份／已發幾份", options: { bold: true, color: BAD } }, "同上，也可能被人為衝量"],
      [{ text: "後台系統的存在、網址或操作方式", options: { bold: true, color: BAD } }, "內部管理系統"],
      [{ text: "其他中獎者的姓名／電話／中獎內容", options: { bold: true, color: BAD } }, "個人資料，涉及法律責任"],
      ["對兌換方式、日期做個人承諾", "一切以活動頁公告與券面規則為準"],
    ], { y: 1.55, colW: [4.3, 4.6], rowH: 0.46 });
    callout(s, { x: 0.55, y: 4.2, w: 8.9, h: 0.62, tone: "warn", icon: "🙋",
      text: "遇到無法回答或客人情緒不佳的狀況，請轉給主管處理，不要自行承諾。" });
  }

  // 回報
  {
    const s = slide("七、什麼狀況要往上回報");
    s.addText([
      { text: "▸ 客人說沒收到券，且在 LINE 對話中確實找不到\n", options: {} },
      { text: "▸ 客人的兌換碼在系統查不到，或狀態異常\n", options: {} },
      { text: "▸ 客人拿【臺北洲際】的兌換碼來高雄要求核銷\n", options: { bold: true } },
      { text: "▸ 客人對中獎結果或活動規則提出申訴\n", options: {} },
      { text: "▸ 同一位客人短時間內出現大量中獎紀錄（疑似異常）\n", options: {} },
    ], { x: 0.8, y: 1.7, w: 8.4, h: 2.4, fontFace: FONT, fontSize: 14, color: INK, lineSpacing: 30 });
  }

  // 速查
  {
    const s = pptx.addSlide();
    s.background = { color: INK };
    s.addText("一頁速查卡", { x: 0.6, y: 0.35, w: 8.8, h: 0.5, fontFace: FONT, fontSize: 24, bold: true, color: GOLD_LT });
    s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.92, w: 0.55, h: 0.045, fill: { color: GOLD_LT } });
    [["🟡 高雄的獎", "券自動進客人 LINE\n出示兌換碼 → 櫃檯核銷", KH_BG, KH_FG],
     ["🔵 臺北的獎", "不發券，臺北同仁主動聯繫\n客人沒有券是正常的", TPE_BG, TPE_FG],
     ["🚫 絕不能說", "中獎機率 · 剩幾份\n其他客人的資料 · 後台", BAD_BG, BAD],
     ["🙋 不確定就轉單", "不要自行承諾兌換方式或日期\n一切以活動頁公告為準", OK_BG, OK]]
      .forEach(([t, dsc, bg, fg], i) => {
      const x = 0.6 + (i % 2) * 4.45, y = 1.35 + Math.floor(i / 2) * 1.75;
      s.addShape(pptx.ShapeType.roundRect, { x, y, w: 4.2, h: 1.5, rectRadius: 0.08, fill: { color: bg } });
      s.addText(t, { x: x + 0.25, y: y + 0.16, w: 3.7, h: 0.33, fontFace: FONT, fontSize: 15, bold: true, color: fg });
      s.addText(dsc, { x: x + 0.25, y: y + 0.55, w: 3.7, h: 0.8, fontFace: FONT, fontSize: 11.5, color: fg, lineSpacing: 17 });
    });
    s.addText("活動期間 2026/09/01 – 11/30", { x: 0.6, y: H - 0.7, w: 8.8, h: 0.3, fontFace: FONT, fontSize: 12, color: GOLD_LT, align: "center" });
  }

  return { pptx: d.pptx, pages: d.count() + 2 };
}

// ════════════════════════════════════════════════════════════════
//  B · 管理版（機密）
// ════════════════════════════════════════════════════════════════
function buildAdmin() {
  const d = deck({ confidential: true });
  const { pptx, slide, callout, table, th } = d;

  // 封面
  {
    const s = pptx.addSlide();
    s.background = { color: "241E1A" };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.14, h: H, fill: { color: BAD } });
    s.addShape(pptx.ShapeType.roundRect, { x: 0.9, y: 1.2, w: 2.15, h: 0.42, rectRadius: 0.06, fill: { color: BAD } });
    s.addText("🔒 機密 · 限授權人員", { x: 0.9, y: 1.2, w: 2.15, h: 0.42, fontFace: FONT, fontSize: 12, bold: true, color: WHITE, align: "center", valign: "middle" });
    s.addText("洲遊幣 Lite", { x: 0.9, y: 1.85, w: 8, h: 0.85, fontFace: FONT, fontSize: 42, bold: true, color: WHITE });
    s.addText("管理手冊", { x: 0.9, y: 2.7, w: 8, h: 0.6, fontFace: FONT, fontSize: 26, color: GOLD_LT });
    s.addText("Tony · 兩館行銷主管 · 獎品庫存負責人", { x: 0.9, y: 3.4, w: 8, h: 0.3, fontFace: FONT, fontSize: 13, color: "BFB8AE" });
    s.addText("含中獎機率、獎品庫存、後台入口、個資處理方式 —— 請勿轉發給一般同事", {
      x: 0.9, y: H - 0.9, w: 8.5, h: 0.4, fontFace: FONT, fontSize: 11.5, color: "E5A0A0" });
  }

  // 系統一頁
  {
    const s = slide("一、系統一頁看懂");
    table(s, [
      [th("項目"), th("內容")],
      ["客人玩的", "https://liff.line.me/1656533531-r7GGrXqJ（在 LINE 內開）"],
      [{ text: "後台", options: { bold: true } }, { text: "https://intercoins.ictaiwan.net/admin", options: { bold: true } }],
      ["資料存放", "Zeabur（台北機房）Postgres —— 中獎紀錄、聯絡資訊、洲遊幣帳本"],
      ["LINE 官方帳號", "高雄洲際（@519pzkds）—— 加好友檢查與發券都走這個帳號"],
      ["臺北洲際", "是另一個 LINE 官方帳號，我們沒有推播權限 → 臺北的獎才需要專人聯繫"],
    ], { y: 1.5, colW: [1.9, 7.0], rowH: 0.44 });
    callout(s, { x: 0.55, y: 4.2, w: 8.9, h: 0.72, tone: "info", icon: "🔧",
      text: "臺北細則定案 + 拿到臺北 OA token 後，把該獎項的 claim_mode 改成 coupon 就自動改走發券流程，程式不用改。" });
  }

  // 後台操作
  {
    const s = slide("二、後台操作", "個人帳號登入，不是共用密碼。每次調閱名單都會留稽核紀錄。");
    table(s, [
      [th("分頁"), th("用途")],
      ["臺北待聯繫", "臺北的人照這份聯繫。篩「只看未填」的那些不用人工催 —— 客人下次開遊戲系統會自動再問"],
      ["中獎名單", "兩館共用一份，可依館別／類型篩。最實用是「實體獎・尚未領取」＝待辦清單。可下載 CSV"],
      ["獎項與庫存", "每個獎的實際機率、名額、已發出、剩餘"],
    ], { y: 1.5, colW: [1.9, 7.0], rowH: 0.62 });
    s.addText("上方六個數字只有兩個會變紅 —— 紅了就是有待辦：", { x: 0.55, y: 3.55, w: 8.9, h: 0.3, fontFace: FONT, fontSize: 12.5, bold: true, color: INK });
    callout(s, { x: 0.55, y: 3.9, w: 4.28, h: 0.85, tone: "bad", icon: "📞",
      text: "臺北待聯繫\n中了臺北獎但還沒留聯絡資訊" });
    callout(s, { x: 5.17, y: 3.9, w: 4.28, h: 0.85, tone: "bad", icon: "📨",
      text: "推播失敗\n券沒送進客人 LINE → 要補送" });
  }

  // 機率
  {
    const s = slide("三、🔒 中獎機率（絕對不可外流）", "兩館共用同一個轉盤，同等級的機率跨館一起分配到 100%。");
    table(s, [
      [th("等級"), th("館別"), th("獎品"), th("名額"), th("機率")],
      ["三等（投1）", "高雄", "明信片組 / 洲賀熊 / 旅行錢包", "各 20", "各 8%"],
      ["三等", "高雄", "隨行瓶 / 餐飲抵用券 NT$500", "各 10", "各 4%"],
      ["三等", "臺北", "楠竹玻璃永續隨行瓶", "10", "4%"],
      ["三等", "高雄", { text: "《洲遊幣》+1 枚", options: { bold: true } }, "20", { text: "64%", options: { bold: true, color: GOLD } }],
      ["二等（投3）", "高雄", "餐飲 85 折 / 下午茶 / 氣泡飲", "10 / 5 / 5", "6% / 3% / 3%"],
      ["二等", "臺北", "全日餐廳雙人午餐 / 氣泡茶", "各 3", "各 2%"],
      ["二等", "高雄", { text: "《洲遊幣》+3 枚", options: { bold: true } }, "10", { text: "84%", options: { bold: true, color: GOLD } }],
      ["一等（投5）", "高雄", "港灣套房 / 豪華經典房 / 餐飲 5 折", "2 / 4 / 1", { text: "各 2%", options: { bold: true } }],
      ["一等", "臺北", "雙人下午茶 / 高樓層套房 / 豪華經典房", "2 / 2 / 5", { text: "各 2%", options: { bold: true } }],
      ["一等", "高雄", { text: "《洲遊幣》+5 枚", options: { bold: true } }, "5", { text: "88%", options: { bold: true, color: GOLD } }],
    ], { y: 1.5, colW: [1.35, 0.75, 3.6, 1.5, 1.7], rowH: 0.3, fontSize: 10 });
  }

  // 獎池容量
  {
    const s = slide("四、🔒 獎池容量 —— 上線前必須決策");
    callout(s, { x: 0.55, y: 1.45, w: 8.9, h: 0.6, tone: "bad", icon: "🚨",
      text: "目前的獎池只夠約 31 位玩家玩完，全部獎品就發光了。" });
    s.addText([
      { text: "為什麼：", options: { bold: true } },
      { text: "轉盤每抽必中，而「洲遊幣 +N」是全額退幣（等於免費再抽一次）\n", options: {} },
      { text: "⇒ 客人手上的每一枚洲遊幣，最終都會換成一件實體獎\n", options: { bold: true, color: BAD } },
      { text: "實體獎總名額 132 份 ＝ 可吸收 248 枚洲遊幣；每人可賺 8 枚 → 248 ÷ 8 ≈ 31 人", options: {} },
    ], { x: 0.7, y: 2.18, w: 8.6, h: 1.0, fontFace: FONT, fontSize: 12, color: INK, lineSpacing: 20 });
    table(s, [
      [th("每人可賺"), th("可支撐玩家"), th("一等獎（投 5 枚）")],
      ["4 枚", "62 人", "❌ 抽不到"],
      ["6 枚", "41 人", "✅"],
      [{ text: "8 枚（現況）", options: { bold: true } }, { text: "31 人", options: { bold: true, color: BAD } }, "✅ 抽完還剩 3 枚"],
    ], { y: 3.3, colW: [2.6, 3.0, 3.3], rowH: 0.34 });
    callout(s, { x: 0.55, y: 4.72, w: 8.9, h: 0.55, tone: "warn", icon: "⚖️",
      text: "任務數是社群成長的槓桿，玩家數是獎品庫存的槓桿 —— 加任務反而會讓可服務人數變少。" });
  }

  // 調整方案
  {
    const s = slide("四之二、可以怎麼調", "A～C 只要改資料、不用改程式，也不用重新部署。");
    table(s, [
      [th("做法"), th("效果"), th("代價")],
      [{ text: "A. 增加獎品名額", options: { bold: true } }, "最直接。名額 ×3 → 約 93 人；×10 → 約 310 人", "要真的有庫存與預算"],
      ["B. 加「銘謝惠顧」格並扣幣", "讓幣可以消失，中獎率由行銷控制", "不再是全獎盤，體驗要重新說明"],
      ["C. 減少任務或降低幣值", "每人幣數少 → 服務更多人", "社群曝光變少"],
      ["D. 維持現狀（小規模體驗）", "不用改任何東西", "第 31 人之後客人抽到的都是銘謝惠顧"],
    ], { y: 1.55, colW: [2.7, 3.5, 2.7], rowH: 0.55 });
    callout(s, { x: 0.55, y: 4.1, w: 8.9, h: 0.8, tone: "ok", icon: "🎡",
      text: "目前發完後的行為：轉盤照轉、停在格線之間、跳「銘謝惠顧」，\n並且【不扣客人的洲遊幣】，明白告知可改抽其他等級。" });
  }

  // 個資
  {
    const s = slide("五、🔒 個人資料與稽核");
    table(s, [
      [th("項目"), th("說明")],
      ["蒐集了什麼", "姓名、手機、Email、LINE UserId、LINE 顯示名稱"],
      ["存在哪", "Zeabur Postgres（台北機房）。不在 GitHub、不在任何檔案"],
      ["誰看得到", "只有 ADMIN_USERS 名單內的人，且每次調閱都留紀錄"],
      ["客人的同意", "活動頁「個資告知事項」；兩館分別勾選，互不共享未授權資料"],
      ["移除某人的存取", "從 ADMIN_USERS 拿掉他那組並重新部署，其他人不受影響"],
    ], { y: 1.5, colW: [2.1, 6.8], rowH: 0.4 });
    callout(s, { x: 0.55, y: 3.85, w: 8.9, h: 1.0, tone: "bad", icon: "🚨",
      text: "程式碼庫裡有 17 條 Omnichat 兌換連結，是 stateless 的 —— 任何人拿到就能直接領券。\n程式碼庫必須永遠保持 private；懷疑外流請到 Omnichat 後台重新產生連結。" });
  }

  // 帳號管理
  {
    const s = slide("六、帳號管理", "Zeabur → intercoins-lite 服務 → 環境變數 → ADMIN_USERS");
    s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 1.55, w: 8.9, h: 0.55, rectRadius: 0.05, fill: { color: CODE_BG } });
    s.addText("ADMIN_USERS=tony:密碼A,kh-mktg:密碼B,tpe-mktg:密碼C", { x: 0.75, y: 1.55, w: 8.5, h: 0.55, fontFace: MONO, fontSize: 12.5, color: INK, valign: "middle" });
    s.addText([
      { text: "▸ 多組用【逗號】分隔，帳號密碼用【冒號】分隔\n", options: {} },
      { text: "▸ 密碼裡不能有逗號或冒號\n", options: { bold: true, color: BAD } },
      { text: "▸ 改完一定要按「重新部署」—— 容器只在啟動時讀環境變數\n", options: { bold: true, color: BAD } },
      { text: "▸ 移除某個人：把他那組刪掉重新部署，其他人不受影響\n", options: {} },
    ], { x: 0.7, y: 2.3, w: 8.6, h: 1.3, fontFace: FONT, fontSize: 12, color: INK, lineSpacing: 21 });
    s.addText("驗證有沒有生效：", { x: 0.7, y: 3.65, w: 8.6, h: 0.28, fontFace: FONT, fontSize: 12, bold: true, color: INK });
    s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 3.95, w: 8.9, h: 0.8, rectRadius: 0.05, fill: { color: CODE_BG } });
    s.addText("curl -s https://intercoins.ictaiwan.net/api/health\n看 admin_users_configured 是不是等於你設的帳號數", {
      x: 0.75, y: 3.95, w: 8.5, h: 0.8, fontFace: MONO, fontSize: 10.5, color: INK, valign: "middle", lineSpacing: 15 });
  }

  // 狀況處理
  {
    const s = slide("七、狀況處理");
    table(s, [
      [th("狀況"), th("處理")],
      ["客人沒收到券", "中獎名單搜姓名／兌換碼 → 「推播失敗」→ 補送；「券未領取」→ 請他在 LINE 對話往上找"],
      ["客人說券已使用但堅稱沒領", "查 claim_used_at 時間。為防無限領取，每張券只能領一次"],
      ["臺北中獎者遲遲沒填聯絡資訊", "不用人工催，系統會在他下次開遊戲時自動再問"],
      ["某等級獎品發完", "客人會抽到銘謝惠顧且不扣幣。要繼續發獎需增加名額"],
      ["懷疑異常大量中獎", "查同一 LINE UserId 的中獎筆數。洲遊幣每人上限 8 枚，正常不會異常"],
      ["系統整體異常", "打 /api/health?deep=1 看 db 與 LINE token 是否有效"],
    ], { y: 1.5, colW: [2.7, 6.2], rowH: 0.5 });
  }

  // 檢查清單
  {
    const s = slide("八、上線前檢查清單");
    s.addText([
      { text: "☐  用手機在 LINE 內完整玩一輪\n", options: {} },
      { text: "☐  抽到高雄的獎 → LINE 收到券 → 點領取 → 再點第二次要顯示「已使用過」\n", options: {} },
      { text: "☐  抽到臺北的獎 → 看不到領取連結、只跳聯絡表單 → 後台「臺北待聯繫」查得到\n", options: {} },
      { text: "☐  刻意跳過臺北表單 → 關掉重開遊戲 → 應該要再問一次\n", options: {} },
      { text: "☐  確認六個社群連結都連到正確的官方帳號\n", options: {} },
      { text: "☐  行銷確認獎池容量要不要調整（第四節）\n", options: { bold: true, color: BAD } },
      { text: "☐  兩館櫃檯與客服都收到《員工手冊_一般版》\n", options: {} },
      { text: "☐  ADMIN_USERS 已加入需要的人，且沒有多餘的人\n", options: {} },
    ], { x: 0.75, y: 1.5, w: 8.5, h: 3.4, fontFace: FONT, fontSize: 12.5, color: INK, lineSpacing: 26 });
  }

  return { pptx: d.pptx, pages: d.count() + 1 };
}

// ─── 產生 ───────────────────────────────────────────────────────
(async () => {
  const jobs = [
    [buildGeneral(), "洲遊幣Lite_員工手冊_一般版.pptx"],
    [buildAdmin(), "洲遊幣Lite_員工手冊_管理版_機密.pptx"],
  ];
  for (const [{ pptx, pages }, name] of jobs) {
    await pptx.writeFile({ fileName: path.join(__dirname, name) });
    console.log(`✅ ${String(pages).padStart(2)} 張投影片 → ${name}`);
  }
})();
