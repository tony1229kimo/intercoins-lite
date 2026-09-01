"""
獎項匯入：獎項一覽表.xlsx → server/prizes.json

用法：
    python scripts/import-prizes.py "C:\\Users\\smtony\\Downloads\\獎項一覽表.xlsx"

行銷更新 Excel 後重跑這支，再 git push，Zeabur 重新部署就會把新獎項寫進 DB。
已發出的數量（prizes.issued）不會被覆蓋。
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path.home() / "Downloads" / "獎項一覽表.xlsx"

# 新版 Excel 18 欄：0-7 臺北 / 8-17 高雄。（舊版 20 欄含「機率」，行銷已移除。）
# 臺北那半邊沒有「兌換期限 / 結帳 Code / 庫存歸屬部門」三欄。
# 「庫存歸屬部門 / 負責申請人」是同事姓名，刻意不匯入（見下方 read_prizes）。
KH = dict(level=8, slot=9, name=10, link=11, quota=12,
          threshold=13, terms=14, expiry=15)
TPE = dict(level=0, slot=1, name=2, link=3, quota=4,
           threshold=5, terms=6, expiry=None)

HOTELS = [("KH", KH), ("TPE", TPE)]

TIER_BY_LEVEL = {"I": 5, "II": 3, "III": 1}   # 一等獎投 5 / 二等獎投 3 / 三等獎投 1
TIER_LABEL = {5: "一等獎", 3: "二等獎", 1: "三等獎"}

# ── 領獎方式（Tony 2026-09-01）────────────────────────────────
#   coupon ：中獎直接把 Omnichat 券推到 LINE 聊天室，連結單次有效
#   contact：【不觸發連結】，改跳表單請中獎者留姓名 / 手機 / Email / 方便聯繫時段，
#            由該館的人後續主動聯繫。
#
# 規則：
#   臺北全部 contact —— 兌換細則還沒定案，而且臺北是另一個 LINE OA，我們推不了券。
#   高雄預設 coupon，但下面 CONTACT_PRIZES 列出的例外也走 contact。
#
# 為什麼高雄的住宿大獎要例外（Tony 2026-09-01）：
#   住宿券需要安排入住日期、房型與早餐，不是拿張券到櫃檯就能換，
#   由飯店的人主動聯繫安排比較妥當。
#
# ⚠️ 這些獎項在 Excel 裡照樣有 Omnichat 連結，我們照樣存進 DB 但【不使用】；
#    日後要改回發券，把該 id 從 CONTACT_PRIZES 拿掉重跑匯入即可，程式不用動。
DEFAULT_CLAIM_MODE = {"KH": "coupon", "TPE": "contact"}

CONTACT_PRIZES = {
    "kh-5-1",   # 高雄 港灣海景開放式套房 住宿一晚（含雙人早餐）
    "kh-5-2",   # 高雄 豪華經典房 住宿一晚（含雙人早餐）
}

# ── 中獎權重（Tony 2026-09-01）─────────────────────────────────
# Excel 已無機率欄。規則：
#   一等獎 —— 所有實體獎品（含臺北）一律各 2%，剩餘由「洲遊幣 +5」吸收
#   二等／三等 —— 依名額比例壓低實體獎，剩餘由「洲遊幣 +N」吸收
# 兩館獎項共用同一個轉盤，所以權重是跨館一起分配到 100%。
# key = 獎項 id，未列出的 id 自動吃掉該等級剩餘的機率。
WEIGHT_PCT = {
    # ── 一等獎（投 5 枚）· 實體獎一律 2% ──
    "kh-5-1": 2.0,    # 高雄 港灣海景開放式套房 住宿一晚
    "kh-5-2": 2.0,    # 高雄 豪華經典房 住宿一晚
    "kh-5-4": 2.0,    # 高雄 餐飲 5 折優惠禮遇
    "tpe-5-1": 2.0,   # 臺北 雙人下午茶
    "tpe-5-2": 2.0,   # 臺北 高樓層開放式套房住宿一晚
    "tpe-5-3": 2.0,   # 臺北 豪華經典房住宿一晚
    # kh-5-3《洲遊幣》+5 → 自動吃剩餘 88%

    # ── 二等獎（投 3 枚）──
    "kh-3-1": 6.0,    # 高雄 餐飲 85 折優惠禮遇（名額 10）
    "kh-3-3": 3.0,    # 高雄 BL.T33 洲際經典雙人下午茶（名額 5）
    "kh-3-4": 3.0,    # 高雄 玫果沁釀覆盆莓煎茶氣泡飲（名額 5）
    "tpe-3-1": 2.0,   # 臺北 全日餐廳雙人午餐（名額 3）
    "tpe-3-2": 2.0,   # 臺北 氣泡茶 750ML（名額 3）
    # kh-3-2《洲遊幣》+3 → 自動吃剩餘 84%

    # ── 三等獎（投 1 枚）──
    "kh-1-1": 8.0,    # 高雄 明信片組（名額 20）
    "kh-1-3": 8.0,    # 高雄 洲賀熊（名額 20）
    "kh-1-4": 8.0,    # 高雄 旅行外幣收納錢包（名額 20）
    "kh-1-5": 4.0,    # 高雄 天然楠竹不鏽鋼環保隨行瓶（名額 10）
    "kh-1-6": 4.0,    # 高雄 餐飲抵用券 NT$500（名額 10）
    "tpe-1-1": 4.0,   # 臺北 楠竹玻璃永續隨行瓶（名額 10）
    # kh-1-2《洲遊幣》+1 → 自動吃剩餘 64%
}

COIN_RE = re.compile(r"洲遊幣》?\s*\+\s*(\d+)")


def cell(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def read_prizes(rows):
    prizes = []
    for hotel, col in HOTELS:
        for row in rows[2:]:
            level = cell(row[col["level"]])
            name = cell(row[col["name"]])
            if level not in TIER_BY_LEVEL or not name:
                continue          # 空格位不放進轉盤
            try:
                quota = int(float(row[col["quota"]] or 0))
            except (TypeError, ValueError):
                quota = 0
            coin = COIN_RE.search(name)
            threshold = cell(row[col["threshold"]])
            slot = int(row[col["slot"]])
            prize_id = f"{hotel.lower()}-{TIER_BY_LEVEL[level]}-{slot}"
            prizes.append({
                "id": prize_id,
                "hotel": hotel,
                "claim_mode": ("contact" if prize_id in CONTACT_PRIZES
                               else DEFAULT_CLAIM_MODE[hotel]),
                "tier": TIER_BY_LEVEL[level],
                "slot": slot,
                "name": name,
                "coupon_link": cell(row[col["link"]]),
                "coin_reward": int(coin.group(1)) if coin else 0,
                "quota": quota,
                "weight": 0.0,               # 下面統一分配
                "spend_threshold": None if threshold == "X" else threshold,
                "terms": cell(row[col["terms"]]),
                "expiry_note": cell(row[col["expiry"]]) if col["expiry"] is not None else None,
                # ⚠️ 刻意【不】匯入 Excel 的「庫存歸屬部門 / 負責申請人」欄 ——
                #    那是同事姓名，程式從來沒用到，存進 repo 與 DB 只是多一份個資。
                #    要查誰負責哪個獎品，直接看行銷的 Excel。
            })
    return prizes


def apply_weights(prizes):
    for tier in (1, 3, 5):
        group = [p for p in prizes if p["tier"] == tier]
        assigned = [p for p in group if p["id"] in WEIGHT_PCT]
        rest = [p for p in group if p["id"] not in WEIGHT_PCT]
        used = sum(WEIGHT_PCT[p["id"]] for p in assigned)
        if used > 100.0 + 1e-9:
            sys.exit(f"{TIER_LABEL[tier]} 指定機率合計 {used}% > 100%，請修正 WEIGHT_PCT")
        for p in assigned:
            p["weight"] = WEIGHT_PCT[p["id"]]
        if rest:
            share = (100.0 - used) / len(rest)
            for p in rest:
                p["weight"] = round(share, 4)
        elif used < 100.0 - 1e-9:
            sys.exit(f"{TIER_LABEL[tier]} 機率合計只有 {used}%，且沒有可吸收剩餘的格位")


def assign_positions(prizes):
    """轉盤格位順序：同一等級內先高雄後臺北，各自照 Excel 的格號。

    ⚠️ 前端是用 prize id 對應中獎格，不是用 slot —— 兩館的 slot 會撞號
    （kh-1-1 和 tpe-1-1 都是「第 1 格」）。
    """
    prizes.sort(key=lambda p: (p["tier"], 0 if p["hotel"] == "KH" else 1, p["slot"]))
    for tier in (1, 3, 5):
        for i, p in enumerate([x for x in prizes if x["tier"] == tier]):
            p["position"] = i


def report(prizes):
    kh = sum(1 for p in prizes if p["hotel"] == "KH")
    print(f"匯入 {len(prizes)} 個獎項（高雄 {kh} / 臺北 {len(prizes) - kh}）\n")
    physical_total = 0
    for tier in (1, 3, 5):
        group = [p for p in prizes if p["tier"] == tier]
        physical = [p for p in group if not p["coin_reward"]]
        physical_total += sum(p["quota"] for p in physical)
        total_w = sum(p["weight"] for p in group)
        print(f"── {TIER_LABEL[tier]}（投 {tier} 枚）· {len(group)} 格 · 機率合計 {total_w:g}% ──")
        for p in group:
            mode = ("洲遊幣（退幣重抽）" if p["coin_reward"]
                    else "Omnichat 發券" if p["claim_mode"] == "coupon"
                    else "★ 留聯絡資訊")
            print(f"   {p['position']:>2}. [{p['hotel']:<3}] {p['name'][:26]:<26} "
                  f"名額{p['quota']:>3}  {p['weight']:>6.4g}%  {mode}")
        print(f"   → 實體獎中獎率 {sum(p['weight'] for p in physical):g}%\n")
    print(f"實體獎總庫存：{physical_total} 份")

    contact = [p for p in prizes if p["claim_mode"] == "contact" and not p["coin_reward"]]
    print(f"\n★ 走「留聯絡資訊」的獎項共 {len(contact)} 個：")
    for p in contact:
        print(f"   [{p['hotel']:<3}] {p['name']}")
    missing = CONTACT_PRIZES - {p["id"] for p in prizes}
    if missing:
        print(f"⚠️ CONTACT_PRIZES 裡有 id 在 Excel 中找不到：{sorted(missing)}")


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        sys.exit(f"找不到檔案：{src}")

    rows = list(openpyxl.load_workbook(src, data_only=True)["獎項一覽表"]
                .iter_rows(values_only=True))
    prizes = read_prizes(rows)
    apply_weights(prizes)
    assign_positions(prizes)

    out = ROOT / "server" / "prizes.json"
    out.write_text(json.dumps(prizes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "server" / "prizes.kh.json").unlink(missing_ok=True)   # 舊的單館檔已淘汰

    report(prizes)
    print(f"\n→ {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
