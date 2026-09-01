# 洲遊幣 Lite · InterCoins Lite

臺北／高雄洲際酒店 中秋轉盤抽獎 LIFF 遊戲。客人在 LINE 內完成任務蒐集「洲遊幣」，
投入轉盤抽獎。

- **活動期間**：2026-09-01 ～ 2026-11-30
- **正式網址**：https://intercoins.ictaiwan.net
- **兩館獎項共用同一個轉盤**，差別在領獎方式：

| 館別 | `claim_mode` | 領獎方式 | 為什麼 |
|---|---|---|---|
| 高雄洲際 | `coupon` | Omnichat 券推到 LINE 聊天室，連結**單次有效** | 細則已定案，OA token 也在我們手上 |
| 臺北洲際 | `contact` | **不觸發連結**，跳表單收姓名／手機／Email／方便聯繫時段，由專人以信件聯繫 | 兌換細則還沒定案（Excel 細則欄全寫「待酒店開幕後公告」），且臺北是**另一個 LINE OA**，我們沒有它的 token |

> 臺北細則定案、也拿到臺北 OA token 之後，把該獎項的 `claim_mode` 改成 `coupon`
> 就自動改走發券流程 —— **程式完全不用動**。

## 🔐 這個 repo 為什麼必須保持 private

`server/prizes.json` 裡有 **17 條 Omnichat 兌換連結**（`api.omnichat.ai/.../omo/bind/...`）。

**這些連結是 stateless 的 —— 任何人拿到就能直接領券**，不需要登入、不需要中獎。
（這正是味蕾旅遊地圖 POSTMORTEM Bug #9 的成因，我們是在應用層包一層單次
`claim_token` 才擋住無限領取；但原始連結本身沒有任何保護。）

所以：

- ❌ **絕對不要把這個 repo 改成 public**
- ❌ 不要把 `prizes.json` 貼進 issue、Slack、簡報或任何對外文件
- ✅ Fork / clone 給別人之前，先確認對方有權限看到這些連結
- ✅ 若連結曾外流，請行銷到 Omnichat 後台重新產生一組，再重跑匯入

> 已確認：`tony1229kimo/intercoins-lite` 目前是 **PRIVATE**。

### 其他脫敏處理

- Excel 的「庫存歸屬部門 / 負責申請人」欄是**同事姓名**，程式從來沒用到 ——
  **刻意不匯入**，`prizes.js` 也不再寫入，並用 `ALTER TABLE ... DROP COLUMN`
  把已經寫進 production DB 的那些姓名刪掉。要查誰負責哪個獎品請看行銷的 Excel。
- 中獎者的姓名 / 手機 / Email 只存在 Postgres，**不進 repo**；
  後台調閱一律留稽核紀錄（`admin_access_log`）。
- `.env` 未被追蹤（`.gitignore` 已擋），`.env.example` 內全是佔位值。

---

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
server/prizes.js      獎項匯入（prizes.json → DB）
server/prizes.json    獎項資料 · 兩館共 20 筆（由 scripts/import-prizes.py 產生，勿手改）
server/routes/game.js  /api/state /api/spin /api/tasks /api/profile /api/me/friendship
                       /api/draws/:id/contact —— 臺北中獎者的聯絡資訊
