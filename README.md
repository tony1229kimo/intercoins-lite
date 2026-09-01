# 洲遊幣 Lite · InterCoins Lite

高雄洲際酒店 中秋轉盤抽獎 LIFF 遊戲。客人在 LINE 內完成任務蒐集「洲遊幣」，
投入轉盤抽獎，中獎券自動推播到 LINE 聊天室。

- **活動期間**：2026-09-01 ～ 2026-11-30
- **本階段範圍**：**只做高雄洲際**。臺北洲際待開幕後另行開放（獎項表已備妥，未啟用）
- **正式網址**：https://intercoins.ictaiwan.net

## 這份專案的來源

| 來源 | 用途 |
|---|---|
| [`JamesWuIC/20260713_-Lite`](https://github.com/JamesWuIC/20260713_-Lite) | 前端主體（`prototype/index.html` 轉盤、美術、動畫、法規條款） |
| [`KHHKT/20260706_intercoins`](https://gitlab.com/KHHKT/20260706_intercoins) | 「洲遊幣」完整平台（Cloudflare Pages + D1）。**本專案沒有沿用**，僅作參考 |
| `ickaohsiungculinaryjourneymap` | 加好友 gate、Omnichat 單次領券、LINE Flex 推播的做法都是從這裡移植的 |
| 行銷「獎項一覽表.xlsx」 | 獎項、連結、名額的唯一真相來源 |

原型是**純前端 localStorage**：抽獎在瀏覽器算、庫存不會扣、洲遊幣客人可自行竄改。
本專案補上 Node/Express + Postgres 後端把這三件事收回伺服器。

---

## 架構

```
public/index.html     遊戲本體（單檔，無 build step）
public/assets/        轉盤三層美術 L1/L2/L3、開場影片
server/index.js       Express：靜態檔 + /api/*（同一個服務、同一個網域）
server/db.js          Postgres 連線池 + idempotent schema
server/prizes.js      獎項匯入（prizes.kh.json → DB）
server/prizes.kh.json 獎項資料（由 scripts/import-prizes.py 產生，勿手改）
server/routes/game.js  /api/state /api/spin /api/tasks /api/profile /api/me/friendship
server/routes/claim.js /api/claim/:token —— 單次有效的 Omnichat 轉址
server/routes/admin.js /api/admin/* —— 庫存、機率、中獎名單 CSV、補推播
scripts/import-prizes.py  Excel → prizes.kh.json
```

**前後端刻意同一個服務、同一個網域。** 味蕾旅遊地圖曾因前後端分網域，
Flex 訊息裡的 `/api/claim/:token` 指到錯誤 host 而 404（POSTMORTEM Bug #9B）。

---

## 客人的流程

1. 從高雄洲際 LINE 官方帳號開啟 LIFF
2. `liff.login()` → 取 `id_token`
3. `GET /api/me/friendship` 檢查是否已加好友
   - 未加 → 顯示加好友 gate，每 2.5 秒自動重查，加完自動進遊戲
4. `GET /api/state` 取餘額、任務、轉盤盤面、中獎紀錄
5. 完成任務 → `POST /api/tasks/:id/claim` → 後端發幣（一個帳號一個任務只發一次）
6. 投幣抽獎 → `POST /api/spin` → **後端**加權抽獎、扣庫存、扣幣、開票、推播
7. 中獎券以 LINE Flex 推到聊天室，按鈕連到 `/api/claim/:token`（**單次有效**）

---

## 安全設計（都是踩過的坑）

| 機制 | 為什麼 |
|---|---|
| 抽獎在後端，前端只收 `slot` | 前端抽獎 = 客人改個變數就中頭獎。前端**拿不到**機率與庫存 |
| `/api/spin` 全程 transaction + `FOR UPDATE` | 併發抽獎不會超發庫存（只有 1 張的五折券不會發出兩張） |
| Omnichat 連結包一層單次 `claim_token` | Omnichat bind URL 是 stateless 的，**點幾次發幾張券**。Flex 訊息永遠留在對話歷史 → 不包就是無限領券（POSTMORTEM Bug #9） |
| 中獎彈窗**不放**領取連結 | 同上。券只在 LINE 對話裡領一次 |
| `asyncRouter()` 自動接住 async 例外 | Express 4 的 async handler reject 不會進錯誤處理，請求會 hang、前端只看到「Failed to fetch」 |
| 抽獎按鈕 20 秒看門狗 + `unlockSpin()` | 任何路徑都保證解鎖，不會卡在「抽獎中…」（POSTMORTEM Bug #6） |
| `task_claims` 用 PK + `ON CONFLICT DO NOTHING` | 連點不會重複發幣 |
| 錯誤一律帶 `detail` | 全部歸成同一個錯誤碼 = 現場所有人猜錯方向（POSTMORTEM Bug #3） |

---

## 環境變數

見 [`.env.example`](.env.example)。**上線前一定要在 Zeabur 設好這五個，少一個功能就是壞的：**

| 變數 | 沒設會怎樣 |
|---|---|
| `LIFF_ID` | 客人看到「請在 LINE 中開啟」，玩不了 |
| `LINE_CHANNEL_ID` | production 直接 503（拒絕未驗證的請求） |
| `LINE_MESSAGING_ACCESS_TOKEN_KH` | 加好友 gate 失效（全部放行）＋ **中獎券推不出去** |
| `PUBLIC_BASE_URL` | Flex 領取按鈕沒有連結，客人領不到獎 |
| `DATABASE_URL` | 只剩靜態頁，遊戲不能玩（Zeabur 綁 PostgreSQL 會自動注入） |
| `ADMIN_TOKEN` | 後台 API 停用（其他功能正常） |

> ⚠️ `/api/health` 的 `*_configured: true` 只代表**環境變數非空**，不代表 key 有效（踩雷 T09）。
> 真要驗證得實際跑一次會呼叫該服務的操作。

### ⚠️ LIFF 不要沿用味蕾旅遊地圖那一支

味蕾旅遊地圖用的是 `1656533531-U5OvwB62`。**一個 LIFF app 只能有一個 Endpoint URL**，
改掉它會讓現役的味蕾地圖當場失效。

正確做法是在**同一個 LINE Login channel（`1656533531`）底下新增第二個 LIFF app**，
Endpoint 填 `https://intercoins.ictaiwan.net`。這樣 `LINE_CHANNEL_ID` 與
Messaging token 都能跟味蕾地圖共用，加好友檢查也共用同一個官方帳號。

---

## 更新獎項

行銷改完 Excel 後：

```bash
python scripts/import-prizes.py "C:\Users\smtony\Downloads\獎項一覽表.xlsx"
```

檢查印出的機率表沒問題，然後 `git commit` + `git push`，Zeabur 重新部署即生效。
**已發出的數量（`prizes.issued`）不會被重置。**

臨時要調機率不想重新部署，可直接打後台 API：

```bash
curl -X PATCH https://intercoins.ictaiwan.net/api/admin/prizes/kh-5-1 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"weight": 5}'
```

### 機率規則

Excel 的機率欄已被行銷移除，權重改由 `scripts/import-prizes.py` 的 `WEIGHT_PCT` 決定
（Tony 2026-09-01 拍板）：一等獎三個實體獎品**各 2%**，其餘由「洲遊幣 +N」吸收；
二等／三等比照同一精神。同等級中**沒有指定的格位自動吃掉剩餘機率**。

---

## 後台

```bash
# 獎項、庫存、實際機率
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://intercoins.ictaiwan.net/api/admin/prizes

# 營運總覽（玩家數、發幣數、各等級抽獎次數、推播成功率）
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://intercoins.ictaiwan.net/api/admin/stats

# 中獎名單 CSV（UTF-8 BOM，Excel 直接開）
curl -H "Authorization: Bearer $ADMIN_TOKEN" -O https://intercoins.ictaiwan.net/api/admin/winners.csv

# 推播失敗的補送
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://intercoins.ictaiwan.net/api/admin/draws/123/repush
```

---

## 本機開發

```bash
npm install
DATABASE_URL=postgres://... PORT=8099 npm run dev
```

沒設 `DATABASE_URL` 也起得來（只服務靜態檔），方便純看前端。
沒設 `LIFF_ID` 時會保留原型的訪客密碼閘（`20260815`）；設了就跳過密碼、走 LINE 登入。

---

## 部署後驗證

```bash
curl -s https://intercoins.ictaiwan.net/api/health
```

`db` 要是 `"ok"`，五個 `*_configured` 要都是 `true`。
接著**用手機在 LINE 內實際玩一輪**：登入 → 加好友 gate → 做任務拿幣 → 抽獎 →
確認 LINE 收到 Flex 券 → 點領取 → **再點第二次應該顯示「此連結已使用過」**。

---

*高雄洲際酒店 · Tony Chen · 2026-09*
