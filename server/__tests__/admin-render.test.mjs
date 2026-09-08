/**
 * Actually run the admin page's render functions.
 *
 * 2026-09-06 a helper was inserted into renderContacts when it was meant for
 * renderWinners. The file parsed, the columns lined up, the test suite passed --
 * and the winners list was blank for two days, because renderWinners threw a
 * ReferenceError halfway through building the rows. The row count above the
 * table is set before that line, so the page looked alive: "946 / 946 筆" over
 * an empty table.
 *
 * Checking the markup by reading it did not catch that and never would have.
 * These tests execute the real script against real-shaped data in a minimal DOM
 * and assert each tab produced rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ADMIN = path.join(import.meta.dirname, "..", "..", "public", "admin.html");
const src = readFileSync(ADMIN, "utf8");
const script = [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]).join("\n");

/** Every element behaves; only innerHTML and textContent are worth reading back. */
function makeEl(id) {
  const el = {
    id, innerHTML: "", textContent: "", value: "", disabled: false, dataset: {},
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {},
    appendChild() {}, remove() {}, setAttribute() {}, getAttribute: () => null,
    closest: () => null, querySelector: () => makeEl("child"),
    querySelectorAll: () => [],
  };
  return el;
}

function makeDom() {
  const els = new Map();
  const get = (sel) => {
    const key = String(sel);
    if (!els.has(key)) els.set(key, makeEl(key));
    return els.get(key);
  };
  return {
    els,
    document: {
      querySelector: get,
      querySelectorAll: () => [],
      createElement: () => makeEl("created"),
      addEventListener() {},
      body: makeEl("body"),
    },
  };
}

/** Rows shaped like the real API, including the fields the renderers read. */
const WINNER = {
  id: 1, at: "2026-09-05T15:09:37.000Z", hotel: "KH", tier: 1, label: "三等獎",
  prize: "高雄洲際酒店 洲賀熊", code: "IC-ABCD-1234", coin: 0, claimMode: "coupon",
  name: "測試", phone: "0900000000", email: "a@b.c", contactWindow: null,
  contactFilled: false, lineName: "測試", lineUserId: "U1",
  pushed: true, pushError: null, claimedAt: "2026-09-08T03:59:41.000Z", claimSecs: 233435,
};

const CACHE = {
  stats: {
    players: 287,
    coinsOutstanding: 195,
    coinsIssued: 1880,
    draws: [
      { tier: 1, spins: 701, physical: 681, label: "三等獎" },
      { tier: 3, spins: 180, physical: 175, label: "二等獎" },
      { tier: 5, spins: 65, physical: 60, label: "一等獎" },
    ],
    push: { ok: 201, failed: 44, claimed: 201 },
  },
  contacts: { contacts: [{ ...WINNER, created_at: WINNER.at, prize_name: WINNER.prize, contact_window: "" }] },
  prizes: { tiers: [{ tier: 1, label: "三等獎", open: true, totalPct: 100, missPct: 0,
    prizes: [{ id: "kh-1-3", hotel: "KH", name: "高雄洲際酒店 洲賀熊", claim_mode: "coupon",
      quota: 20, issued: 20, weight: 25, pct: 25, remaining: 0, reopened: 2,
      coin_reward: 0, visible: true, active: true, is_consolation: false }] }] },
  winners: {
    total: 3,
    winners: [
      WINNER,
      { ...WINNER, id: 2, claimedAt: "2026-09-05T15:09:40.000Z", claimSecs: 3 },   // 疑似
      { ...WINNER, id: 3, claimedAt: null, claimSecs: null, pushed: false },       // 推播失敗
    ],
  },
  growth: { newPlayers: { total: 287, today: 1, yesterday: 2, last7: 50 }, daily: [],
    line: { ok: false, reason: "test" }, tasks: [], funnel: {}, drawDaily: [], coupons: {} },
};

function loadAdmin() {
  const dom = makeDom();
  const ctx = vm.createContext({
    ...dom,
    window: {},
    console,
    sessionStorage: { getItem: () => "fake-token", setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { reload() {}, href: "" },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), blob: async () => ({}) }),
    alert() {}, confirm: () => false,
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL: { createObjectURL: () => "blob:", revokeObjectURL() {} },
    Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Intl,
  });
  vm.runInContext(script, ctx, { filename: "admin.html" });
  // CACHE is a top-level `let`, so it is a lexical binding rather than a
  // property of the context -- assigning ctx.CACHE would not reach it.
  ctx.__cache = CACHE;
  vm.runInContext("CACHE = __cache;", ctx);
  return { ctx, dom };
}

const TABS = [
  ["renderWinners", "中獎名單"],
  ["renderContacts", "待聯繫名單"],
  ["renderPrizes", "獎項與庫存"],
  ["renderGrowth", "活動成效"],
  ["renderStats", "上方統計卡"],
];

for (const [fn, label] of TABS) {
  test(`${label}（${fn}）跑得完，不會丟例外`, () => {
    const { ctx } = loadAdmin();
    assert.equal(typeof ctx[fn], "function", `${fn} 不存在`);
    assert.doesNotThrow(() => ctx[fn](), `${label} 渲染時丟例外`);
  });
}

test("中獎名單真的有把列寫進表格（不是只設好筆數就掛掉）", () => {
  const { ctx, dom } = loadAdmin();
  ctx.renderWinners();
  const tb = dom.els.get("#tb");
  assert.ok(tb, "找不到 #tb");
  assert.match(tb.innerHTML, /<tr>/, "表格是空的 —— 渲染中途就掛了");
  assert.match(tb.innerHTML, /IC-ABCD-1234/, "兌換碼沒有出現在列裡");
  assert.equal((tb.innerHTML.match(/<tr>/g) || []).length, 3, "應該有 3 列");
});

test("中獎名單的三種狀態都畫得出來", () => {
  const { ctx, dom } = loadAdmin();
  ctx.renderWinners();
  const html = dom.els.get("#tb").innerHTML;
  assert.match(html, /券已領取/, "缺少「券已領取」");
  assert.match(html, /疑似沒真的領到/, "缺少「疑似沒真的領到」—— suspect() 可能又不在這個 scope");
  assert.match(html, /推播失敗/, "缺少「推播失敗」");
  assert.match(html, /data-reopen=/, "缺少「重發」按鈕");
});

test("待聯繫名單也要有列", () => {
  const { ctx, dom } = loadAdmin();
  ctx.renderContacts();
  assert.match(dom.els.get("#tb").innerHTML, /<tr>/, "待聯繫名單是空的");
});

test("獎項與庫存畫得出「重發」欄", () => {
  const { ctx, dom } = loadAdmin();
  ctx.renderPrizes();
  const html = dom.els.get("#pane").innerHTML;
  assert.match(html, /重發/, "缺少重發欄");
  assert.match(html, /\+2/, "重發次數沒有顯示出來");
});
