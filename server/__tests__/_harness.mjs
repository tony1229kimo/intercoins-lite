/**
 * 測試用的假資料庫 + 把【真的】game.js router 掛起來。
 *
 * 這個 repo 沒有 DB 可以在本機跑，所以用 node:test 的 module mock 換掉 db.js / line.js /
 * liffAuth.js，其餘（路由、交易邏輯、上限判斷）都是真的程式碼。
 *
 * ⚠️ 需要 --experimental-test-module-mocks（見 package.json 的 test script）。
 */
import { mock } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import express from "express";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const url = (rel) => pathToFileURL(path.join(SERVER_DIR, rel)).href;

/** 每個測試檔自己一份，測試之間用 resetDB() 歸零。 */
export const DB = {
  player: null,
  draws: [],
  prize: null,
  pushes: [],
};

export function resetDB({ balance = 8 } = {}) {
  DB.player = { line_user_id: "U_test", display_name: "測試", picture_url: null, balance };
  DB.draws = [];
  DB.pushes = [];
  DB.prize = {
    id: "kh-3-1", hotel: "KH", tier: 1, position: 0, name: "測試實體獎",
    claim_mode: "coupon", coupon_link: "https://example.invalid/x",
    coin_reward: 0, quota: 100, issued: 0, weight: 100,
    spend_threshold: null, terms: null, expiry_note: null, active: true, visible: true,
  };
}

/** 只實作這些路由真正會下的查詢；沒對上的一律炸掉，避免測試默默通過。 */
function run(sql, params = []) {
  const q = sql.replace(/\s+/g, " ").trim();
  if (q.startsWith("INSERT INTO players")) return { rows: [DB.player] };
  if (q.startsWith("SELECT balance FROM players")) return { rows: [{ balance: DB.player.balance }] };
  if (q.includes("COUNT(*)::int AS n FROM draws")) {
    return { rows: [{ n: DB.draws.filter((d) => d.coin_reward === 0).length }] };
  }
  if (q.startsWith("SELECT * FROM prizes")) return { rows: [{ ...DB.prize }] };
  if (q.startsWith("UPDATE prizes SET issued")) {
    DB.prize.issued++;
    return { rowCount: 1, rows: [{ issued: DB.prize.issued }] };
  }
  if (q.startsWith("UPDATE players SET balance")) {
    DB.player.balance += params[1];
    return { rows: [{ balance: DB.player.balance }] };
  }
  if (q.startsWith("INSERT INTO coin_ledger")) return { rows: [] };
  if (q.startsWith("INSERT INTO draws")) {
    const row = {
      id: DB.draws.length + 1, line_user_id: params[0], hotel: params[1], tier: params[2],
      cost: params[3], prize_id: params[4], prize_name: params[5],
      coin_reward: params[6], code: params[7], claim_token: params[8],
    };
    DB.draws.push(row);
    return { rows: [row] };
  }
  if (q.startsWith("UPDATE draws SET pushed")) return { rows: [] };
  if (q.startsWith("SELECT task_id")) return { rows: [] };
  if (q.startsWith("SELECT id, hotel, tier, position")) return { rows: [{ ...DB.prize, winnable: true }] };
  if (q.startsWith("SELECT prize_name, tier, code")) return { rows: [] };
  if (q.includes("FROM draws d")) return { rows: [] };
  if (q.startsWith("SELECT name, phone, email")) return { rows: [] };
  throw new Error("假 DB 沒有對應的查詢：" + q.slice(0, 100));
}

/**
 * 掛好 mock 後 import 真的 router 並起一個 server。
 * 一定要在 import game.js 之前設好 process.env.MAX_PHYSICAL_WINS ——
 * 那個常數是 module load 時讀的。
 */
export async function startApp() {
  mock.module(url("db.js"), {
    exports: {
      query: async (sql, params) => run(sql, params),
      withTx: async (fn) => fn({ query: async (sql, params) => run(sql, params) }),
    },
  });
  mock.module(url("lib/line.js"), {
    exports: {
      checkFriendship: async () => ({ ok: true, friend: true }),
      pushRewardCoupon: async () => ({ ok: true }),
      pushContactReminder: async (hotel, userId, payload) => {
        DB.pushes.push({ hotel, userId, ...payload });
        return { ok: true };
      },
    },
  });
  mock.module(url("middleware/liffAuth.js"), {
    exports: {
      requireLiffAuth: () => (req, _res, next) => {
        req.lineUserId = "U_test";
        req.lineDisplayName = "測試";
        req.linePictureUrl = null;
        next();
      },
    },
  });

  const { default: router } = await import(url("routes/game.js"));
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: String(err) }));

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    server,
    close: () => server.close(),
    post: (p, body) => fetch(base + p, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: await r.json() })),
    get: (p) => fetch(base + p).then(async (r) => ({ status: r.status, json: await r.json() })),
  };
}
