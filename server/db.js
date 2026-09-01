/**
 * Postgres 連線池 + schema。
 *
 * Zeabur 綁 PostgreSQL 服務後會自動注入 DATABASE_URL。
 * 本機開發若沒設 DATABASE_URL，伺服器會以「無資料庫模式」啟動（只服務靜態檔），
 * 讓你可以純看前端而不用先架 DB。
 */
import pg from "pg";

const { Pool } = pg;

export const hasDb = Boolean(process.env.DATABASE_URL);

export const pool = hasDb
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // Zeabur 內網連線不需要 TLS；外部連線才需要。以 sslmode 參數為準。
      ssl: /sslmode=require/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
    })
  : null;

if (pool) {
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
}

export async function query(text, params) {
  if (!pool) throw new Error("DATABASE_URL not configured");
  return pool.query(text, params);
}

/** 在單一 transaction 內執行 fn(client)。拋錯自動 ROLLBACK。 */
export async function withTx(fn) {
  if (!pool) throw new Error("DATABASE_URL not configured");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Idempotent DDL —— 每次啟動都跑，安全可重複執行。
 * (刻意不用 migration 工具：這個專案只有一組表，raw DDL 比較好讀也好救。)
 */
export const SCHEMA_SQL = `
-- 玩家（= LINE 使用者）
CREATE TABLE IF NOT EXISTS players (
  line_user_id  TEXT PRIMARY KEY,
  display_name  TEXT,
  picture_url   TEXT,
  balance       INTEGER     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  hotel         TEXT        NOT NULL DEFAULT 'KH',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 獎項（來源：行銷提供的「獎項一覽表.xlsx」，由 server/prizes.*.json 匯入）
CREATE TABLE IF NOT EXISTS prizes (
  id              TEXT PRIMARY KEY,
  hotel           TEXT    NOT NULL,
  tier            INTEGER NOT NULL,          -- 抽一次要投的洲遊幣數：1=三等 3=二等 5=一等
  slot            INTEGER NOT NULL,          -- 轉盤格位 1..6
  name            TEXT    NOT NULL,
  coupon_link     TEXT,                      -- Omnichat OMO bind URL；NULL = 虛擬獎（洲遊幣）
  coin_reward     INTEGER NOT NULL DEFAULT 0,
  quota           INTEGER NOT NULL DEFAULT 0,-- 名額；0 = 不限量
  issued          INTEGER NOT NULL DEFAULT 0,
  weight          NUMERIC NOT NULL DEFAULT 0,-- 中獎權重（= Excel 機率欄）
  spend_threshold TEXT,
  terms           TEXT,
  expiry_note     TEXT,
  owner           TEXT,
  visible         BOOLEAN NOT NULL DEFAULT true,  -- false = 轉盤/獎項一覽都不顯示，也抽不到
  active          BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prizes_pool_idx ON prizes (hotel, tier, active, visible);

-- 任務完成紀錄（一人一任務只能領一次）
CREATE TABLE IF NOT EXISTS task_claims (
  line_user_id TEXT        NOT NULL REFERENCES players(line_user_id) ON DELETE CASCADE,
  task_id      TEXT        NOT NULL,
  reward       INTEGER     NOT NULL,
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (line_user_id, task_id)
);

-- 抽獎紀錄 / 票券
CREATE TABLE IF NOT EXISTS draws (
  id            BIGSERIAL   PRIMARY KEY,
  line_user_id  TEXT        NOT NULL REFERENCES players(line_user_id) ON DELETE CASCADE,
  hotel         TEXT        NOT NULL DEFAULT 'KH',
  tier          INTEGER     NOT NULL,
  cost          INTEGER     NOT NULL,
  prize_id      TEXT        NOT NULL,
  prize_name    TEXT        NOT NULL,
  coin_reward   INTEGER     NOT NULL DEFAULT 0,
  code          TEXT UNIQUE,                 -- IC-XXXXX 兌換碼（實體獎才有）
  claim_token   TEXT UNIQUE,                 -- 單次有效 → 導向 Omnichat 的 token
  claim_used_at TIMESTAMPTZ,
  pushed        BOOLEAN     NOT NULL DEFAULT false,
  push_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS draws_user_idx ON draws (line_user_id, created_at DESC);

-- 洲遊幣帳本（稽核用，每一次加減都留痕）
CREATE TABLE IF NOT EXISTS coin_ledger (
  id           BIGSERIAL   PRIMARY KEY,
  line_user_id TEXT        NOT NULL,
  delta        INTEGER     NOT NULL,
  balance_after INTEGER    NOT NULL,
  reason       TEXT        NOT NULL,         -- task / spin_cost / spin_reward / refund / admin
  ref          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coin_ledger_user_idx ON coin_ledger (line_user_id, created_at DESC);

-- 個資同意（活動條款「填寫資料領取洲遊幣」）
CREATE TABLE IF NOT EXISTS player_profiles (
  line_user_id    TEXT PRIMARY KEY REFERENCES players(line_user_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  consent_kh      BOOLEAN NOT NULL DEFAULT false,
  consent_tpe     BOOLEAN NOT NULL DEFAULT false,
  consent_version TEXT    NOT NULL DEFAULT 'v0.2',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function ensureSchema() {
  if (!pool) {
    console.warn("[db] DATABASE_URL 未設定 —— 以無資料庫模式啟動（僅服務靜態檔）");
    return false;
  }
  await query(SCHEMA_SQL);
  console.log("[db] schema ready");
  return true;
}
