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

-- 獎項（來源：行銷提供的「獎項一覽表.xlsx」，由 server/prizes.json 匯入）
CREATE TABLE IF NOT EXISTS prizes (
  id              TEXT PRIMARY KEY,
  hotel           TEXT    NOT NULL,          -- KH 高雄 / TPE 臺北
  tier            INTEGER NOT NULL,          -- 抽一次要投的洲遊幣數：1=三等 3=二等 5=一等
  slot            INTEGER NOT NULL,          -- Excel 上的格號（兩館會撞號，僅供對照）
  position        INTEGER NOT NULL DEFAULT 0,-- 轉盤實際格位（同等級內唯一）
  name            TEXT    NOT NULL,
  -- 領獎方式：
  --   coupon  = 推 Omnichat 券到 LINE，連結單次有效（高雄）
  --   contact = 不觸發連結，跳表單收聯絡資訊，由飯店人員後續聯繫（臺北，細則未定案）
  claim_mode      TEXT    NOT NULL DEFAULT 'coupon',
  coupon_link     TEXT,                      -- Omnichat OMO bind URL；NULL = 虛擬獎（洲遊幣）
  coin_reward     INTEGER NOT NULL DEFAULT 0,
  quota           INTEGER NOT NULL DEFAULT 0,-- 名額；0 = 不限量
  issued          INTEGER NOT NULL DEFAULT 0,
  weight          NUMERIC NOT NULL DEFAULT 0,-- 中獎權重（%）
  spend_threshold TEXT,
  terms           TEXT,
  expiry_note     TEXT,
  visible         BOOLEAN NOT NULL DEFAULT true,  -- false = 轉盤/獎項一覽都不顯示，也抽不到
  active          BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prizes_pool_idx ON prizes (tier, active, visible);
-- 既有資料庫補欄位（CREATE TABLE IF NOT EXISTS 不會幫既有表加欄位）
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS claim_mode TEXT NOT NULL DEFAULT 'coupon';
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS position   INTEGER NOT NULL DEFAULT 0;
-- 脫敏：owner 欄存的是 Excel 的「負責申請人」= 同事姓名，程式從來沒讀過。
-- 這行會把已經寫進 production DB 的那些姓名真的刪掉，不只是不再寫入。
ALTER TABLE prizes DROP COLUMN IF EXISTS owner;

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

-- 中獎聯絡資訊（claim_mode='contact' 的獎項專用）
--
-- 臺北洲際的兌換細則還沒定案，所以中臺北的獎不發 Omnichat 券，
-- 改請中獎者留下聯絡方式，由臺北洲際的人後續以信件聯繫。
-- 一筆中獎紀錄只會有一筆聯絡資訊（draw_id 當 PK），重填會覆蓋。
CREATE TABLE IF NOT EXISTS prize_contacts (
  draw_id        BIGINT      PRIMARY KEY REFERENCES draws(id) ON DELETE CASCADE,
  line_user_id   TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  phone          TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  contact_window TEXT,                       -- 方便聯繫時段：上午/下午/晚上/皆可
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prize_contacts_user_idx ON prize_contacts (line_user_id);

-- 後台存取稽核：誰、什麼時候、看了哪一份含個資的名單。
-- 中獎名單有中獎者的姓名/手機/Email，出事要查得出是誰調閱的。
CREATE TABLE IF NOT EXISTS admin_access_log (
  id         BIGSERIAL   PRIMARY KEY,
  username   TEXT        NOT NULL,
  action     TEXT        NOT NULL,      -- winners / winners.csv / contacts
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_access_log_idx ON admin_access_log (created_at DESC);

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