server/routes/claim.js /api/claim/:token —— 單次有效的 Omnichat 轉址（高雄）
server/routes/admin.js /api/admin/* —— 庫存、機率、中獎名單 CSV、臺北待聯繫名單、補推播
scripts/import-prizes.py  Excel → prizes.json（含機率分配與 claim_mode）
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
7. 中獎後依該獎項的 `claim_mode` 分流：
   - **高雄（`coupon`）** → Flex 券推到聊天室，按鈕連到 `/api/claim/:token`（**單次有效**）
   - **臺北（`contact`）** → 畫面跳表單收聯絡資訊 → `POST /api/draws/:id/contact`；
     同時推一則提醒進聊天室。客人若關掉彈窗就跑了，下次進遊戲時
     `/api/state` 的 `pendingContacts` 會再問一次，直到填完為止

---

## 安全設計（都是踩過的坑）

| 機制 | 為什麼 |
|---|---|
| 抽獎在後端，前端只收獎項 `id` | 前端抽獎 = 客人改個變數就中頭獎。前端**拿不到**機率與庫存 |
| 兩館獎項用 `id` 對位，不用 `slot` | 兩館的 slot 會撞號（`kh-1-1` 和 `tpe-1-1` 都是「第 1 格」），用 slot 會停錯格 |
| `/api/draws/:id/contact` 驗證 draw 屬於本人 | 否則任何登入者都能覆蓋別人的中獎聯絡資訊 |
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
| `ADMIN_USERS` | 後台 `/admin` 沒人進得去（遊戲本身正常）。格式 `帳號:密碼,帳號:密碼` |

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

檢查印出的機率表沒問題（每個等級要剛好 100%，臺北要全部標 `★ 留聯絡資訊`），
然後 `git commit` + `git push`，Zeabur 重新部署即生效。
**已發出的數量（`prizes.issued`）不會被重置。**

臨時要調機率不想重新部署，可直接打後台 API：

```bash
curl -X PATCH https://intercoins.ictaiwan.net/api/admin/prizes/kh-5-1 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"weight": 5}'
```

### 機率規則

Excel 的機率欄已被行銷移除，權重改由 `scripts/import-prizes.py` 的 `WEIGHT_PCT` 決定
（Tony 2026-09-01 拍板）：**一等獎所有實體獎品（含臺北）一律各 2%**，其餘由「洲遊幣 +5」
吸收；二等／三等依名額比例壓低實體獎，同樣由洲遊幣格吸收剩餘。
同等級中**沒有指定的格位自動吃掉剩餘機率**，兩館獎項跨館一起分配到 100%。

⚠️ 加入臺北後，三等 7 格、二等 6 格、一等 7 格，但盤面美術畫的是 12 格 ——
**7 格不會對齊格線**（純視覺問題，功能正常）。詳見 `docs/獎池容量分析.md`。

---

## 後台 `/admin`

**https://intercoins.ictaiwan.net/admin** —— 用瀏覽器開，帳號密碼登入，不用打 curl。

三個分頁：

| 分頁 | 內容 |
|---|---|
| **臺北待聯繫** | 中了臺北獎項的人。可搜尋、可只看「未填聯絡資訊」的。臺北洲際的人照這份聯繫 |
| **中獎名單** | **兩館共用一份**，可依館別／獎項類型篩選。高雄櫃檯查客人手上的券是不是自家發的、臺北的人查該聯繫誰，都在這裡。可下載 CSV |
| **獎項與庫存** | 每個獎品的實際機率、名額、已發出、剩餘。哪一等級發完了一眼看得出來 |

### 誰能進去 —— 個人帳號，不是共用密碼

名單裡有中獎者的**姓名／手機／Email**，所以刻意不用一組共用密碼：

```
ADMIN_USERS=tony:密碼A,kh-mktg:密碼B,tpe-mktg:密碼C
```

- 帳號不分大小寫，密碼區分；多組用逗號分隔。**密碼裡不能有逗號或冒號**
- 要移除某個人 → 從這串拿掉他那組，重新部署即可，**其他人不受影響**
- 每次調閱名單都會寫進 `admin_access_log`（誰、什麼時候、看了哪一份、來源 IP）
- 密碼不會存進瀏覽器 —— 登入後只保留伺服器推導出的 token，關掉分頁就失效

`ADMIN_TOKEN` 保留為主金鑰，給 curl／自動化用（稽核會記成使用者 `master`）。
兩個都沒設 → 後台整個停用（回 503）。

### API（要帶 token）

```bash
# 登入取得 token
curl -X POST https://intercoins.ictaiwan.net/api/admin/login   -H "Content-Type: application/json" -d '{"username":"tony","password":"..."}'

# 之後都帶 Authorization: Bearer <token>
curl -H "Authorization: Bearer $T" https://intercoins.ictaiwan.net/api/admin/winners    # 完整中獎名單
curl -H "Authorization: Bearer $T" https://intercoins.ictaiwan.net/api/admin/contacts   # 臺北待聯繫
curl -H "Authorization: Bearer $T" https://intercoins.ictaiwan.net/api/admin/prizes     # 獎項與庫存
curl -H "Authorization: Bearer $T" https://intercoins.ictaiwan.net/api/admin/stats      # 營運總覽
curl -H "Authorization: Bearer $T" -O https://intercoins.ictaiwan.net/api/admin/winners.csv

# 改機率／名額（立即生效，不用重新部署）
curl -X PATCH https://intercoins.ictaiwan.net/api/admin/prizes/kh-5-1   -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"weight": 5}'

# 推播失敗的補送
curl -X POST -H "Authorization: Bearer $T" https://intercoins.ictaiwan.net/api/admin/draws/123/repush
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
接著**用手機在 LINE 內實際玩一輪**，兩條領獎路徑都要走過：

**高雄的獎（coupon）**
登入 → 加好友 gate → 做任務拿幣 → 抽獎 → 確認 LINE 收到 Flex 券 → 點領取 →
**再點第二次應該顯示「此連結已使用過」**。

**臺北的獎（contact）**
抽到臺北獎項 → 應該**不出現領取連結**，改跳聯絡資訊表單 → 送出 →
`GET /api/admin/contacts` 要看得到這筆 → 關掉遊戲重開，**不應該再被問一次**。
反過來，若刻意按 Esc 跳過表單，重開遊戲**應該要再問一次**。

---

*臺北洲際酒店 × 高雄洲際酒店 · Tony Chen · 2026-09*
